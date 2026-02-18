"""Add daily prompt tracking to users

Revision ID: 002
Revises: 001
Create Date: 2026-02-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('daily_prompt_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('last_prompt_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'last_prompt_date')
    op.drop_column('users', 'daily_prompt_count')
