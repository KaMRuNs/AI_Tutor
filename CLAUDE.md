# CLAUDE.md

Bangla AI Teacher: a personal AI tutor for university CSE students. It teaches from uploaded course PDFs in Bangla/Banglish/English, using a step-by-step SVG whiteboard and (Level 2) Bangla voice. The LLM is Gemma 3 4B via Ollama.

- Product plan and scope: [plan.md](plan.md)
- System design, schemas, flows: [architecture.md](architecture.md)

## Repo layout (planned — not yet scaffolded)

```
frontend/   Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
  app/            pages: dashboard, library, classroom/[lessonId], progress
  components/board/   SVG whiteboard components (one per board action)
  lib/            API client, WebSocket client, shared types
backend/    FastAPI + Pydantic v2 + SQLAlchemy
  app/api/        REST + WebSocket routes
  app/llm/        Ollama client, prompts, structured-output helpers
  app/rag/        extraction, chunking, embeddings, retrieval
  app/lesson/     lesson state machine, orchestration
  app/board/      board command schemas + validation
  app/memory/     mastery, memories, spaced repetition
  app/voice/      STT / TTS adapters (Level 2)
  app/db/         models, migrations (Alembic)
evals/      JSONL test sets + scripts (retrieval@5, citations, schema validity)
data/       uploaded files (gitignored), seed demo PDF
docker-compose.yml
```

## Commands (update once scaffolded)

```sh
ollama pull gemma3:4b
docker compose up -d db
cd backend && uv sync && uv run alembic upgrade head && uv run uvicorn app.main:app --reload
cd frontend && pnpm install && pnpm dev
cd backend && uv run pytest
uv run python evals/run.py
```

## Hard rules

1. **The LLM never emits HTML, JS, or SVG.** It returns JSON matching the `Lesson` schema, using only the board actions listed in architecture.md. The frontend owns rendering and layout.
2. **Every LLM output goes through a Pydantic model.** Use Ollama `format` (JSON schema), validate, retry at most 2 times with the error fed back, then fall back to text-only. Never crash on bad model output.
3. **Deterministic code** for grading MCQ/numeric answers, mastery scores, review scheduling, permissions, and board layout. The LLM is only for language and teaching decisions.
4. **No fabricated citations.** The model may only cite chunk IDs it was given; the backend maps them to document/page. If retrieval is below threshold, the teacher says the materials don't cover it.
5. **Scope every query by `user_id`** (and `course_id` where relevant), even while the MVP has a single demo user.
6. **TTS receives only a step's `say` text**, never JSON or board commands.
7. **Memories need evidence.** Past mistakes are referenced only if a stored memory with an evidence ID exists.
8. **Keep prompts small** (~4–6k tokens total). See the context budget in plan.md §4.
9. **The LLM sits behind one client interface** (`app/llm/client.py`) so the model or runtime can be swapped.

## Conventions

- Python: type hints everywhere, `ruff` + `pytest`; async FastAPI routes.
- TypeScript: strict mode; board command types are generated from or mirrored by the backend Pydantic schemas. Keep them in sync.
- All text is UTF-8. Test with mixed Bangla-English input (e.g., "binary search-এর time complexity কত?").
- Keep English technical terms in Bangla output.
- Prompts live in `backend/app/llm/prompts/` as versioned files, not inline strings.
- When changing a prompt or schema, run `evals/` and note the schema-valid rate.
- Windows dev machine: use cross-platform paths and scripts.
