"""Quiz generation (LLM) and grading (deterministic where possible)."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Assessment, Concept, Lesson, QuizItem
from app.lesson.schemas import LANGUAGE_RULES, FeedbackOut, QuizItemOut, QuizOut
from app.lesson.service import lesson_chunks_text, lesson_steps
from app.llm.client import LLMClient, generate_structured, load_prompt
from app.memory.grading import grade_mcq, grade_numeric, normalize, parse_number
from app.memory.mastery import add_misconception, get_or_create_concept, record_review, update_mastery

log = logging.getLogger(__name__)


def _usable(item: QuizItemOut) -> bool:
    if item.type == "mcq":
        return bool(item.options) and len(item.options) >= 2 and \
            normalize(item.answer) in {normalize(o) for o in item.options}
    if item.type == "numeric":
        return parse_number(item.answer) is not None
    return bool(item.answer.strip())


async def generate_quiz(db: Session, llm: LLMClient, lesson: Lesson, n: int = 3) -> list[QuizItem]:
    steps = lesson_steps(db, lesson.id)
    system = load_prompt("quiz_v1.txt").format(language_rule=LANGUAGE_RULES[lesson.language], n=n)
    user = (f"LESSON: {lesson.title}\n" + "\n".join(s.say for s in steps) +
            f"\n\nCOURSE PASSAGES:\n{lesson_chunks_text(db, steps)}")
    out = await generate_structured(llm, QuizOut, [{"role": "system", "content": system},
                                                   {"role": "user", "content": user}])
    items: list[QuizItem] = []
    if out is None:
        return items
    for it in out.items:
        if not _usable(it):
            log.info("dropping unusable quiz item: %s", it)
            continue
        concept_id = lesson.concept_id
        if it.concept:
            concept_id = get_or_create_concept(db, lesson.course_id, it.concept).id
        q = QuizItem(user_id=lesson.user_id, lesson_id=lesson.id, concept_id=concept_id, type=it.type,
                     question=it.question, options=it.options if it.type == "mcq" else None,
                     answer=it.answer, explanation=it.explanation)
        db.add(q)
        items.append(q)
    db.commit()
    return items


async def grade_item(llm: LLMClient, item: QuizItem, response: str, language: str) -> FeedbackOut:
    if item.type == "mcq":
        ok = grade_mcq(response, item.answer, item.options)
        return FeedbackOut(correct=ok, explanation=item.explanation,
                           misconception=None if ok else
                           f"Chose \"{response}\" instead of \"{item.answer}\" for: {item.question}")
    if item.type == "numeric":
        ok = grade_numeric(response, item.answer)
        return FeedbackOut(correct=ok, explanation=item.explanation,
                           misconception=None if ok else
                           f"Answered {response} instead of {item.answer} for: {item.question}")
    system = load_prompt("grade_v1.txt").format(language_rule=LANGUAGE_RULES[language])
    user = f"QUESTION: {item.question}\nMODEL ANSWER: {item.answer}\nSTUDENT ANSWER: {response}"
    fb = await generate_structured(llm, FeedbackOut, [{"role": "system", "content": system},
                                                      {"role": "user", "content": user}])
    if fb is None:
        ok = normalize(response) == normalize(item.answer)
        return FeedbackOut(correct=ok, explanation=f"Model answer: {item.answer}")
    return fb


async def submit_quiz(db: Session, llm: LLMClient, user_id: int, lesson: Lesson,
                      answers: dict[int, str]) -> dict:
    items = db.scalars(select(QuizItem).where(QuizItem.lesson_id == lesson.id, QuizItem.user_id == user_id,
                                              QuizItem.id.in_(list(answers)))).all()
    results = []
    per_concept: dict[int, list[bool]] = {}
    for item in items:
        response = answers[item.id]
        fb = await grade_item(llm, item, response, lesson.language)
        a = Assessment(user_id=user_id, quiz_item_id=item.id, concept_id=item.concept_id,
                       response=response, correct=fb.correct, feedback=fb.explanation)
        db.add(a)
        db.flush()
        if not fb.correct and fb.misconception:
            add_misconception(db, user_id, item.concept_id, fb.misconception, a.id)
        if item.concept_id is not None:
            per_concept.setdefault(item.concept_id, []).append(fb.correct)
        results.append({"item_id": item.id, "correct": fb.correct, "explanation": fb.explanation,
                        "answer": item.answer})
    db.flush()
    mastery = {}
    for cid, oks in per_concept.items():
        mastery[cid] = update_mastery(db, user_id, cid)
        record_review(db, user_id, cid, sum(oks) / len(oks))
    db.commit()
    names = {c.id: c.name for c in db.scalars(select(Concept).where(Concept.id.in_(list(mastery))))}
    return {"results": results, "score": sum(r["correct"] for r in results), "total": len(results),
            "mastery": [{"concept": names.get(cid, ""), "score": s} for cid, s in mastery.items()]}
