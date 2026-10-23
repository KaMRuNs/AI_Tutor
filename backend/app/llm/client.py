"""The single LLM interface (CLAUDE.md rule 9).

`generate_structured` asks for JSON matching a Pydantic schema, validates it,
retries with the validation error fed back, and returns None if it still fails
so callers can fall back to text-only.
"""

import json
import logging
from pathlib import Path
from typing import Protocol, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app import config

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

PROMPT_DIR = Path(__file__).parent / "prompts"


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
        self._embed_ok: bool | None = None

    async def chat(self, messages: list[dict], schema: dict | None = None) -> str:
        body: dict = {"model": self.model, "messages": messages, "stream": False,
                      "options": {"temperature": 0.4, "num_ctx": 8192}}
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
        if self._embed_ok is False or not texts:
            return None
        try:
            async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT) as client:
                r = await client.post(f"{self.base_url}/api/embed",
                                      json={"model": self.embed_model, "input": texts})
                r.raise_for_status()
                self._embed_ok = True
                return r.json()["embeddings"]
        except (httpx.HTTPError, KeyError) as e:
            log.warning("embedding unavailable (%s); using keyword retrieval only", e)
            self._embed_ok = False
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
