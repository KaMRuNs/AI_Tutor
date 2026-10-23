"""Evaluation harness (plan.md §15).

Retrieval@5 on evals/retrieval.jsonl against the seeded demo course, plus the grounded/not-grounded
decision for off-topic questions. With --lessons N it also generates N real lessons and reports the
schema-valid rate and how many board commands survived validation.

Run from backend/:  .venv/Scripts/python ../evals/run.py [--course 1] [--lessons 3]
"""

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal, init_db  # noqa: E402
from app.db.models import Course, User  # noqa: E402
from app.lesson.service import create_lesson, lesson_steps  # noqa: E402
from app.llm.client import OllamaClient  # noqa: E402
from app.rag.retrieve import retrieve  # noqa: E402


async def eval_retrieval(course_id: int, llm: OllamaClient) -> None:
    cases = [json.loads(line) for line in (ROOT / "evals" / "retrieval.jsonl").read_text(encoding="utf-8").splitlines()
             if line.strip()]
    hit = total = correct_refusal = off_topic = 0
    with SessionLocal() as db:
        uid = db.scalar(select(Course.user_id).where(Course.id == course_id))
        for c in cases:
            results = await retrieve(db, llm, uid, course_id, c["q"], top_k=5)
            pages = [r.chunk.page_start for r in results]
            if c["page"] is None:
                off_topic += 1
                ok = not results
                correct_refusal += ok
                print(f"  {'OK ' if ok else 'BAD'} off-topic  {c['q'][:50]:<50} -> {pages}")
            else:
                total += 1
                ok = c["page"] in pages
                hit += ok
                print(f"  {'OK ' if ok else 'BAD'} p.{c['page']}  {c['q'][:50]:<50} -> {pages}")
    print(f"\nretrieval@5: {hit}/{total} = {hit / max(total, 1):.0%} (target ≥85%)")
    print(f"off-topic correctly ungrounded: {correct_refusal}/{off_topic}")


async def eval_lessons(course_id: int, llm: OllamaClient, n: int) -> None:
    questions = ["binary search কীভাবে কাজ করে?", "Deadlock prevention বুঝিয়ে দাও", "BFS আর DFS এর পার্থক্য",
                 "BST তে inorder traversal", "Coffman conditions কী?"][:n]
    valid = kept = 0
    for q in questions:
        t = time.time()
        with SessionLocal() as db:
            uid = db.scalar(select(User.id))
            lesson = await create_lesson(db, llm, uid, course_id, q, "bangla")
            steps = lesson_steps(db, lesson.id)
            cmds = sum(len(s.board) for s in steps)
            cites = sum(len(s.citations) for s in steps)
        valid += not lesson.fallback
        kept += cmds
        print(f"  {'valid' if not lesson.fallback else 'FALLBACK':8} {time.time() - t:5.0f}s  steps={len(steps)} "
              f"board={cmds} citations={cites}  {q}")
    print(f"\nschema-valid lessons: {valid}/{len(questions)} (target ≥98%) · board commands kept: {kept}")


async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--course", type=int, default=1)
    p.add_argument("--lessons", type=int, default=0)
    args = p.parse_args()
    init_db()
    llm = OllamaClient()
    print("== retrieval ==")
    await eval_retrieval(args.course, llm)
    if args.lessons:
        print("\n== lessons ==")
        await eval_lessons(args.course, llm, args.lessons)


if __name__ == "__main__":
    asyncio.run(main())
