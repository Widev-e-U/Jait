import { useState, useEffect, useCallback } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  FolderOpen,
  ListChecks,
  Loader2 as SpinnerIcon,
  Monitor,
  Pause,
  Plus,
  ScrollText,
  Square,
  Timer,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { useIsMobile } from '@/hooks/useIsMobile'
import { ThreadActions } from '@/components/automation/ThreadActions'
import { shouldRenderThreadActions } from '@/components/automation/thread-actions-state'
import { canStopThread } from '@/lib/thread-status'
import {
  inferThreadRepositoryName,
  type AutomationRepository,
  type RepositoryRuntimeInfo,
} from '@/lib/automation-repositories'
import type { AgentThread } from '@/lib/agents-api'

const TITLE_PLACEHOLDER_SUFFIX = 'Generating title…'
export function isTitlePending(title: string): boolean {
  return title.replace(/^\[.*?\]\s*/, '').trim() === TITLE_PLACEHOLDER_SUFFIX
}

export function TitleSkeleton({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-block rounded bg-muted animate-pulse ${className}`}>
      <span className="invisible">Generating title</span>
    </span>
  )
}

export function ManagerStatusDot({ status, kind }: { status: string; kind?: AgentThread['kind'] }) {
  const map: Record<string, { icon: typeof Circle; color: string }> = {
    running: { icon: SpinnerIcon, color: 'text-blue-500 animate-spin' },
    ...(kind === 'delegation' ? { idle: { icon: SpinnerIcon, color: 'text-blue-500 animate-spin' } } : {}),
    paused: { icon: Pause, color: 'text-yellow-500' },
    interrupted: { icon: Pause, color: 'text-yellow-500' },
    done: { icon: CheckCircle2, color: 'text-green-500' },
    completed: { icon: CheckCircle2, color: 'text-green-500' },
    error: { icon: XCircle, color: 'text-red-500' },
  }
  const { icon: Icon, color } = map[status] ?? { icon: AlertCircle, color: 'text-muted-foreground' }
  return <Icon className={`h-3 w-3 shrink-0 ${color}`} />
}

export type ThreadPrState = 'creating' | 'open' | 'closed' | 'merged' | null | undefined

export function getVisibleThreadPrState(thread: Pick<AgentThread, 'prState' | 'prUrl'>, polledPrState?: ThreadPrState): ThreadPrState {
  const prState = polledPrState !== undefined ? polledPrState : thread.prState
  return prState ?? (thread.prUrl ? 'open' : null)
}

export function ThreadPrBadge({ prState }: { prState: ThreadPrState }) {
  if (!prState) return null
  const label =
    prState === 'creating'
      ? 'PR creating'
      : prState === 'open'
      ? 'PR open'
      : prState === 'merged'
        ? 'PR merged'
        : 'PR closed'
  const className =
    prState === 'creating'
      ? 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300 dark:bg-amber-500/20 dark:border-amber-400/30'
      : prState === 'open'
      ? 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300 dark:bg-blue-500/20 dark:border-blue-400/30'
      : prState === 'merged'
        ? 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-300 dark:bg-purple-500/20 dark:border-purple-400/30'
        : 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300 dark:bg-red-500/20 dark:border-red-400/30'
  return (
    <Badge variant="outline" className={`h-4 shrink-0 whitespace-nowrap px-1 py-0 text-2xs ${className}`}>
      {label}
    </Badge>
  )
}

export function ThreadKindBadge({ kind }: { kind: 'delivery' | 'delegation' }) {
  return (
    <Badge
      variant="outline"
      className={`h-4 shrink-0 whitespace-nowrap px-1 py-0 text-2xs ${
        kind === 'delegation'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:border-amber-400/30'
          : 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300 dark:bg-blue-500/20 dark:border-blue-400/30'
      }`}
    >
      {kind === 'delegation' ? 'Delegate' : 'Delivery'}
    </Badge>
  )
}

const REPO_RUNTIME_PROVIDER_LABELS: Record<'codex' | 'claude-code', string> = {
  codex: 'Codex',
  'claude-code': 'Claude',
}

export function ManagerRepoRuntimeMeta({
  runtime,
  className = '',
}: {
  runtime: RepositoryRuntimeInfo
  className?: string
}) {
  const cliProviders = runtime.availableProviders.filter(
    (provider): provider is 'codex' | 'claude-code' => provider === 'codex' || provider === 'claude-code',
  )

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-1 text-2xs text-muted-foreground ${className}`.trim()}>
      <span className="min-w-0 max-w-full truncate">{runtime.locationLabel}</span>
      {runtime.loading ? (
        <SpinnerIcon className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : !runtime.online && (
        <Badge
          variant="outline"
          className="h-4 border-amber-500/30 bg-amber-500/10 px-1 py-0 text-2xs text-amber-700 dark:text-amber-300"
        >
          Offline
        </Badge>
      )}
      {cliProviders.map((provider) => (
        <Badge key={provider} variant="outline" className="h-4 px-1 py-0 text-2xs">
          {REPO_RUNTIME_PROVIDER_LABELS[provider]}
        </Badge>
      ))}
    </div>
  )
}

