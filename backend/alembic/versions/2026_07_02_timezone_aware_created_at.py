"""Make created_at columns timezone-aware

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6g7
Create Date: 2026-07-02 12:00:00.000000

On PostgreSQL this converts the created_at columns to TIMESTAMP WITH TIME ZONE
so stored values keep their offset. On SQLite the DBAPI cannot store tzinfo at
all (it is stripped on read), so altering the column type is a pointless full
table rebuild — we skip it there and rely on the read-schema coercion in
models._ensure_utc to re-attach UTC.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = ("feature", "feature_link", "test_case_link")


def _is_sqlite(bind) -> bool:
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    """Convert created_at columns to timezone-aware (Postgres only)."""
    bind = op.get_bind()
    if _is_sqlite(bind):
        return
    for table in _TABLES:
        op.alter_column(
            table,
            "created_at",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=False,
        )


def downgrade() -> None:
    """Revert created_at columns to naive datetimes (Postgres only)."""
    bind = op.get_bind()
    if _is_sqlite(bind):
        return
    for table in _TABLES:
        op.alter_column(
            table,
            "created_at",
            type_=sa.DateTime(),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )
