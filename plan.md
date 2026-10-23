# Project Plan: Bangla AI Teacher — Your Personal AI Classroom

**Vision:** An AI personal teacher that learns from a student's previous questions, understands their course materials, teaches concepts in Bangla through voice and an interactive whiteboard, and adapts to the student's level of understanding.

It is a web application powered by **Gemma 3 4B**, with separate retrieval, memory, whiteboard, and speech systems. The model is the teacher's reasoning engine, not the entire application.

The student should feel they are sitting in front of a real teacher who remembers their difficulties, explains patiently, draws while speaking, and checks whether they understand.

See also: [architecture.md](architecture.md) (system design) and [CLAUDE.md](CLAUDE.md) (rules for working in this repo).

## 1. Project overview

| Pillar | What it means |
| --- | --- |
| Personalized AI teacher | Remembers past questions, mistakes, preferences, and progress. |
| Natural Bangla voice | Understands spoken Bangla and responds aloud; Banglish and English modes optional. |
| Live teaching whiteboard | Draws diagrams, equations, algorithms, and step-by-step examples in sync with speech. |
| Course-aware learning | Uses uploaded PDFs, notes, and imported previous questions as evidence. |

**Target users:** University students who study in English but prefer difficult concepts explained in Bangla.

**First subject:** Computer Science and Engineering (CSE): data structures, algorithms, operating systems, databases, networks. These mix theory, diagrams, equations, and code.

**Development target:** A demo-ready MVP in about 3 weeks, then polish over weeks 4–6. Assumes a small team or a focused solo developer and a machine (or authorized server) that can run Gemma 3 4B.

## 2. The complete user experience

1. **Import learning materials:** upload lecture PDFs and (Level 2) previous questions.
2. **Choose a topic:** pick a course, topic, or exam question.
3. **Start a Bangla lesson:** the AI retrieves relevant material and plans a short lesson.
4. **Watch and interact:** the whiteboard draws step by step while the teacher explains.
5. **Ask questions:** type (MVP) or speak (Level 2): interrupt, ask why, request another example, go back.
6. **Test understanding:** answer quiz questions and get feedback based on mistakes.
7. **Remember and improve:** progress is updated and the next review is scheduled.

**Key requirement:** the teacher never delivers one long answer followed by a static diagram. A lesson is a sequence of small steps, each pairing what is said with what is drawn, so the student can pause, ask, and redirect at any step.

## 3. Feature roadmap

### Level 1 — Core MVP (weeks 1–3)

- Single local demo user (no login screen); every table still carries `user_id`.
- Create courses; upload **PDF and TXT** files; see processing status.
- Ask questions in text.
- Teach in Bangla, Banglish, or English.
- Retrieve relevant course passages and cite document + page.
- Lessons as validated step sequences with whiteboard actions (text, arrays, nodes/edges, arrows, equations, highlights).
- Store lesson history.
- Generate quizzes, grade them deterministically where possible, and explain wrong answers.
- Basic concept mastery from quiz results.
- Seeded demo course (one CSE lecture PDF) and a scripted demo path.
- Graceful fallback to text-only teaching when model output is invalid.

**Success:** a student uploads a PDF and completes a personalized, source-grounded lesson with a quiz.

### Level 2 — Interactive AI classroom (weeks 3–5)

- Bangla speech-to-text (push-to-talk) and spoken answers, with browser speech APIs as fallback.
- Interruptible lessons (stop audio and board on mic press).
- Animated board actions synchronized to TTS playback.
- Import previous questions and past conversations (indexed separately from course material).
- Track recurring misconceptions as curated memories.
- Revision plan using simple spaced repetition.
- DOCX/PPTX upload.
- Real authentication (email + password or OAuth).
- Memory viewer: inspect, edit, delete, and export learning history.

**Success:** the student talks to the teacher while the board updates in sync.

### Level 3 — Advanced autonomous tutor (stretch)

