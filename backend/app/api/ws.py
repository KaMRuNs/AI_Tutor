"""Lesson WebSocket (architecture.md §5). The server owns lesson state; the client sends actions."""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ValidationError

from app.api.deps import current_user_id
from app.db import SessionLocal
from app.db.models import Lesson
from app.lesson.service import answer_followup, lesson_steps
from app.llm.client import LLMError, get_llm

log = logging.getLogger(__name__)
router = APIRouter()


class ClientMsg(BaseModel):
    type: str
    data: dict = {}


@router.websocket("/ws/lessons/{lesson_id}")
async def lesson_ws(ws: WebSocket, lesson_id: int) -> None:
    await ws.accept()
    with SessionLocal() as db:
        uid = current_user_id(db)
        lesson = db.get(Lesson, lesson_id)
        if lesson is None or lesson.user_id != uid:
            await ws.send_json({"type": "error", "data": {"code": "not_found", "message": "lesson not found"}})
            await ws.close()
            return
        steps = lesson_steps(db, lesson.id)
        idx = 0

        async def send_step(i: int) -> None:
            s = steps[i]
            await ws.send_json({"type": "lesson.step", "data": {"index": i, "say": s.say, "citations": s.citations}})
            await ws.send_json({"type": "board.cmd", "data": {"index": i, "commands": s.board}})
            if i == len(steps) - 1 and lesson.check_question:
                await ws.send_json({"type": "lesson.check", "data": {"question": lesson.check_question}})

        await ws.send_json({"type": "lesson.meta", "data": {"title": lesson.title, "step_count": len(steps),
                                                            "language": lesson.language,
                                                            "fallback": lesson.fallback}})
        if steps:
            await send_step(0)
        try:
            while True:
                try:
                    msg = ClientMsg.model_validate(await ws.receive_json())
                except (ValidationError, ValueError):
                    await ws.send_json({"type": "error", "data": {"code": "bad_message", "message": "invalid message"}})
                    continue
                if msg.type == "next" and idx < len(steps) - 1:
                    idx += 1
                    await send_step(idx)
                elif msg.type == "prev" and idx > 0:
                    idx -= 1
                    await send_step(idx)
                elif msg.type == "goto" and isinstance(msg.data.get("index"), int) \
                        and 0 <= msg.data["index"] < len(steps):
                    idx = msg.data["index"]
                    await send_step(idx)
                elif msg.type == "student.interrupt":
                    await ws.send_json({"type": "lesson.paused", "data": {"index": idx}})
                elif msg.type == "ask":
                    text = str(msg.data.get("text", "")).strip()[:1000]
                    if not text:
                        continue
                    await ws.send_json({"type": "teacher.thinking", "data": {}})
                    try:
                        reply = await answer_followup(db, get_llm(), lesson, text, idx)
                        await ws.send_json({"type": "teacher.answer", "data": {"question": text, "after_index": idx,
                                                                               **reply}})
                    except LLMError:
                        await ws.send_json({"type": "error", "data": {
                            "code": "llm_unavailable",
                            "message": "শিক্ষক এখন উত্তর দিতে পারছেন না। Ollama চালু আছে কিনা দেখুন।"}})
        except WebSocketDisconnect:
            return
