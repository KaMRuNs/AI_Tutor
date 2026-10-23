"""REST routes (plan.md §12)."""

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import config
from app.api.deps import current_user_id, owned_course, owned_lesson
from app.db import get_db
from app.db.models import (
    Assessment,
    Concept,
    Conversation,
    Course,
    Document,
    DocumentChunk,
    Lesson,
    LessonStep,
    MasteryRecord,
    Memory,
    Message,
    QuizItem,
    ReviewSchedule,
    User,
)
from app.lesson.quiz import generate_quiz, submit_quiz
from app.lesson.service import create_lesson, lesson_steps, mastery_for
from app.llm.client import LLMError, get_llm
from app.rag.ingest import ingest_document

router = APIRouter(prefix="/api")

ALLOWED_SUFFIXES = {".pdf", ".txt"}
MAX_UPLOAD_BYTES = 40 * 1024 * 1024


# ---------- health ----------

@router.get("/health")
async def health() -> dict:
    ok, models = False, []
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f"{config.OLLAMA_URL}/api/tags")
            models = [m["name"] for m in r.json().get("models", [])]
            ok = True
    except (httpx.HTTPError, ValueError):
        pass
    return {"ollama": ok, "llm_model": config.LLM_MODEL,
            "llm_available": any(m.startswith(config.LLM_MODEL) for m in models),
            "embed_available": bool(config.EMBED_MODEL) and any(m.startswith(config.EMBED_MODEL) for m in models)}


# ---------- courses ----------

class CourseIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


def _course_dict(db: Session, c: Course) -> dict:
    docs = db.scalar(select(func.count()).select_from(Document).where(Document.course_id == c.id)) or 0
    lessons = db.scalar(select(func.count()).select_from(Lesson).where(Lesson.course_id == c.id)) or 0
    return {"id": c.id, "name": c.name, "description": c.description, "documents": docs, "lessons": lessons}


