"""Hybrid retrieval: BM25 keywords + embedding cosine, merged with reciprocal rank fusion.

Course sizes in the MVP are small, so scoring happens in Python over the course's chunks.
"""

import math
import re
from collections import Counter
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.db.models import Document, DocumentChunk
from app.llm.client import LLMClient

_TOKEN = re.compile(r"[\wঀ-৿]+", re.UNICODE)
MIN_COSINE = 0.45
RRF_K = 60


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN.findall(text) if len(t) > 1]


@dataclass
class Retrieved:
    chunk: DocumentChunk
    document_name: str
    score: float

    @property
    def ref(self) -> str:
        return f"chunk_{self.chunk.id}"

    def citation(self) -> dict:
        return {"id": self.ref, "document": self.document_name, "page": self.chunk.page_start,
                "document_id": self.chunk.document_id}


def bm25_scores(query: list[str], docs: list[list[str]], k1: float = 1.5, b: float = 0.75) -> list[float]:
    n = len(docs)
    if n == 0:
        return []
    avgdl = sum(len(d) for d in docs) / n or 1
    df = Counter(t for d in docs for t in set(d))
    scores = []
    for d in docs:
        tf = Counter(d)
        s = 0.0
        for t in set(query):
            if t not in tf:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            s += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * len(d) / avgdl))
        scores.append(s)
    return scores


async def retrieve(db: Session, llm: LLMClient, user_id: int, course_id: int, query: str,
                   top_k: int = config.RETRIEVAL_TOP_K) -> list[Retrieved]:
    rows = db.execute(
        select(DocumentChunk, Document.filename)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(DocumentChunk.user_id == user_id, DocumentChunk.course_id == course_id,
               Document.status == "ready")
    ).all()
    if not rows:
        return []
    chunks = [r[0] for r in rows]
    names = {r[0].id: r[1] for r in rows}

    kw = bm25_scores(tokenize(query), [tokenize(c.heading + " " + c.content) for c in chunks])
    ranked_kw = [i for i in sorted(range(len(chunks)), key=lambda i: -kw[i]) if kw[i] > 0][:20]

    cos: list[float] = [0.0] * len(chunks)
    ranked_vec: list[int] = []
    with_vec = [i for i, c in enumerate(chunks) if c.embedding]
    if with_vec:
        qv = await llm.embed([query])
        if qv:
            q = np.asarray(qv[0], dtype=np.float32)
            m = np.asarray([chunks[i].embedding for i in with_vec], dtype=np.float32)
            sims = m @ q / (np.linalg.norm(m, axis=1) * np.linalg.norm(q) + 1e-9)
            for j, i in enumerate(with_vec):
                cos[i] = float(sims[j])
            ranked_vec = [i for i in sorted(with_vec, key=lambda i: -cos[i]) if cos[i] >= MIN_COSINE][:20]

    fused: dict[int, float] = {}
    for ranking in (ranked_kw, ranked_vec):
        for rank, i in enumerate(ranking):
            fused[i] = fused.get(i, 0.0) + 1.0 / (RRF_K + rank + 1)
    best = sorted(fused, key=lambda i: -fused[i])[:top_k]
    return [Retrieved(chunks[i], names[chunks[i].id], fused[i]) for i in best]


def format_passages(results: list[Retrieved], max_chars: int = 2400) -> str:
    """Render chunks for the prompt as `[chunk_42] (Lecture.pdf, p.12) text`."""
    if not results:
        return "(no relevant course passages found)"
    per = max_chars // len(results)
    return "\n\n".join(
        f"[{r.ref}] ({r.document_name}, p.{r.chunk.page_start}) {r.chunk.content[:per]}" for r in results
    )
