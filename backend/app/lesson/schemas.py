"""LLM output schemas (architecture.md §4)."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.board.schemas import BoardCommand

Language = Literal["bangla", "banglish", "english"]


class Step(BaseModel):
    say: str = Field(max_length=800)
    board: list[dict[str, Any]] = Field(default_factory=list, max_length=8)
    citations: list[str] = Field(default_factory=list)


class LessonOut(BaseModel):
    title: str = Field(max_length=200)
    concept: str = Field(max_length=100)
    steps: list[Step] = Field(min_length=1, max_length=6)
    check_question: str | None = None


class FollowupOut(BaseModel):
    answer: str = Field(max_length=1500)
    board: list[dict[str, Any]] = Field(default_factory=list, max_length=6)
    citations: list[str] = Field(default_factory=list)


# Strict variants: only used to build the JSON schema handed to Ollama's grammar.
class _StrictStep(BaseModel):
    say: str
    board: list[BoardCommand]
    citations: list[str]


class _StrictLesson(BaseModel):
    title: str = Field(max_length=80)
    concept: str = Field(max_length=40, description="Short English concept name, e.g. 'Binary search'")
    steps: list[_StrictStep] = Field(min_length=3, max_length=5)
    check_question: str


class _StrictFollowup(BaseModel):
    answer: str
    board: list[BoardCommand]
    citations: list[str]


LESSON_GRAMMAR = _StrictLesson.model_json_schema()
FOLLOWUP_GRAMMAR = _StrictFollowup.model_json_schema()


class QuizItemOut(BaseModel):
    type: Literal["mcq", "numeric", "short"]
    question: str
    options: list[str] | None = None
    answer: str
    explanation: str = ""
    concept: str = ""


class QuizOut(BaseModel):
    items: list[QuizItemOut] = Field(min_length=1, max_length=6)


class _StrictQuizItem(BaseModel):
    type: Literal["mcq", "numeric", "short"]
    question: str
    options: list[str] = Field(min_length=4, max_length=4, description="4 choices; for mcq the answer is one of them")
    answer: str
    explanation: str
    concept: str = Field(max_length=40)


class _StrictQuiz(BaseModel):
    items: list[_StrictQuizItem] = Field(min_length=2, max_length=5)


QUIZ_GRAMMAR = _StrictQuiz.model_json_schema()


class FeedbackOut(BaseModel):
    correct: bool
    explanation: str
    misconception: str | None = None


LANGUAGE_RULES: dict[str, str] = {
    "bangla": "Write in natural Bangla (বাংলা script). Keep standard English technical terms "
              "in English, e.g. 'binary search-এর time complexity'.",
    "banglish": "Write Bangla using Latin letters (Banglish), the way students type, "
                "e.g. 'ekhon amra binary search er time complexity bujhbo'. Keep technical terms in English.",
    "english": "Write in simple, clear English.",
}
