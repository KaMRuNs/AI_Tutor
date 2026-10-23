from datetime import datetime, timezone

from app.board.schemas import BoardState
from app.db.models import ReviewSchedule
from app.memory.grading import grade_mcq, grade_numeric
from app.memory.mastery import mastery_from_results, schedule_review
from app.rag.chunk import chunk_pages
from app.rag.extract import Page
from app.rag.retrieve import bm25_scores, tokenize


def test_board_drops_invalid_commands():
    b = BoardState()
    out = b.apply([
        {"action": "draw_array", "id": "arr", "values": [2, 5, 8]},
        {"action": "highlight", "target": "arr", "indices": [1]},
        {"action": "highlight", "target": "arr", "indices": [9]},       # out of range
        {"action": "draw_edge", "id": "e1", "from_id": "x", "to_id": "y"},  # unknown refs
        {"action": "explode", "id": "z"},                                 # unknown action
        {"action": "draw_array", "id": "arr", "values": [1]},             # duplicate id
        {"action": "write_text", "id": "t1", "text": "Binary Search", "style": "heading"},
    ])
    assert [c["action"] for c in out] == ["draw_array", "write_text", "highlight"]


def test_board_creates_before_references_within_step():
    out = BoardState().apply([
        {"action": "draw_arrow", "id": "a", "from_id": "n1", "to_id": "n2"},
        {"action": "draw_node", "id": "n1", "label": "A"},
        {"action": "draw_node", "id": "n2", "label": "B"},
    ])
    assert [c["action"] for c in out] == ["draw_node", "draw_node", "draw_arrow"]


def test_board_state_carries_across_steps():
    b = BoardState()
    b.apply([{"action": "draw_node", "id": "n1", "label": "A"}, {"action": "draw_node", "id": "n2", "label": "B"}])
    assert b.apply([{"action": "draw_edge", "id": "e", "from_id": "n1", "to_id": "n2"}])
    b.apply([{"action": "clear_region", "ids": ["n1"]}])
    assert b.apply([{"action": "draw_arrow", "id": "a", "from_id": "n1", "to_id": "n2"}]) == []


def test_grading():
    assert grade_mcq("O(log n)", "O(log n)", ["O(n)", "O(log n)"])
    assert grade_mcq("b", "O(log n)", ["O(n)", "O(log n)"])
    assert not grade_mcq("a", "O(log n)", ["O(n)", "O(log n)"])
    assert grade_numeric("৩", "3")
    assert grade_numeric("answer is 3.0", "3")
    assert not grade_numeric("4", "3")


def test_mastery_and_schedule():
    assert mastery_from_results([]) == 0
    assert mastery_from_results([True] * 5) == 1.0
    assert mastery_from_results([True]) < mastery_from_results([True] * 5)
    rec = ReviewSchedule(interval_days=0, ease=2.5, repetitions=0)
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    schedule_review(rec, 5, now)
    schedule_review(rec, 5, now)
    assert rec.interval_days == 3
    schedule_review(rec, 2, now)
    assert rec.interval_days == 1 and rec.repetitions == 0


def test_chunking_keeps_pages_and_overlap():
    pages = [Page(1, "Binary Search\n" + " ".join(f"w{i}" for i in range(120))), Page(2, "short page text here")]
    chunks = chunk_pages(pages, max_words=50, overlap=10)
    assert all(c.page_start == c.page_end for c in chunks)
    assert chunks[0].heading == "Binary Search"
    assert chunks[1].content.split()[0] == chunks[0].content.split()[40]
    assert chunks[-1].page_start == 2


def test_bangla_tokenize_and_bm25():
    toks = tokenize("binary search-এর time complexity কত?")
    assert "complexity" in toks and "কত" in toks
    docs = [tokenize("deadlock prevention in operating systems"), tokenize("binary search halves the array")]
    s = bm25_scores(tokenize("binary search"), docs)
    assert s[1] > s[0] == 0
