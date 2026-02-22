"""Add feature and test case link tables

Revision ID: a1b2c3d4e5f6
Revises: d3f7b66295cd
Create Date: 2026-02-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'd3f7b66295cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade database schema."""
    # Create feature_link table
    op.create_table(
        'feature_link',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source_feature_id', sa.Integer(), nullable=False),
        sa.Column('target_feature_id', sa.Integer(), nullable=False),
        sa.Column('link_type', sa.Enum(
            'RELATES_TO', 'DEPENDS_ON', 'BLOCKS', 'PARENT_OF', 'CHILD_OF',
            name='featurelinktype'
        ), nullable=False),
        sa.Column('notes', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['source_feature_id'], ['feature.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['target_feature_id'], ['feature.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(
        op.f('ix_feature_link_source_feature_id'),
        'feature_link',
        ['source_feature_id'],
        unique=False
    )
    op.create_index(
        op.f('ix_feature_link_target_feature_id'),
        'feature_link',
        ['target_feature_id'],
        unique=False
    )
    
    # Create test_case_link table
    op.create_table(
        'test_case_link',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('feature_id', sa.Integer(), nullable=False),
        sa.Column('test_case_id', sa.Integer(), nullable=False),
        sa.Column('notes', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['feature_id'], ['feature.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['test_case_id'], ['testcase.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(
        op.f('ix_test_case_link_feature_id'),
        'test_case_link',
        ['feature_id'],
        unique=False
    )
    op.create_index(
        op.f('ix_test_case_link_test_case_id'),
        'test_case_link',
        ['test_case_id'],
        unique=False
    )


def downgrade() -> None:
    """Downgrade database schema."""
    # Drop test_case_link table
    op.drop_index(op.f('ix_test_case_link_test_case_id'), table_name='test_case_link')
    op.drop_index(op.f('ix_test_case_link_feature_id'), table_name='test_case_link')
    op.drop_table('test_case_link')
    
    # Drop feature_link table
    op.drop_index(op.f('ix_feature_link_target_feature_id'), table_name='feature_link')
    op.drop_index(op.f('ix_feature_link_source_feature_id'), table_name='feature_link')
    op.drop_table('feature_link')
    
    # Drop the enum type
    op.execute('DROP TYPE IF EXISTS featurelinktype')



