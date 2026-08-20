"""
Database connection and session management.

Connects to the shared PostgreSQL database (same as main API and ballot_service).
Engine is created lazily to avoid import-time failures when DB isn't available.
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from contextlib import contextmanager
from typing import Generator

from config import settings
from models import Base


def create_engine_safe(url: str):
    """Create engine with appropriate settings for PostgreSQL or SQLite."""
    connect_args = {}
    poolclass = None

    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        poolclass = StaticPool
    elif url.startswith("postgresql") or url.startswith("postgres"):
        connect_args["options"] = "-c statement_timeout=30000"

    return create_engine(
        url,
        connect_args=connect_args,
        echo=settings.DEBUG,
        poolclass=poolclass,
    )


# Lazy engine — created on first access
_engine = None
_SessionLocal = None


def get_engine():
    """Get or create the database engine (lazy initialization)."""
    global _engine
    if _engine is None:
        _engine = create_engine_safe(settings.DATABASE_URL)
    return _engine


def get_session_factory():
    """Get or create the session factory (lazy initialization)."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=get_engine()
        )
    return _SessionLocal


def init_db() -> None:
    """
    Initialize the database by creating tables if they don't exist.
    Safe for shared DB — only creates tables that don't exist.
    """
    engine = get_engine()
    from sqlalchemy.exc import ProgrammingError
    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except ProgrammingError as e:
        # Tables/indexes already managed by Drizzle in the shared DB.
        if "already exists" not in str(e):
            raise


def get_db() -> Generator[Session, None, None]:
    """
    Dependency that provides a database session.
    Used with FastAPI's Depends() for request-scoped sessions.
    """
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager for database sessions.
    Use when not in a FastAPI request context (e.g. background jobs).
    """
    db = get_session_factory()()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
