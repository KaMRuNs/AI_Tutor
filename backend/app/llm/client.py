"""The single LLM interface (CLAUDE.md rule 9).

`generate_structured` asks for JSON matching a Pydantic schema, validates it,
retries with the validation error fed back, and returns None if it still fails
so callers can fall back to text-only.
"""

import json
import logging
import time
from pathlib import Path
from typing import Protocol, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app import config

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

PROMPT_DIR = Path(__file__).parent / "prompts"
EMBED_COOLDOWN_S = 120


def load_prompt(name: str) -> str:
    return (PROMPT_DIR / name).read_text(encoding="utf-8")


class LLMError(RuntimeError):
    pass


class LLMClient(Protocol):
    async def chat(self, messages: list[dict], schema: dict | None = None) -> str: ...

    async def embed(self, texts: list[str]) -> list[list[float]] | None: ...


class OllamaClient:
    def __init__(self, base_url: str = config.OLLAMA_URL, model: str = config.LLM_MODEL,
                 embed_model: str = config.EMBED_MODEL) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.embed_model = embed_model
        self._embed_retry_at = 0.0

    async def chat(self, messages: list[dict], schema: dict | None = None) -> str:
        body: dict = {"model": self.model, "messages": messages, "stream": False, "keep_alive": "30m",
                      "options": {"temperature": 0.4, "num_ctx": config.LLM_NUM_CTX,
                                  "num_predict": config.LLM_MAX_TOKENS}}
        if schema is not None:
            body["format"] = schema
        try:
            async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT) as client:
                r = await client.post(f"{self.base_url}/api/chat", json=body)
                r.raise_for_status()
                return r.json()["message"]["content"]
        except (httpx.HTTPError, KeyError) as e:
            raise LLMError(f"Ollama chat failed: {e}") from e

    async def embed(self, texts: list[str]) -> list[list[float]] | None:
        """Returns None when the embedding model is unavailable (retrieval then uses keywords only)."""
        if not self.embed_model or not texts or time.monotonic() < self._embed_retry_at:
            return None
        try:
            async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT) as client:
                r = await client.post(f"{self.base_url}/api/embed",
                                      json={"model": self.embed_model, "input": texts})
                r.raise_for_status()
                return r.json()["embeddings"]
        except (httpx.HTTPError, KeyError) as e:
            # Back off instead of disabling for good: failures are often a model swap on low-RAM machines.
            log.warning("embedding unavailable (%s: %s); keyword retrieval for %ds",
                        type(e).__name__, e, EMBED_COOLDOWN_S)
            self._embed_retry_at = time.monotonic() + EMBED_COOLDOWN_S
            return None


async def generate_structured(llm: LLMClient, schema: type[T], messages: list[dict],
                              max_retries: int = config.LLM_MAX_RETRIES,
                              json_schema: dict | None = None) -> T | None:
    """`json_schema` lets the grammar be stricter than `schema` (e.g. board commands
    are constrained for Ollama but filtered one by one after parsing)."""
    msgs = list(messages)
    json_schema = json_schema or schema.model_json_schema()
    for attempt in range(max_retries + 1):
        try:
            raw = await llm.chat(msgs, schema=json_schema)
        except LLMError:
            log.exception("LLM call failed")
            return None
        try:
            return schema.model_validate_json(raw)
        except (ValidationError, json.JSONDecodeError) as e:
            log.info("schema validation failed (attempt %d): %s", attempt + 1, e)
            msgs = msgs + [
                {"role": "assistant", "content": raw[:4000]},
                {"role": "user", "content": f"That output was invalid: {str(e)[:800]}\n"
                                            "Return only corrected JSON matching the schema."},
            ]
    return None


_default: LLMClient | None = None


def get_llm() -> LLMClient:
    global _default
    if _default is None:
        _default = OllamaClient()
    return _default


def set_llm(client: LLMClient) -> None:
    """Used by tests to inject a fake client."""
    global _default
    _default = client
