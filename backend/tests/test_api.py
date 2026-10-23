"""End-to-end API test with a fake LLM (no Ollama needed)."""

import json
import time

from fastapi.testclient import TestClient

from app.llm.client import LLMError, set_llm
from app.main import app

LESSON = {
    "title": "Binary Search — উদাহরণ", "concept": "Binary search",
    "steps": [
        {"say": "ধরো একটি sorted array আছে।", "citations": ["chunk_1", "chunk_999"],
         "board": [{"action": "draw_array", "id": "arr", "values": [2, 5, 8, 12, 16]},
                   {"action": "highlight", "target": "arr", "indices": [7]}]},
        {"say": "মাঝের মান 8।", "citations": [], "board": [{"action": "highlight", "target": "arr", "indices": [2]}]},
    ],
    "check_question": "target 2 হলে কোন দিকে যাব?",
}
QUIZ = {"items": [
    {"type": "mcq", "question": "Time complexity?", "options": ["O(n)", "O(log n)"], "answer": "O(log n)",
     "explanation": "halves", "concept": "Binary search"},
    {"type": "numeric", "question": "Steps for n=8?", "answer": "3", "explanation": "log2 8",
     "concept": "Binary search"},
    {"type": "mcq", "question": "bad", "options": ["a", "b"], "answer": "c", "concept": "x"},
]}


class FakeLLM:
    def __init__(self, fail_schema: bool = False, down: bool = False):
        self.fail_schema, self.down, self.calls = fail_schema, down, 0

    async def chat(self, messages, schema=None):
        self.calls += 1
        if self.down:
            raise LLMError("down")
        if schema is None:
            return "Binary search ছোট করে খোঁজে।\n\nএটি O(log n)।"
        if self.fail_schema:
            return "{not json"
        title = schema.get("title", "")
        if "Lesson" in title:
            return json.dumps(LESSON, ensure_ascii=False)
        if "Followup" in title:
            return json.dumps({"answer": "কারণ array sorted।", "board": [], "citations": ["chunk_1"]})
        if "Quiz" in title:
            return json.dumps(QUIZ)
        return json.dumps({"correct": False, "explanation": "no", "misconception": "x"})

    async def embed(self, texts):
        return None


def _setup(client, tmp_path):
    course = client.post("/api/courses", json={"name": "Algorithms"}).json()
    f = tmp_path / "notes.txt"
    f.write_text("Binary Search\nBinary search finds a target in a sorted array by halving the range. "
                 "Time complexity is O(log n).", encoding="utf-8")
    with f.open("rb") as fh:
        doc = client.post("/api/documents", data={"course_id": course["id"]},
                          files={"file": ("notes.txt", fh, "text/plain")}).json()
    for _ in range(50):
        if client.get(f"/api/documents/{doc['id']}").json()["status"] != "processing":
            break
        time.sleep(0.05)
    return course


def test_full_flow(tmp_path):
    set_llm(FakeLLM())
    with TestClient(app) as client:
        course = _setup(client, tmp_path)
        docs = client.get("/api/documents", params={"course_id": course["id"]}).json()
        assert docs[0]["status"] == "ready" and docs[0]["chunks"] >= 1

        r = client.post("/api/lessons", json={"course_id": course["id"], "question": "binary search কী?"})
        lesson = r.json()
        assert r.status_code == 200 and not lesson["fallback"] and lesson["grounded"]
        s0 = lesson["steps"][0]
        assert [c["action"] for c in s0["board"]] == ["draw_array"]          # bad highlight dropped
        assert [c["id"] for c in s0["citations"]] == ["chunk_1"]             # fabricated id dropped
        assert s0["citations"][0]["page"] == 1

        with client.websocket_connect(f"/ws/lessons/{lesson['id']}") as ws:
            assert ws.receive_json()["type"] == "lesson.meta"
            assert ws.receive_json()["type"] == "lesson.step"
            assert ws.receive_json()["type"] == "board.cmd"
            ws.send_json({"type": "next"})
            assert ws.receive_json()["data"]["index"] == 1
            ws.receive_json()
            assert ws.receive_json()["type"] == "lesson.check"
            ws.send_json({"type": "ask", "data": {"text": "কেন?"}})
            assert ws.receive_json()["type"] == "teacher.thinking"
            ans = ws.receive_json()
            assert ans["type"] == "teacher.answer" and ans["data"]["citations"][0]["id"] == "chunk_1"

        quiz = client.post("/api/quizzes", json={"lesson_id": lesson["id"]}).json()
        assert len(quiz["items"]) == 2                                         # invalid mcq dropped
        mcq, num = quiz["items"]
        res = client.post(f"/api/quizzes/{lesson['id']}/submit",
                          json={"answers": {str(mcq["id"]): "O(n)", str(num["id"]): "৩"}}).json()
        assert res["score"] == 1 and res["total"] == 2

        prof = client.get("/api/learning-profile").json()
        assert prof["mastery"][0]["concept"] == "Binary search"
        assert prof["misconceptions"][0]["evidence"]["type"] == "assessment"
        assert client.get("/api/revision-plan").json()[0]["concept"] == "Binary search"

        assert client.delete("/api/me/data").json()["ok"]
        assert client.get("/api/learning-profile").json()["misconceptions"] == []


def test_fallback_and_unavailable(tmp_path):
    with TestClient(app) as client:
        set_llm(FakeLLM())
        course = _setup(client, tmp_path)
        set_llm(FakeLLM(fail_schema=True))
        lesson = client.post("/api/lessons", json={"course_id": course["id"], "question": "binary search"}).json()
        assert lesson["fallback"] and len(lesson["steps"]) == 2 and lesson["steps"][0]["board"] == []
        set_llm(FakeLLM(down=True))
        r = client.post("/api/lessons", json={"course_id": course["id"], "question": "binary search"})
        assert r.status_code == 503
