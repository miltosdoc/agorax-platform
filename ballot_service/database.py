"""
Database connection and session management.

Connects to the shared PostgreSQL database (same as main API).
The ballot_votes table is managed by Drizzle ORM in the main API,
so we don't auto-create tables here — just connect and query.
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
        # PostgreSQL — use connection pooling
        connect_args["options"] = "-c statement_timeout=30000"
    
    return create_engine(
        url,
        connect_args=connect_args,
        echo=settings.DEBUG,
        poolclass=poolclass,
    )


# Create engine based on configuration
engine = create_engine_safe(settings.DATABASE_URL)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """
    Initialize the database by creating tables if they don't exist.
    
    Note: In production, the ballot_votes table is created by Drizzle ORM
    in the main API. This only creates tables if running standalone.
    """
    # Only create tables if they don't exist (safe for shared DB)
    Base.metadata.create_all(bind=engine, checkfirst=True)


def get_db() -> Generator[Session, None, None]:
    """
    Dependency that provides a database session.
    Used with FastAPI's Depends() for request-scoped sessions.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager for database sessions.
    Use when not in a FastAPI request context.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
