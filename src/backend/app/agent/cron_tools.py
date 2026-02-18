"""
Cron job management tools for the agent
Allows the agent to create, list, update, and delete scheduled jobs.
"""
import json
from typing import Any, Optional
from datetime import datetime
from croniter import croniter

from app.config import get_settings

settings = get_settings()


# Tool definitions for cron job management
CRON_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_cron_job",
            "description": "Create a new scheduled cron job that will run a prompt/task on a recurring schedule. Use standard cron expressions (e.g., '0 * * * *' for hourly, '0 9 * * *' for daily at 9am, '0 0 * * 0' for weekly on Sunday).",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "A short, descriptive name for the job"
                    },
                    "cron_expression": {
                        "type": "string",
                        "description": "Cron expression defining the schedule (minute hour day month weekday). Examples: '0 * * * *' (hourly), '0 9 * * *' (daily 9am), '*/15 * * * *' (every 15 min)"
                    },
                    "prompt": {
                        "type": "string",
                        "description": "The prompt/task to execute on each run"
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional longer description of what this job does"
                    }
                },
                "required": ["name", "cron_expression", "prompt"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_cron_jobs",
            "description": "List all scheduled cron jobs for the current user. Shows job names, schedules, and status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "include_disabled": {
                        "type": "boolean",
                        "description": "Whether to include disabled jobs (default: false)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_cron_job",
            "description": "Get details of a specific scheduled job including its recent run history.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The ID of the job to retrieve"
                    }
                },
                "required": ["job_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_cron_job",
            "description": "Update an existing scheduled job. Can change the schedule, prompt, name, or enable/disable it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The ID of the job to update"
                    },
                    "name": {
                        "type": "string",
                        "description": "New name for the job"
                    },
                    "cron_expression": {
                        "type": "string",
                        "description": "New cron schedule"
                    },
                    "prompt": {
                        "type": "string",
                        "description": "New prompt/task"
                    },
                    "enabled": {
                        "type": "boolean",
                        "description": "Enable or disable the job"
                    }
                },
                "required": ["job_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_cron_job",
            "description": "Delete a scheduled job permanently.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The ID of the job to delete"
                    }
                },
                "required": ["job_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_cron_job",
            "description": "Manually trigger a scheduled job to run immediately, regardless of its schedule.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The ID of the job to trigger"
                    }
                },
                "required": ["job_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_job_history",
            "description": "Get the execution history of a scheduled job, showing past runs and their results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "The ID of the job"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of runs to return (default: 10)"
                    }
                },
                "required": ["job_id"]
            }
        }
    }
]


