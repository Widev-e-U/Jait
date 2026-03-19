import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { ModelIcon } from '../icons/model-icons'
import { describeCron, formatRelativeTime, getNextRunTime } from '@/lib/cron-utils'
import type { ScheduledJob, JobRun } from '@/lib/jobs-api'
import { Play, Trash2, History, Edit, Clock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

interface JobCardProps {
  job: ScheduledJob
  recentRun?: JobRun | null
  onToggle: (id: string, enabled: boolean) => void
  onTrigger: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (job: ScheduledJob) => void
  onViewHistory: (job: ScheduledJob) => void
  isLoading?: boolean
}

export function JobCard({
  job,
  recentRun,
  onToggle,
  onTrigger,
  onDelete,
  onEdit,
  onViewHistory,
  isLoading = false,
}: JobCardProps) {
  const [isToggling, setIsToggling] = useState(false)
  const [isTriggering, setIsTriggering] = useState(false)

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true)
    try {
      await onToggle(job.id, checked)
    } finally {
      setIsToggling(false)
    }
  }

  const handleTrigger = async () => {
    setIsTriggering(true)
    try {
      await onTrigger(job.id)
    } finally {
      setIsTriggering(false)
    }
  }

  const nextRun = job.enabled ? getNextRunTime(job.cron_expression) : null
  const jobTypeLabels: Record<string, string> = {
    agent_task: 'Agent Task',
    system_job: 'System Job',
  }

  return (
    <Card
      data-testid={`job-card-${job.id}`}
      className={`transition-opacity ${isLoading ? 'opacity-50' : ''} ${!job.enabled ? 'opacity-75' : ''}`}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {job.job_type === 'agent_task' && job.model && job.provider && (
              <ModelIcon provider={job.provider} model={job.model} size={32} />
            )}
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-base sm:text-lg">{job.name}</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant={job.job_type === 'agent_task' ? 'default' : 'secondary'}>
                  {jobTypeLabels[job.job_type]}
                </Badge>
                {job.provider && (
                  <Badge variant="outline" className="text-xs">
                    {job.provider}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 sm:min-w-[92px] sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
            <span className="text-xs text-muted-foreground sm:hidden">
              {job.enabled ? 'Enabled' : 'Paused'}
            </span>
            <Switch
              checked={job.enabled}
              onCheckedChange={handleToggle}
              disabled={isToggling}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Schedule */}
        <div className="mb-2 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
          <Clock className="h-4 w-4" />
          <span className="break-all font-mono">{job.cron_expression}</span>
          <span className="text-xs sm:text-[11px]">({describeCron(job.cron_expression)})</span>
        </div>

        {/* Next run */}
        {nextRun && (
          <div className="text-sm text-muted-foreground mb-2">
            Next run: {nextRun.toLocaleString()} ({formatRelativeTime(nextRun)})
          </div>
        )}

        {/* Prompt preview for agent tasks */}
        {job.prompt && (
          <div className="text-sm text-muted-foreground mb-3 line-clamp-2 italic">
            "{job.prompt}"
          </div>
        )}

        {/* Last run status */}
        {recentRun && (
          <div className="mb-3 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
            <div className="flex items-center gap-2">
              {recentRun.status === 'completed' && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">Last run succeeded</span>
                </>
              )}
              {recentRun.status === 'failed' && (
                <>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-red-600 dark:text-red-400">Last run failed</span>
                </>
              )}
              {recentRun.status === 'running' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="text-blue-600 dark:text-blue-400">Running now...</span>
                </>
              )}
            </div>
            {recentRun.started_at && (
              <span className="text-xs text-muted-foreground">
                {new Date(recentRun.started_at).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 border-t pt-2 sm:flex sm:flex-wrap sm:items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTrigger}
            disabled={isTriggering || !job.enabled}
            data-testid={`job-trigger-${job.id}`}
            className="w-full"
          >
            {isTriggering ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            Run Now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewHistory(job)}
            data-testid={`job-history-${job.id}`}
            className="w-full"
          >
            <History className="h-4 w-4 mr-1" />
            History
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(job)}
            aria-label={`Edit job ${job.name}`}
            data-testid={`job-edit-${job.id}`}
            className="w-full"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(job.id)}
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete job ${job.name}`}
            data-testid={`job-delete-${job.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
