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
EMBED_MODEL = os.getenv("EMBED_MODEL", "bge-m3")
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "2"))
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "180"))

RETRIEVAL_TOP_K = int(os.getenv("RETRIEVAL_TOP_K", "4"))
CHUNK_TOKENS = int(os.getenv("CHUNK_TOKENS", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "75"))

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

DEMO_USER_EMAIL = "demo@student.local"
