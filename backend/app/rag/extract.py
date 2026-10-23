"""Text extraction per page. Pages with almost no text are flagged for a vision description."""

from dataclasses import dataclass
from pathlib import Path

import pymupdf

MIN_TEXT_CHARS = 40


@dataclass
class Page:
    number: int  # 1-based
    text: str
    image_png: bytes | None = None  # set when the page needs a vision description


def extract_pages(path: Path) -> list[Page]:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        return [Page(number=1, text=path.read_text(encoding="utf-8", errors="replace"))]
    if suffix != ".pdf":
        raise ValueError(f"unsupported file type: {suffix}")
    pages: list[Page] = []
    with pymupdf.open(path) as doc:
        for i, page in enumerate(doc, start=1):
            text = page.get_text("text").strip()
            img = None
            if len(text) < MIN_TEXT_CHARS:
                img = page.get_pixmap(dpi=110).tobytes("png")
            pages.append(Page(number=i, text=text, image_png=img))
    return pages
