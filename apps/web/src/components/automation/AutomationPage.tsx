import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Bot, CheckCircle2, ExternalLink, GitBranch, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { JobsApi, type JobRun, type ScheduledJob } from '@/lib/jobs-api'

type GitProvider = 'github' | 'gitea' | 'gitlab' | 'azure-devops' | 'bitbucket' | 'other'

type RepositoryConnection = {
  id: string
  name: string
  provider: GitProvider
  cloneUrl: string
  defaultBranch: string
}

const api = new JobsApi()

function providerLabel(provider: GitProvider): string {
  switch (provider) {
    case 'azure-devops':
      return 'Azure DevOps'
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1)
  }
}

export function AutomationPage() {
  const [repositories, setRepositories] = useState<RepositoryConnection[]>([])
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<GitProvider>('github')
  const [cloneUrl, setCloneUrl] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('main')

  const [selectedRepoId, setSelectedRepoId] = useState<string>('')
  const [taskBranch, setTaskBranch] = useState('codex/automated-change')
  const [taskPrompt, setTaskPrompt] = useState('Implement the requested change and open a pull request with a clear summary and test evidence.')
  const [taskNotes, setTaskNotes] = useState('Keep changes scoped. Run typecheck and tests before opening the pull request.')

  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdJob, setCreatedJob] = useState<ScheduledJob | null>(null)
  const [lastRun, setLastRun] = useState<JobRun | null>(null)

  useEffect(() => {
    if (!selectedRepoId && repositories.length > 0) {
      setSelectedRepoId(repositories[0].id)
    }
    if (selectedRepoId && repositories.every(repo => repo.id !== selectedRepoId)) {
      setSelectedRepoId(repositories[0]?.id ?? '')
    }
  }, [repositories, selectedRepoId])

  const selectedRepo = useMemo(
    () => repositories.find(repo => repo.id === selectedRepoId) ?? null,
    [repositories, selectedRepoId],
  )

  const addRepository = useCallback(() => {
    if (!name.trim() || !cloneUrl.trim()) {
      setError('Repository name and clone URL are required.')
      return
    }

    const repository: RepositoryConnection = {
      id: crypto.randomUUID(),
      name: name.trim(),
      provider,
      cloneUrl: cloneUrl.trim(),
      defaultBranch: defaultBranch.trim() || 'main',
    }

    setRepositories(prev => [repository, ...prev])
    setName('')
    setCloneUrl('')
    setDefaultBranch('main')
    setError(null)
  }, [cloneUrl, defaultBranch, name, provider])

  const removeRepository = useCallback((id: string) => {
    setRepositories(prev => prev.filter(repo => repo.id !== id))
  }, [])

  const runTask = useCallback(async () => {
    if (!selectedRepo) {
      setError('Select a repository before running a task.')
      return
    }

    setIsRunning(true)
    setError(null)

    try {
      const prompt = [
        'You are an autonomous coding agent.',
        `Repository provider: ${providerLabel(selectedRepo.provider)}`,
        `Repository URL: ${selectedRepo.cloneUrl}`,
        `Base branch: ${selectedRepo.defaultBranch}`,
        `Working branch: ${taskBranch}`,
        '',
        'Task:',
        taskPrompt,
        '',
        'Execution notes:',
        taskNotes,
        '',
        'Expected output:',
        '- Commit the change set',
        '- Open a pull request against the base branch',
        '- Include a concise title, summary, and tests run',
      ].join('\n')

      const job = await api.createJob({
        name: `Repo Task: ${selectedRepo.name}`,
        description: `One-click background task for ${selectedRepo.name}`,
        cron_expression: '0 0 1 1 *',
        job_type: 'agent_task',
        prompt,
        enabled: false,
      })

      const run = await api.triggerJob(job.id)
      setCreatedJob(job)
      setLastRun(run)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run background task.')
    } finally {
      setIsRunning(false)
    }
  }, [selectedRepo, taskBranch, taskNotes, taskPrompt])

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            Repo Automation
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure repositories from any Git provider and launch Codex-style background agent tasks that can prepare pull requests.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {error}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Repository sources</CardTitle>
            <CardDescription>Add repositories from GitHub, Gitea, Azure DevOps, GitLab, Bitbucket, and more. Repository entries stay in-memory for this device session only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repo-name">Display name</Label>
              <Input id="repo-name" placeholder="my-service" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repo-provider">Provider</Label>
              <select
                id="repo-provider"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={provider}
                onChange={(event) => setProvider(event.target.value as GitProvider)}
              >
                <option value="github">GitHub</option>
                <option value="gitea">Gitea</option>
                <option value="gitlab">GitLab</option>
                <option value="azure-devops">Azure DevOps</option>
                <option value="bitbucket">Bitbucket</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="repo-url">Clone URL</Label>
              <Input
                id="repo-url"
                placeholder="https://github.com/org/repo.git"
                value={cloneUrl}
                onChange={(event) => setCloneUrl(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repo-base">Default branch</Label>
              <Input id="repo-base" placeholder="main" value={defaultBranch} onChange={(event) => setDefaultBranch(event.target.value)} />
            </div>
            <Button onClick={addRepository} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add repository
            </Button>

            <div className="space-y-2">
              {repositories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No repositories configured yet.</p>
              ) : repositories.map((repo) => (
                <div key={repo.id} className="flex items-center gap-3 border rounded-md p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{repo.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{repo.cloneUrl}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary">{providerLabel(repo.provider)}</Badge>
                      <Badge variant="outline">{repo.defaultBranch}</Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeRepository(repo.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Background task runner</CardTitle>
            <CardDescription>
              Compose an autonomous coding request. The agent receives repo metadata, works in the background, and is instructed to open a PR.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-repo">Repository</Label>
              <select
                id="task-repo"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedRepoId}
                onChange={(event) => setSelectedRepoId(event.target.value)}
              >
                {repositories.length === 0 && <option value="">No repositories</option>}
                {repositories.map(repo => (
                  <option key={repo.id} value={repo.id}>{repo.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-branch">Working branch name</Label>
              <Input id="task-branch" value={taskBranch} onChange={(event) => setTaskBranch(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-prompt">Task prompt</Label>
              <Textarea id="task-prompt" rows={5} value={taskPrompt} onChange={(event) => setTaskPrompt(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-notes">Execution notes</Label>
              <Textarea id="task-notes" rows={4} value={taskNotes} onChange={(event) => setTaskNotes(event.target.value)} />
            </div>

            <Button onClick={() => { void runTask() }} disabled={isRunning || !selectedRepo} className="w-full">
              <GitBranch className="h-4 w-4 mr-2" />
              {isRunning ? 'Running in background...' : 'Run background task'}
            </Button>

            {createdJob && (
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <p className="font-medium flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-500" /> Background task created</p>
                <p className="text-muted-foreground">Job ID: <span className="font-mono text-xs">{createdJob.id}</span></p>
                {lastRun && (
                  <p className="text-muted-foreground">Run status: <Badge variant="outline">{lastRun.status}</Badge></p>
                )}
                <p>
                  <a className="inline-flex items-center gap-1 text-primary hover:underline" href="#" onClick={(event) => event.preventDefault()}>
                    View details in Jobs <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
