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

from sqlalchemy import event
from sqlmodel import SQLModel, create_engine, Session
from config import get_settings
from logging_config import get_logger

settings = get_settings()
logger = get_logger(__name__)

# check_same_thread is a SQLite-only DBAPI argument — passing it to psycopg2
# raises a TypeError, so gate it on the URL scheme. pool_pre_ping guards against
# stale Postgres connections in long-lived deployments.
_is_sqlite = settings.database_url.startswith("sqlite")
_engine_kwargs: dict = {"echo": settings.db_echo}
if _is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs["pool_pre_ping"] = True

# Create synchronous engine
# Note: FastAPI runs sync dependencies in a thread pool, so this is safe for concurrency
engine = create_engine(settings.database_url, **_engine_kwargs)


if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
        """SQLite disables FK enforcement by default; turn it on per connection
        so ON DELETE CASCADE on the link tables actually fires."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


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
    """Request-scoped unit of work.

    Yields a session, then commits once if the request handler returned
    without raising, or rolls back if it raised. Repositories therefore only
    add/flush — they must not commit — so a whole request is one transaction.
    """
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


