import { useState, useEffect, useCallback } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { JobCard } from './JobCard'
import { CreateJobDialog } from './CreateJobDialog'
import { JobHistoryDialog } from './JobHistoryDialog'
import { JobsApi, type ScheduledJob, type JobRun } from '@/lib/jobs-api'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { Plus, RefreshCw, Calendar, AlertCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

const api = new JobsApi()
const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export function JobsPage() {
  const confirm = useConfirmDialog()
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [recentRuns, setRecentRuns] = useState<Record<string, JobRun | null>>({})
  const [totalJobs, setTotalJobs] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null)
  const [historyJob, setHistoryJob] = useState<ScheduledJob | null>(null)

  const loadJobs = useCallback(async (targetPage: number, targetSize: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const paged = await api.listJobsPage(targetPage, targetSize, true)
      setJobs(paged.items)
      setTotalJobs(paged.total)
      setPage(paged.page)
      setPageSize(paged.size)
      
      // Load recent run for each job
      const runsMap: Record<string, JobRun | null> = {}
      await Promise.all(
        paged.items.map(async (job) => {
          try {
            const runs = await api.getJobRuns(job.id, 1)
            runsMap[job.id] = runs[0] || null
          } catch {
            runsMap[job.id] = null
          }
        })
      )
      setRecentRuns(prev => ({ ...prev, ...runsMap }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadJobs(page, pageSize)
  }, [loadJobs, page, pageSize])

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const updated = await api.updateJob(id, { enabled })
      setJobs(prev => prev.map(j => j.id === id ? updated : j))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job')
    }
  }

  const handleTrigger = async (id: string) => {
    try {
      const run = await api.triggerJob(id)
      setRecentRuns(prev => ({ ...prev, [id]: run }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger job')
    }
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete job',
      description: 'Are you sure you want to delete this job?',
      confirmLabel: 'Delete',
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await api.deleteJob(id)
      const nextTotal = Math.max(0, totalJobs - 1)
      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / pageSize))
      const nextPage = Math.min(page, nextTotalPages)
      setPage(nextPage)
      await loadJobs(nextPage, pageSize)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job')
    }
  }

  const handleCreated = (_job: ScheduledJob) => {
    setPage(1)
    void loadJobs(1, pageSize)
    setIsCreateOpen(false)
  }

  const handleUpdated = (job: ScheduledJob) => {
    setJobs(prev => prev.map(j => j.id === job.id ? job : j))
    setEditingJob(null)
  }

  const totalPages = Math.max(1, Math.ceil(totalJobs / pageSize))
  const pageStart = totalJobs === 0 ? 0 : ((page - 1) * pageSize) + 1
  const pageEnd = Math.min(totalJobs, page * pageSize)
  const enabledCount = jobs.filter(j => j.enabled).length
  const agentTaskCount = jobs.filter(j => j.job_type === 'agent_task').length
  const systemJobCount = jobs.filter(j => j.job_type === 'system_job').length

  return (
    <div className="container mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Calendar className="h-6 w-6" />
            Scheduled Jobs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Manage your automated tasks and agent schedules
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
          <Button variant="outline" onClick={() => void loadJobs(page, pageSize)} disabled={isLoading} className="w-full sm:w-auto">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
        <Badge variant="outline" className="justify-center px-3 py-1 text-xs sm:text-sm">
          {totalJobs} total
        </Badge>
        <Badge variant="default" className="justify-center px-3 py-1 text-xs sm:text-sm">
          {enabledCount} enabled on page
        </Badge>
        <Badge variant="secondary" className="justify-center px-3 py-1 text-xs sm:text-sm">
          {agentTaskCount} agent tasks on page
        </Badge>
        <Badge variant="secondary" className="justify-center px-3 py-1 text-xs sm:text-sm">
          {systemJobCount} system jobs on page
        </Badge>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md mb-4">
          <AlertCircle className="h-4 w-4" />
          {error}
          <Button 
            variant="ghost" 
            size="sm" 
            className="ml-auto" 
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && jobs.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        /* Empty state */
        <div className="rounded-lg border-2 border-dashed px-4 py-16 text-center sm:py-24">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No scheduled jobs yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first job to automate tasks or schedule agent prompts
          </p>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Job
          </Button>
        </div>
      ) : (
        /* Jobs grid */
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              recentRun={recentRuns[job.id]}
              onToggle={handleToggle}
              onTrigger={handleTrigger}
              onDelete={handleDelete}
              onEdit={setEditingJob}
              onViewHistory={setHistoryJob}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {pageStart}–{pageEnd} of {totalJobs}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-sm text-muted-foreground" htmlFor="jobs-page-size">
            Per page
          </label>
          <select
            id="jobs-page-size"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={pageSize}
            onChange={(event) => {
              const nextSize = Number.parseInt(event.target.value, 10)
              if (!Number.isFinite(nextSize) || nextSize <= 0) return
              setPage(1)
              setPageSize(nextSize)
            }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:items-center">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              className="w-full"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Prev
            </Button>
            <span className="text-center text-sm text-muted-foreground tabular-nums">
              Page {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              className="w-full"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <CreateJobDialog
        isOpen={isCreateOpen || !!editingJob}
        onClose={() => {
          setIsCreateOpen(false)
          setEditingJob(null)
        }}
        onCreated={handleCreated}
        editJob={editingJob}
        onUpdated={handleUpdated}
      />

      <JobHistoryDialog
        job={historyJob}
        isOpen={!!historyJob}
        onClose={() => setHistoryJob(null)}
      />
    </div>
  )
}
