"""Initial migration with Feature Template and TestCase

Revision ID: d3f7b66295cd
Revises: 
Create Date: 2025-12-21 23:50:49.467753

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'd3f7b66295cd'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade database schema."""
    # Create feature table
    op.create_table(
        'feature',
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('raw_requirements', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_feature_title'), 'feature', ['title'], unique=False)
    
    # Create template table
    op.create_table(
        'template',
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('system_instructions', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('id', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_template_name'), 'template', ['name'], unique=True)
    
    # Create testcase table
    op.create_table(
        'testcase',
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('steps', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('expected_result', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('is_edge_case', sa.Boolean(), nullable=False),
        sa.Column('is_manual', sa.Boolean(), nullable=False),
        sa.Column('refinement_notes', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('status', sa.Enum('DRAFT', 'ACCEPTED', 'REJECTED', name='testcasestatus'), nullable=False),
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('feature_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['feature_id'], ['feature.id'], ),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    """Downgrade database schema."""
    op.drop_table('testcase')
    op.drop_index(op.f('ix_template_name'), table_name='template')
    op.drop_table('template')
    op.drop_index(op.f('ix_feature_title'), table_name='feature')
    op.drop_table('feature')
