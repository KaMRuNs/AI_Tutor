from collections.abc import Iterator

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app import config
from app.db.models import Base, User

config.DATA_DIR.mkdir(parents=True, exist_ok=True)

_connect_args = {"check_same_thread": False} if config.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(config.DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if not db.scalar(select(User).where(User.email == config.DEMO_USER_EMAIL)):
            db.add(User(email=config.DEMO_USER_EMAIL, preferences={"language": "bangla"}))
            db.commit()


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db
