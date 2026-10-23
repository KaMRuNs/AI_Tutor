"""Background ingestion: extract → (vision for image-only pages) → chunk → embed → store."""

import base64
import logging
from pathlib import Path

from app.db import SessionLocal
from app.db.models import Document, DocumentChunk
from app.llm.client import LLMClient, LLMError
from app.rag.chunk import chunk_pages
from app.rag.extract import extract_pages

log = logging.getLogger(__name__)

VISION_PROMPT = ("This is a page from a university lecture. Describe its content as plain text notes: "
                 "transcribe headings, bullet points, formulas and explain any diagram briefly.")


async def ingest_document(document_id: int, llm: LLMClient) -> None:
    with SessionLocal() as db:
        doc = db.get(Document, document_id)
        if doc is None:
            return
        try:
            pages = extract_pages(Path(doc.file_path))
            for page in pages:
                if page.image_png is not None:
                    try:
                        page.text = await llm.chat([{
                            "role": "user", "content": VISION_PROMPT,
                            "images": [base64.b64encode(page.image_png).decode()],
                        }])
                    except LLMError:
                        log.warning("vision description failed for page %d", page.number)
            chunks = chunk_pages(pages)
            vectors = await llm.embed([c.content for c in chunks]) if chunks else None
            for i, c in enumerate(chunks):
                db.add(DocumentChunk(
                    document_id=doc.id, course_id=doc.course_id, user_id=doc.user_id,
                    page_start=c.page_start, page_end=c.page_end, heading=c.heading,
                    content=c.content, embedding=vectors[i] if vectors else None,
                ))
            doc.page_count = len(pages)
            doc.status = "ready" if chunks else "failed"
            doc.error = None if chunks else "No text could be extracted."
        except Exception as e:  # report any failure in the library UI
            log.exception("ingestion failed")
            doc.status, doc.error = "failed", str(e)[:500]
        db.commit()
