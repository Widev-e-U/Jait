import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { ModelIcon } from '../icons/model-icons'
import { describeCron, formatRelativeTime, getNextRunTime } from '@/lib/cron-utils'
import type { ScheduledJob, JobRun } from '@/lib/jobs-api'
import { cn } from '@/lib/utils'
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
      className={cn(
        'transition-opacity',
        isLoading && 'opacity-50',
        !job.enabled && 'opacity-75',
      )}
    >
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {job.job_type === 'agent_task' && job.model && job.provider && (
              <ModelIcon provider={job.provider} model={job.model} size={32} />
            )}
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-base md:text-lg">{job.name}</CardTitle>
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
          <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 md:min-w-[92px] md:justify-end md:border-0 md:bg-transparent md:p-0">
            <span className="text-xs text-muted-foreground md:hidden">
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

      <CardContent className="space-y-3 pt-0">
        {/* Schedule */}
        <div className="flex flex-col gap-1 text-sm text-muted-foreground md:flex-row md:items-center md:gap-2">
          <Clock className="h-4 w-4" />
          <span className="break-all font-mono">{job.cron_expression}</span>
          <span className="text-xs md:text-xs">({describeCron(job.cron_expression)})</span>
        </div>

        {/* Next run */}
        {nextRun && (
          <div className="text-sm text-muted-foreground">
            Next run: {nextRun.toLocaleString()} ({formatRelativeTime(nextRun)})
          </div>
        )}

        {/* Prompt preview for agent tasks */}
        {job.prompt && (
          <div className="line-clamp-2 text-sm italic text-muted-foreground">
            "{job.prompt}"
          </div>
        )}

        {/* Last run status */}
        {recentRun && (
          <div className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-2">
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
        <div className="grid grid-cols-2 gap-2 border-t pt-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTrigger}
            disabled={isTriggering || !job.enabled}
            data-testid={`job-trigger-${job.id}`}
            className="w-full md:justify-self-start"
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
            className="w-full md:w-auto"
          >
            <History className="h-4 w-4 mr-1" />
            <span className="md:hidden lg:inline">History</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(job)}
            aria-label={`Edit job ${job.name}`}
            data-testid={`job-edit-${job.id}`}
            className="h-8 w-full md:w-8"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(job.id)}
            className="h-8 w-full text-destructive hover:bg-destructive/10 hover:text-destructive md:w-8"
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
