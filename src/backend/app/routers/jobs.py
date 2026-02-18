"""
Jobs API router - REST endpoints for managing scheduled jobs
Provides alternative to agent tool for job management via UI.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from croniter import croniter

from app.models.database import get_db
from app.models.schemas import (
    ScheduledJob, JobRun,
    ScheduledJobCreate, ScheduledJobUpdate, ScheduledJobResponse,
    JobRunResponse, ScheduledJobListResponse, JobRunListResponse
)
from app.routers.auth import get_current_user, User
from app.temporal.client import (
    create_schedule, delete_schedule, pause_schedule, 
    unpause_schedule, trigger_schedule
)
from app.config import get_settings

settings = get_settings()

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=ScheduledJobListResponse)
async def list_jobs(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    include_disabled: bool = False,
    job_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """List all scheduled jobs for the current user."""
    query = select(ScheduledJob).where(ScheduledJob.user_id == user.id)
    
    if not include_disabled:
        query = query.where(ScheduledJob.enabled == True)
    
    if job_type:
        query = query.where(ScheduledJob.job_type == job_type)
    
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    # Paginate
    query = query.offset((page - 1) * size).limit(size).order_by(ScheduledJob.created_at.desc())
    result = await db.execute(query)
    jobs = result.scalars().all()
    
    return ScheduledJobListResponse(
        items=[ScheduledJobResponse.model_validate(job) for job in jobs],
        total=total,
        page=page,
        size=size
    )


@router.post("", response_model=ScheduledJobResponse, status_code=201)
async def create_job(
    job_data: ScheduledJobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Create a new scheduled job."""
    # Validate cron expression
    try:
        croniter(job_data.cron_expression)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid cron expression: {e}")
    
    if job_data.job_type == "agent_task" and not job_data.prompt:
        raise HTTPException(status_code=400, detail="Prompt is required for agent_task jobs")
    
    import uuid
    job_id = str(uuid.uuid4())
    schedule_id = f"job-{job_id}"
    
    job = ScheduledJob(
        id=job_id,
        user_id=user.id,
        name=job_data.name,
        description=job_data.description,
        cron_expression=job_data.cron_expression,
        job_type=job_data.job_type,
        prompt=job_data.prompt,
        payload=job_data.payload if job_data.payload else None,
        provider=job_data.provider,
        model=job_data.model,
        enabled=job_data.enabled,
        temporal_schedule_id=schedule_id,
    )
    
    db.add(job)
    
    # Create Temporal schedule
    try:
        await create_schedule(
            schedule_id=schedule_id,
            workflow_type="AgentTaskWorkflow",
            workflow_id=f"agent-task-{job_id}",
            cron_expression=job_data.cron_expression,
            args=[job_id, user.id, job_data.prompt, job_data.provider, job_data.model],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create schedule: {e}")
    
    await db.commit()
    await db.refresh(job)
    
    return ScheduledJobResponse.model_validate(job)


@router.get("/{job_id}", response_model=ScheduledJobResponse)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get a specific job by ID."""
    result = await db.execute(
        select(ScheduledJob).where(
            ScheduledJob.id == job_id,
            ScheduledJob.user_id == user.id
        )
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return ScheduledJobResponse.model_validate(job)


@router.patch("/{job_id}", response_model=ScheduledJobResponse)
async def update_job(
    job_id: str,
    job_data: ScheduledJobUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Update a scheduled job."""
    result = await db.execute(
        select(ScheduledJob).where(
            ScheduledJob.id == job_id,
            ScheduledJob.user_id == user.id
        )
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Validate cron if changing
    if job_data.cron_expression:
        try:
            croniter(job_data.cron_expression)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid cron expression: {e}")
    
    # Update fields
    update_data = job_data.model_dump(exclude_unset=True)
    schedule_changed = False
    
    for field, value in update_data.items():
        if value is not None:
            setattr(job, field, value)
            if field == "cron_expression":
                schedule_changed = True
    
    job.updated_at = datetime.utcnow()
    
    # Handle Temporal schedule updates
    try:
        if schedule_changed:
            # Recreate schedule with new cron
            await delete_schedule(job.temporal_schedule_id)
            await create_schedule(
                schedule_id=job.temporal_schedule_id,
                workflow_type="AgentTaskWorkflow",
                workflow_id=f"agent-task-{job.id}",
                cron_expression=job.cron_expression,
                args=[job.id, user.id, job.prompt, job.provider, job.model],
            )
        elif "enabled" in update_data:
            if job.enabled:
                await unpause_schedule(job.temporal_schedule_id)
            else:
                await pause_schedule(job.temporal_schedule_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update schedule: {e}")
    
    await db.commit()
    await db.refresh(job)
    
    return ScheduledJobResponse.model_validate(job)


@router.delete("/{job_id}", status_code=204)
async def delete_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Delete a scheduled job."""
    result = await db.execute(
        select(ScheduledJob).where(
            ScheduledJob.id == job_id,
            ScheduledJob.user_id == user.id
        )
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Delete Temporal schedule
    try:
        await delete_schedule(job.temporal_schedule_id)
    except Exception:
        pass  # Continue even if Temporal fails
    
    # Delete job runs first
    from sqlalchemy import delete
    await db.execute(delete(JobRun).where(JobRun.job_id == job_id))
    
    # Delete job
    await db.delete(job)
    await db.commit()


@router.post("/{job_id}/trigger", status_code=202)
async def trigger_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Trigger immediate execution of a job."""
    result = await db.execute(
        select(ScheduledJob).where(
            ScheduledJob.id == job_id,
            ScheduledJob.user_id == user.id
        )
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    try:
        await trigger_schedule(job.temporal_schedule_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger job: {e}")
    
    return {"status": "triggered", "job_id": job_id}


@router.get("/{job_id}/runs", response_model=JobRunListResponse)
async def get_job_runs(
    job_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get execution history for a job."""
    # Verify job belongs to user
    result = await db.execute(
        select(ScheduledJob).where(
            ScheduledJob.id == job_id,
            ScheduledJob.user_id == user.id
        )
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Query runs
    query = select(JobRun).where(JobRun.job_id == job_id)
    
    if status:
        query = query.where(JobRun.status == status)
    
    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    # Paginate
    query = query.offset((page - 1) * size).limit(size).order_by(JobRun.started_at.desc())
    result = await db.execute(query)
    runs = result.scalars().all()
    
    return JobRunListResponse(
        items=[JobRunResponse.model_validate(run) for run in runs],
        total=total,
        page=page,
        size=size
    )


# Provider endpoints for model selection UI
@router.get("/providers/available")
async def get_available_providers(
    user: User = Depends(get_current_user)
):
    """Get list of available LLM providers and their models."""
    from app.agent.providers import get_available_providers
    return {"providers": get_available_providers()}
