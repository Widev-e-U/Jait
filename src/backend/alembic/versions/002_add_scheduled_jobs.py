"""Add scheduled jobs tables

Revision ID: 002
Revises: 001
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add missing columns to users table (if not exists)
    op.add_column('users', sa.Column('daily_prompt_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('last_prompt_date', sa.Date(), nullable=True))
    
    # Scheduled jobs table
    op.create_table(
        'scheduled_jobs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('cron_expression', sa.String(100), nullable=False),
        sa.Column('job_type', sa.String(50), nullable=False),  # 'agent_task' or 'system'
        sa.Column('prompt', sa.Text(), nullable=True),  # For agent tasks
        sa.Column('payload', sa.Text(), nullable=True),  # JSON for system jobs
        sa.Column('provider', sa.String(50), nullable=True),  # Optional LLM provider
        sa.Column('model', sa.String(100), nullable=True),  # Optional model override
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('temporal_schedule_id', sa.String(255), nullable=True, unique=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Job runs table
    op.create_table(
        'job_runs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('job_id', sa.String(36), sa.ForeignKey('scheduled_jobs.id'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),  # pending, running, completed, failed
        sa.Column('started_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('result', sa.Text(), nullable=True),  # JSON result
        sa.Column('error', sa.Text(), nullable=True),
    )
    
    # Indexes
    op.create_index('ix_scheduled_jobs_user_id', 'scheduled_jobs', ['user_id'])
    op.create_index('ix_scheduled_jobs_enabled', 'scheduled_jobs', ['enabled'])
    op.create_index('ix_scheduled_jobs_job_type', 'scheduled_jobs', ['job_type'])
    op.create_index('ix_job_runs_job_id', 'job_runs', ['job_id'])
    op.create_index('ix_job_runs_status', 'job_runs', ['status'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_job_runs_status')
    op.drop_index('ix_job_runs_job_id')
    op.drop_index('ix_scheduled_jobs_job_type')
    op.drop_index('ix_scheduled_jobs_enabled')
    op.drop_index('ix_scheduled_jobs_user_id')
    
    # Drop tables
    op.drop_table('job_runs')
    op.drop_table('scheduled_jobs')
    
    # Remove added columns from users
    op.drop_column('users', 'last_prompt_date')
    op.drop_column('users', 'daily_prompt_count')
