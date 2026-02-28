import { useState, useEffect, useCallback } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { JobCard } from './JobCard'
import { CreateJobDialog } from './CreateJobDialog'
import { JobHistoryDialog } from './JobHistoryDialog'
import { JobsApi, type ScheduledJob, type JobRun } from '@/lib/jobs-api'
import { Plus, RefreshCw, Calendar, AlertCircle, Loader2 } from 'lucide-react'

const api = new JobsApi()

export function JobsPage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [recentRuns, setRecentRuns] = useState<Record<string, JobRun | null>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null)
  const [historyJob, setHistoryJob] = useState<ScheduledJob | null>(null)

  const loadJobs = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.listJobs()
      setJobs(data)
      
      // Load recent run for each job
      const runsMap: Record<string, JobRun | null> = {}
      await Promise.all(
        data.map(async (job) => {
          try {
            const runs = await api.getJobRuns(job.id, 1)
            runsMap[job.id] = runs[0] || null
          } catch {
            runsMap[job.id] = null
          }
        })
      )
      setRecentRuns(runsMap)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const updated = await api.updateJob(id, { enabled })
      setJobs(jobs.map(j => j.id === id ? updated : j))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job')
    }
  }

  const handleTrigger = async (id: string) => {
    try {
      const run = await api.triggerJob(id)
      setRecentRuns({ ...recentRuns, [id]: run })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger job')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return
    try {
      await api.deleteJob(id)
      setJobs(jobs.filter(j => j.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job')
    }
  }

  const handleCreated = (job: ScheduledJob) => {
    setJobs([job, ...jobs])
    setIsCreateOpen(false)
  }

  const handleUpdated = (job: ScheduledJob) => {
    setJobs(jobs.map(j => j.id === job.id ? job : j))
    setEditingJob(null)
  }

  const enabledCount = jobs.filter(j => j.enabled).length
  const agentTaskCount = jobs.filter(j => j.job_type === 'agent_task').length
  const systemJobCount = jobs.filter(j => j.job_type === 'system_job').length

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Scheduled Jobs
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your automated tasks and agent schedules
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadJobs} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-6">
        <Badge variant="outline" className="text-sm py-1 px-3">
          {jobs.length} total
        </Badge>
        <Badge variant="default" className="text-sm py-1 px-3">
          {enabledCount} enabled
        </Badge>
        <Badge variant="secondary" className="text-sm py-1 px-3">
          {agentTaskCount} agent tasks
        </Badge>
        <Badge variant="secondary" className="text-sm py-1 px-3">
          {systemJobCount} system jobs
        </Badge>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-md mb-4">
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
        <div className="text-center py-24 border-2 border-dashed rounded-lg">
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
        <div className="grid gap-4 md:grid-cols-2">
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
