# Architecture — Bangla AI Teacher

This document describes how the system is built. Scope and priorities are in [plan.md](plan.md); working rules are in [CLAUDE.md](CLAUDE.md).

## 1. Overview

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js UI<br/>dashboard · library · classroom · progress]
    Board[SVG Whiteboard<br/>+ KaTeX]
    Mic[Push-to-talk<br/>+ audio player]
  end

  subgraph Backend[FastAPI]
    API[REST routes]
    WS[WebSocket /ws/lessons/:id]
    Lesson[Lesson controller<br/>state machine]
    BoardV[Board validator]
    RAG[RAG service]
    Mem[Memory & mastery]
    Voice[Voice adapters]
    LLM[LLM client]
  end

  Ollama[(Ollama<br/>gemma3:4b)]
  Emb[(Embedding model<br/>bge-m3)]
  PG[(PostgreSQL<br/>+ pgvector)]
  Files[(File storage)]

  UI --> API
  UI <--> WS
  Board <-- board.cmd --- WS
  Mic --> API
  API --> Lesson
  WS --> Lesson
  Lesson --> RAG
  Lesson --> Mem
  Lesson --> LLM
  Lesson --> BoardV
  LLM --> Ollama
  RAG --> Emb
  RAG --> PG
  Mem --> PG
  API --> Files
  Voice --> API
```

**Principle:** one teacher LLM, surrounded by deterministic services. The model decides *what to say and what to draw*; code decides *whether it is valid, how it looks, and what it means for progress*.

## 2. Backend modules

| Module | Responsibility |
| --- | --- |
| `app/api` | Routes, request/response models, WebSocket handler, current-user dependency (demo user in MVP). |
| `app/llm` | `LLMClient` interface + Ollama implementation; `generate_structured(schema, messages)` with validate → retry → fallback; prompt files. |
| `app/rag` | `extract.py` (PyMuPDF, vision fallback), `chunk.py`, `embed.py`, `retrieve.py` (hybrid + RRF), `cite.py` (chunk id → doc/page). |
| `app/lesson` | State machine, context assembly (respecting the token budget), lesson persistence, follow-up handling. |
| `app/board` | Pydantic models for board commands; semantic validation (ids, references, index ranges). |
| `app/memory` | Mastery calculation, SM-2-lite scheduler, candidate memory validation, export/delete. |
| `app/voice` | `STT` and `TTS` interfaces; Whisper and MMS-TTS adapters (Level 2). |
| `app/db` | SQLAlchemy models, Alembic migrations, session handling. |
| `app/jobs` | Background ingestion (FastAPI `BackgroundTasks` in MVP; a queue later if needed). |

## 3. Key flows

### 3.1 Document ingestion

```mermaid
sequenceDiagram
  participant U as Browser
  participant A as API
  participant J as Ingestion job
  participant G as Gemma (vision)
  participant DB as Postgres
  U->>A: POST /api/documents (file, course_id)
  A->>DB: insert document(status=processing)
  A-->>U: 202 {id}
  A->>J: enqueue
  J->>J: PyMuPDF text per page
  alt page text too short (scanned/diagram)
    J->>G: page image → describe
  end
  J->>J: chunk (400–800 tokens, overlap, page range)
  J->>J: embed (bge-m3)
  J->>DB: insert chunks (+ tsvector)
  J->>DB: document.status = ready | failed
  U->>A: GET /api/documents/{id} (poll)
```

### 3.2 Question → streamed lesson

```mermaid
sequenceDiagram
  participant U as Browser
  participant A as API/WS
  participant L as Lesson controller
  participant R as RAG
  participant M as Memory
  participant G as Gemma
  U->>A: POST /api/lessons {course_id, question, language}
  A->>L: start
  L->>M: mastery + relevant memories
  L->>R: hybrid retrieve (course filter, top 4)
  L->>G: prompt + Lesson JSON schema
  G-->>L: JSON
  L->>L: validate (Pydantic + board semantics)
  alt invalid (≤2 retries with error)
    L->>G: retry
  else still invalid
    L->>L: text-only fallback lesson
  end
  L-->>A: lesson id
  U->>A: WS connect /ws/lessons/{id}
  loop each step
    A-->>U: lesson.step {say, citations}
    A-->>U: board.cmd[]
    U->>A: next | prev | ask | interrupt
  end
  A-->>U: lesson.check {question}
```

### 3.3 Quiz → grade → mastery

1. `POST /api/quizzes` → Gemma generates `Quiz` (MCQ, numeric, short answer) grounded in the lesson's chunks; validated.
2. `POST /api/quizzes/{id}/submit` → MCQ/numeric graded in code; short answers graded by Gemma against a reference answer with a strict `Feedback` schema.
3. Wrong answers → candidate `misconception` memory with `evidence = assessment_id`.
4. `mastery_records` recomputed; `review_schedule` updated (SM-2 lite).

### 3.4 Voice (Level 2)

- Push-to-talk records audio in the browser → `POST /api/voice/transcribe` → transcript shown and editable → sent as `ask`.
- For each streamed step, the client requests `POST /api/voice/synthesize {text: step.say}` (or receives `tts.chunk` over WS) and starts board animation when audio starts.
- Mic press or pause → client stops audio and animations, sends `student.interrupt`; controller pauses at the current step.
- Fallbacks: Web Speech API for STT, `speechSynthesis` for TTS, text-only if both fail.

## 4. Schemas

### 4.1 Lesson

```python
class Step(BaseModel):
    say: str = Field(max_length=600)          # spoken/displayed text only
    board: list[BoardCommand] = []            # max ~6 per step
    citations: list[str] = []                 # chunk ids from the prompt only