class CronToolExecutor:
    """
    Execute cron-related tools.
    Requires database session and user context.
    """
    
    def __init__(self, db_session, user_id: Optional[str] = None):
        self.db = db_session
        self.user_id = user_id
        
        self.tool_handlers = {
            "create_cron_job": self._create_cron_job,
            "list_cron_jobs": self._list_cron_jobs,
            "get_cron_job": self._get_cron_job,
            "update_cron_job": self._update_cron_job,
            "delete_cron_job": self._delete_cron_job,
            "trigger_cron_job": self._trigger_cron_job,
            "get_job_history": self._get_job_history,
        }
    
    async def execute(self, tool_name: str, arguments: dict) -> dict:
        """Execute a cron tool."""
        handler = self.tool_handlers.get(tool_name)
        if not handler:
            return {"error": f"Unknown cron tool: {tool_name}"}
        
        try:
            return await handler(arguments)
        except Exception as e:
            return {"error": str(e)}
    
    async def _create_cron_job(self, args: dict) -> dict:
        """Create a new scheduled job."""
        from app.models.schemas import ScheduledJob
        from app.temporal.client import create_schedule
        from app.temporal.workflows import AgentTaskWorkflow
        import uuid
        
        name = args.get("name")
        cron_expression = args.get("cron_expression")
        prompt = args.get("prompt")
        description = args.get("description")
        
        # Validate cron expression
        try:
            croniter(cron_expression)
        except Exception as e:
            return {"error": f"Invalid cron expression: {e}"}
        
        if not self.user_id:
            return {"error": "Authentication required to create jobs"}
        
        # Create job in database
        job_id = str(uuid.uuid4())
        schedule_id = f"job-{job_id}"
        
        job = ScheduledJob(
            id=job_id,
            user_id=self.user_id,
            name=name,
            description=description,
            cron_expression=cron_expression,
            job_type="agent_task",
            prompt=prompt,
            enabled=True,
            temporal_schedule_id=schedule_id,
        )
        
        self.db.add(job)
        await self.db.commit()
        
        # Create Temporal schedule
        try:
            await create_schedule(
                schedule_id=schedule_id,
                workflow_type="AgentTaskWorkflow",
                workflow_id=f"agent-task-{job_id}",
                cron_expression=cron_expression,
                args=[job_id, self.user_id, prompt, None, None],
            )
        except Exception as e:
            # Rollback if Temporal fails
            await self.db.delete(job)
            await self.db.commit()
            return {"error": f"Failed to create schedule: {e}"}
        
        # Calculate next run time
        cron = croniter(cron_expression, datetime.utcnow())
        next_run = cron.get_next(datetime)
        
        return {
            "status": "created",
            "job_id": job_id,
            "name": name,
            "cron_expression": cron_expression,
            "next_run": next_run.isoformat(),
            "message": f"Job '{name}' created successfully. Next run at {next_run.strftime('%Y-%m-%d %H:%M UTC')}"
        }
    
    async def _list_cron_jobs(self, args: dict) -> dict:
        """List user's scheduled jobs."""
        from app.models.schemas import ScheduledJob
        from sqlalchemy import select
        
        include_disabled = args.get("include_disabled", False)
        
        if not self.user_id:
            return {"error": "Authentication required", "jobs": []}
        
        query = select(ScheduledJob).where(ScheduledJob.user_id == self.user_id)
        if not include_disabled:
            query = query.where(ScheduledJob.enabled == True)
        
        result = await self.db.execute(query)
        jobs = result.scalars().all()
        
        job_list = []
        for job in jobs:
            cron = croniter(job.cron_expression, datetime.utcnow())
            next_run = cron.get_next(datetime)
            
            job_list.append({
                "id": job.id,
                "name": job.name,
                "cron_expression": job.cron_expression,
                "enabled": job.enabled,
                "next_run": next_run.isoformat(),
                "prompt_preview": job.prompt[:100] + "..." if job.prompt and len(job.prompt) > 100 else job.prompt,
            })
        
        return {
            "count": len(job_list),
            "jobs": job_list
        }
    
    async def _get_cron_job(self, args: dict) -> dict:
        """Get job details."""
        from app.models.schemas import ScheduledJob, JobRun
        from sqlalchemy import select
        
        job_id = args.get("job_id")
        
        result = await self.db.execute(
            select(ScheduledJob).where(
                ScheduledJob.id == job_id,
                ScheduledJob.user_id == self.user_id
            )
        )
        job = result.scalar_one_or_none()
        
        if not job:
            return {"error": "Job not found"}
        
        # Get recent runs
        runs_result = await self.db.execute(
            select(JobRun)
            .where(JobRun.job_id == job_id)
            .order_by(JobRun.started_at.desc())
            .limit(5)
        )
        runs = runs_result.scalars().all()
        
        cron = croniter(job.cron_expression, datetime.utcnow())
        next_run = cron.get_next(datetime)
        
        return {
            "id": job.id,
            "name": job.name,
            "description": job.description,
            "cron_expression": job.cron_expression,
            "prompt": job.prompt,
            "enabled": job.enabled,
            "created_at": job.created_at.isoformat(),
            "next_run": next_run.isoformat(),
            "recent_runs": [
                {
                    "id": run.id,
                    "status": run.status,
                    "started_at": run.started_at.isoformat(),
                    "completed_at": run.completed_at.isoformat() if run.completed_at else None,
                }
                for run in runs
            ]
        }
    
    async def _update_cron_job(self, args: dict) -> dict:
        """Update an existing job."""
        from app.models.schemas import ScheduledJob
        from app.temporal.client import delete_schedule, create_schedule, pause_schedule, unpause_schedule
        from sqlalchemy import select
        
        job_id = args.get("job_id")
        
        result = await self.db.execute(
            select(ScheduledJob).where(
                ScheduledJob.id == job_id,
                ScheduledJob.user_id == self.user_id
            )
        )
        job = result.scalar_one_or_none()
        
        if not job:
            return {"error": "Job not found"}
        
        # Update fields
        updated = []
        
        if "name" in args and args["name"]:
            job.name = args["name"]
            updated.append("name")
        
        if "prompt" in args and args["prompt"]:
            job.prompt = args["prompt"]
            updated.append("prompt")
        
        if "cron_expression" in args and args["cron_expression"]:
            try:
                croniter(args["cron_expression"])
            except Exception as e:
                return {"error": f"Invalid cron expression: {e}"}
            
            job.cron_expression = args["cron_expression"]
            updated.append("schedule")
            
            # Recreate Temporal schedule with new cron
            try:
                await delete_schedule(job.temporal_schedule_id)
                await create_schedule(
                    schedule_id=job.temporal_schedule_id,
                    workflow_type="AgentTaskWorkflow",
                    workflow_id=f"agent-task-{job.id}",
                    cron_expression=args["cron_expression"],
                    args=[job.id, self.user_id, job.prompt, None, None],
                )
            except Exception as e:
                return {"error": f"Failed to update schedule: {e}"}
        
        if "enabled" in args:
            job.enabled = args["enabled"]
            updated.append("enabled")
            
            # Pause/unpause in Temporal
            try:
                if args["enabled"]:
                    await unpause_schedule(job.temporal_schedule_id)
                else:
                    await pause_schedule(job.temporal_schedule_id)
            except Exception as e:
                return {"error": f"Failed to update schedule state: {e}"}
        
        await self.db.commit()
        
        return {
            "status": "updated",
            "job_id": job_id,
            "updated_fields": updated,
            "message": f"Job updated: {', '.join(updated)}"
        }
    
    async def _delete_cron_job(self, args: dict) -> dict:
        """Delete a job."""
        from app.models.schemas import ScheduledJob, JobRun
        from app.temporal.client import delete_schedule
        from sqlalchemy import select, delete
        
        job_id = args.get("job_id")
        
        result = await self.db.execute(
            select(ScheduledJob).where(
                ScheduledJob.id == job_id,
                ScheduledJob.user_id == self.user_id
            )
        )
        job = result.scalar_one_or_none()
        
        if not job:
            return {"error": "Job not found"}
        
        job_name = job.name
        
        # Delete Temporal schedule
        try:
            await delete_schedule(job.temporal_schedule_id)
        except Exception:
            pass  # Continue even if Temporal fails
        
        # Delete job runs
        await self.db.execute(delete(JobRun).where(JobRun.job_id == job_id))
        
        # Delete job
        await self.db.delete(job)
        await self.db.commit()
        
        return {
            "status": "deleted",
            "job_id": job_id,
            "message": f"Job '{job_name}' deleted successfully"
        }
    
    async def _trigger_cron_job(self, args: dict) -> dict:
        """Trigger immediate execution of a job."""
        from app.models.schemas import ScheduledJob
        from app.temporal.client import trigger_schedule
        from sqlalchemy import select
        
        job_id = args.get("job_id")
        
        result = await self.db.execute(
            select(ScheduledJob).where(
                ScheduledJob.id == job_id,
                ScheduledJob.user_id == self.user_id
            )
        )
        job = result.scalar_one_or_none()
        
        if not job:
            return {"error": "Job not found"}
        
        try:
            await trigger_schedule(job.temporal_schedule_id)
        except Exception as e:
            return {"error": f"Failed to trigger job: {e}"}
        
        return {
            "status": "triggered",
            "job_id": job_id,
            "message": f"Job '{job.name}' triggered for immediate execution"
        }
    
    async def _get_job_history(self, args: dict) -> dict:
        """Get job execution history."""
        from app.models.schemas import ScheduledJob, JobRun
        from sqlalchemy import select
        
        job_id = args.get("job_id")
        limit = args.get("limit", 10)
        
        # Verify job belongs to user
        result = await self.db.execute(
            select(ScheduledJob).where(
                ScheduledJob.id == job_id,
                ScheduledJob.user_id == self.user_id
            )
        )
        job = result.scalar_one_or_none()
        
        if not job:
            return {"error": "Job not found"}
        
        # Get runs
        runs_result = await self.db.execute(
            select(JobRun)
            .where(JobRun.job_id == job_id)
            .order_by(JobRun.started_at.desc())
            .limit(limit)
        )
        runs = runs_result.scalars().all()
        
        return {
            "job_id": job_id,
            "job_name": job.name,
            "total_runs": len(runs),
            "runs": [
                {
                    "id": run.id,
                    "status": run.status,
                    "started_at": run.started_at.isoformat(),
                    "completed_at": run.completed_at.isoformat() if run.completed_at else None,
                    "duration_seconds": (run.completed_at - run.started_at).total_seconds() if run.completed_at else None,
                    "error": run.error,
                }
                for run in runs
            ]
        }


def get_cron_tool_descriptions() -> str:
    """Get human-readable descriptions of cron tools."""
    descriptions = []
    for tool in CRON_TOOLS:
        func = tool["function"]
        name = func["name"]
        desc = func["description"]
        descriptions.append(f"**{name}**: {desc}")
    return "\n\n".join(descriptions)