- Automatically detect weak topics and propose sessions.
- Teacher chooses when to explain, draw, quiz, or revisit.
- Adaptive difficulty from performance.
- Handwritten question recognition (photo → Gemma 3 vision).
- Exam schedules across multiple courses.
- Optional freehand board (Excalidraw) and continuous conversational voice.

**Success:** the system plans and adjusts a session instead of waiting for every instruction.

### Removed or deferred from the original plan

| Item | Decision | Why |
| --- | --- | --- |
| Auth.js accounts in MVP | Deferred to Level 2 | Not needed for a hackathon demo; `user_id` columns keep it easy to add. |
| Excalidraw | Level 3 only | The structured SVG board is the differentiator; freehand is nice-to-have. |
| WebRTC | Dropped | Push-to-talk with uploaded audio clips plus WebSocket streaming is sufficient. |
| DOCX/PPTX in MVP | Level 2 | PDF covers most lecture material; fewer parsers to debug in week 1. |
| Client-posted lesson events | Replaced | The server owns lesson state and streams events; the client only sends user actions. |
| Separate OCR stack | Replaced in MVP | Gemma 3 4B is multimodal: render scanned pages to images and ask it for a description. Add Tesseract only if quality is poor. |

## 4. Technical architecture

One teacher agent plus a few deterministic services. No multi-agent setup in the first version. Full details in [architecture.md](architecture.md).

| Component | Responsibility |
| --- | --- |
| Frontend (Next.js + TypeScript) | Dashboard, library, classroom, whiteboard renderer, voice controls, progress. |
| Backend API (FastAPI) | REST + WebSocket, lesson orchestration, validation, persistence. |
| LLM service | Gemma 3 4B via Ollama: lesson planning, teaching text, quiz generation, open-answer feedback. |
| RAG service | Extraction, chunking, embeddings, hybrid retrieval, citations. |
| Board controller | Schema validation of board commands, layout, step history. |
| Voice service (Level 2) | STT and Bangla TTS, with browser fallbacks. |
| Storage | PostgreSQL + pgvector; uploaded files on local disk. |

### Why this works with a 4B model

The model never sees whole documents or writes frontend code. It gets a short, focused context and fills a strict JSON schema. For "Explain binary search in Bangla and show me an example", the backend:

1. Retrieves the relevant course chunks.
2. Asks Gemma for a lesson matching the `Lesson` schema (Ollama structured output).
3. Validates it with Pydantic; retries up to 2 times; falls back to text-only.
4. Streams each step (`say` text + `board` commands) to the browser.
5. (Level 2) Speaks each step's `say` text via TTS.
6. Saves the lesson; updates mastery only after an assessment.

Deterministic code handles drawing, quiz scoring, permissions, mastery, and scheduling. The LLM handles language and teaching decisions.

### Context budget (4B model)

Keep each prompt around 4–6k tokens:

- System prompt + language rules: ~600 tokens
- Top 4 retrieved chunks: ~2,400 tokens
- Up to 3 relevant memories/past mistakes: ~300 tokens
- Last 6 conversation turns (summarized if longer): ~1,000 tokens
- Output schema + instruction: ~400 tokens

## 5. Technology stack

Starting choices to benchmark, not hard commitments.

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui | |
| Whiteboard | SVG + custom React components, KaTeX for equations | Animations with CSS/Framer Motion. |
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy | `uv` for dependency management. |
| Main LLM | Gemma 3 4B Instruct (`gemma3:4b` in Ollama) | Benchmark Bangla quality early. |
| Inference | Ollama locally; llama.cpp server or a remote GPU if too slow | Use Ollama's `format` (JSON schema) for structured output. |
| Embeddings | `bge-m3` (alternative: `multilingual-e5-base`) | Both handle Bangla + English; verify on your own test set. |
| Vector search | PostgreSQL 16 + pgvector | Plus Postgres full-text search for keyword matching. |
| Parsing | PyMuPDF (PDF, page rendering) | python-docx / python-pptx in Level 2. |
| Speech-to-text | Whisper `large-v3-turbo` or a Bangla fine-tuned Whisper; browser Web Speech API fallback | Level 2. |
| Text-to-speech | Meta `mms-tts-ben` or a cloud Bangla voice; browser `speechSynthesis` fallback | Level 2. |
| Realtime | WebSocket | |
| Deployment | Docker Compose (db, backend, frontend); Ollama on host | |