@router.post("/courses")
async def create_course(body: CourseIn, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    c = Course(user_id=uid, name=body.name.strip(), description=body.description)
    db.add(c)
    db.commit()
    return _course_dict(db, c)


@router.get("/courses")
async def list_courses(db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    return [_course_dict(db, c) for c in db.scalars(select(Course).where(Course.user_id == uid).order_by(Course.id))]


@router.get("/courses/{course_id}")
async def get_course(course_id: int, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    return _course_dict(db, owned_course(db, uid, course_id))


# ---------- documents ----------

def _doc_dict(d: Document, chunks: int = 0) -> dict:
    return {"id": d.id, "course_id": d.course_id, "filename": d.filename, "kind": d.kind, "status": d.status,
            "error": d.error, "page_count": d.page_count, "chunks": chunks, "created_at": d.created_at.isoformat()}


@router.post("/documents")
async def upload_document(background: BackgroundTasks, course_id: int = Form(...), file: UploadFile = File(...),
                          db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    owned_course(db, uid, course_id)
    name = Path(file.filename or "upload").name
    suffix = Path(name).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(400, "Only PDF and TXT files are supported in the MVP.")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 40 MB).")
    config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^\w.\-]+", "_", name)[:120]
    path = config.UPLOAD_DIR / f"{uuid.uuid4().hex[:12]}_{safe}"
    path.write_bytes(data)
    doc = Document(user_id=uid, course_id=course_id, filename=name, file_path=str(path))
    db.add(doc)
    db.commit()
    background.add_task(ingest_document, doc.id, get_llm())
    return _doc_dict(doc)


@router.get("/documents")
async def list_documents(course_id: int, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    owned_course(db, uid, course_id)
    counts = dict(db.execute(select(DocumentChunk.document_id, func.count()).where(DocumentChunk.course_id == course_id)
                             .group_by(DocumentChunk.document_id)).all())
    docs = db.scalars(select(Document).where(Document.course_id == course_id, Document.user_id == uid)
                      .order_by(Document.id.desc()))
    return [_doc_dict(d, counts.get(d.id, 0)) for d in docs]


@router.get("/documents/{doc_id}")
async def get_document(doc_id: int, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    d = db.get(Document, doc_id)
    if d is None or d.user_id != uid:
        raise HTTPException(404, "document not found")
    n = db.scalar(select(func.count()).select_from(DocumentChunk).where(DocumentChunk.document_id == d.id)) or 0
    return _doc_dict(d, n)


@router.get("/documents/{doc_id}/file")
async def document_file(doc_id: int, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    d = db.get(Document, doc_id)
    if d is None or d.user_id != uid:
        raise HTTPException(404, "document not found")
    return FileResponse(d.file_path, filename=d.filename,
                        media_type="application/pdf" if d.filename.lower().endswith(".pdf") else "text/plain",
                        content_disposition_type="inline")


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: int, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    d = db.get(Document, doc_id)
    if d is None or d.user_id != uid:
        raise HTTPException(404, "document not found")
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == d.id))
    Path(d.file_path).unlink(missing_ok=True)
    db.delete(d)
    db.commit()
    return {"ok": True}


# ---------- lessons ----------

class LessonIn(BaseModel):
    course_id: int
    question: str = Field(min_length=2, max_length=1000)
    language: Literal["bangla", "banglish", "english"] = "bangla"


def _lesson_dict(db: Session, lesson: Lesson, with_steps: bool = True) -> dict:
    d = {"id": lesson.id, "course_id": lesson.course_id, "title": lesson.title, "question": lesson.question,
         "language": lesson.language, "fallback": lesson.fallback, "grounded": lesson.grounded,
         "check_question": lesson.check_question, "created_at": lesson.created_at.isoformat()}
    if lesson.concept_id:
        concept = db.get(Concept, lesson.concept_id)
        d["concept"] = concept.name if concept else None
        d["mastery"] = mastery_for(db, lesson.user_id, lesson.concept_id)
    if with_steps:
        d["steps"] = [{"index": s.idx, "say": s.say, "board": s.board, "citations": s.citations}
                      for s in lesson_steps(db, lesson.id)]
    return d


@router.post("/lessons")
async def start_lesson(body: LessonIn, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    owned_course(db, uid, body.course_id)
    try:
        lesson = await create_lesson(db, get_llm(), uid, body.course_id, body.question.strip(), body.language)
    except LLMError as e:
        raise HTTPException(503, f"The teacher model is unavailable. Is Ollama running? ({e})") from e
    return _lesson_dict(db, lesson)


@router.get("/lessons")
async def list_lessons(course_id: int | None = None, limit: int = 20,
                       db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    q = select(Lesson).where(Lesson.user_id == uid)
    if course_id is not None:
        q = q.where(Lesson.course_id == course_id)
    lessons = db.scalars(q.order_by(Lesson.created_at.desc()).limit(min(limit, 100)))
    return [_lesson_dict(db, lesson, with_steps=False) for lesson in lessons]


@router.get("/lessons/{lesson_id}")
async def get_lesson(lesson_id: int, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    return _lesson_dict(db, owned_lesson(db, uid, lesson_id))


# ---------- quizzes ----------

class QuizIn(BaseModel):
    lesson_id: int
    n: int = Field(3, ge=1, le=5)


class SubmitIn(BaseModel):
    answers: dict[int, str]


def _item_dict(q: QuizItem) -> dict:
    return {"id": q.id, "type": q.type, "question": q.question, "options": q.options}


@router.post("/quizzes")
async def create_quiz(body: QuizIn, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    lesson = owned_lesson(db, uid, body.lesson_id)
    try:
        items = await generate_quiz(db, get_llm(), lesson, body.n)
    except LLMError as e:
        raise HTTPException(503, str(e)) from e
    if not items:
        raise HTTPException(502, "Could not generate a valid quiz. Please try again.")
    return {"lesson_id": lesson.id, "items": [_item_dict(q) for q in items]}


@router.post("/quizzes/{lesson_id}/submit")
async def submit(lesson_id: int, body: SubmitIn, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    lesson = owned_lesson(db, uid, lesson_id)
    return await submit_quiz(db, get_llm(), uid, lesson, body.answers)


# ---------- learning profile ----------

@router.get("/learning-profile")
async def learning_profile(db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    rows = db.execute(select(MasteryRecord, Concept, Course.name)
                      .join(Concept, Concept.id == MasteryRecord.concept_id)
                      .join(Course, Course.id == Concept.course_id)
                      .where(MasteryRecord.user_id == uid).order_by(MasteryRecord.score)).all()
    mems = db.scalars(select(Memory).where(Memory.user_id == uid).order_by(Memory.created_at.desc()).limit(20))
    total = db.scalar(select(func.count()).select_from(Assessment).where(Assessment.user_id == uid)) or 0
    correct = db.scalar(select(func.count()).select_from(Assessment)
                        .where(Assessment.user_id == uid, Assessment.correct.is_(True))) or 0
    user = db.get(User, uid)
    return {
        "preferences": user.preferences if user else {},
        "mastery": [{"concept_id": c.id, "concept": c.name, "course": course, "score": m.score,
                     "updated_at": m.updated_at.isoformat()} for m, c, course in rows],
        "misconceptions": [{"id": m.id, "content": m.content, "evidence": m.evidence,
                            "created_at": m.created_at.isoformat()} for m in mems],
        "quiz_totals": {"answered": total, "correct": correct},
    }


@router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: int, db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    m = db.get(Memory, memory_id)
    if m is None or m.user_id != uid:
        raise HTTPException(404, "memory not found")
    db.delete(m)
    db.commit()
    return {"ok": True}


@router.get("/revision-plan")
async def revision_plan(db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    now = datetime.now(timezone.utc)
    rows = db.execute(select(ReviewSchedule, Concept).join(Concept, Concept.id == ReviewSchedule.concept_id)
                      .where(ReviewSchedule.user_id == uid).order_by(ReviewSchedule.due_at)).all()
    out = []
    for r, c in rows:
        due = r.due_at if r.due_at.tzinfo else r.due_at.replace(tzinfo=timezone.utc)
        out.append({"concept_id": c.id, "concept": c.name, "course_id": c.course_id, "due_at": due.isoformat(),
                    "due": due <= now, "interval_days": r.interval_days,
                    "mastery": mastery_for(db, uid, c.id)})
    return out


# ---------- privacy ----------

@router.get("/me/export")
async def export_me(db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    lessons = db.scalars(select(Lesson).where(Lesson.user_id == uid)).all()
    return {
        "courses": [_course_dict(db, c) for c in db.scalars(select(Course).where(Course.user_id == uid))],
        "lessons": [_lesson_dict(db, lesson) for lesson in lessons],
        "profile": await learning_profile(db, uid),
    }


@router.delete("/me/data")
async def delete_me(db: Session = Depends(get_db), uid: int = Depends(current_user_id)):
    """Delete all learning history (lessons, quizzes, memories, mastery). Courses and documents are kept."""
    lesson_ids = select(Lesson.id).where(Lesson.user_id == uid)
    conv_ids = select(Conversation.id).where(Conversation.user_id == uid)
    item_ids = select(QuizItem.id).where(QuizItem.user_id == uid)
    db.execute(delete(Assessment).where(Assessment.user_id == uid))
    db.execute(delete(QuizItem).where(QuizItem.id.in_(item_ids)))
    db.execute(delete(LessonStep).where(LessonStep.lesson_id.in_(lesson_ids)))
    db.execute(delete(Lesson).where(Lesson.user_id == uid))
    db.execute(delete(Message).where(Message.conversation_id.in_(conv_ids)))
    db.execute(delete(Conversation).where(Conversation.user_id == uid))
    db.execute(delete(Memory).where(Memory.user_id == uid))
    db.execute(delete(MasteryRecord).where(MasteryRecord.user_id == uid))
    db.execute(delete(ReviewSchedule).where(ReviewSchedule.user_id == uid))
    db.commit()
    return {"ok": True}
