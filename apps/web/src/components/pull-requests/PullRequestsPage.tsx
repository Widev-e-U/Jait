import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  PullRequestDetail,
  PullRequestDiff,
  PullRequestListState,
  PullRequestMergeMethod,
  PullRequestReviewEvent,
  PullRequestSummary,
} from '@jait/shared'
import {
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  Code2,
  ExternalLink,
  FileCode2,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { MessageResponse } from '@/components/ai-elements/message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { AutomationRepository } from '@/lib/automation-repositories'
import { pullRequestsApi } from '@/lib/pull-requests-api'
import { cn } from '@/lib/utils'

interface PullRequestsPageProps {
  repositories: AutomationRepository[]
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

interface PullRequestDeepLink {
  host: string
  owner: string
  repo: string
  number: number
}

function parsePullRequestDeepLink(): PullRequestDeepLink | null {
  const raw = new URLSearchParams(window.location.search).get('url')
  if (!raw) return null
  try {
    const url = new URL(raw)
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
    if (!match) return null
    return {
      host: url.hostname.toLowerCase(),
      owner: (match[1] ?? '').toLowerCase(),
      repo: (match[2] ?? '').toLowerCase(),
      number: Number(match[3]),
    }
  } catch {
    return null
  }
}

function repositoryMatchesDeepLink(
  repository: AutomationRepository,
  deepLink: PullRequestDeepLink,
): boolean {
  const raw = repository.forgeUrl ?? repository.githubUrl
  if (!raw) return false
  try {
    const normalized = raw.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '')
    const url = new URL(normalized)
    const parts = url.pathname.split('/').filter(Boolean)
    return url.hostname.toLowerCase() === deepLink.host
      && parts[0]?.toLowerCase() === deepLink.owner
      && parts[1]?.toLowerCase() === deepLink.repo
  } catch {
    return false
  }
}

function isGitHubRepository(repository: AutomationRepository): boolean {
  const url = repository.forgeUrl ?? repository.githubUrl ?? ''
  try {
    return new URL(url.replace(/^git@([^:]+):/, 'https://$1/')).hostname.toLowerCase().includes('github')
  } catch {
    return url.toLowerCase().includes('github')
  }
}

function stateBadge(pr: Pick<PullRequestSummary, 'state' | 'isDraft'>) {
  if (pr.isDraft) return <Badge variant="secondary">Draft</Badge>
  if (pr.state === 'MERGED') return <Badge className="border-transparent bg-purple-500/15 text-purple-700 dark:text-purple-300">Merged</Badge>
  if (pr.state === 'CLOSED') return <Badge variant="destructive">Closed</Badge>
  return <Badge variant="success">Open</Badge>
}

function checksSummary(checks: PullRequestSummary['checks']) {
  if (!checks.length) return { label: 'No checks', tone: 'text-muted-foreground', icon: Clock3 }
  const failed = checks.some((check) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(check.conclusion.toUpperCase()))
  if (failed) return { label: 'Checks failing', tone: 'text-red-600 dark:text-red-400', icon: XCircle }
  const pending = checks.some((check) => {
    const status = check.status.toUpperCase()
    return status && status !== 'COMPLETED'
  })
  if (pending) return { label: 'Checks running', tone: 'text-amber-600 dark:text-amber-400', icon: Clock3 }
  return { label: 'Checks passing', tone: 'text-green-600 dark:text-green-400', icon: CheckCircle2 }
}

function PullRequestListItem({
  pullRequest,
  selected,
  onSelect,
}: {
  pullRequest: PullRequestSummary
  selected: boolean
  onSelect: () => void
}) {
  const checkState = checksSummary(pullRequest.checks)
  const CheckIcon = checkState.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/60',
        selected && 'bg-muted',
      )}
    >
      <div className="flex items-start gap-2">
        <GitPullRequest className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          pullRequest.state === 'MERGED'
            ? 'text-purple-500'
            : pullRequest.state === 'CLOSED'
              ? 'text-red-500'
              : 'text-green-500',
        )} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium leading-5">{pullRequest.title}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>#{pullRequest.number}</span>
            <span>by {pullRequest.author?.login ?? 'unknown'}</span>
            <span>·</span>
            <span>{formatDate(pullRequest.updatedAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {pullRequest.isDraft && <Badge variant="secondary" className="h-5">Draft</Badge>}
            <span className={cn('inline-flex items-center gap-1 text-xs', checkState.tone)}>
              <CheckIcon className="h-3.5 w-3.5" />
              {checkState.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {pullRequest.changedFiles} {pullRequest.changedFiles === 1 ? 'file' : 'files'}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

function EmptyDetail() {
  return (
    <div className="flex h-full min-h-72 items-center justify-center p-8 text-center">
      <div>
        <GitPullRequest className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">Select a pull request</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Review changes, checks, discussion, and merge status here.
        </p>
      </div>
    </div>
  )
}

export function PullRequestsPage({ repositories }: PullRequestsPageProps) {
  const confirm = useConfirmDialog()
  const deepLink = useMemo(parsePullRequestDeepLink, [])
  const deepLinkHandledRef = useRef(false)
  const githubRepositories = useMemo(
    () => repositories.filter(isGitHubRepository),
    [repositories],
  )
  const [repositoryId, setRepositoryId] = useState('')
  const [listState, setListState] = useState<PullRequestListState>(deepLink ? 'all' : 'open')
  const [pullRequests, setPullRequests] = useState<PullRequestSummary[]>([])
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)
  const [detail, setDetail] = useState<PullRequestDetail | null>(null)
  const [diff, setDiff] = useState<PullRequestDiff | null>(null)
  const [activeTab, setActiveTab] = useState('conversation')
  const [listLoading, setListLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [reviewBody, setReviewBody] = useState('')
  const [reviewEvent, setReviewEvent] = useState<PullRequestReviewEvent>('approve')
  const [mergeMethod, setMergeMethod] = useState<PullRequestMergeMethod>('squash')
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')

  useEffect(() => {
    if (!deepLinkHandledRef.current && deepLink) {
      const deepLinkedRepository = githubRepositories.find((repository) => (
        repositoryMatchesDeepLink(repository, deepLink)
      ))
      if (deepLinkedRepository) {
        deepLinkHandledRef.current = true
        setRepositoryId(deepLinkedRepository.id)
        setSelectedNumber(deepLink.number)
        return
      }
    }
    if (repositoryId && githubRepositories.some((repository) => repository.id === repositoryId)) return
    setRepositoryId(githubRepositories[0]?.id ?? '')
  }, [deepLink, githubRepositories, repositoryId])

  const refreshList = useCallback(async () => {
    if (!repositoryId) {
      setPullRequests([])
      setSelectedNumber(null)
      return
    }
    setListLoading(true)
    setError(null)
    try {
      const result = await pullRequestsApi.list(repositoryId, listState)
      setPullRequests(result)
      setSelectedNumber((current) => (
        current && result.some((pullRequest) => pullRequest.number === current)
          ? current
          : result[0]?.number ?? null
      ))
    } catch (requestError) {
      setPullRequests([])
      setSelectedNumber(null)
      setError(requestError instanceof Error ? requestError.message : 'Failed to load pull requests')
    } finally {
      setListLoading(false)
    }
  }, [listState, repositoryId])

  const refreshDetail = useCallback(async () => {
    if (!repositoryId || !selectedNumber) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    setError(null)
    try {
      const result = await pullRequestsApi.get(repositoryId, selectedNumber)
      setDetail(result)
      setEditTitle(result.title)
      setEditBody(result.body)
    } catch (requestError) {
      setDetail(null)
      setError(requestError instanceof Error ? requestError.message : 'Failed to load pull request')
    } finally {
      setDetailLoading(false)
    }
  }, [repositoryId, selectedNumber])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  useEffect(() => {
    setDiff(null)
    setEditing(false)
    void refreshDetail()
  }, [refreshDetail])

  useEffect(() => {
    if (activeTab !== 'changes' || !repositoryId || !selectedNumber || diff || diffLoading) return
    setDiffLoading(true)
    pullRequestsApi.diff(repositoryId, selectedNumber)
      .then(setDiff)
      .catch((requestError) => {
        toast.error('Could not load PR diff', {
          description: requestError instanceof Error ? requestError.message : undefined,
        })
      })
      .finally(() => setDiffLoading(false))
  }, [activeTab, diff, diffLoading, repositoryId, selectedNumber])

  const reloadAfterAction = useCallback(async () => {
    await refreshDetail()
    await refreshList()
  }, [refreshDetail, refreshList])

  const runAction = useCallback(async (
    name: string,
    operation: () => Promise<unknown>,
    successMessage: string,
    reload = reloadAfterAction,
  ) => {
    setAction(name)
    try {
      await operation()
      toast.success(successMessage)
      await reload()
    } catch (requestError) {
      toast.error(`${name} failed`, {
        description: requestError instanceof Error ? requestError.message : undefined,
      })
    } finally {
      setAction(null)
    }
  }, [reloadAfterAction])

  const submitComment = async () => {
    const body = commentBody.trim()
    if (!detail || !body) return
    await runAction(
      'Comment',
      () => pullRequestsApi.comment(repositoryId, detail.number, body),
      'Comment added',
      refreshDetail,
    )
    setCommentBody('')
  }

  const submitReview = async () => {
    if (!detail) return
    await runAction(
      'Review',
      () => pullRequestsApi.review(repositoryId, detail.number, reviewEvent, reviewBody),
      reviewEvent === 'approve'
        ? 'Pull request approved'
        : reviewEvent === 'request_changes'
          ? 'Changes requested'
          : 'Review submitted',
      refreshDetail,
    )
    setReviewBody('')
  }

  const saveEdit = async () => {
    if (!detail || !editTitle.trim()) return
    await runAction(
      'Update',
      () => pullRequestsApi.update(repositoryId, detail.number, {
        title: editTitle.trim(),
        body: editBody,
      }),
      'Pull request updated',
    )
    setEditing(false)
  }

  const changeState = async () => {
    if (!detail) return
    const nextState = detail.state === 'OPEN' ? 'closed' : 'open'
    const accepted = await confirm({
      title: nextState === 'closed' ? 'Close pull request?' : 'Reopen pull request?',
      description: nextState === 'closed'
        ? `Close #${detail.number} without merging it?`
        : `Reopen #${detail.number}?`,
      confirmLabel: nextState === 'closed' ? 'Close pull request' : 'Reopen',
      variant: nextState === 'closed' ? 'destructive' : 'default',
    })
    if (!accepted) return
    await runAction(
      nextState === 'closed' ? 'Close' : 'Reopen',
      () => pullRequestsApi.update(repositoryId, detail.number, { state: nextState }),
      nextState === 'closed' ? 'Pull request closed' : 'Pull request reopened',
    )
  }

  const merge = async () => {
    if (!detail) return
    const accepted = await confirm({
      title: 'Merge pull request?',
      description: (
        <span>
          Merge <strong>#{detail.number} {detail.title}</strong> using {mergeMethod} and delete its branch?
        </span>
      ),
      confirmLabel: 'Merge pull request',
    })
    if (!accepted) return
    await runAction(
      'Merge',
      () => pullRequestsApi.merge(repositoryId, detail.number, mergeMethod),
      'Pull request merged',
    )
  }

  if (!githubRepositories.length) {
    return (
      <div className="mx-auto flex min-h-full max-w-2xl items-center justify-center p-6">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
          <GitPullRequest className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h1 className="mt-4 text-xl font-semibold">Pull Requests</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a GitHub URL to one of your Jait repositories to review and control its pull requests here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20">
      <div className="shrink-0 border-b bg-background px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <GitPullRequest className="h-5 w-5" />
              <h1 className="text-lg font-semibold">Pull Requests</h1>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Review, discuss, approve, close, and merge without leaving Jait.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={repositoryId}
              onValueChange={(value) => {
                deepLinkHandledRef.current = true
                setRepositoryId(value)
                setSelectedNumber(null)
                setDetail(null)
              }}
            >
              <SelectTrigger className="h-9 min-w-52 max-w-80">
                <SelectValue placeholder="Choose repository" />
              </SelectTrigger>
              <SelectContent>
                {githubRepositories.map((repository) => (
                  <SelectItem key={repository.id} value={repository.id}>
                    {repository.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex rounded-lg border bg-background p-0.5">
              {(['open', 'closed', 'merged', 'all'] as const).map((value) => (
                <Button
                  key={value}
                  variant={listState === value ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 capitalize"
                  onClick={() => setListState(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => { void refreshList(); void refreshDetail() }}
              disabled={listLoading || detailLoading}
              aria-label="Refresh pull requests"
            >
              <RefreshCw className={cn('h-4 w-4', (listLoading || detailLoading) && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden border-x bg-background lg:flex-row">
        <aside className="max-h-64 shrink-0 overflow-y-auto border-b lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r">
          {listLoading && !pullRequests.length ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading pull requests
            </div>
          ) : pullRequests.length ? (
            pullRequests.map((pullRequest) => (
              <PullRequestListItem
                key={pullRequest.number}
                pullRequest={pullRequest}
                selected={selectedNumber === pullRequest.number}
                onSelect={() => setSelectedNumber(pullRequest.number)}
              />
            ))
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No {listState === 'all' ? '' : listState} pull requests found.
            </div>
          )}
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {detailLoading && !detail ? (
            <div className="flex h-full min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading pull request
            </div>
          ) : !detail ? (
            <EmptyDetail />
          ) : (
            <div>
              <div className="border-b px-4 py-4 sm:px-6">
                {editing ? (
                  <div className="space-y-3">
                    <input
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      className="h-10 w-full rounded-lg border bg-background px-3 text-base font-semibold outline-none focus:ring-2 focus:ring-ring/60"
                      aria-label="Pull request title"
                    />
                    <Textarea
                      value={editBody}
                      onChange={(event) => setEditBody(event.target.value)}
                      className="min-h-32"
                      placeholder="Pull request description"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void saveEdit()} disabled={action !== null || !editTitle.trim()}>
                        {action === 'Update' && <Loader2 className="animate-spin" />}
                        Save
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {stateBadge(detail)}
                          <span className="text-sm text-muted-foreground">#{detail.number}</span>
                        </div>
                        <h2 className="mt-2 text-xl font-semibold leading-7 sm:text-2xl">{detail.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {detail.author?.login ?? 'Unknown author'} wants to merge{' '}
                          <code className="rounded bg-muted px-1 py-0.5 text-xs">{detail.headBranch}</code>
                          {' '}into{' '}
                          <code className="rounded bg-muted px-1 py-0.5 text-xs">{detail.baseBranch}</code>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={action !== null}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        {detail.url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={detail.url} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                              GitHub
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>

                    {detail.state !== 'MERGED' && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2.5">
                        {detail.state === 'OPEN' && (
                          <>
                            <Select value={mergeMethod} onValueChange={(value) => setMergeMethod(value as PullRequestMergeMethod)}>
                              <SelectTrigger className="h-8 w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="squash">Squash merge</SelectItem>
                                <SelectItem value="merge">Merge commit</SelectItem>
                                <SelectItem value="rebase">Rebase merge</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="sm" className="h-8" onClick={() => void merge()} disabled={action !== null || detail.isDraft}>
                              {action === 'Merge' ? <Loader2 className="animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                              Merge
                            </Button>
                          </>
                        )}
                        <Button
                          variant={detail.state === 'OPEN' ? 'destructive' : 'outline'}
                          size="sm"
                          className="h-8"
                          onClick={() => void changeState()}
                          disabled={action !== null}
                        >
                          {action === 'Close' || action === 'Reopen'
                            ? <Loader2 className="animate-spin" />
                            : detail.state === 'OPEN'
                              ? <XCircle className="h-3.5 w-3.5" />
                              : <RotateCcw className="h-3.5 w-3.5" />}
                          {detail.state === 'OPEN' ? 'Close' : 'Reopen'}
                        </Button>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {detail.mergeable && `Mergeable: ${detail.mergeable.toLowerCase()}`}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 py-4 sm:px-6">
                <TabsList className="grid w-full grid-cols-4 sm:w-auto">
                  <TabsTrigger value="conversation" className="gap-1.5 px-2 sm:px-3">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Conversation</span>
                  </TabsTrigger>
                  <TabsTrigger value="changes" className="gap-1.5 px-2 sm:px-3">
                    <FileCode2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Changes</span>
                    <span>{detail.changedFiles}</span>
                  </TabsTrigger>
                  <TabsTrigger value="checks" className="gap-1.5 px-2 sm:px-3">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Checks</span>
                    <span>{detail.checks.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="commits" className="gap-1.5 px-2 sm:px-3">
                    <GitCommitHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Commits</span>
                    <span>{detail.commits.length}</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="conversation" className="space-y-4">
                  <section className="rounded-xl border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{detail.author?.login ?? 'Unknown author'} opened this pull request</span>
                      <span>{formatDate(detail.createdAt)}</span>
                    </div>
                    {detail.body ? (
                      <MessageResponse>{detail.body}</MessageResponse>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">No description provided.</p>
                    )}
                  </section>

                  {[...detail.reviews, ...detail.comments]
                    .sort((left, right) => {
                      const leftDate = 'submittedAt' in left ? left.submittedAt : left.createdAt
                      const rightDate = 'submittedAt' in right ? right.submittedAt : right.createdAt
                      return leftDate.localeCompare(rightDate)
                    })
                    .map((item) => {
                      const isReview = 'submittedAt' in item
                      const date = isReview ? item.submittedAt : item.createdAt
                      return (
                        <section key={`${isReview ? 'review' : 'comment'}-${item.id}`} className="rounded-xl border bg-card p-4">
                          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{item.author?.login ?? 'Unknown user'}</span>
                            {isReview && <Badge variant={item.state === 'APPROVED' ? 'success' : item.state === 'CHANGES_REQUESTED' ? 'destructive' : 'secondary'}>{item.state.replaceAll('_', ' ').toLowerCase()}</Badge>}
                            <span className="ml-auto">{formatDate(date)}</span>
                          </div>
                          {item.body
                            ? <MessageResponse>{item.body}</MessageResponse>
                            : <p className="text-sm italic text-muted-foreground">No review message.</p>}
                        </section>
                      )
                    })}

                  {detail.state === 'OPEN' && (
                    <>
                      <section className="rounded-xl border bg-card p-4">
                        <h3 className="text-sm font-medium">Add a comment</h3>
                        <Textarea
                          value={commentBody}
                          onChange={(event) => setCommentBody(event.target.value)}
                          placeholder="Write a comment in Markdown…"
                          className="mt-3 min-h-24"
                        />
                        <div className="mt-3 flex justify-end">
                          <Button size="sm" onClick={() => void submitComment()} disabled={!commentBody.trim() || action !== null}>
                            {action === 'Comment' && <Loader2 className="animate-spin" />}
                            Comment
                          </Button>
                        </div>
                      </section>

                      <section className="rounded-xl border bg-card p-4">
                        <h3 className="text-sm font-medium">Submit a review</h3>
                        <Textarea
                          value={reviewBody}
                          onChange={(event) => setReviewBody(event.target.value)}
                          placeholder="Optional review summary…"
                          className="mt-3 min-h-24"
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                          <Select value={reviewEvent} onValueChange={(value) => setReviewEvent(value as PullRequestReviewEvent)}>
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="approve">Approve</SelectItem>
                              <SelectItem value="comment">Comment only</SelectItem>
                              <SelectItem value="request_changes">Request changes</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" onClick={() => void submitReview()} disabled={action !== null}>
                            {action === 'Review' ? <Loader2 className="animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Submit review
                          </Button>
                        </div>
                      </section>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="changes" className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
                    <Code2 className="h-4 w-4 text-muted-foreground" />
                    <span>{detail.changedFiles} changed files</span>
                    <span className="text-green-600 dark:text-green-400">+{detail.additions}</span>
                    <span className="text-red-600 dark:text-red-400">−{detail.deletions}</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border bg-card">
                    {detail.files.map((file) => (
                      <div key={file.path} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
                        <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <code className="min-w-0 flex-1 truncate text-xs">{file.path}</code>
                        <span className="text-xs text-green-600 dark:text-green-400">+{file.additions}</span>
                        <span className="text-xs text-red-600 dark:text-red-400">−{file.deletions}</span>
                      </div>
                    ))}
                  </div>
                  {diffLoading ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl border p-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading patch
                    </div>
                  ) : diff?.truncated ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
                      This patch is larger than Jait's 2 MB display limit. The file summary remains available above.
                    </div>
                  ) : diff?.patch ? (
                    <pre className="max-h-[60vh] overflow-auto rounded-xl border bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
                      <code>{diff.patch}</code>
                    </pre>
                  ) : null}
                </TabsContent>

                <TabsContent value="checks">
                  <div className="overflow-hidden rounded-xl border bg-card">
                    {detail.checks.length ? detail.checks.map((check, index) => {
                      const checkState = checksSummary([check])
                      const CheckIcon = checkState.icon
                      return (
                        <div key={`${check.name}-${index}`} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                          <CheckIcon className={cn('h-4 w-4 shrink-0', checkState.tone)} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{check.name}</p>
                            <p className="text-xs capitalize text-muted-foreground">
                              {(check.conclusion || check.status || 'pending').toLowerCase().replaceAll('_', ' ')}
                            </p>
                          </div>
                          {check.detailsUrl && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={check.detailsUrl} target="_blank" rel="noreferrer" aria-label={`Open ${check.name}`}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                        </div>
                      )
                    }) : (
                      <div className="p-8 text-center text-sm text-muted-foreground">No checks reported.</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="commits">
                  <div className="overflow-hidden rounded-xl border bg-card">
                    {detail.commits.length ? detail.commits.map((commit) => (
                      <div key={commit.oid} className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0">
                        <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{commit.message}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {commit.authors.map((author) => author.login).join(', ') || 'Unknown author'}
                            {commit.authoredAt && ` · ${formatDate(commit.authoredAt)}`}
                          </p>
                        </div>
                        <code className="text-xs text-muted-foreground">{commit.oid.slice(0, 7)}</code>
                      </div>
                    )) : (
                      <div className="p-8 text-center text-sm text-muted-foreground">No commits reported.</div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
