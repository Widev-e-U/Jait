"""
Temporal activity implementations
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
from temporalio import activity


@dataclass
class ExecuteAgentTaskInput:
    """Input for agent task execution."""
    job_id: str
    user_id: str
    prompt: str
    provider: Optional[str] = None
    model: Optional[str] = None


@activity.defn
async def execute_agent_task(input: ExecuteAgentTaskInput) -> dict:
    """
    Execute an agent task (prompt) for a scheduled job.
    
    This activity runs the agent with the given prompt and stores the result.
    """
    from app.agent.core import get_agent
    from app.models.database import AsyncSessionLocal
    from app.models.schemas import JobRun
    from sqlalchemy import select, update
    import json
    
    activity.logger.info(f"Executing agent task for job {input.job_id}")
    
    started_at = datetime.utcnow()
    
    try:
        # Get agent with optional provider/model override
        agent = get_agent(
            provider=input.provider,
            model=input.model
        )
        
        # Execute the prompt
        response, tool_calls = await agent.chat(input.prompt)
        
        result = {
            "status": "success",
            "response": response,
            "tool_calls": tool_calls,
            "started_at": started_at.isoformat(),
            "completed_at": datetime.utcnow().isoformat(),
        }
        
        # Store job run in database
        async with AsyncSessionLocal() as session:
            job_run = JobRun(
                job_id=input.job_id,
                status="completed",
                started_at=started_at,
                completed_at=datetime.utcnow(),
                result=json.dumps(result),
            )
            session.add(job_run)
            await session.commit()
        
        activity.logger.info(f"Agent task completed for job {input.job_id}")
        return result
        
    except Exception as e:
        activity.logger.error(f"Agent task failed for job {input.job_id}: {e}")
        
        error_result = {
            "status": "error",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.utcnow().isoformat(),
        }
        
        # Store failed run
        try:
            async with AsyncSessionLocal() as session:
                job_run = JobRun(
                    job_id=input.job_id,
                    status="failed",
                    started_at=started_at,
                    completed_at=datetime.utcnow(),
                    error=str(e),
                )
                session.add(job_run)
                await session.commit()
        except Exception:
            pass  # Don't fail the activity if we can't store the error
        
        raise


@activity.defn
async def cleanup_old_messages(days: int = 30) -> dict:
    """
    Clean up messages older than specified days.
    System maintenance task.
    """
    from app.models.database import AsyncSessionLocal
    from app.models.schemas import Message
    from sqlalchemy import delete
    
    activity.logger.info(f"Cleaning up messages older than {days} days")
    
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            delete(Message).where(Message.created_at < cutoff_date)
        )
        await session.commit()
        deleted_count = result.rowcount
    
    activity.logger.info(f"Deleted {deleted_count} old messages")
    
    return {
        "status": "success",
        "deleted_count": deleted_count,
        "cutoff_date": cutoff_date.isoformat(),
    }


@activity.defn
async def reset_daily_counts() -> dict:
    """
    Reset daily prompt counts for all users.
    Runs at midnight.
    """
    from app.models.database import AsyncSessionLocal
    from app.models.schemas import User
    from sqlalchemy import update
    from datetime import date
    
    activity.logger.info("Resetting daily prompt counts")
    
    today = date.today()
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            update(User)
            .where(User.last_prompt_date < today)
            .values(daily_prompt_count=0, last_prompt_date=today)
        )
        await session.commit()
        updated_count = result.rowcount
    
    activity.logger.info(f"Reset prompt counts for {updated_count} users")
    
    return {
        "status": "success",
        "updated_count": updated_count,
        "date": today.isoformat(),
    }


@activity.defn
async def sync_job_status() -> dict:
    """
    Sync job status between database and Temporal schedules.
    Reconcile any inconsistencies.
    """
    from app.models.database import AsyncSessionLocal
    from app.models.schemas import ScheduledJob
    from app.temporal.client import get_schedule
    from sqlalchemy import select, update
    
    activity.logger.info("Syncing job status with Temporal")
    
    synced = 0
    errors = []
    
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ScheduledJob).where(ScheduledJob.enabled == True)
        )
        jobs = result.scalars().all()
        
        for job in jobs:
            try:
                schedule = await get_schedule(job.temporal_schedule_id)
                if schedule is None:
                    # Schedule missing in Temporal, mark job as disabled
                    job.enabled = False
                    synced += 1
            except Exception as e:
                errors.append(f"Job {job.id}: {str(e)}")
        
        await session.commit()
    
    activity.logger.info(f"Synced {synced} jobs, {len(errors)} errors")
    
    return {
        "status": "success" if not errors else "partial",
        "synced_count": synced,
        "errors": errors,
    }
