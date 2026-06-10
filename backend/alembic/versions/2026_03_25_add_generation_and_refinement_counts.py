"""Add generation_count and refinement_count to feature table

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6g7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add generation and refinement counters to feature table."""
    op.add_column('feature', sa.Column('generation_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('feature', sa.Column('refinement_count', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Remove generation and refinement counters from feature table."""
    op.drop_column('feature', 'refinement_count')
    op.drop_column('feature', 'generation_count')
