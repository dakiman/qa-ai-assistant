"""Database configuration and session management."""

from sqlmodel import SQLModel, create_engine, Session
from config import get_settings

settings = get_settings()

# Create engine with SQLite
engine = create_engine(
    settings.database_url,
    echo=True,  # Set to False in production
    connect_args={"check_same_thread": False}  # Needed for SQLite
)


def init_db() -> None:
    """Initialize the database by creating all tables."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency for getting database sessions."""
    with Session(engine) as session:
        yield session


