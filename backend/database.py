"""
Database configuration and session management.

Architecture Decision: Synchronous Database Operations
=======================================================

This project uses **synchronous** database operations with SQLModel/SQLAlchemy.

Rationale:
- SQLModel doesn't have mature async support yet
- SQLite (our dev database) works best synchronously
- Simpler code without async/await complexity
- FastAPI handles concurrent requests via thread pool for sync routes

Important:
- All route handlers should use `def`, NOT `async def`
- Use `Session` from sqlmodel, not async sessions
- Database operations will run in FastAPI's thread pool automatically

For PostgreSQL in production, this approach still works well. If high-concurrency
async operations become necessary, consider migrating to SQLAlchemy 2.0 async
with asyncpg driver.
"""

from sqlmodel import SQLModel, create_engine, Session
from config import get_settings
from logging_config import get_logger

settings = get_settings()
logger = get_logger(__name__)

# Create synchronous engine
# Note: FastAPI runs sync dependencies in a thread pool, so this is safe for concurrency
engine = create_engine(
    settings.database_url,
    echo=settings.db_echo,  # Configurable SQL query logging
    connect_args={"check_same_thread": False}  # Needed for SQLite
)


def init_db() -> None:
    """
    Initialize the database by creating all tables.
    
    DEPRECATED: Use Alembic migrations instead.
    This function is kept for testing purposes only.
    For production, run: alembic upgrade head
    """
    import warnings
    warnings.warn(
        "init_db() is deprecated. Use Alembic migrations: 'alembic upgrade head'",
        DeprecationWarning,
        stacklevel=2
    )
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency for getting database sessions."""
    with Session(engine) as session:
        yield session


