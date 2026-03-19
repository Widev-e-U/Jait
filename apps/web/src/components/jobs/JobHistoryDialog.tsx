import { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { JobsApi, type ScheduledJob, type JobRun } from '@/lib/jobs-api'
import { X, CheckCircle2, AlertCircle, Loader2, Clock, RefreshCw } from 'lucide-react'

interface JobHistoryDialogProps {
  job: ScheduledJob | null
  isOpen: boolean
  onClose: () => void
}

const api = new JobsApi()

export function JobHistoryDialog({ job, isOpen, onClose }: JobHistoryDialogProps) {
  const [runs, setRuns] = useState<JobRun[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRuns = async () => {
    if (!job) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.getJobRuns(job.id, 50)
      setRuns(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && job) {
      loadRuns()
    }
  }, [isOpen, job?.id])

  if (!isOpen || !job) return null

  const getStatusIcon = (status: JobRun['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: JobRun['status']) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      failed: 'destructive',
      running: 'secondary',
      pending: 'outline',
    }
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>
  }

  const formatDuration = (start: string, end?: string | null) => {
    if (!end) return '—'
    const startDate = new Date(start)
    const endDate = new Date(end)
    const durationMs = endDate.getTime() - startDate.getTime()
    
    if (durationMs < 1000) return `${durationMs}ms`
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`
    return `${(durationMs / 60000).toFixed(1)}m`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-history-dialog-title"
        data-testid="job-history-dialog"
        className="flex h-[92dvh] w-full flex-col overflow-hidden border border-border bg-background text-foreground shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:p-4">
          <div className="min-w-0">
            <h2 id="job-history-dialog-title" className="text-lg font-semibold sm:text-xl">Job History</h2>
            <p className="text-sm text-muted-foreground">{job.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadRuns} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close history dialog">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md mb-4">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {isLoading && runs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No runs yet. This job hasn't been executed.
            </div>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="border border-border rounded-lg p-4 hover:bg-muted/40 transition-colors"
                >
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusIcon(run.status)}
                      {getStatusBadge(run.status)}
                      {run.triggered_by && (
                        <span className="text-xs text-muted-foreground">
                          by {run.triggered_by}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Duration: {formatDuration(run.started_at!, run.completed_at)}
                    </div>
                  </div>

                  <div className="mb-2 text-sm text-muted-foreground">
                    <span className="font-medium">Started:</span>{' '}
                    {run.started_at ? new Date(run.started_at).toLocaleString() : 'Not started'}
                    {run.completed_at && (
                      <>
                        {' → '}
                        <span className="font-medium">Completed:</span>{' '}
                        {new Date(run.completed_at).toLocaleString()}
                      </>
                    )}
                  </div>

                  {/* Result/Error */}
                  {run.status === 'completed' && run.result && (
                    <details className="mt-2">
                      <summary className="text-sm text-green-600 dark:text-green-400 cursor-pointer hover:underline">
                        View result
                      </summary>
                      <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                        {typeof run.result === 'string' 
                          ? run.result 
                          : JSON.stringify(run.result, null, 2)}
                      </pre>
                    </details>
                  )}

                  {run.status === 'failed' && run.error && (
                    <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                      <strong>Error:</strong> {run.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
