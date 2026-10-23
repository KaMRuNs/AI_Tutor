from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.db import get_db
from app.db.models import Course, Lesson, User


def current_user_id(db: Session = Depends(get_db)) -> int:
    """MVP: single demo user. Replace with real auth in Level 2; callers already scope by user_id."""
    uid = db.scalar(select(User.id).where(User.email == config.DEMO_USER_EMAIL))
    if uid is None:
        raise HTTPException(500, "demo user missing")
    return uid


def owned_course(db: Session, user_id: int, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if course is None or course.user_id != user_id:
        raise HTTPException(404, "course not found")
    return course


def owned_lesson(db: Session, user_id: int, lesson_id: int) -> Lesson:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None or lesson.user_id != user_id:
        raise HTTPException(404, "lesson not found")
    return lesson
