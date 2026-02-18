"""
Temporal worker entry point
Runs as a separate container/process to execute workflows and activities.
"""
import asyncio
import signal
from temporalio.client import Client
from temporalio.worker import Worker

from app.config import get_settings
from app.temporal.workflows import AgentTaskWorkflow, SystemJobWorkflow, OneShotAgentWorkflow
from app.temporal.activities import (
    execute_agent_task,
    cleanup_old_messages,
    reset_daily_counts,
    sync_job_status,
)

settings = get_settings()


async def run_worker():
    """Start the Temporal worker."""
    print(f"Connecting to Temporal at {settings.temporal_host}")
    
    client = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace
    )
    
    print(f"Starting worker on task queue: {settings.temporal_task_queue}")
    
    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[
            AgentTaskWorkflow,
            SystemJobWorkflow,
            OneShotAgentWorkflow,
        ],
        activities=[
            execute_agent_task,
            cleanup_old_messages,
            reset_daily_counts,
            sync_job_status,
        ],
    )
    
    # Handle graceful shutdown
    shutdown_event = asyncio.Event()
    
    def signal_handler():
        print("Shutdown signal received")
        shutdown_event.set()
    
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)
    
    print("Worker started. Press Ctrl+C to stop.")
    
    # Run worker until shutdown
    async with worker:
        await shutdown_event.wait()
    
    print("Worker stopped.")


def main():
    """Entry point for the worker."""
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