**Hardware note:** test Gemma 3 4B on the actual machine in week 1. A Q4 quantization needs roughly 3–4 GB of RAM/VRAM; Whisper and TTS add more. If it is too slow, keep the frontend local and point the backend at an authorized remote inference server.

## 6. Bangla voice system (Level 2)

**Inbound:** student speaks → push-to-talk recording → STT → transcript shown with an edit box → teacher receives the question.

**Outbound:** lesson step → `say` text → TTS audio → played while that step's board commands animate.

Design decisions:

- Start with push-to-talk; continuous listening is Level 3.
- Keep technical terms in English: "এখন আমরা binary search-এর time complexity বুঝব।"
- Interruption: pressing mic or pause stops audio and board animation and sends `student.interrupt`.
- Synthesize per step, not per lesson, so playback starts quickly.
- TTS only ever receives `say` text, never JSON or board commands.
- Always show the transcript and allow correcting it before sending.
- Text-only mode is always available.

Before choosing models, test 20–30 representative mixed Bangla-English questions. Do not commit to an STT/TTS model until accuracy and naturalness are acceptable.

## 7. The whiteboard engine

The main differentiator: a board that teaches in step with speech.

### Lesson format

A lesson is a list of steps. Each step pairs speech with drawing, so they are synchronized by construction:

```json
{
  "title": "Binary Search — উদাহরণ",
  "steps": [
    {
      "say": "ধরো আমাদের একটি sorted array আছে, আর আমরা ১৬ খুঁজছি।",
      "board": [
        {"action": "write_text", "id": "t1", "text": "Binary Search — উদাহরণ", "style": "heading"},
        {"action": "draw_array", "id": "arr", "values": [2, 5, 8, 12, 16, 23, 38]}
      ],
      "citations": ["chunk_42"]
    },
    {
      "say": "মাঝের মান ১২। target ১৬ এর চেয়ে ছোট, তাই আমরা ডান পাশে খুঁজব।",
      "board": [
        {"action": "highlight", "target": "arr", "indices": [3], "color": "accent"},
        {"action": "write_text", "id": "t2", "text": "mid = 12 < 16 → right half"}
      ]
    }
  ],
  "check_question": "যদি target ৫ হতো, আমরা কোন দিকে যেতাম?"
}
```

### Allowed board actions

| Action | Purpose |
| --- | --- |
| `write_text` | Heading or explanation text |
| `draw_array` | Array or sequence with indexable cells |
| `draw_node` | Node in a tree, graph, or linked list |
| `draw_edge` | Connect two nodes (optionally labeled/directed) |
| `draw_arrow` | Point between any two objects or show a process |
| `draw_equation` | LaTeX expression rendered with KaTeX |
| `highlight` | Emphasize an object or array indices |
| `clear_region` | Remove objects by id or region |
| `next_step` | Explicit step boundary (implicit between steps) |

The backend validates every command; unknown actions, bad references, or out-of-range indices are dropped and logged. The frontend handles layout (auto-placing objects in a grid), so the model never has to compute coordinates.

**Rule:** Gemma never generates HTML, JavaScript, or SVG. It only picks from these components.

Later (Level 2+): reusable algorithm visualizers (sorting, BFS/DFS, tree traversal) that the model triggers with a single high-level command.

## 8. Course materials and RAG pipeline

