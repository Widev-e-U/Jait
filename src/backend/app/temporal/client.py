"""
Temporal client setup and connection management
"""
from typing import Optional
from temporalio.client import Client, ScheduleHandle
from temporalio.common import SearchAttributeKey
from app.config import get_settings

settings = get_settings()

_client: Optional[Client] = None


async def get_temporal_client() -> Client:
    """
    Get or create the Temporal client singleton.
    
    Returns:
        Connected Temporal client
    """
    global _client
    
    if _client is None:
        _client = await Client.connect(
            settings.temporal_host,
            namespace=settings.temporal_namespace
        )
    
    return _client


async def close_temporal_client():
    """Close the Temporal client connection."""
    global _client
    if _client is not None:
        await _client.close()
        _client = None


async def create_schedule(
    schedule_id: str,
    workflow_type: str,
    workflow_id: str,
    cron_expression: str,
    args: list = None,
    task_queue: Optional[str] = None
) -> ScheduleHandle:
    """
    Create a Temporal schedule for recurring workflow execution.
    
    Args:
        schedule_id: Unique identifier for the schedule
        workflow_type: Name of the workflow to run
        workflow_id: ID for the workflow execution
        cron_expression: Cron expression (e.g., "0 * * * *" for hourly)
        args: Arguments to pass to the workflow
        task_queue: Task queue name (defaults to settings)
    
    Returns:
        ScheduleHandle for managing the schedule
    """
    from temporalio.client import (
        Schedule,
        ScheduleSpec,
        ScheduleIntervalSpec,
        ScheduleActionStartWorkflow,
        ScheduleState,
    )
    from datetime import timedelta
    from croniter import croniter
    
    client = await get_temporal_client()
    
    # Parse cron to intervals (Temporal uses intervals, not cron directly for some setups)
    # For proper cron support, we use ScheduleSpec with cron_expressions
    schedule = Schedule(
        action=ScheduleActionStartWorkflow(
            workflow_type,
            args=args or [],
            id=f"{workflow_id}-{{{{.ScheduledTime.Unix}}}}",
            task_queue=task_queue or settings.temporal_task_queue,
        ),
        spec=ScheduleSpec(
            cron_expressions=[cron_expression],
        ),
        state=ScheduleState(
            paused=False,
        ),
    )
    
    handle = await client.create_schedule(
        schedule_id,
        schedule,
    )
    
    return handle


async def get_schedule(schedule_id: str) -> Optional[ScheduleHandle]:
    """Get an existing schedule handle."""
    client = await get_temporal_client()
    try:
        return client.get_schedule_handle(schedule_id)
    except Exception:
        return None


async def delete_schedule(schedule_id: str) -> bool:
    """Delete a schedule."""
    handle = await get_schedule(schedule_id)
    if handle:
        await handle.delete()
        return True
    return False


async def pause_schedule(schedule_id: str) -> bool:
    """Pause a schedule."""
    handle = await get_schedule(schedule_id)
    if handle:
        await handle.pause()
        return True
    return False


async def unpause_schedule(schedule_id: str) -> bool:
    """Resume a paused schedule."""
    handle = await get_schedule(schedule_id)
    if handle:
        await handle.unpause()
        return True
    return False


async def trigger_schedule(schedule_id: str) -> bool:
    """Trigger immediate execution of a scheduled workflow."""
    handle = await get_schedule(schedule_id)
    if handle:
        await handle.trigger()
        return True
    return False
