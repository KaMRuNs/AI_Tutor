"""Runtime configuration read from environment variables (see architecture.md §10)."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR.parent / "data"))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", DATA_DIR / "uploads"))

# SQLite for local MVP (no Docker on the dev machine); Postgres URL also works.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'teacher.db').as_posix()}")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma3:4b")
# Off by default: on an 8 GB CPU-only machine bge-m3 evicts gemma from RAM on every query, making lessons
# time out. Keyword retrieval scores 100% on evals/retrieval.jsonl. Set EMBED_MODEL=bge-m3 with ≥16 GB RAM.
EMBED_MODEL = os.getenv("EMBED_MODEL", "")
LLM_NUM_CTX = int(os.getenv("LLM_NUM_CTX", "4096"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "1500"))
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "2"))
# Generous: on low-RAM machines Ollama may swap gemma and bge-m3 in and out of memory.
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "300"))

RETRIEVAL_TOP_K = int(os.getenv("RETRIEVAL_TOP_K", "4"))
CHUNK_TOKENS = int(os.getenv("CHUNK_TOKENS", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "75"))

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

DEMO_USER_EMAIL = "demo@student.local"
