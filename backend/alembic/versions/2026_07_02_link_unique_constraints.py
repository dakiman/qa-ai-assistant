"""Add unique constraints on link pairs

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-02 12:30:00.000000

Enforces one link per ordered pair at the database level so the create path is
no longer a check-then-insert TOCTOU (M7). Any pre-existing duplicate rows
(possible from the old ``.first()`` inverse-delete bug) are collapsed to the
lowest id before the constraint is added.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Deduplicate link pairs, then add unique constraints."""
    bind = op.get_bind()

    # Collapse duplicate pairs, keeping the earliest row. Portable across
    # SQLite and Postgres.
    bind.execute(sa.text(
        "DELETE FROM feature_link WHERE id NOT IN "
        "(SELECT MIN(id) FROM feature_link "
        "GROUP BY source_feature_id, target_feature_id)"
    ))
    bind.execute(sa.text(
        "DELETE FROM test_case_link WHERE id NOT IN "
        "(SELECT MIN(id) FROM test_case_link "
        "GROUP BY feature_id, test_case_id)"
    ))

    with op.batch_alter_table("feature_link") as batch:
        batch.create_unique_constraint(
            "uq_feature_link_pair",
            ["source_feature_id", "target_feature_id"],
        )
    with op.batch_alter_table("test_case_link") as batch:
        batch.create_unique_constraint(
            "uq_test_case_link_pair",
            ["feature_id", "test_case_id"],
        )


def downgrade() -> None:
    """Drop the unique constraints."""
    with op.batch_alter_table("test_case_link") as batch:
        batch.drop_constraint("uq_test_case_link_pair", type_="unique")
    with op.batch_alter_table("feature_link") as batch:
        batch.drop_constraint("uq_feature_link_pair", type_="unique")
