"""Split page text into overlapping chunks that stay within one page (keeps citations exact)."""

from dataclasses import dataclass

from app import config
from app.rag.extract import Page


@dataclass
class Chunk:
    page_start: int
    page_end: int
    heading: str
    content: str


def _looks_like_heading(line: str) -> bool:
    s = line.strip()
    return 2 < len(s) < 80 and not s.endswith((".", ",", ";", "।")) and len(s.split()) <= 10


def chunk_pages(pages: list[Page], max_words: int = config.CHUNK_TOKENS,
                overlap: int = config.CHUNK_OVERLAP) -> list[Chunk]:
    chunks: list[Chunk] = []
    heading = ""
    for page in pages:
        lines = [ln for ln in page.text.splitlines() if ln.strip()]
        if lines and _looks_like_heading(lines[0]):
            heading = lines[0].strip()
        words = "\n".join(lines).split()
        if not words:
            continue
        start = 0
        while start < len(words):
            end = min(len(words), start + max_words)
            chunks.append(Chunk(page.number, page.number, heading, " ".join(words[start:end])))
            if end == len(words):
                break
            start = end - overlap
    return chunks