class Lesson(BaseModel):
    title: str
    concept: str
    steps: list[Step] = Field(min_length=1, max_length=6)
    check_question: str | None = None
```

### 4.2 Board commands (discriminated union on `action`)

| Action | Fields |
| --- | --- |
| `write_text` | `id`, `text`, `style: heading \| body \| note` |
| `draw_array` | `id`, `values: list[str \| int]`, `label?` |
| `draw_node` | `id`, `label`, `group?` (tree/graph/list id) |
| `draw_edge` | `id`, `from_id`, `to_id`, `label?`, `directed: bool` |
| `draw_arrow` | `id`, `from_id`, `to_id`, `label?` |
| `draw_equation` | `id`, `latex` |
| `highlight` | `target`, `indices?`, `color: accent \| success \| warning` |
| `clear_region` | `ids: list[str]` |
| `next_step` | — |

Semantic validation after Pydantic: ids unique, referenced ids exist (in this or earlier steps), highlight indices within array bounds, LaTeX parses (KaTeX check on the client; bad equations render as plain text). Invalid commands are dropped and logged, not fatal.

**No coordinates from the model.** The frontend layout engine places objects: headings at the top, arrays in rows, node groups laid out as tree (dagre-style) or graph, equations and notes in a side column.

### 4.3 Quiz and feedback

```python
class QuizItem(BaseModel):
    type: Literal["mcq", "numeric", "short"]
    question: str
    options: list[str] | None = None
    answer: str
    explanation: str
    concept: str

class Feedback(BaseModel):
    correct: bool
    explanation: str
    misconception: str | None = None
```

## 5. WebSocket protocol — `/ws/lessons/{id}`

All messages are JSON `{type, data}` and validated on both ends.

| Direction | Type | Data |
| --- | --- | --- |
| server → client | `lesson.meta` | `title`, `step_count`, `language` |
| server → client | `lesson.step` | `index`, `say`, `citations[] {doc, page}` |
| server → client | `board.cmd` | `index`, `commands[]` |
| server → client | `tts.chunk` | `index`, audio (base64) — Level 2 |
| server → client | `lesson.check` | `question` |
| server → client | `teacher.answer` | follow-up answer (may include new steps) |
| server → client | `error` | `code`, `message`, `fallback?` |
| client → server | `next` / `prev` | — |
| client → server | `ask` | `text` |
| client → server | `student.interrupt` | `at_index` |
| client → server | `check.answer` | `text` |

## 6. Lesson state machine

```mermaid
stateDiagram-v2
  [*] --> Assess
  Assess --> Retrieve
  Retrieve --> Plan
  Plan --> Teach : valid lesson
  Plan --> Teach : text fallback
  Teach --> Teach : next/prev
  Teach --> Answer : ask / interrupt
  Answer --> Teach : resume
  Teach --> Check : last step
  Check --> Adapt
  Adapt --> Plan : wrong/confused (new example)
  Adapt --> [*] : correct (update mastery)
```

Follow-up context sent to the model: lesson title, steps shown so far (say text only), a short board summary (object ids and labels), the question, and freshly retrieved chunks.

## 7. Data model

See plan.md §11 for the full table list. Notes:

- `document_chunks.embedding vector(1024)` (bge-m3) with an HNSW index; `tsv tsvector` with a GIN index (`simple` config, since Postgres has no Bangla stemmer).
- `documents.kind`: `course_material | past_question`, so past questions are retrievable separately.
- `lesson_steps.board` is JSONB holding validated commands.
- `memories.evidence` is JSONB `{type: "assessment" | "message", id}`; memories without evidence are rejected.
- B-tree indexes on all foreign keys and `(user_id, created_at)`.

## 8. Retrieval details

- Query = student question (+ lesson concept for follow-ups).
- Vector top 20 + full-text top 20 → reciprocal rank fusion → top 4 → `course_id` filter applied in both queries.
- If the best fused score is below a tuned threshold, pass "no relevant material" to the prompt.
- Chunks are given to the model as `[chunk_42] (Lecture 3, p.12) ...text...`.

## 9. Failure handling

| Failure | Behavior |
| --- | --- |
| Invalid JSON / schema | Retry ≤2 with error message; then text-only lesson (one step per paragraph, no board). |
| Invalid board command | Drop that command, keep the step. |
| Ollama down / timeout | `error` event with a friendly Bangla/English message; the lesson can be retried. |
| Ingestion failure | `documents.status = failed` with reason; shown in the library. |
| STT failure | Fall back to Web Speech API, then to typing. |
| TTS failure | Browser `speechSynthesis`, then text-only. |

## 10. Configuration

Environment variables (`backend/.env`):

```
DATABASE_URL=postgresql+psycopg://teacher:teacher@localhost:5432/teacher
OLLAMA_URL=http://localhost:11434
LLM_MODEL=gemma3:4b
EMBED_MODEL=BAAI/bge-m3
UPLOAD_DIR=./data/uploads
RETRIEVAL_TOP_K=4
LLM_MAX_RETRIES=2
STT_PROVIDER=whisper|browser
TTS_PROVIDER=mms|browser
```

Frontend: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`.

## 11. Deployment

Docker Compose services: `db` (pgvector/pgvector:pg16), `backend`, `frontend`. Ollama runs on the host (GPU access is easier) and is reached via `OLLAMA_URL`. For weak hardware, point `OLLAMA_URL` at an authorized remote server; nothing else changes.
