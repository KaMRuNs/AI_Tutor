"""Mastery scores, spaced repetition (SM-2 lite), concepts and evidence-backed memories."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Assessment, Concept, MasteryRecord, Memory, ReviewSchedule


def get_or_create_concept(db: Session, course_id: int, name: str) -> Concept:
    name = name.strip()[:200] or "General"
    concept = db.scalar(select(Concept).where(Concept.course_id == course_id,
                                              func.lower(Concept.name) == name.lower()))
    if concept is None:
        concept = Concept(course_id=course_id, name=name)
        db.add(concept)
        db.flush()
    return concept


def mastery_from_results(results: list[bool], decay: float = 0.8) -> float:
    """Exponentially weighted accuracy, newest first, scaled down until there are 5+ attempts."""
    if not results:
        return 0.0
    weights = [decay**i for i in range(len(results))]
    acc = sum(w for w, ok in zip(weights, results, strict=True) if ok) / sum(weights)
    confidence = min(1.0, len(results) / 5)
    return round(acc * confidence, 3)


def update_mastery(db: Session, user_id: int, concept_id: int) -> float:
    recent = db.scalars(
        select(Assessment.correct).where(Assessment.user_id == user_id, Assessment.concept_id == concept_id)
        .order_by(Assessment.created_at.desc(), Assessment.id.desc()).limit(10)
    ).all()
    score = mastery_from_results(list(recent))
    rec = db.get(MasteryRecord, (user_id, concept_id))
    if rec is None:
        rec = MasteryRecord(user_id=user_id, concept_id=concept_id)
        db.add(rec)
    rec.score = score
    rec.updated_at = datetime.now(timezone.utc)
    return score


def schedule_review(rec: ReviewSchedule, quality: int, now: datetime | None = None) -> ReviewSchedule:
    """SM-2 lite. quality: 0..5 (we use 5 for a fully correct quiz, 2 for mostly wrong)."""
    now = now or datetime.now(timezone.utc)
    if quality < 3:
        rec.repetitions = 0
        rec.interval_days = 1
    else:
        rec.repetitions += 1
        rec.interval_days = 1 if rec.repetitions == 1 else 3 if rec.repetitions == 2 \
            else round(rec.interval_days * rec.ease, 1)
    rec.ease = max(1.3, rec.ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    rec.due_at = now + timedelta(days=rec.interval_days)
    return rec


def record_review(db: Session, user_id: int, concept_id: int, fraction_correct: float) -> None:
    rec = db.get(ReviewSchedule, (user_id, concept_id))
    if rec is None:
        rec = ReviewSchedule(user_id=user_id, concept_id=concept_id, interval_days=0, ease=2.5, repetitions=0)
        db.add(rec)
    quality = 5 if fraction_correct >= 0.99 else 4 if fraction_correct >= 0.66 else 2
    schedule_review(rec, quality)


def add_misconception(db: Session, user_id: int, concept_id: int | None, text: str, assessment_id: int) -> None:
    text = text.strip()
    if not text:
        return
    db.add(Memory(user_id=user_id, concept_id=concept_id, type="misconception", content=text[:500],
                  evidence={"type": "assessment", "id": assessment_id}))


def relevant_memories(db: Session, user_id: int, course_id: int, query: str, limit: int = 3) -> list[Memory]:
    """Evidence-backed memories whose concept name appears in the query (or the lesson concept)."""
    mems = db.scalars(
        select(Memory).join(Concept, Concept.id == Memory.concept_id)
        .where(Memory.user_id == user_id, Concept.course_id == course_id)
        .order_by(Memory.created_at.desc()).limit(30)
    ).all()
    mems = [m for m in mems if m.evidence and m.evidence.get("id")]
    q = query.lower()
    names = {c.id: c.name.lower() for c in db.scalars(select(Concept).where(Concept.course_id == course_id))}
    return [m for m in mems if names.get(m.concept_id, "\0") in q][:limit]