1. **Upload:** PDF, TXT (DOCX/PPTX in Level 2); previous questions in Level 2.
2. **Extract:** text per page with PyMuPDF. Pages with little text are rendered to images and described by Gemma 3 vision.
3. **Chunk:** 400–800 tokens with ~15% overlap, never crossing page boundaries without recording both pages. Preserve headings; keep formulas and tables together.
4. **Embed:** `bge-m3` vectors.
5. **Index:** chunks with `course_id`, `document_id`, `page_number`, heading, and source type (`course_material` vs `past_question`).
6. **Retrieve:** hybrid search (pgvector cosine + Postgres full-text), merged with reciprocal rank fusion, always filtered by course. Optional reranker if quality is poor.
7. **Teach with evidence:** the model may only cite chunk IDs it was given; the backend maps them to "document, page N".

**Source-grounding rule:** the teacher separates what the materials say from its own supplementary explanation. If retrieval finds nothing relevant (score below threshold), it says so and does not invent a page reference.

## 9. Personal memory and learning profile

This turns a document chatbot into a personal tutor.

### What to remember

1. **Events:** questions, answers, hints requested, corrections.
2. **Misconceptions:** specific incorrect ideas, with the quiz answer or message that shows them.
3. **Mastery evidence:** quiz results per concept.
4. **Preferences:** teaching language, depth, diagram use.
5. **Revision needs:** next review date per concept.

### Rules

- Mastery is computed in code from assessments (e.g., weighted recent accuracy), never from how often a topic is discussed.
- The model can only propose candidate memories; the backend validates them and stores evidence (message/assessment ID) and a timestamp.
- Revision uses a simple SM-2-style schedule: correct answers push the next review further out; mistakes bring it closer.
- Students can view, edit, delete, and export everything (Level 2 UI; delete/export API in MVP).

### Using previous questions

Previous questions and past mistakes are indexed separately from official materials. Lecture notes are factual evidence; past mistakes are teaching context:

> "Last time, you confused process synchronization with deadlock prevention. Let's compare the two before moving on."

This is only said if a stored memory with evidence supports it.

## 10. AI teacher logic

A lesson is driven by a state machine, not a single prompt:

1. **Assess:** what is the question; what is the student's mastery of the concept?
2. **Retrieve:** relevant course chunks and prior mistakes.
3. **Plan + Teach:** generate a `Lesson` (3–6 steps) and stream it step by step.
4. **Check:** ask the `check_question` or a short quiz.
5. **Adapt:** if wrong or confused → re-teach with a different example; if right → move on or increase difficulty.

Follow-up questions inside a lesson keep the lesson context (title, steps shown so far, current board state summary).

### System prompt (starting point)

```
You are a patient personal university teacher.

- Use the selected language: Bangla, Banglish, or English.
- In Bangla, write natural Bangla and keep standard English technical terms.
- Teach one small idea per step. Prefer a concrete example before a definition.
- Use the provided course passages as primary evidence. Cite only the chunk ids given.
- If the passages do not answer the question, say so.
- Mention past mistakes only if they appear in the provided memories.
- Use board actions when a diagram helps. Use only the allowed actions.
- End with one short question that checks understanding.
- Return only JSON that matches the schema.
```

### Language modes

- **Bangla:** Bangla script; English technical terms; Bangla or Western numerals (user setting).
- **Banglish:** Bangla in Latin script, as students type it.
- **English:** plain English, simpler wording than the textbook.

Separate schemas for lessons, quizzes, and answer feedback. Every output is validated; up to 2 retries with the validation error fed back; then a text-only fallback.

## 11. Database design

PostgreSQL + pgvector.