interface ManagerRepoPickerProps {
  repositories: AutomationRepository[]
  selectedRepo: AutomationRepository | null
  disabled?: boolean
  compact?: boolean
  className?: string
  getRuntimeInfo: (repo: AutomationRepository) => RepositoryRuntimeInfo
  onSelect: (repoId: string) => void
  onAddRepository: () => void
}

export function ManagerRepoPicker({
  repositories,
  selectedRepo,
  disabled = false,
  compact = false,
  className = '',
  getRuntimeInfo,
  onSelect,
  onAddRepository,
}: ManagerRepoPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 min-w-0 max-w-full gap-1.5 rounded-lg px-2 text-xs ${className}`.trim()}
          disabled={disabled}
          title={selectedRepo ? selectedRepo.name : 'Select repository'}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className={`min-w-0 truncate ${compact ? 'max-w-[8rem]' : 'max-w-[140px]'}`}>
            {selectedRepo ? selectedRepo.name : 'Select repository'}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel>Repository</DropdownMenuLabel>
        {repositories.map((repo) => {
          const runtime = getRuntimeInfo(repo)
          return (
            <DropdownMenuItem key={repo.id} onSelect={() => onSelect(repo.id)} className="min-w-0">
              <div className="flex min-w-0 w-full items-start gap-2">
                <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate">{repo.name}</span>
                    <span className="shrink-0 text-2xs text-muted-foreground">{repo.defaultBranch}</span>
                    {repo.source === 'shared' && (
                      <Badge variant="outline" className="h-4 px-1 py-0 text-2xs">
                        Shared
                      </Badge>
                    )}
                  </div>
                  <ManagerRepoRuntimeMeta runtime={runtime} className="mt-1" />
                </div>
              </div>
            </DropdownMenuItem>
          )
        })}
        {repositories.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">No repositories yet.</div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAddRepository}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add repository
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface ManagerRepositoryPanelProps {
  repositories: AutomationRepository[]
  selectedRepoId: string | null
  isMobile?: boolean
  getRuntimeInfo: (repo: AutomationRepository) => RepositoryRuntimeInfo
  onSelect: (repoId: string) => void
  onAddRepository: () => void
  onRemoveRepository: (repoId: string) => void
  onOpenStrategy: (repo: AutomationRepository) => void
  onOpenPlan: (repo: AutomationRepository) => void
}

export function ManagerRepositoryPanel({
  repositories,
  selectedRepoId,
  isMobile = false,
  getRuntimeInfo,
  onSelect,
  onAddRepository,
  onRemoveRepository,
  onOpenStrategy,
  onOpenPlan,
}: ManagerRepositoryPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[35px] items-center justify-between border-b px-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Repositories
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 px-2 text-xs"
          onClick={onAddRepository}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      <div className={isMobile ? 'flex-1 overflow-y-auto p-1.5 space-y-0.5' : 'flex-1 overflow-y-auto p-2 space-y-1'}>
        {repositories.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No repositories yet.
            <br />
            <button type="button" onClick={onAddRepository} className="mt-1 inline-block underline underline-offset-2 hover:text-foreground">
              Add one
            </button>
          </p>
        ) : (
          repositories.map((repo) => {
            const runtime = getRuntimeInfo(repo)
            return (
              <div
                role="button"
                tabIndex={0}
                key={repo.id}
                className={`flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors ${
                  isMobile ? 'cursor-pointer rounded-md text-sm' : 'rounded-lg text-xs'
                } ${
                  selectedRepoId === repo.id
                    ? isMobile
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-primary/10 text-primary'
                    : isMobile
                      ? 'hover:bg-muted/50'
                      : 'hover:bg-muted'
                }`}
                onClick={() => onSelect(repo.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(repo.id)
                  }
                }}
              >
                <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className={isMobile ? 'truncate text-xs font-medium' : 'truncate font-medium'}>{repo.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <span className="text-2xs text-muted-foreground">{repo.defaultBranch}</span>
                    {repo.source === 'shared' && (
                      <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 text-2xs">
                        Shared
                      </Badge>
                    )}
                  </div>
                  <ManagerRepoRuntimeMeta runtime={runtime} className="mt-1" />
                </div>
                <div className="mt-0.5 flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    title="Strategy"
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-primary"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenStrategy(repo)
                    }}
                  >
                    <ScrollText className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    title="Plans"
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-primary"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenPlan(repo)
                    }}
                  >
                    <ListChecks className="h-3 w-3" />
                  </button>
                  {repo.source === 'local' && (
                    <button
                      type="button"
                      title="Remove"
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRemoveRepository(repo.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function formatThreadDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min < 60) return `${min}m ${sec.toString().padStart(2, '0')}s`
  const hr = Math.floor(min / 60)
  const rm = min % 60
  return `${hr}h ${rm.toString().padStart(2, '0')}m`
}

function ThreadDuration({ createdAt, completedAt, status }: { createdAt: string; completedAt: string | null; status: string }) {
  const [now, setNow] = useState(Date.now)
  const isRunning = status === 'running' || status === 'queued'

  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isRunning])

  const start = new Date(createdAt).getTime()
  const end = isRunning
    ? now
    : completedAt
      ? new Date(completedAt).getTime()
      : now
  const ms = Math.max(0, end - start)

  return (
    <span className="shrink-0 tabular-nums" title={isRunning ? 'Elapsed time' : 'Total duration'}>
      {isRunning && <Timer className="inline h-3 w-3 mr-0.5 -mt-px" />}
      {formatThreadDuration(ms)}
    </span>
  )
}

interface ManagerThreadListItemProps {
  thread: AgentThread
  repo: AutomationRepository | null
  repoName: string
  prState: ThreadPrState
  ghAvailable: boolean
  onOpen: () => void
  onStop: () => void
  onDelete: () => Promise<void>
}

export function ManagerThreadListItem({
  thread,
  repo,
  repoName,
  prState,
  ghAvailable,
  onOpen,
  onStop,
  onDelete,
}: ManagerThreadListItemProps) {
  const isMobile = useIsMobile()
  const confirm = useConfirmDialog()
  const [deleting, setDeleting] = useState(false)
  const showThreadActions = shouldRenderThreadActions({
    hasRepository: repo != null,
    threadKind: thread.kind,
    threadStatus: thread.status,
    threadBranch: thread.branch,
    prUrl: thread.prUrl,
    prState,
  })
  const stopThreadVisible = canStopThread(thread)
  const showKindBadge = thread.kind === 'delegation' || !isMobile
  const handleDeleteClick = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Delete thread?',
      description: (
        <div className="space-y-2">
          <p>
            Are you sure you want to delete this thread?
          </p>
          <p className="text-xs text-muted-foreground">
            This removes the thread and its local worktree cleanup will run in the background.
          </p>
        </div>
      ),
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    })
    if (!confirmed) return

    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }, [confirm, onDelete])

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-b px-2.5 py-2.5 text-sm transition-colors hover:bg-muted/40 sm:gap-5 sm:px-3 sm:py-3.5 ${
        thread.kind === 'delegation' ? 'bg-amber-500/[0.04]' : ''
      }`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex w-full min-w-0 items-center gap-1.5">
          <ManagerStatusDot status={thread.status} kind={thread.kind} />
          <div className="flex-1 truncate text-sm font-medium sm:text-sm">
            {isTitlePending(thread.title) ? (
              <TitleSkeleton className="h-3.5 w-28" />
            ) : (
              <span>{thread.title.replace(/^\[.*?\]\s*/, '')}</span>
            )}
          </div>
          <ThreadDuration createdAt={thread.createdAt} completedAt={thread.completedAt} status={thread.status} />
        </div>
        <div className="flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden pl-[calc(0.75rem+6px)] text-xs leading-tight text-muted-foreground sm:gap-x-1 sm:text-xs">
          <span className="min-w-0 truncate">{repoName}</span>
          {showKindBadge && <ThreadKindBadge kind={thread.kind} />}
          {thread.kind === 'delegation' && (
            <span className="hidden shrink-0 text-amber-700 dark:text-amber-300 sm:inline">Helper thread</span>
          )}
          {thread.branch && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="hidden max-w-full truncate font-mono sm:inline">{thread.branch}</span>
            </>
          )}
          {thread.providerId && thread.providerId !== 'jait' && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="hidden shrink-0 whitespace-nowrap sm:inline">{thread.providerId}</span>
            </>
          )}
          {thread.executionNodeName && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="hidden max-w-full items-center gap-1 truncate text-blue-500 dark:text-blue-400 sm:inline-flex">
                <Monitor className="inline h-3 w-3 mr-0.5 -mt-px" />
                {thread.executionNodeName}
              </span>
            </>
          )}
          {prState && (
            <>
              <span className="hidden sm:inline">·</span>
              <ThreadPrBadge prState={prState} />
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1">
        {showThreadActions && repo && (
          <div
            className="shrink-0"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <ThreadActions
              threadId={thread.id}
              cwd={thread.workingDirectory ?? repo.localPath}
              branch={thread.branch}
              baseBranch={thread.prBaseBranch ?? repo.defaultBranch}
              threadTitle={thread.title}
              threadStatus={thread.status}
              threadKind={thread.kind}
              prUrl={thread.prUrl}
              prState={prState}
              ghAvailable={ghAvailable}
              showStatusBadge={false}
              changeFiles={thread.changeFiles}
              changeInsertions={thread.changeInsertions}
              changeDeletions={thread.changeDeletions}
            />
          </div>
        )}
        {stopThreadVisible && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-lg sm:h-7 sm:w-7"
            onClick={(event) => {
              event.stopPropagation()
              onStop()
            }}
            title={thread.kind === 'delegation' ? 'End helper thread' : 'Stop thread'}
          >
            <Square className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg opacity-100 transition-opacity"
          disabled={deleting}
          onClick={(event) => {
            event.stopPropagation()
            void handleDeleteClick()
          }}
          title="Delete thread"
        >
          {deleting ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

interface ManagerActiveThreadsMenuProps {
  threads: AgentThread[]
  getRepositoryForThread: (thread: Pick<AgentThread, 'title' | 'workingDirectory'>) => AutomationRepository | null
  threadPrStates: Record<string, Exclude<ThreadPrState, undefined>>
  ghAvailable: boolean
  onOpenThread: (threadId: string) => void
  onStopThread: (threadId: string) => void
}

export function ManagerActiveThreadsMenu({
  threads,
  getRepositoryForThread,
  threadPrStates,
  ghAvailable,
  onOpenThread,
  onStopThread,
}: ManagerActiveThreadsMenuProps) {
  const [open, setOpen] = useState(false)

  if (threads.length === 0) return null

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="mr-1 h-8 gap-1.5 rounded-lg px-2 text-xs sm:mr-0"
          title={`${threads.length} active ${threads.length === 1 ? 'thread' : 'threads'}`}
        >
          <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-blue-500" />
          <span className="hidden sm:inline">Active</span>
          <Badge variant="secondary" className="h-4 rounded-md px-1 text-2xs">
            {threads.length}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(34rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-blue-500" />
            <span className="text-sm font-medium">
              {threads.length} active {threads.length === 1 ? 'thread' : 'threads'}
            </span>
          </div>
        </div>
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
          {threads.map((thread) => {
            const repo = getRepositoryForThread(thread)
            const repoName = repo?.name ?? inferThreadRepositoryName(thread) ?? 'Unknown repo'
            const prState = getVisibleThreadPrState(
              thread,
              thread.id in threadPrStates ? threadPrStates[thread.id] : undefined,
            )

            return (
              <div
                key={thread.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-3 py-3 last:border-b-0"
              >
                <button
                  type="button"
                  className="min-w-0 text-left transition-colors hover:text-foreground"
                  onClick={() => {
                    setOpen(false)
                    onOpenThread(thread.id)
                  }}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <ManagerStatusDot status={thread.status} kind={thread.kind} />
                    <span className="truncate text-sm font-medium">
                      {isTitlePending(thread.title)
                        ? 'Generating title...'
                        : thread.title.replace(/^\[.*?\]\s*/, '')}
                    </span>
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span className="truncate">{repoName}</span>
                    {thread.branch && (
                      <Badge variant="outline" className="h-4 px-1 py-0 font-mono text-2xs">
                        {thread.branch}
                      </Badge>
                    )}
                    {thread.providerId && thread.providerId !== 'jait' && (
                      <Badge variant="outline" className="h-4 px-1 py-0 text-2xs">
                        {thread.providerId}
                      </Badge>
                    )}
                    {thread.executionNodeName && (
                      <Badge variant="outline" className="h-4 px-1 py-0 text-2xs text-blue-500 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                        <Monitor className="inline h-2.5 w-2.5 mr-0.5" />
                        {thread.executionNodeName}
                      </Badge>
                    )}
                    <ThreadPrBadge prState={prState} />
                  </div>
                </button>
                <div className="flex items-center gap-1 self-start">
                  {repo && (
                    <div
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <ThreadActions
                        threadId={thread.id}
                        cwd={thread.workingDirectory ?? repo.localPath}
                        branch={thread.branch}
                        baseBranch={thread.prBaseBranch ?? repo.defaultBranch}
                        threadTitle={thread.title}
                        threadStatus={thread.status}
                        threadKind={thread.kind}
                        prUrl={thread.prUrl}
                        prState={prState}
                        ghAvailable={ghAvailable}
                        showStatusBadge={false}
                        changeFiles={thread.changeFiles}
                        changeInsertions={thread.changeInsertions}
                        changeDeletions={thread.changeDeletions}
                      />
                    </div>
                  )}
                  {canStopThread(thread) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg"
                      onClick={(event) => {
                        event.stopPropagation()
                        void Promise.resolve(onStopThread(thread.id))
                      }}
                      title="Stop thread"
                    >
                      <Square className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
