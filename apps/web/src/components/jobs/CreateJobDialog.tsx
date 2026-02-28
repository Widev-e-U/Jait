import { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Switch } from '../ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { ModelIcon } from '../icons/model-icons'
import { CRON_PRESETS, validateCron, describeCron } from '@/lib/cron-utils'
import { JobsApi, type CreateJobRequest, type ScheduledJob, type JobType, type ProviderInfo } from '@/lib/jobs-api'
import { Loader2, X, AlertCircle } from 'lucide-react'

interface CreateJobDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (job: ScheduledJob) => void
  editJob?: ScheduledJob | null
  onUpdated?: (job: ScheduledJob) => void
}

const api = new JobsApi()

export function CreateJobDialog({
  isOpen,
  onClose,
  onCreated,
  editJob,
  onUpdated,
}: CreateJobDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({})
  
  // Form state
  const [name, setName] = useState('')
  const [jobType, setJobType] = useState<JobType>('agent_task')
  const [schedule, setSchedule] = useState('0 * * * *')
  const [customSchedule, setCustomSchedule] = useState('')
  const [useCustomSchedule, setUseCustomSchedule] = useState(false)
  const [enabled, setEnabled] = useState(true)
  
  // Agent task specific
  const [provider, setProvider] = useState<string>('')
  const [model, setModel] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  
  // System job specific
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')

  // Load providers on mount
  useEffect(() => {
    api.getAvailableProviders().then(setProviders).catch(console.error)
  }, [])

  // Populate form when editing
  useEffect(() => {
    if (editJob) {
      setName(editJob.name)
      setJobType(editJob.job_type as JobType)
      setSchedule(editJob.cron_expression)
      setEnabled(editJob.enabled)
      setProvider(editJob.provider || '')
      setModel(editJob.model || '')
      setPrompt(editJob.prompt || '')
      // For system jobs, payload is stored as JSON string in DB, parse it back
      setArgs('')
      setCommand('')
      
      // Check if schedule is a preset
      const isPreset = CRON_PRESETS.some(p => p.value === editJob.cron_expression)
      if (!isPreset) {
        setUseCustomSchedule(true)
        setCustomSchedule(editJob.cron_expression)
      }
    } else {
      // Reset form for new job
      setName('')
      setJobType('agent_task')
      setSchedule('0 * * * *')
      setCustomSchedule('')
      setUseCustomSchedule(false)
      setEnabled(true)
      setProvider('')
      setModel('')
      setPrompt('')
      setCommand('')
      setArgs('')
    }
  }, [editJob, isOpen])

  const currentSchedule = useCustomSchedule ? customSchedule : schedule
  const scheduleValidation = validateCron(currentSchedule)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!scheduleValidation.valid) {
      setError(scheduleValidation.error || 'Invalid cron expression')
      return
    }

    const jobData: CreateJobRequest = {
      name,
      job_type: jobType,
      cron_expression: currentSchedule,
      enabled,
    }

    if (jobType === 'agent_task') {
      if (!provider || !model || !prompt) {
        setError('Provider, model, and prompt are required for agent tasks')
        return
      }
      jobData.provider = provider
      jobData.model = model
      jobData.prompt = prompt
    } else {
      // System job - combine command and args into payload
      if (!command) {
        setError('Command is required for system jobs')
        return
      }
      const payload: Record<string, unknown> = { command }
      if (args) {
        try {
          payload.args = JSON.parse(args)
        } catch {
          setError('Args must be valid JSON')
          return
        }
      }
      jobData.payload = payload
    }

    setIsSubmitting(true)
    try {
      if (editJob) {
        const updated = await api.updateJob(editJob.id, jobData)
        onUpdated?.(updated)
      } else {
        const created = await api.createJob(jobData)
        onCreated(created)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">
            {editJob ? 'Edit Job' : 'Create New Job'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-6">
          {/* Job Type Selection */}
          <Tabs value={jobType} onValueChange={(v) => setJobType(v as JobType)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="agent_task">Agent Task</TabsTrigger>
              <TabsTrigger value="system_job">System Job</TabsTrigger>
            </TabsList>

            {/* Agent Task Configuration */}
            <TabsContent value="agent_task" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="provider">Provider</Label>
                <Select value={provider} onValueChange={(v) => { setProvider(v); setModel('') }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(providers).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <ModelIcon provider={key} size={20} />
                          <span>{info.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {provider && providers[provider] && (
                <div>
                  <Label htmlFor="model">Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers[provider].models.map((m) => (
                        <SelectItem key={m} value={m}>
                          <div className="flex items-center gap-2">
                            <ModelIcon provider={provider} model={m} size={20} />
                            <span>{m}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="What should the agent do?"
                  rows={4}
                />
              </div>
            </TabsContent>

            {/* System Job Configuration */}
            <TabsContent value="system_job" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="command">Command</Label>
                <Input
                  id="command"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="e.g., cleanup_old_files"
                />
              </div>

              <div>
                <Label htmlFor="args">Arguments (JSON)</Label>
                <Textarea
                  id="args"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder='{"days": 30}'
                  rows={3}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Common Fields */}
          <div className="border-t pt-4 space-y-4">
            <div>
              <Label htmlFor="name">Job Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My scheduled job"
                required
              />
            </div>

            {/* Schedule */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Schedule</Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="custom-schedule" className="text-sm text-muted-foreground">
                    Custom
                  </Label>
                  <Switch
                    id="custom-schedule"
                    checked={useCustomSchedule}
                    onCheckedChange={setUseCustomSchedule}
                  />
                </div>
              </div>

              {useCustomSchedule ? (
                <div>
                  <Input
                    value={customSchedule}
                    onChange={(e) => setCustomSchedule(e.target.value)}
                    placeholder="* * * * *"
                    className={scheduleValidation.valid ? '' : 'border-red-500'}
                  />
                  {customSchedule && (
                    <p className={`text-sm mt-1 ${scheduleValidation.valid ? 'text-muted-foreground' : 'text-red-500'}`}>
                      {scheduleValidation.valid ? describeCron(customSchedule) : scheduleValidation.error}
                    </p>
                  )}
                </div>
              ) : (
                <Select value={schedule} onValueChange={setSchedule}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRON_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        <div className="flex flex-col">
                          <span>{preset.label}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {preset.value}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enabled">Enabled</Label>
                <p className="text-sm text-muted-foreground">
                  Job will run according to schedule
                </p>
              </div>
              <Switch
                id="enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editJob ? 'Save Changes' : 'Create Job'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
