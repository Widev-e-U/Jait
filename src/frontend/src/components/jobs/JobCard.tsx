import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Switch } from '../ui/switch'
import { Button } from '../ui/button'
import { ModelIcon } from '../icons/model-icons'
import { describeCron, formatRelativeTime, getNextRunTime } from '@/lib/cron-utils'
import type { ScheduledJob, JobRun, JobType } from '@/lib/jobs-api'
import { Play, Trash2, History, Edit, Clock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

export type JobType = 'agent_task' | 'system_job'

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
  const jobTypeLabels: Record<JobType, string> = {
    agent_task: 'Agent Task',
    system_job: 'System Job',
  }

  return (
    <Card className={`transition-opacity ${isLoading ? 'opacity-50' : ''} ${!job.enabled ? 'opacity-75' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {job.job_type === 'agent_task' && job.model && (
              <ModelIcon provider={job.provider} model={job.model} size={32} />
            )}
            <div>
              <CardTitle className="text-lg">{job.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
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
          <Switch
            checked={job.enabled}
            onCheckedChange={handleToggle}
            disabled={isToggling}
          />
        </div>
      </CardHeader>

      <CardContent>
        {/* Schedule */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Clock className="h-4 w-4" />
          <span className="font-mono">{job.cron_expression}</span>
          <span className="text-xs">({describeCron(job.cron_expression)})</span>
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
          <div className="flex items-center gap-2 text-sm mb-3">
            {recentRun.status === 'completed' && (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-green-600">Last run succeeded</span>
              </>
            )}
            {recentRun.status === 'failed' && (
              <>
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-red-600">Last run failed</span>
              </>
            )}
            {recentRun.status === 'running' && (
              <>
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                <span className="text-blue-600">Running now...</span>
              </>
            )}
            {recentRun.started_at && (
              <span className="text-xs text-muted-foreground">
                {new Date(recentRun.started_at).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTrigger}
            disabled={isTriggering || !job.enabled}
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
          >
            <History className="h-4 w-4 mr-1" />
            History
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(job)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(job.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
