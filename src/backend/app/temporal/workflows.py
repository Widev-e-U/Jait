"""
Temporal workflow definitions
"""
from datetime import timedelta
from typing import Optional
from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from app.temporal.activities import (
        execute_agent_task,
        cleanup_old_messages,
        reset_daily_counts,
        sync_job_status,
        ExecuteAgentTaskInput,
    )


@workflow.defn
class AgentTaskWorkflow:
    """
    Workflow for executing scheduled agent tasks.
    Runs an agent prompt on behalf of a user.
    """
    
    @workflow.run
    async def run(
        self,
        job_id: str,
        user_id: str,
        prompt: str,
        provider: Optional[str] = None,
        model: Optional[str] = None
    ) -> dict:
        """
        Execute an agent task.
        
        Args:
            job_id: ID of the scheduled job
            user_id: Owner of the job
            prompt: The prompt to execute
            provider: Optional LLM provider override
            model: Optional model override
        
        Returns:
            Dict with execution result
        """
        input_data = ExecuteAgentTaskInput(
            job_id=job_id,
            user_id=user_id,
            prompt=prompt,
            provider=provider,
            model=model,
        )
        
        result = await workflow.execute_activity(
            execute_agent_task,
            input_data,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=workflow.RetryPolicy(
                maximum_attempts=3,
                initial_interval=timedelta(seconds=1),
                maximum_interval=timedelta(minutes=1),
            ),
        )
        
        return result


@workflow.defn
class SystemJobWorkflow:
    """
    Workflow for system maintenance tasks.
    """
    
    @workflow.run
    async def run(self, job_type: str, params: Optional[dict] = None) -> dict:
        """
        Execute a system job.
        
        Args:
            job_type: Type of system job ('cleanup', 'reset_counts', 'sync_status')
            params: Optional parameters for the job
        
        Returns:
            Dict with execution result
        """
        params = params or {}
        
        if job_type == "cleanup":
            days = params.get("days", 30)
            result = await workflow.execute_activity(
                cleanup_old_messages,
                days,
                start_to_close_timeout=timedelta(minutes=10),
            )
        elif job_type == "reset_counts":
            result = await workflow.execute_activity(
                reset_daily_counts,
                start_to_close_timeout=timedelta(minutes=5),
            )
        elif job_type == "sync_status":
            result = await workflow.execute_activity(
                sync_job_status,
                start_to_close_timeout=timedelta(minutes=5),
            )
        else:
            result = {"error": f"Unknown job type: {job_type}"}
        
        return result


@workflow.defn
class OneShotAgentWorkflow:
    """
    Workflow for immediate one-shot agent task execution.
    Used for testing or manual triggering.
    """
    
    @workflow.run
    async def run(
        self,
        user_id: str,
        prompt: str,
        provider: Optional[str] = None,
        model: Optional[str] = None
    ) -> dict:
        """Execute a one-shot agent task."""
        input_data = ExecuteAgentTaskInput(
            job_id="oneshot",
            user_id=user_id,
            prompt=prompt,
            provider=provider,
            model=model,
        )
        
        result = await workflow.execute_activity(
            execute_agent_task,
            input_data,
            start_to_close_timeout=timedelta(minutes=5),
        )
        
        return result