| Table | Important fields | Purpose |
| --- | --- | --- |
| `users` | `id`, `email`, `preferences` | Account and language settings (one demo user in MVP) |
| `courses` | `id`, `user_id`, `name`, `description` | Subjects |
| `documents` | `id`, `course_id`, `user_id`, `file_path`, `kind`, `status` | Uploaded materials / past questions |
| `document_chunks` | `id`, `document_id`, `page_start`, `page_end`, `heading`, `content`, `embedding`, `tsv` | RAG and citations |
| `concepts` | `id`, `course_id`, `name` | Learning concepts |
| `conversations` | `id`, `user_id`, `course_id` | Sessions |
| `messages` | `id`, `conversation_id`, `role`, `content`, `created_at` | Chat history |
| `lessons` | `id`, `conversation_id`, `concept_id`, `title`, `language`, `status` | Generated lessons |
| `lesson_steps` | `id`, `lesson_id`, `idx`, `say`, `board`, `citations` | Steps and board commands |
| `quiz_items` | `id`, `lesson_id`, `concept_id`, `type`, `question`, `options`, `answer` | Generated questions |
| `assessments` | `id`, `user_id`, `quiz_item_id`, `response`, `correct`, `feedback` | Graded answers |
| `mastery_records` | `user_id`, `concept_id`, `score`, `updated_at` | Computed progress |
| `review_schedule` | `user_id`, `concept_id`, `due_at`, `interval_days`, `ease` | Spaced repetition |
| `memories` | `id`, `user_id`, `type`, `content`, `evidence`, `created_at` | Curated personal memories |

Index all foreign keys and `created_at`. Every query is scoped by `user_id`. Files live on local disk (dev) or private object storage (prod), never inside message rows.

## 12. Backend API design

| Endpoint | Responsibility |
| --- | --- |
| `POST /api/courses`, `GET /api/courses` | Create / list courses |
| `POST /api/documents` | Upload a document (multipart) |
| `GET /api/documents/{id}` | Status and page count |
| `POST /api/chat` | Text question → short grounded answer |
| `POST /api/lessons` | Start a lesson for a topic/question; returns lesson id |
| `GET /api/lessons/{id}` | Full lesson (steps, citations) for replay |
| `WS /ws/lessons/{id}` | Stream steps; receive `next`, `prev`, `ask`, `interrupt` |
| `POST /api/quizzes` | Generate a quiz for a lesson or concept |
| `POST /api/quizzes/{id}/submit` | Grade answers, update mastery and schedule |
| `GET /api/learning-profile` | Mastery, misconceptions, preferences |
| `GET /api/revision-plan` | Concepts due for review |
| `GET /api/me/export`, `DELETE /api/me/data` | Export / delete personal data |
| `POST /api/voice/transcribe` | Audio → transcript (Level 2) |
| `POST /api/voice/synthesize` | Text → audio (Level 2) |

All WebSocket messages are validated; see [architecture.md](architecture.md) for event types.

## 13. UI/UX design plan

The interface should feel like a classroom, not a chat app.

- **A. Dashboard:** course cards, recent lessons, weak topics, reviews due today, "Start learning" button.
- **B. Classroom:** large whiteboard (~60% width), transcript with citations, step controls (prev / next / pause), language selector, question box (mic in Level 2), lesson progress.
- **C. Course library:** upload, processing status, page preview for each citation.
- **D. Progress:** mastery per concept, recurring misconceptions, quiz history, revision schedule.

On mobile, tabs switch between board and conversation. Accessibility: Bangla-friendly font (e.g., Noto Sans Bengali / Hind Siliguri), keyboard shortcuts for step controls, always-visible transcript, adjustable speech speed, text-only fallback.

## 14. Three-week implementation schedule

### Week 1 — Grounded teacher brain (days 1–7)

- Scaffold Next.js frontend, FastAPI backend, Docker Compose with Postgres + pgvector.
- Run `gemma3:4b` in Ollama; test 20 Bangla explanations and structured JSON output.
- PDF upload, extraction, chunking, `bge-m3` embeddings, hybrid retrieval.
- `/api/chat` with citations; build `evals/` with 20–30 questions from the demo PDF.

### Week 2 — Visual lessons (days 8–14)

