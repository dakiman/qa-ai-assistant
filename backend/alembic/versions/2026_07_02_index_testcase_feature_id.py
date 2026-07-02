"""Index testcase.feature_id

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-02 13:00:00.000000

feature_id is the hottest FK in the schema — every test-case list, export, and
refinement filters on it — but it was never indexed (L7).
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        op.f('ix_testcase_feature_id'), 'testcase', ['feature_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_testcase_feature_id'), table_name='testcase')
