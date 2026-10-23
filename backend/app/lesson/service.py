"""Lesson orchestration: Assess → Retrieve → Plan/Teach → Check → Adapt (architecture.md §6)."""

import logging
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.board.schemas import BoardState
from app.db.models import Conversation, DocumentChunk, Lesson, LessonStep, MasteryRecord, Message
from app.lesson.schemas import (
    FOLLOWUP_GRAMMAR,
    LANGUAGE_RULES,
    LESSON_GRAMMAR,
    FollowupOut,
    LessonOut,
)
from app.llm.client import LLMClient, LLMError, generate_structured, load_prompt
from app.memory.mastery import get_or_create_concept, relevant_memories
from app.rag.retrieve import Retrieved, format_passages, retrieve

log = logging.getLogger(__name__)

NO_MATERIAL_RULE = ("No relevant course passages were found. Say clearly at the start that the course "
                    "materials do not cover this, then teach from general knowledge with empty citations.")
GROUNDED_RULE = ("Separate what the course passages say from your own extra explanation. "
                 "If the passages do not answer the question, say so.")


def _map_citations(refs: list[str], results: list[Retrieved]) -> list[dict]:
    """Keep only chunk ids that were in the prompt (rule 4: no fabricated citations)."""
    allowed = {r.ref: r for r in results}
    out, seen = [], set()
    for ref in refs:
        ref = ref.strip().strip("[]")
        if ref in allowed and ref not in seen:
            seen.add(ref)
            out.append(allowed[ref].citation())
    return out


def _text_fallback_steps(text: str) -> list[dict]:
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    paras = [re.sub(r"[*#`_>]+", "", p) for p in paras][:6] or [text.strip()]
    return [{"say": p[:800], "board": [], "citations": []} for p in paras]


def _memory_block(memories: list) -> str:
    if not memories:
        return "(none)"
    return "\n".join(f"- {m.content}" for m in memories)


async def create_lesson(db: Session, llm: LLMClient, user_id: int, course_id: int,
                        question: str, language: str) -> Lesson:
    results = await retrieve(db, llm, user_id, course_id, question)
    memories = relevant_memories(db, user_id, course_id, question)
    grounded = bool(results)

    system = load_prompt("teacher_v1.txt").format(
        language_rule=LANGUAGE_RULES[language],
        grounding_rule=GROUNDED_RULE if grounded else NO_MATERIAL_RULE,
    )
    user = (f"COURSE PASSAGES:\n{format_passages(results)}\n\n"
            f"STUDENT MEMORIES:\n{_memory_block(memories)}\n\n"
            f"STUDENT QUESTION: {question}")
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]

    out = await generate_structured(llm, LessonOut, messages, json_schema=LESSON_GRAMMAR)
    fallback = out is None
    if out is None:
        # Text-only fallback (rule 2). Raises LLMError if the model is unreachable.
        text = await llm.chat(messages[:1] + [{"role": "user", "content": user +
                              "\n\nAnswer in short paragraphs of plain text."}])
        steps_raw = _text_fallback_steps(text)
        # No reliable concept name without structured output; don't invent one from the question.
        title, concept_name, check = question[:120], None, None
    else:
        steps_raw = [s.model_dump() for s in out.steps]
        title, concept_name, check = out.title, out.concept, out.check_question

    conv = Conversation(user_id=user_id, course_id=course_id)
    db.add(conv)
    db.flush()
    concept = get_or_create_concept(db, course_id, concept_name) if concept_name else None
    lesson = Lesson(user_id=user_id, conversation_id=conv.id, course_id=course_id,
                    concept_id=concept.id if concept else None,
                    question=question, title=title, language=language, fallback=fallback,
                    check_question=check, grounded=grounded)
    db.add(lesson)
    db.flush()

    board = BoardState()
    for i, s in enumerate(steps_raw):
        db.add(LessonStep(lesson_id=lesson.id, idx=i, say=s["say"], board=board.apply(s["board"]),
                          citations=_map_citations(s["citations"], results)))
    db.add(Message(conversation_id=conv.id, role="user", content=question))
    db.add(Message(conversation_id=conv.id, role="assistant", content="\n".join(s["say"] for s in steps_raw)))
    db.commit()
    return lesson


def lesson_steps(db: Session, lesson_id: int) -> list[LessonStep]:
    return list(db.scalars(select(LessonStep).where(LessonStep.lesson_id == lesson_id).order_by(LessonStep.idx)))


async def answer_followup(db: Session, llm: LLMClient, lesson: Lesson, question: str,
                          shown_upto: int) -> dict:
    """Answer a question mid-lesson, keeping lesson context. Returns {say, board, citations}."""
    steps = lesson_steps(db, lesson.id)
    shown = steps[: shown_upto + 1]
    board = BoardState()
    for s in shown:
        board.apply(s.board)

    results = await retrieve(db, llm, lesson.user_id, lesson.course_id, f"{lesson.title} {question}")
    history = db.scalars(select(Message).where(Message.conversation_id == lesson.conversation_id)
                         .order_by(Message.created_at.desc()).limit(6)).all()[::-1]
    system = load_prompt("followup_v1.txt").format(
        language_rule=LANGUAGE_RULES[lesson.language],
        board_ids=", ".join(board.objects) or "(none)",
    )
    user = (f"LESSON: {lesson.title}\nSTEPS SHOWN SO FAR:\n" +
            "\n".join(f"{s.idx + 1}. {s.say}" for s in shown) +
            "\n\nRECENT CONVERSATION:\n" + "\n".join(f"{m.role}: {m.content[:300]}" for m in history) +
            f"\n\nCOURSE PASSAGES:\n{format_passages(results)}\n\nSTUDENT QUESTION: {question}")
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]

    out = await generate_structured(llm, FollowupOut, messages, json_schema=FOLLOWUP_GRAMMAR)
    if out is None:
        text = await llm.chat(messages[:1] + [{"role": "user", "content": user + "\n\nAnswer in plain text."}])
        reply = {"say": re.sub(r"[*#`_>]+", "", text).strip()[:1500], "board": [], "citations": []}
    else:
        reply = {"say": out.answer, "board": board.apply(out.board),
                 "citations": _map_citations(out.citations, results)}
    db.add(Message(conversation_id=lesson.conversation_id, role="user", content=question))
    db.add(Message(conversation_id=lesson.conversation_id, role="assistant", content=reply["say"]))
    db.commit()
    return reply


def lesson_chunks_text(db: Session, steps: list[LessonStep], max_chars: int = 2400) -> str:
    ids = {c["id"].removeprefix("chunk_") for s in steps for c in s.citations}
    chunks = db.scalars(select(DocumentChunk).where(DocumentChunk.id.in_([int(i) for i in ids]))).all() if ids else []
    return "\n\n".join(c.content[: max_chars // max(1, len(chunks))] for c in chunks) or "(none)"


def mastery_for(db: Session, user_id: int, concept_id: int | None) -> float | None:
    if concept_id is None:
        return None
    rec = db.get(MasteryRecord, (user_id, concept_id))
    return rec.score if rec else None


__all__ = ["create_lesson", "answer_followup", "lesson_steps", "LLMError"]