- Lesson + board Pydantic schemas; validation, retry, fallback.
- SVG board components: text, array, node/edge, arrow, equation (KaTeX), highlight.
- Lesson state machine and WebSocket step streaming; classroom page.
- Quiz generation, grading, mastery, lesson history.
- Measure schema-valid rate and fix prompts.

### Week 3 — Voice and personalization (days 15–21)

- Push-to-talk STT and per-step TTS with browser fallbacks; interruption.
- Curated memories from wrong answers; use them in the next lesson.
- Revision plan (spaced repetition) and progress page.
- Seed demo course; end-to-end run; record the demo.

## 15. Testing and evaluation

Judge by whether students learn correctly, not by one impressive answer.

| Metric | Initial target | How |
| --- | --- | --- |
| Retrieval quality | Relevant chunk in top 5 for ≥85% of test questions | `evals/retrieval.jsonl` |
| Citation correctness | ≥95% of citations point to the right page | Manual + script check |
| Schema validity | ≥98% of lessons valid after retries | Log validation outcomes |
| Bangla teaching quality | Human review of 30–50 explanations | Rubric: correct, clear, natural |
| Board synchronization | ≥90% of steps render in correct order | Scripted lessons |
| Speech recognition | Word error rate on mixed Bangla-English | 20–30 recorded questions |
| Latency | Time to first step / first audio on target hardware | Backend timing logs |
| Personalization | Recorded misconception appears in next relevant lesson | Scripted scenario |
| Learning effect | Pre- vs post-lesson quiz score | Small user test |

These are engineering targets; set baselines with your real model, documents, and hardware. The test set should include scanned PDFs, wrong student assumptions, ambiguous questions, English terms inside Bangla sentences, and questions the materials cannot answer.

## 16. Main risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Small model makes mistakes or bad JSON | Structured output, retrieval, validation, retries, text fallback, deterministic grading. |
| Bangla quality from a 4B model is weak | Benchmark in week 1; keep the LLM behind an interface so a larger model or remote API can be swapped in. |
| Bangla voice sounds unnatural | Compare engines; browser voice fallback; text-only mode. |
| PDF extraction loses equations/tables | Keep page metadata, vision description for hard pages, page previews for verification. |
| Too slow | Short lessons (3–6 steps), stream steps, cache embeddings, per-step TTS, board independent of inference. |
| Private history exposed | Per-user scoping on every query, private file storage, export/delete controls. |

## 17. MVP acceptance checklist

- [ ] A course can be created (demo user; login in Level 2).
- [ ] A PDF uploads and becomes searchable.
- [ ] The teacher answers using relevant course passages with correct page citations.
- [ ] The student can choose Bangla, Banglish, or English.
- [ ] A lesson produces valid, correctly rendered board actions, step by step.
- [ ] The student can ask a follow-up without losing lesson context.
- [ ] A Bangla speech pipeline can accept a question and speak a response.
- [ ] The system saves a lesson and records quiz results and mastery.
- [ ] The next lesson can use a genuinely relevant prior mistake.
- [ ] Invalid model output and speech failures degrade gracefully.

## 18. Recommended development order

Build the teacher's brain first, then the whiteboard, then voice. Voice-first gives a speaking chatbot that still can't teach; board-first without a lesson format means constantly fixing inconsistent drawings.

**First milestone:**

1. Run Gemma 3 4B locally (or on an inference server).
2. Upload one CSE lecture PDF.
3. Ask a question in Bangla.
4. Retrieve the correct passages.
5. Generate a valid `Lesson` with a small diagram.
6. Render it step by step in the classroom page.

Then add quizzes and mastery, then voice and long-term memory.

**Model decision:** start with Gemma 3 4B, but benchmark it on real Bangla teaching tasks first. Keep the LLM behind one client interface so another model can be compared without redesign.

The innovation is not the LLM. It is the combination of **personal learning memory + grounded teaching + synchronized Bangla voice and whiteboard + adaptive assessment**.
