import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  ArrowLeft,
  ArrowUpCircle,
  AlertTriangle,
  Calendar,
  Bug,
  Cast,
  ChevronDown,
  Code,
  Eye,
  FolderTree,
  FolderOpen,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Square,
  Trash2,
  Terminal as TerminalIcon,
  Wifi,
  X,
  Loader2 as SpinnerIcon,
  Minus,
  Pause,
  CheckCircle2,
  XCircle,
  Circle,
  AlertCircle,
  Server,
  ScrollText,
  ListChecks,
  type LucideIcon,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Conversation, Message, PromptInput, SessionSelector, Suggestions, TodoList, MessageQueue, FilesChanged } from '@/components/chat'
import type { ReferencedFile, PromptInputHandle, ChangedFile } from '@/components/chat'
import { PlanReview } from '@/components/chat/plan-review'
import { ContextIndicator } from '@/components/chat/context-indicator'
import { ConsentQueue } from '@/components/consent'
import { SSEDebugPanel } from '@/components/debug/sse-debug-panel'
import { JobsPage } from '@/components/jobs'
import { ThreadActions } from '@/components/automation/ThreadActions'
import { StrategyModal } from '@/components/automation/StrategyModal'
import { PlanModal } from '@/components/automation/PlanModal'
import { activitiesToMessages } from '@/lib/activity-to-messages'
import { SettingsPage, type UpdateInfo } from '@/components/settings/SettingsPage'
import { NetworkPanel } from '@/components/network'
import { ScreenSharePanel } from '@/components/screen-share'
import { useScreenShare } from '@/hooks/useScreenShare'
import { TerminalTabs, TerminalView, useTerminals } from '@/components/terminal'
import { WorkspacePanel, workspaceLanguageForPath, DiffView, type WorkspaceFile, type WorkspacePanelHandle } from '@/components/workspace'
import { FolderPickerDialog } from '@/components/workspace/folder-picker-dialog'
import { createActivityEvent, type ActivityEvent } from '@jait/ui-shared'
import { ModelIcon, getModelDisplayName } from '@/components/icons/model-icons'
import { useAuth, type ThemeMode, type SttProvider, type ChatProvider } from '@/hooks/useAuth'
import { useChat, type ChatMode } from '@/hooks/useChat'
import { useModelInfo } from '@/hooks/useModelInfo'
import { useSessions } from '@/hooks/useSessions'
import { useUICommands } from '@/hooks/useUICommands'
import { useSessionState } from '@/hooks/useSessionState'
import { useAutomation } from '@/hooks/useAutomation'
import type { ViewMode } from '@/components/chat/view-mode-selector'
import type { WorkspaceOpenData, TerminalFocusData, FsChangesPayload } from '@jait/shared'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/useIsMobile'

import { Badge } from '@/components/ui/badge'
import { getApiUrl, getStoredGatewayUrl, setStoredGatewayUrl, isGatewayConfigured } from '@/lib/gateway-url'
import { inferThreadRepositoryName, type AutomationRepository, type RepositoryRuntimeInfo } from '@/lib/automation-repositories'
import { agentsApi, type AgentThread, type AutomationPlan } from '@/lib/agents-api'
import { gitApi } from '@/lib/git-api'

const API_URL = getApiUrl()

type AppView = 'chat' | 'jobs' | 'network' | 'settings'

const suggestions = [
  'What can you help me with?',
  'Explain quantum computing',
  'Write a Python script',
  'What time is it?',
]

function applyTheme(mode: ThemeMode) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = mode === 'dark' || (mode === 'system' && systemDark)
  document.documentElement.classList.toggle('dark', dark)
}

const TITLE_PLACEHOLDER_SUFFIX = 'Generating title\u2026'
function isTitlePending(title: string): boolean {
  return title.replace(/^\[.*?\]\s*/, '').trim() === TITLE_PLACEHOLDER_SUFFIX
}

function TitleSkeleton({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-block rounded bg-muted animate-pulse ${className}`}>
      <span className="invisible">Generating title</span>
    </span>
  )
}

function ManagerStatusDot({ status }: { status: string }) {
  const map: Record<string, { icon: typeof Circle; color: string }> = {
    running: { icon: SpinnerIcon, color: 'text-blue-500 animate-spin' },
    paused: { icon: Pause, color: 'text-yellow-500' },
    interrupted: { icon: Pause, color: 'text-yellow-500' },
    done: { icon: CheckCircle2, color: 'text-green-500' },
    completed: { icon: CheckCircle2, color: 'text-green-500' },
    error: { icon: XCircle, color: 'text-red-500' },
  }
  const { icon: Icon, color } = map[status] ?? { icon: AlertCircle, color: 'text-muted-foreground' }
  return <Icon className={`h-3 w-3 shrink-0 ${color}`} />
}

function ThreadPrBadge({ prState }: { prState: 'open' | 'closed' | 'merged' | null | undefined }) {
  if (!prState) return null
  const label =
    prState === 'open'
      ? 'PR created'
      : prState === 'merged'
        ? 'PR merged'
        : 'PR closed'
  const className =
    prState === 'open'
      ? 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300 dark:bg-blue-500/20 dark:border-blue-400/30'
      : prState === 'merged'
        ? 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-300 dark:bg-purple-500/20 dark:border-purple-400/30'
        : 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300 dark:bg-red-500/20 dark:border-red-400/30'
  return (
    <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${className}`}>
      {label}
    </Badge>
  )
}

const REPO_RUNTIME_PROVIDER_LABELS: Record<'codex' | 'claude-code', string> = {
  codex: 'Codex',
  'claude-code': 'Claude',
}

function ManagerRepoRuntimeMeta({
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
    <div className={`flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground ${className}`.trim()}>
      <span>{runtime.locationLabel}</span>
      {!runtime.online && (
        <Badge
          variant="outline"
          className="h-4 border-amber-500/30 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-700 dark:text-amber-300"
        >
          Offline
        </Badge>
      )}
      {cliProviders.map((provider) => (
        <Badge key={provider} variant="outline" className="h-4 px-1 py-0 text-[9px]">
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
  getRuntimeInfo: (repo: AutomationRepository) => RepositoryRuntimeInfo
  onSelect: (repoId: string) => void
  onAddRepository: () => void
}

function ManagerRepoPicker({
  repositories,
  selectedRepo,
  disabled = false,
  getRuntimeInfo,
  onSelect,
  onAddRepository,
}: ManagerRepoPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg px-2 text-xs" disabled={disabled}>
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-[140px] truncate">
            {selectedRepo ? selectedRepo.name : 'Select repository'}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel>Repository</DropdownMenuLabel>
        {repositories.map((repo) => {
          const runtime = getRuntimeInfo(repo)
          return (
            <DropdownMenuItem key={repo.id} onSelect={() => onSelect(repo.id)}>
              <div className="flex min-w-0 items-start gap-2">
                <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{repo.name}</span>
                    <span className="text-[10px] text-muted-foreground">{repo.defaultBranch}</span>
                    {repo.source === 'shared' && (
                      <Badge variant="outline" className="h-4 px-1 py-0 text-[9px]">
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

function summarizeManagerPreview(value: string | null | undefined, fallback: string, maxLength = 180): string {
  const normalized = value
    ?.replace(/^#{1,6}\s+/gm, '')
    .replace(/`+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return fallback
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

function ManagerRepoPageCard({
  icon: Icon,
  title,
  meta,
  description,
  actionLabel,
  loading = false,
  disabled = false,
  onOpen,
}: {
  icon: LucideIcon
  title: string
  meta?: string | null
  description: string
  actionLabel: string
  loading?: boolean
  disabled?: boolean
  onOpen: () => void
}) {
  return (
    <div className="rounded-xl border bg-card/70 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="rounded-md border bg-muted/60 p-1.5 text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">{title}</div>
              {meta && (
                <div className="text-[11px] text-muted-foreground">{meta}</div>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {loading ? 'Loading…' : description}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={disabled}
          onClick={onOpen}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
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

function ManagerRepositoryPanel({
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
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Repositories
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 px-2 text-[11px]"
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
                    <span className="text-[10px] text-muted-foreground">{repo.defaultBranch}</span>
                    {repo.source === 'shared' && (
                      <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 text-[9px]">
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

interface ManagerThreadListItemProps {
  thread: AgentThread
  repo: AutomationRepository | null
  repoName: string
  prState: 'open' | 'closed' | 'merged' | null | undefined
  ghAvailable: boolean
  onOpen: () => void
  onStop: () => void
  onDelete: () => void
}

function ManagerThreadListItem({
  thread,
  repo,
  repoName,
  prState,
  ghAvailable,
  onOpen,
  onStop,
  onDelete,
}: ManagerThreadListItemProps) {
  const showThreadActions = repo != null && (thread.status === 'completed' || Boolean(thread.prUrl))

  return (
    <div
      role="button"
      tabIndex={0}
      className="group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b px-3 py-3.5 text-sm transition-colors hover:bg-muted/40"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex w-full min-w-0 items-center gap-1.5">
          <ManagerStatusDot status={thread.status} />
          <div className="flex-1 truncate font-medium">
            {isTitlePending(thread.title) ? (
              <TitleSkeleton className="h-3.5 w-28" />
            ) : (
              <span>{thread.title.replace(/^\[.*?\]\s*/, '')}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 text-xs text-muted-foreground pl-[calc(0.75rem+6px)]">
          <span className="truncate">{repoName}</span>
          {thread.branch && (
            <>
              <span>·</span>
              <span className="truncate font-mono">{thread.branch}</span>
            </>
          )}
          {prState && (
            <>
              <span>·</span>
              <ThreadPrBadge prState={prState} />
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
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
              baseBranch={repo.defaultBranch}
              threadTitle={thread.title}
              threadStatus={thread.status}
              prUrl={thread.prUrl}
              prState={prState}
              ghAvailable={ghAvailable}
              showStatusBadge={false}
            />
          </div>
        )}
        {thread.status === 'running' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={(event) => {
              event.stopPropagation()
              onStop()
            }}
          >
            <Square className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-lg opacity-100 transition-opacity"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

interface ManagerActiveThreadsMenuProps {
  threads: AgentThread[]
  getRepositoryForThread: (thread: Pick<AgentThread, 'title' | 'workingDirectory'>) => AutomationRepository | null
  threadPrStates: Record<string, 'open' | 'closed' | 'merged' | null>
  ghAvailable: boolean
  onOpenThread: (threadId: string) => void
  onStopThread: (threadId: string) => void
}

function ManagerActiveThreadsMenu({
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
          className="h-8 gap-1.5 rounded-lg px-2 text-xs"
          title={`${threads.length} active ${threads.length === 1 ? 'thread' : 'threads'}`}
        >
          <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-blue-500" />
          <span className="hidden sm:inline">Active</span>
          <Badge variant="secondary" className="h-4 rounded-md px-1 text-[10px]">
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
                    <ManagerStatusDot status={thread.status} />
                    <span className="truncate text-sm font-medium">
                      {isTitlePending(thread.title)
                        ? 'Generating title...'
                        : thread.title.replace(/^\[.*?\]\s*/, '')}
                    </span>
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="truncate">{repoName}</span>
                    {thread.branch && (
                      <Badge variant="outline" className="h-4 px-1 py-0 font-mono text-[9px]">
                        {thread.branch}
                      </Badge>
                    )}
                    <ThreadPrBadge prState={thread.id in threadPrStates ? threadPrStates[thread.id] : thread.prState} />
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
                        baseBranch={repo.defaultBranch}
                        threadTitle={thread.title}
                        threadStatus={thread.status}
                        prUrl={thread.prUrl}
                        prState={(thread.id in threadPrStates ? threadPrStates[thread.id] : thread.prState) as 'open' | 'closed' | 'merged' | null | undefined}
                        ghAvailable={ghAvailable}
                        showStatusBadge={false}
                      />
                    </div>
                  )}
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
                </div>
              </div>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function App() {
  const [inputValue, setInputValue] = useState('')
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<AppView>('chat')
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [showSidebar, setShowSidebar] = useState(() => localStorage.getItem('showSessionsSidebar') === 'true')
  const [showTerminal, setShowTerminal] = useState(false)
  const [showManagerRepos, setShowManagerRepos] = useState(false)
  const [strategyRepo, setStrategyRepo] = useState<AutomationRepository | null>(null)
  const [planRepo, setPlanRepo] = useState<AutomationRepository | null>(null)
  const [managerRepoPreviewVersion, setManagerRepoPreviewVersion] = useState(0)
  const [managerRepoStrategyPreview, setManagerRepoStrategyPreview] = useState<string | null>(null)
  const [managerRepoPlansPreview, setManagerRepoPlansPreview] = useState<AutomationPlan[]>([])
  const [managerRepoPreviewLoading, setManagerRepoPreviewLoading] = useState(false)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [showScreenShare, setShowScreenShare] = useState(false)
  const [showWorkspaceTree, setShowWorkspaceTree] = useState(() => localStorage.getItem('showWorkspaceTree') !== 'false')
  const [showWorkspaceEditor, setShowWorkspaceEditor] = useState(() => localStorage.getItem('showWorkspaceEditor') !== 'false')
  const [showCloseWorkspaceConfirm, setShowCloseWorkspaceConfirm] = useState(false)
  const closeConfirmRef = useRef<HTMLDivElement>(null)
  const [showDebugPanel, setShowDebugPanel] = useState(() => localStorage.getItem('showDebugPanel') === 'true')
  const [terminalHeight, setTerminalHeight] = useState(280)
  const [floatingSSPos, setFloatingSSPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 })
  const [floatingSSSize, setFloatingSSSize] = useState<{ w: number; h: number }>({ w: 420, h: 320 })
  const floatingDragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null)
  const floatingResizeRef = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null)
  const [approveAllInSession, setApproveAllInSession] = useState(false)
  const [chatMode, setChatMode] = useState<ChatMode>(() => (localStorage.getItem('chatMode') as ChatMode) || 'agent')
  const [chatProvider, setChatProvider] = useState<import('@/lib/agents-api').ProviderId>(
    () => (localStorage.getItem('chatProvider') as import('@/lib/agents-api').ProviderId) || 'jait'
  )
  const [cliModel, setCliModel] = useState<string | null>(
    () => localStorage.getItem('cliModel') || null
  )
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('viewMode') as ViewMode) || 'developer')
  const [managerAnimPhase, setManagerAnimPhase] = useState<'idle' | 'center' | 'top'>('idle')
  const [developerAnimPhase, setDeveloperAnimPhase] = useState<'idle' | 'animating'>('idle')
  const prevViewModeRef = useRef<ViewMode>(viewMode)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('')
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [gatewayUrlInput, setGatewayUrlInput] = useState(() => getStoredGatewayUrl() ?? '')
  const isStandaloneApp = !!(window as any).jaitDesktop || !!(window as any).Capacitor
  const isElectron = !!(window as any).jaitDesktop
  const isCapacitor = !!(window as any).Capacitor
  const appPlatform: 'web' | 'electron' | 'capacitor' = isElectron ? 'electron' : isCapacitor ? 'capacitor' : 'web'

  // ── Update state ───────────────────────────────────────────────
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateApplying, setUpdateApplying] = useState(false)
  const pendingGatewayRestartVersionRef = useRef<string | null>(null)
  const gatewayRestartSawDisconnectRef = useRef(false)
  const automationRefreshRef = useRef<() => Promise<void>>(async () => {})
  const [desktopPlatform, setDesktopPlatform] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [gatewayStep, setGatewayStep] = useState<'url' | 'auth'>(() =>
    isStandaloneApp && !isGatewayConfigured() ? 'url' : 'auth'
  )
  const [gatewayChecking, setGatewayChecking] = useState(false)
  const [gatewayError, setGatewayError] = useState<string | null>(null)
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const [activeWorkspaceFileId, setActiveWorkspaceFileId] = useState<string | null>(null)
  const [availableFilesForMention, setAvailableFilesForMention] = useState<{ path: string; name: string }[]>([])
  const [activeDiff, setActiveDiff] = useState<{
    filePath: string
    originalContent: string
    modifiedContent: string
    language: string
  } | null>(null)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const isDragging = useRef(false)
  const workspaceRef = useRef<WorkspacePanelHandle>(null)
  const promptInputRef = useRef<PromptInputHandle>(null)
  const isMobile = useIsMobile()

  // Native filesystem watcher — incremented whenever the server pushes fs.changes
  const [fsWatcherVersion, setFsWatcherVersion] = useState(0)
  const showDesktopWorkspace = !isMobile && showWorkspace
  const showMobileWorkspace = isMobile && showWorkspace

  const getDefaultFloatingPos = useCallback(() => ({
    x: window.innerWidth - floatingSSSize.w - 16,
    y: window.innerHeight - floatingSSSize.h - 16,
  }), [floatingSSSize])

  const onFloatingDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const pos = floatingSSPos.x < 0 ? getDefaultFloatingPos() : floatingSSPos
    floatingDragRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y }
    const onMove = (ev: MouseEvent) => {
      if (!floatingDragRef.current) return
      setFloatingSSPos({
        x: Math.max(0, Math.min(window.innerWidth - 100, floatingDragRef.current.posX + ev.clientX - floatingDragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 40, floatingDragRef.current.posY + ev.clientY - floatingDragRef.current.startY)),
      })
    }
    const onUp = () => {
      floatingDragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'move'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [floatingSSPos, getDefaultFloatingPos])

  const onFloatingResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    floatingResizeRef.current = { startX: e.clientX, startY: e.clientY, w: floatingSSSize.w, h: floatingSSSize.h }
    const onMove = (ev: MouseEvent) => {
      if (!floatingResizeRef.current) return
      setFloatingSSSize({
        w: Math.max(280, Math.min(window.innerWidth - 40, floatingResizeRef.current.w + ev.clientX - floatingResizeRef.current.startX)),
        h: Math.max(200, Math.min(window.innerHeight - 40, floatingResizeRef.current.h + ev.clientY - floatingResizeRef.current.startY)),
      })
    }
    const onUp = () => {
      floatingResizeRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'nwse-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [floatingSSSize])

  const {
    user,
    token,
    settings,
    isLoading: authLoading,
    isAuthenticated,
    login,
    register,
    logout,
    bindSession,
    updateSettings,
    clearSessionArchive,
  } = useAuth()

  // ── Update check/apply handlers ────────────────────────────────
  const handleCheckUpdate = useCallback(async () => {
    if (!token) return
    setUpdateChecking(true)
    try {
      const res = await fetch(`${API_URL}/api/update/check`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setUpdateInfo(await res.json() as UpdateInfo)
      }
    } catch { /* ignore */ }
    setUpdateChecking(false)
  }, [token])

  const handleApplyUpdate = useCallback(async () => {
    if (!token || !updateInfo?.hasUpdate) return
    setUpdateApplying(true)
    try {
      const res = await fetch(`${API_URL}/api/update/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: updateInfo.latestVersion }),
      })
      if (res.ok) {
        pendingGatewayRestartVersionRef.current = updateInfo.latestVersion
        gatewayRestartSawDisconnectRef.current = false
        toast.success(`Updated to v${updateInfo.latestVersion}. Gateway is restarting...`)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error((data as any).error ?? 'Update failed')
      }
    } catch { toast.error('Update request failed') }
    setUpdateApplying(false)
  }, [token, updateInfo])

  const handleUiConnectionStateChange = useCallback(({ connected, reconnected }: { connected: boolean; reconnected: boolean }) => {
    if (!connected) {
      if (pendingGatewayRestartVersionRef.current) {
        gatewayRestartSawDisconnectRef.current = true
      }
      return
    }

    // Re-fetch providers so FsNode registration is picked up (fixes "Offline" on desktop)
    void automationRefreshRef.current()

    if (reconnected && pendingGatewayRestartVersionRef.current && gatewayRestartSawDisconnectRef.current) {
      const version = pendingGatewayRestartVersionRef.current
      pendingGatewayRestartVersionRef.current = null
      gatewayRestartSawDisconnectRef.current = false
      toast.success(`Gateway restarted on v${version}.`)
      void handleCheckUpdate()
    }
  }, [handleCheckUpdate])

  // Auto-check for updates on mount (once authenticated)
  useEffect(() => {
    if (token) void handleCheckUpdate()
  }, [token, handleCheckUpdate])

  const onLoginRequired = useCallback(() => setShowLoginDialog(true), [])

  const { sessions, activeSessionId, createSession, switchSession, archiveSession, fetchSessions } = useSessions(
    token,
    onLoginRequired,
  )
  const {
    messages,
    isLoading,
    isLoadingHistory,
    remainingPrompts,
    error,
    hitMaxRounds,
    pendingPlan,
    todoList,
    changedFiles,
    messageQueue,
    contextUsage,
    sendMessage,
    restartFromMessage,
    cancelRequest,
    clearMessages,
    continueChat,
    executePlan,
    rejectPlan,
    enqueueMessage,
    dequeueMessage,
    updateQueueItem,
    acceptFile,
    rejectFile,
    acceptAllFiles,
    rejectAllFiles,
    setTodoList,
    addChangedFile,
    setChangedFiles,
    setOnChangedFilesSync,
    refreshMessages,
  } = useChat(activeSessionId, token, onLoginRequired)
  const { terminals, activeTerminalId, setActiveTerminalId, createTerminal, killTerminal, refresh } = useTerminals()
  const { provider, model } = useModelInfo()

  // ── Screen share (always active so Electron auto-registers) ───────
  const screenShare = useScreenShare({ token })

  // ── Automation / Manager mode state ───────────────────────────────
  const automation = useAutomation()
  automationRefreshRef.current = automation.refresh

  // Convert thread activities → ChatMessage[] for Message rendering
  const automationMessages = useMemo(
    () => activitiesToMessages(automation.activities),
    [automation.activities],
  )
  const managerThreads = useMemo(
    () => [...automation.threads].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [automation.threads],
  )
  const selectedRepoRuntime = useMemo(
    () => (automation.selectedRepo ? automation.getRuntimeInfoForRepository(automation.selectedRepo) : null),
    [automation.getRuntimeInfoForRepository, automation.selectedRepo],
  )
  const selectedThreadRepo = useMemo(
    () => (automation.selectedThread ? automation.getRepositoryForThread(automation.selectedThread) : null),
    [automation.getRepositoryForThread, automation.selectedThread],
  )
  const selectedThreadRepoRuntime = useMemo(
    () => (selectedThreadRepo ? automation.getRuntimeInfoForRepository(selectedThreadRepo) : null),
    [automation.getRuntimeInfoForRepository, selectedThreadRepo],
  )
  const activeManagerThreads = useMemo(
    () => managerThreads.filter((thread) => thread.status === 'running'),
    [managerThreads],
  )
  const managerCanCreateThread = automation.selectedRepo != null
  const managerComposerDisabled = automation.creating || !managerCanCreateThread
  const managerPlaceholder = !automation.selectedRepo
    ? 'Select a repository to start a thread...'
    : 'Describe what you want to do...'
  const selectedManagerPlan = useMemo(
    () => [...managerRepoPlansPreview].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null,
    [managerRepoPlansPreview],
  )
  const selectedManagerPlanProposedCount = useMemo(
    () => selectedManagerPlan?.tasks.filter((task) => task.status === 'proposed').length ?? 0,
    [selectedManagerPlan],
  )
  const selectedManagerPlanReadyCount = useMemo(
    () => selectedManagerPlan?.tasks.filter((task) => task.status === 'approved').length ?? 0,
    [selectedManagerPlan],
  )

  useEffect(() => {
    const repo = automation.selectedRepo
    if (viewMode !== 'manager' || !repo || repo.source !== 'local') {
      setManagerRepoStrategyPreview(null)
      setManagerRepoPlansPreview([])
      setManagerRepoPreviewLoading(false)
      return
    }

    let cancelled = false
    setManagerRepoPreviewLoading(true)

    void Promise.allSettled([
      agentsApi.getRepoStrategy(repo.id),
      agentsApi.listPlans(repo.id),
    ]).then(([strategyResult, plansResult]) => {
      if (cancelled) return
      setManagerRepoStrategyPreview(strategyResult.status === 'fulfilled' ? strategyResult.value : null)
      setManagerRepoPlansPreview(plansResult.status === 'fulfilled' ? plansResult.value : [])
      setManagerRepoPreviewLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [automation.selectedRepo, managerRepoPreviewVersion, viewMode])

  // ── UI command channel (server ↔ frontend via WebSocket) ──────────
  const [activeWorkspace, setActiveWorkspace] = useState<{ surfaceId: string; workspaceRoot: string } | null>(null)

  // Detect Electron platform and listen for maximize/unmaximize (custom titlebar)
  useEffect(() => {
    const desktop = (window as any).jaitDesktop
    if (!desktop) return
    desktop.getInfo?.().then((info: any) => setDesktopPlatform(info.platform))
    desktop.windowIsMaximized?.().then((max: boolean) => setIsMaximized(max))
    const cleanup = desktop.onMaximizedChange?.((_: unknown, maximized: boolean) => setIsMaximized(maximized))
    return () => { cleanup?.() }
  }, [])

  // Track whether the WS has delivered an authoritative full-state push.
  // When true, the REST-based restore effects are skipped to avoid races.
  const wsFullStateReceivedRef = useRef(false)

  // Reset the flag on session switch so the next full-state push takes effect
  useEffect(() => {
    wsFullStateReceivedRef.current = false
  }, [activeSessionId])

  // ── Persistent session state for panels ───────────────────────────
  interface WorkspacePanelState { open: boolean; remotePath: string; surfaceId?: string }
  const [savedWorkspace, setSavedWorkspace] = useSessionState<WorkspacePanelState>(
    activeSessionId, 'workspace.panel', token,
  )
  const [savedScreenShare, setSavedScreenShare] = useSessionState<{ open: boolean }>(
    activeSessionId, 'screen-share.panel', token,
  )
  const [savedTerminal, setSavedTerminal] = useSessionState<{ open: boolean }>(
    activeSessionId, 'terminal.panel', token,
  )

  // ── Persistent session state for todos & changed files ────────────
  type SavedTodo = { id: number; title: string; status: 'not-started' | 'in-progress' | 'completed' }
  const [savedTodos] = useSessionState<SavedTodo[]>(activeSessionId, 'todo_list', token)
  type SavedChangedFile = { path: string; name: string }
  const [savedChangedFiles] = useSessionState<SavedChangedFile[]>(activeSessionId, 'changed_files', token)

  // Restore panel state from REST fallback (only if WS full-state hasn't arrived yet)
  useEffect(() => {
    if (wsFullStateReceivedRef.current) return // WS already delivered authoritative state
    if (!savedWorkspace) return
    if (activeWorkspace) return
    if (savedWorkspace.open && savedWorkspace.remotePath) {
      setActiveWorkspace({
        surfaceId: savedWorkspace.surfaceId ?? '',
        workspaceRoot: savedWorkspace.remotePath,
      })
    }
  }, [savedWorkspace]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (wsFullStateReceivedRef.current) return
    if (savedScreenShare?.open) setShowScreenShare(true)
  }, [savedScreenShare]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (wsFullStateReceivedRef.current) return
    if (savedTerminal?.open) setShowTerminal(true)
  }, [savedTerminal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore todos and changed files (REST fallback)
  useEffect(() => {
    if (wsFullStateReceivedRef.current) return
    if (savedTodos && savedTodos.length > 0) setTodoList(savedTodos)
  }, [savedTodos, setTodoList])

  useEffect(() => {
    if (wsFullStateReceivedRef.current) return
    if (savedChangedFiles && savedChangedFiles.length > 0) {
      for (const f of savedChangedFiles) addChangedFile(f.path, f.name)
    }
  }, [savedChangedFiles, addChangedFile])

  // ── Cross-client state sync handler ───────────────────────────────
  const handleStateSync = useCallback((key: string, value: unknown) => {
    switch (key) {
      case 'workspace.panel': {
        if (!value) {
          setShowWorkspace(false)
          setActiveWorkspace(null)
        } else {
          const v = value as WorkspacePanelState
          if (v.open) {
            setShowWorkspace(true)
            if (v.remotePath) setActiveWorkspace({ surfaceId: v.surfaceId ?? '', workspaceRoot: v.remotePath })
          } else {
            setShowWorkspace(false)
          }
        }
        break
      }
      case 'screen-share.panel':
        if (!value) setShowScreenShare(false)
        else {
          const v = value as { open?: boolean }
          setShowScreenShare(v.open !== false)
        }
        break
      case 'terminal.panel':
        if (!value) setShowTerminal(false)
        else {
          const v = value as { open?: boolean }
          setShowTerminal(v.open !== false)
        }
        break
      case 'todo_list':
        if (Array.isArray(value)) setTodoList(value)
        break
      case 'file_changed': {
        const fc = value as { path?: string; name?: string } | null
        if (fc?.path) addChangedFile(fc.path, fc.name ?? fc.path.split('/').pop() ?? fc.path)
        break
      }
      case 'changed_files': {
        // Full state sync of all changed files (including accept/reject decisions)
        if (Array.isArray(value)) {
          setChangedFiles(value as ChangedFile[])
        } else if (value === null) {
          setChangedFiles([])
        }
        break
      }
    }
  }, [setTodoList, addChangedFile, setChangedFiles])

  // ── Full state hydration from backend (authoritative, pushed on subscribe) ──
  const handleFullState = useCallback((state: Record<string, unknown>) => {
    wsFullStateReceivedRef.current = true

    // Workspace panel
    const wp = state['workspace.panel'] as WorkspacePanelState | null | undefined
    if (wp && wp.open) {
      setShowWorkspace(true)
      if (wp.remotePath) setActiveWorkspace({ surfaceId: wp.surfaceId ?? '', workspaceRoot: wp.remotePath })
    } else {
      setShowWorkspace(false)
      setActiveWorkspace(null)
    }

    // Screen share panel
    const sp = state['screen-share.panel'] as { open?: boolean } | null | undefined
    if (sp && sp.open !== false) {
      setShowScreenShare(true)
    } else {
      setShowScreenShare(false)
    }

    // Terminal panel
    const tp = state['terminal.panel'] as { open?: boolean } | null | undefined
    if (tp && tp.open !== false) {
      setShowTerminal(true)
    } else {
      setShowTerminal(false)
    }

    // Todo list
    const tl = state['todo_list']
    if (Array.isArray(tl) && tl.length > 0) {
      setTodoList(tl)
    }

    // Changed files
    const cf = state['changed_files']
    if (Array.isArray(cf)) {
      setChangedFiles(cf as ChangedFile[])
    }
  }, [setTodoList, setChangedFiles])

  const { sendUIState } = useUICommands({
    sessionId: activeSessionId,
    token,
    onStateSync: handleStateSync,
    onFullState: handleFullState,
    onMessageComplete: refreshMessages,
    onThreadEvent: automation.handleThreadEvent,
    onConnectionStateChange: handleUiConnectionStateChange,
    onFsChanges: useCallback((_payload: FsChangesPayload) => {
      setFsWatcherVersion(v => v + 1)
    }, []),
    listeners: {
      'workspace.open': useCallback((data: WorkspaceOpenData) => {
        setShowWorkspace(true)
        setActiveWorkspace({ surfaceId: data.surfaceId, workspaceRoot: data.workspaceRoot })
        const state = { open: true, remotePath: data.workspaceRoot, surfaceId: data.surfaceId }
        setSavedWorkspace(state)
      }, [setSavedWorkspace]),
      'workspace.close': useCallback(() => {
        setShowWorkspace(false)
        setActiveWorkspace(null)
        setSavedWorkspace(null)
      }, [setSavedWorkspace]),
      'terminal.focus': useCallback((data: TerminalFocusData) => {
        setCurrentView('chat')
        setShowTerminal(true)
        setSavedTerminal({ open: true })
        if (data.terminalId) {
          setActiveTerminalId(data.terminalId)
        }
        if (data.reason === 'interactive-input-required') {
          toast(data.message ?? 'Terminal wartet auf deine Eingabe (z. B. sudo Passwort).', {
            description: 'Klicke ins Terminal und gib die erforderliche Eingabe ein.',
            duration: 10000,
          })
        }
      }, [setSavedTerminal, setActiveTerminalId]),
      'screen-share.open': useCallback(() => {
        setShowScreenShare(true)
        setSavedScreenShare({ open: true })
      }, [setSavedScreenShare]),
      'screen-share.close': useCallback(() => {
        setShowScreenShare(false)
        setSavedScreenShare(null)
      }, [setSavedScreenShare]),
    },
  })

  // Register broadcast callback: when file decisions change, sync to other clients
  useEffect(() => {
    setOnChangedFilesSync((files: ChangedFile[]) => {
      sendUIState('changed_files', files, activeSessionId)
    })
    return () => setOnChangedFilesSync(null)
  }, [sendUIState, activeSessionId, setOnChangedFilesSync])

  useEffect(() => {
    localStorage.setItem('showSessionsSidebar', showSidebar ? 'true' : 'false')
  }, [showSidebar])

  useEffect(() => {
    localStorage.setItem('showDebugPanel', showDebugPanel ? 'true' : 'false')
  }, [showDebugPanel])

  useEffect(() => {
    localStorage.setItem('chatMode', chatMode)
  }, [chatMode])

  useEffect(() => {
    if (cliModel) localStorage.setItem('cliModel', cliModel)
    else localStorage.removeItem('cliModel')
  }, [cliModel])

  // Track whether the initial server sync has happened so we don't PATCH on mount
  const chatProviderInitialized = useRef(false)

  useEffect(() => {
    localStorage.setItem('chatProvider', chatProvider)
    // Only persist to server after the first render (user-initiated change)
    if (!chatProviderInitialized.current) {
      chatProviderInitialized.current = true
      return
    }
    if (token) {
      void updateSettings({ chat_provider: chatProvider as ChatProvider })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatProvider])

  useEffect(() => {
    localStorage.setItem('viewMode', viewMode)
  }, [viewMode])

  useEffect(() => {
    if (prevViewModeRef.current !== 'manager' && viewMode === 'manager') {
      setManagerAnimPhase('center')
      // Force browser to paint 'center' position before transitioning to 'top'.
      // Double-rAF + forced reflow ensures the initial transform is committed.
      requestAnimationFrame(() => {
        // Force a layout/reflow so the browser commits the 'center' style
        document.body.offsetHeight          // eslint-disable-line no-unused-expressions
        requestAnimationFrame(() => setManagerAnimPhase('top'))
      })
    } else if (prevViewModeRef.current === 'manager' && viewMode === 'developer') {
      setDeveloperAnimPhase('animating')
      setManagerAnimPhase('idle')
    } else {
      setManagerAnimPhase('idle')
    }
    prevViewModeRef.current = viewMode
  }, [viewMode])

  useEffect(() => {
    if (viewMode === 'manager' && showDebugPanel) {
      setShowDebugPanel(false)
    }
  }, [viewMode, showDebugPanel])

  // ── Synced panel controllers (local state + WS + DB) ──────────────
  // Use these instead of raw setShowX for user-initiated open/close.

  const openScreenSharePanel = useCallback(() => {
    setShowScreenShare(true)
    setSavedScreenShare({ open: true })
    sendUIState('screen-share.panel', { open: true }, activeSessionId)
  }, [setSavedScreenShare, sendUIState, activeSessionId])

  const closeScreenSharePanel = useCallback(() => {
    setShowScreenShare(false)
    setSavedScreenShare(null)
    sendUIState('screen-share.panel', null, activeSessionId)
  }, [setSavedScreenShare, sendUIState, activeSessionId])

  const openTerminalPanel = useCallback(() => {
    setShowTerminal(true)
    setSavedTerminal({ open: true })
    sendUIState('terminal.panel', { open: true }, activeSessionId)
  }, [setSavedTerminal, sendUIState, activeSessionId])

  const closeTerminalPanel = useCallback(() => {
    setShowTerminal(false)
    setSavedTerminal(null)
    sendUIState('terminal.panel', null, activeSessionId)
  }, [setSavedTerminal, sendUIState, activeSessionId])

  const closeWorkspacePanel = useCallback(() => {
    setShowWorkspace(false)
    setActiveWorkspace(null)
    setSavedWorkspace(null)
    sendUIState('workspace.panel', null, activeSessionId)
  }, [setSavedWorkspace, sendUIState, activeSessionId])

  const toggleWorkspaceTree = useCallback(() => {
    setShowWorkspaceTree(prev => {
      const next = !prev
      localStorage.setItem('showWorkspaceTree', String(next))
      return next
    })
  }, [])

  const toggleWorkspaceEditor = useCallback(() => {
    setShowWorkspaceEditor(prev => {
      const next = !prev
      localStorage.setItem('showWorkspaceEditor', String(next))
      return next
    })
  }, [])

  const showWorkspaceTreePanel = useCallback(() => {
    setShowWorkspaceTree(true)
    localStorage.setItem('showWorkspaceTree', 'true')
  }, [])

  const showWorkspaceEditorPanel = useCallback(() => {
    setShowWorkspaceEditor(true)
    localStorage.setItem('showWorkspaceEditor', 'true')
  }, [])

  // Helper: create a filesystem surface on the gateway so ALL clients
  // can browse the directory remotely (enables cross-device sync).
  const openRemoteWorkspaceOnGateway = useCallback(async (dirPath: string, nodeId?: string) => {
    const res = await fetch(`${API_URL}/api/workspace/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath, sessionId: activeSessionId, nodeId: nodeId || 'gateway' }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error((err as { message?: string }).message ?? 'Failed to open workspace')
    }
    // The gateway broadcasts `workspace.open` via WS and persists state.
    // All clients (including this one) will receive it and hydrate automatically.
  }, [activeSessionId])

  const handleOpenWorkspace = useCallback(async () => {
    if (showWorkspace) {
      // If there are unsaved changed files, ask for confirmation
      if (changedFiles.length > 0) {
        setShowCloseWorkspaceConfirm(true)
        return
      }
      closeWorkspacePanel()
      return
    }

    // If there's an existing remote workspace, just reopen the panel
    if (activeWorkspace) {
      setShowWorkspace(true)
      const state = { open: true, remotePath: activeWorkspace.workspaceRoot, surfaceId: activeWorkspace.surfaceId }
      setSavedWorkspace(state)
      sendUIState('workspace.panel', state, activeSessionId)
      return
    }

    // ── Open the folder picker dialog (browses the gateway's filesystem) ──
    setFolderPickerOpen(true)
  }, [showWorkspace, activeWorkspace, closeWorkspacePanel, setSavedWorkspace, sendUIState, activeSessionId, openRemoteWorkspaceOnGateway, changedFiles.length])

  // Auto-open workspace panel when a filesystem surface starts
  useEffect(() => {
    if (!activeWorkspace) return
    if (!showWorkspace) setShowWorkspace(true)
  }, [activeWorkspace]) // eslint-disable-line react-hooks/exhaustive-deps

  // Verify workspace surface is alive; re-create if stale (e.g. after gateway restart)
  useEffect(() => {
    if (!activeWorkspace?.surfaceId || !activeWorkspace.workspaceRoot || !activeSessionId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/workspace/list?path=${encodeURIComponent(activeWorkspace.workspaceRoot)}&surfaceId=${encodeURIComponent(activeWorkspace.surfaceId)}`)
        if (res.ok || cancelled) return // surface is alive
        // Surface is stale — re-create it
        const openRes = await fetch(`${API_URL}/api/workspace/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: activeWorkspace.workspaceRoot, sessionId: activeSessionId }),
        })
        if (!openRes.ok || cancelled) return
        const data = (await openRes.json()) as { surfaceId: string; workspaceRoot: string }
        if (cancelled) return
        setActiveWorkspace({ surfaceId: data.surfaceId, workspaceRoot: data.workspaceRoot })
        const state = { open: true, remotePath: data.workspaceRoot, surfaceId: data.surfaceId }
        setSavedWorkspace(state)
        sendUIState('workspace.panel', state, activeSessionId)
      } catch { /* network error — ignore, panel will show error naturally */ }
    })()
    return () => { cancelled = true }
  }, [activeWorkspace?.surfaceId, activeSessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open workspace panel when the agent modifies files
  useEffect(() => {
    if (changedFiles.length === 0) return
    if (!showWorkspace) setShowWorkspace(true)
  }, [changedFiles.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Absolute paths of files the agent has modified (undecided only), used to auto-refresh the workspace editor
  const changedPaths = useMemo(
    () => changedFiles.filter((f) => f.state === 'undecided').map((f) => f.path),
    [changedFiles],
  )

  useEffect(() => {
    setThemeMode(settings.theme)
  }, [settings.theme])

  // Sync chat provider from server settings (e.g. on login or new device).
  // Guard on authLoading so EMPTY_SETTINGS ('jait') doesn't override the
  // localStorage value before the real server settings arrive.
  useEffect(() => {
    if (authLoading) return
    if (settings.chat_provider && settings.chat_provider !== chatProvider) {
      setChatProvider(settings.chat_provider as import('@/lib/agents-api').ProviderId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.chat_provider, authLoading])

  useEffect(() => {
    applyTheme(themeMode)
    // Sync Windows titlebar overlay color with theme
    if (isElectron && desktopPlatform === 'win32') {
      const dark = themeMode === 'dark' || (themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ;(window as any).jaitDesktop?.setTitleBarOverlay?.({
        color: dark ? '#202020' : '#e8ecf1',
        symbolColor: dark ? '#f2f2f2' : '#0a0a0a',
        height: 39,
      })
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemThemeChanged = () => {
      if (themeMode === 'system') applyTheme('system')
      if (isElectron && desktopPlatform === 'win32') {
        const dark = media.matches
        ;(window as any).jaitDesktop?.setTitleBarOverlay?.({
          color: dark ? '#202020' : '#e8ecf1',
          symbolColor: dark ? '#f2f2f2' : '#0a0a0a',
          height: 39,
        })
      }
    }
    media.addEventListener('change', onSystemThemeChanged)
    return () => media.removeEventListener('change', onSystemThemeChanged)
  }, [themeMode, desktopPlatform])

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      // Defer so Radix Dialog's FocusScope mounts after the initial render
      // cycle completes (avoids infinite setState loop in React 19 StrictMode).
      const id = requestAnimationFrame(() => setShowLoginDialog(true))

      // If the gateway is supposedly configured but unreachable, send the user
      // back to the URL step so they can correct it instead of being stuck
      // on an auth form that can't reach the server.
      if (isStandaloneApp && isGatewayConfigured()) {
        fetch(`${getApiUrl()}/health`, { signal: AbortSignal.timeout(4000) })
          .then((r) => { if (!r.ok) throw new Error('unhealthy') })
          .catch(() => {
            setGatewayStep('url')
            setGatewayError('Gateway is unreachable. Check the URL or try a different one.')
            setGatewayUrlInput(getStoredGatewayUrl() ?? '')
          })
      }

      return () => cancelAnimationFrame(id)
    }
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    if (isAuthenticated && activeSessionId) bindSession(activeSessionId)
  }, [isAuthenticated, activeSessionId, bindSession])

  useEffect(() => {
    if (error === 'login_required') {
      const id = requestAnimationFrame(() => setShowLoginDialog(true))
      return () => cancelAnimationFrame(id)
    }
  }, [error])

  useEffect(() => {
    const loadApproveAllState = async () => {
      if (!activeSessionId) {
        setApproveAllInSession(false)
        return
      }
      try {
        const res = await fetch(`${API_URL}/api/consent/pending/${activeSessionId}/approve-all`)
        const data = (await res.json()) as { approveAllEnabled?: boolean }
        setApproveAllInSession(data.approveAllEnabled === true)
      } catch {
        setApproveAllInSession(false)
      }
    }
    void loadApproveAllState()
  }, [activeSessionId])


  const handleThemeModeChange = useCallback(async (next: ThemeMode) => {
    const previous = themeMode
    setThemeMode(next)
    try {
      await updateSettings({ theme: next })
    } catch {
      setThemeMode(previous)
    }
  }, [themeMode, updateSettings])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startY = e.clientY
    const startH = terminalHeight
    const maxH = window.innerHeight * 0.5
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startY - ev.clientY
      setTerminalHeight(Math.min(maxH, Math.max(280, startH + delta)))
    }
    const onUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [terminalHeight])

  const ensureActiveTerminal = useCallback(async (preferredTerminalId: string | null = null) => {
    const refreshed = await refresh()

    if (preferredTerminalId) {
      const preferredExists = refreshed.some((t) => t.id === preferredTerminalId)
      if (preferredExists) {
        setActiveTerminalId(preferredTerminalId)
        return preferredTerminalId
      }
    }

    if (activeTerminalId && refreshed.some((t) => t.id === activeTerminalId)) {
      return activeTerminalId
    }

    if (refreshed.length > 0) {
      const fallbackId = refreshed[refreshed.length - 1]!.id
      setActiveTerminalId(fallbackId)
      return fallbackId
    }

    const created = await createTerminal(activeSessionId ?? 'default')
    return created.id
  }, [refresh, setActiveTerminalId, activeTerminalId, createTerminal, activeSessionId])

  const handleOpenTerminalFromToolCall = useCallback(async (terminalId: string | null) => {
    setCurrentView('chat')
    openTerminalPanel()
    await ensureActiveTerminal(terminalId)
  }, [ensureActiveTerminal, openTerminalPanel])

  const handleToggleTerminal = useCallback(async () => {
    if (showTerminal) {
      closeTerminalPanel()
      return
    }
    setCurrentView('chat')
    openTerminalPanel()
    await ensureActiveTerminal()
  }, [showTerminal, ensureActiveTerminal, openTerminalPanel, closeTerminalPanel])

  const handleKillTerminal = useCallback(async (id: string) => {
    const isLastTerminal = terminals.length === 1 && terminals[0]?.id === id
    await killTerminal(id)
    if (isLastTerminal) {
      closeTerminalPanel()
    }
  }, [terminals, killTerminal, closeTerminalPanel])

  const mergeWorkspaceFiles = useCallback((incoming: WorkspaceFile[]) => {
    if (incoming.length === 0) return
    setWorkspaceFiles((prev) => {
      const next = [...prev]
      for (const file of incoming) {
        const idx = next.findIndex((existing) => existing.path === file.path)
        if (idx >= 0) next[idx] = file
        else next.push(file)
      }
      return next
    })
    setActiveWorkspaceFileId((prev) => prev ?? incoming[0]?.id ?? null)
  }, [])

  /** Open a changed file in the diff view (fetches backup + current content) */
  const handleChangedFileClick = useCallback(async (filePath: string) => {
    try {
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      // Try to fetch the backup (original) content from the gateway
      const backupRes = await fetch(
        `${API_URL}/api/workspace/backup?path=${encodeURIComponent(filePath)}`,
        { headers },
      )

      if (backupRes.ok) {
        const data = await backupRes.json() as {
          path: string
          originalContent: string | null
          currentContent: string
        }
        const name = filePath.split(/[\/\\]/).pop() ?? filePath
        setActiveDiff({
          filePath: data.path,
          originalContent: data.originalContent ?? '',
          modifiedContent: data.currentContent,
          language: workspaceLanguageForPath(name),
        })
        if (!showWorkspace) setShowWorkspace(true)
        return
      }

      // No backup — fall back to opening the file normally in the workspace editor
      const file = await workspaceRef.current?.readFileByPath(filePath)
      if (file) {
        mergeWorkspaceFiles([file])
        setActiveWorkspaceFileId(file.id)
        if (!showWorkspace) setShowWorkspace(true)
        return
      }
      // Fallback: fetch from the workspace REST API
      const readRes = await fetch(
        `${API_URL}/api/workspace/read?path=${encodeURIComponent(filePath)}`,
        { headers },
      )
      if (!readRes.ok) return
      const readData = await readRes.json() as { path: string; content: string }
      const name = filePath.split('/').pop() ?? filePath
      const wf: WorkspaceFile = {
        id: `changed-${filePath}`,
        name,
        path: readData.path,
        content: readData.content,
        language: workspaceLanguageForPath(name),
      }
      mergeWorkspaceFiles([wf])
      setActiveWorkspaceFileId(wf.id)
      if (!showWorkspace) setShowWorkspace(true)
    } catch {
      // silently ignore
    }
  }, [token, showWorkspace, mergeWorkspaceFiles])

  /** Close the diff view */
  const handleDiffClose = useCallback(() => {
    setActiveDiff(null)
  }, [])

  /** Apply the merged diff result — write to server and clear backup */
  const handleDiffApply = useCallback(async (resultContent: string) => {
    if (!activeDiff) return
    const filePath = activeDiff.filePath
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      await fetch(`${API_URL}/api/workspace/apply-diff`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: filePath, content: resultContent }),
      })
    } catch { /* ignore */ }
    // Mark the file as accepted in the changed-files list, then close diff view
    acceptFile(filePath)
    setActiveDiff(null)
  }, [activeDiff, token, acceptFile])

  const handleFileDrop = useCallback(async (dropped: FileList | File[]) => {
    const list = Array.from(dropped)
    const resolved = await Promise.all(
      list
        .filter((file) => file.size < 1024 * 1024)
        .map(async (file) => {
          const content = await file.text()
          const path = file.webkitRelativePath || file.name
          return {
            id: `${path}-${file.lastModified}`,
            name: file.name,
            path,
            content,
            language: workspaceLanguageForPath(path),
          } satisfies WorkspaceFile
        }),
    )
    mergeWorkspaceFiles(resolved)
  }, [mergeWorkspaceFiles])

  /** Lazy search files in the workspace directory for @ mention autocomplete */
  const handleSearchFiles = useCallback(async (query: string, limit: number, signal?: AbortSignal) => {
    return workspaceRef.current?.searchFiles(query, limit, signal) ?? []
  }, [])

  /** Explicitly queue a message while the agent is busy. */
  const handleQueue = useCallback((_chipFiles?: ReferencedFile[]) => {
    if (!inputValue.trim()) return
    enqueueMessage(inputValue.trim())
    setInputValue('')
  }, [inputValue, enqueueMessage])


  const handleSubmit = async (chipFiles?: ReferencedFile[]) => {
    if (viewMode === 'manager') {
      return handleManagerSubmit()
    }
    if (!inputValue.trim() && (!chipFiles || chipFiles.length === 0)) return
    if (!token) {
      setShowLoginDialog(true)
      return
    }

    let sid = activeSessionId
    if (!sid) {
      const session = await createSession()
      sid = session?.id ?? null
    }
    if (!sid) return

    // Lazy-read content for inline chip files (@ mentions and drag-dropped)
    const fileContents: { path: string; content: string }[] = []
    if (chipFiles?.length) {
      const seen = new Set<string>()
      for (const chip of chipFiles) {
        if (seen.has(chip.path)) continue
        seen.add(chip.path)
        // Check workspace files cache first
        const cached = workspaceFiles.find((f) => f.path === chip.path)
        if (cached) {
          fileContents.push({ path: cached.path, content: cached.content })
        } else {
          // Lazy read from the filesystem via workspace panel
          const file = await workspaceRef.current?.readFileByPath(chip.path)
          if (file) {
            fileContents.push({ path: file.path, content: file.content })
          }
        }
      }
    }

    const promptWithReferences = fileContents.length > 0
      ? `${inputValue.trim()}

Referenced files:
${fileContents
        .map((file) => `- ${file.path}
\`\`\`
${file.content.slice(0, 2000)}
\`\`\``)
        .join('\n')}`
      : inputValue.trim()
    const displayContent = inputValue.trim()
    const refs = chipFiles?.length ? chipFiles.map(f => ({ path: f.path, name: f.name })) : undefined
    sendMessage(promptWithReferences, {
      token,
      sessionId: sid,
      mode: chatMode,
      provider: chatProvider,
      model: chatProvider !== 'jait' ? cliModel : undefined,
      onLoginRequired: () => setShowLoginDialog(true),
      ...(refs ? { displayContent, referencedFiles: refs } : {}),
    })
    setInputValue('')
  }

  /** Submit for Manager mode — delegate to the automation hook. */
  const handleManagerSubmit = async () => {
    const text = inputValue.trim()
    if (!text || managerComposerDisabled) return
    setInputValue('')
    await automation.handleSend(text, chatProvider, chatProvider !== 'jait' ? cliModel : undefined)
  }

  const handleSuggestion = async (suggestion: string) => {
    if (!token) {
      setShowLoginDialog(true)
      return
    }
    let sid = activeSessionId
    if (!sid) {
      const session = await createSession()
      sid = session?.id ?? null
    }
    if (!sid) return
    sendMessage(suggestion, { token, sessionId: sid, mode: chatMode, provider: chatProvider, model: chatProvider !== 'jait' ? cliModel : undefined, onLoginRequired: () => setShowLoginDialog(true) })
  }

  const handleEditPreviousMessage = useCallback(async (
    messageId: string,
    newContent: string,
    messageIndex?: number,
    messageFromEnd?: number,
  ) => {
    if (!activeSessionId || !token) return
    await restartFromMessage(messageId, newContent, messageIndex, messageFromEnd, {
      token,
      sessionId: activeSessionId,
      mode: chatMode,
      provider: chatProvider,
      model: chatProvider !== 'jait' ? cliModel : undefined,
      onLoginRequired: () => setShowLoginDialog(true),
    })
  }, [activeSessionId, restartFromMessage, token, chatMode, chatProvider, cliModel])

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setAuthError(null)
    try {
      await login(loginUsername, loginPassword)
      setShowLoginDialog(false)
      setLoginPassword('')
      setCurrentView('chat')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault()
    setAuthError(null)
    if (!registerUsername || !registerPassword) {
      setAuthError('Username and password are required')
      return
    }
    if (registerPassword !== registerPasswordConfirm) {
      setAuthError('Passwords do not match')
      return
    }
    try {
      await register(registerUsername, registerPassword)
      setShowLoginDialog(false)
      setRegisterPassword('')
      setRegisterPasswordConfirm('')
      setCurrentView('chat')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  const checkGatewayHealth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const url = gatewayUrlInput.trim()
    if (!url) { setGatewayError('Please enter a gateway URL'); return }
    setGatewayChecking(true)
    setGatewayError(null)
    try {
      const clean = url.replace(/\/+$/, '')
      const res = await fetch(`${clean}/health`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const currentUrl = getApiUrl()
      setStoredGatewayUrl(clean)
      if (clean !== currentUrl) {
        // URL changed — reload so all modules pick up the new gateway
        window.location.reload()
        return
      }
      setGatewayStep('auth')
    } catch (err) {
      setGatewayError(
        err instanceof Error
          ? err.name === 'TimeoutError' || err.name === 'AbortError'
            ? 'Connection timed out'
            : err.message
          : 'Failed to connect',
      )
    } finally {
      setGatewayChecking(false)
    }
  }, [gatewayUrlInput])

  const handleLogout = () => {
    logout()
    clearMessages()
    setCurrentView('chat')
    setShowLoginDialog(true)
  }

  const handleSaveApiKeys = async (next: Record<string, string>) => {
    const sanitized = Object.fromEntries(
      Object.entries(next)
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v.length > 0),
    )
    await updateSettings({ api_keys: sanitized })
  }

  const handleClearArchive = async () => {
    const result = await clearSessionArchive()
    await fetchSessions()
    return result.removed
  }

  const handleClearApproveAll = useCallback(async () => {
    if (!activeSessionId) return
    try {
      await fetch(`${API_URL}/api/consent/pending/${activeSessionId}/approve-all`, {
        method: 'DELETE',
      })
      setApproveAllInSession(false)
    } catch {
      // keep current state on failure
    }
  }, [activeSessionId])

  const submitVoiceTranscript = useCallback(async (transcript: string) => {
    if (!transcript) return

    if (viewMode === 'manager') {
      await automation.handleSend(
        transcript,
        chatProvider,
        chatProvider !== 'jait' ? cliModel : undefined,
      )
      return
    }

    let sid = activeSessionId
    if (!sid) {
      const session = await createSession()
      sid = session?.id ?? null
    }
    if (!sid || !token) return

    sendMessage(transcript, {
      token,
      sessionId: sid,
      onLoginRequired: () => setShowLoginDialog(true),
    })
  }, [activeSessionId, automation.handleSend, chatProvider, cliModel, createSession, sendMessage, token, viewMode])

  // ── Push-to-talk voice recording state ─────────────────────────
  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceTranscribing, setVoiceTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioStreamRef = useRef<MediaStream | null>(null)

  /** Encode PCM samples from an AudioBuffer into a WAV Blob (16-bit, 16 kHz mono). */
  const buildWavBlob = useCallback((audioBuffer: AudioBuffer): Blob => {
    const numChannels = 1
    const sampleRate = audioBuffer.sampleRate
    const samples = audioBuffer.getChannelData(0)
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)

    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
    }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * 2, true)
    view.setUint16(32, numChannels * 2, true)
    view.setUint16(34, 16, true) // bits per sample
    writeStr(36, 'data')
    view.setUint32(40, samples.length * 2, true)

    let offset = 44
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      offset += 2
    }
    return new Blob([buffer], { type: 'audio/wav' })
  }, [])

  const stopRecordingAndTranscribe = useCallback(async () => {
    setVoiceRecording(false)

    // Stop MediaRecorder and collect audio
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    const audioBlob = await new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        resolve(new Blob(audioChunksRef.current, { type: recorder.mimeType }))
      }
      recorder.stop()
    })

    // Stop mic
    audioStreamRef.current?.getTracks().forEach((t) => t.stop())
    audioStreamRef.current = null
    mediaRecorderRef.current = null

    if (audioBlob.size === 0) return

    if (settings.stt_provider === 'wyoming') {
      // Convert to WAV and send to Wyoming/HA via backend
      setVoiceTranscribing(true)
      try {
        // Decode the webm blob to raw PCM, then re-encode as WAV
        const arrayBuf = await audioBlob.arrayBuffer()
        const audioCtx = new AudioContext({ sampleRate: 16000 })
        const decoded = await audioCtx.decodeAudioData(arrayBuf)
        const wavBlob = buildWavBlob(decoded)
        await audioCtx.close()

        // Convert to base64
        const wavArrayBuf = await wavBlob.arrayBuffer()
        const bytes = new Uint8Array(wavArrayBuf)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        const audioBase64 = btoa(binary)

        const res = await fetch(`${API_URL}/api/voice/transcribe-audio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ audioBase64, sessionId: activeSessionId ?? 'voice-input' }),
        })
        const data = (await res.json()) as { text?: string; error?: string; details?: string }
        if (data.text) {
          const transcript = data.text
          setInputValue((prev) => (prev ? prev + ' ' + transcript : transcript))
        } else {
          console.warn('Wyoming transcription failed:', data.details ?? data.error)
        }
      } catch (err) {
        console.error('Wyoming transcription error:', err)
      } finally {
        setVoiceTranscribing(false)
      }
    } else if (settings.stt_provider === 'browser') {
      // Use Web Speech API on the captured audio (fallback: re-trigger recognition)
      setVoiceTranscribing(true)
      try {
        const win = window as typeof window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }
        const speechApi = win.SpeechRecognition ?? win.webkitSpeechRecognition
        if (!speechApi) {
          window.alert('Browser Speech-to-Text is not supported.')
          return
        }
        // Play the audio back through recognition isn't possible — for browser mode
        // we fall back to a simpler approach: submit the blob text  
        // Actually for browser mode we just insert a note that browser STT
        // doesn't support audio blob transcription and should use direct mode
        window.alert('Browser STT works best with direct microphone input. Consider switching to Wyoming for push-to-talk.')
      } finally {
        setVoiceTranscribing(false)
      }
    } else {
      // simulated — show a prompt
      const transcript = window.prompt('Transcription (simulated):')?.trim() ?? ''
      if (transcript) {
        setInputValue((prev) => (prev ? prev + ' ' + transcript : transcript))
      }
    }
  }, [activeSessionId, buildWavBlob, settings.stt_provider, token])

  const handleVoiceInput = useCallback(async () => {
    if (!token) {
      setShowLoginDialog(true)
      return
    }

    // For browser provider, keep the old direct recognition flow
    if (settings.stt_provider === 'browser') {
      const win = window as typeof window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }
      const speechApi = win.SpeechRecognition ?? win.webkitSpeechRecognition
      if (!speechApi) {
        window.alert('Speech-to-Text provider "Browser" is not supported in this browser.')
        return
      }
      const transcript = await new Promise<string>((resolve) => {
        const recognition = new speechApi()
        let resolved = false
        const finish = (value: string) => {
          if (resolved) return
          resolved = true
          resolve(value)
        }
        recognition.lang = 'de-DE'
        recognition.interimResults = false
        recognition.maxAlternatives = 1
        recognition.onresult = (event: any) => {
          const spoken = event.results?.[0]?.[0]?.transcript?.trim() ?? ''
          finish(spoken)
        }
        recognition.onerror = () => finish('')
        recognition.onnomatch = () => finish('')
        recognition.onend = () => finish('')
        recognition.start()
      })
      if (!transcript) return
      try {
        const res = await fetch(`${API_URL}/api/voice/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: activeSessionId ?? 'voice-input', transcript }),
        })
        const data = (await res.json()) as { text?: string }
        if (data.text) {
          await submitVoiceTranscript(data.text)
        }
      } catch {
        // noop
      }
      return
    }

    // For simulated provider, keep the old prompt flow
    if (settings.stt_provider === 'simulated') {
      const transcript = window.prompt('Speak now (simulated transcript):')?.trim() ?? ''
      if (!transcript) return
      try {
        const res = await fetch(`${API_URL}/api/voice/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: activeSessionId ?? 'voice-input', transcript }),
        })
        const data = (await res.json()) as { text?: string }
        if (data.text) {
          await submitVoiceTranscript(data.text)
        }
      } catch {
        // noop
      }
      return
    }

    // Wyoming provider: push-to-talk with MediaRecorder
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      })
      audioStreamRef.current = stream
      audioChunksRef.current = []

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.start()
      setVoiceRecording(true)
    } catch (err) {
      console.error('Microphone access denied:', err)
      window.alert('Microphone access is required for push-to-talk.')
    }
  }, [activeSessionId, settings.stt_provider, submitVoiceTranscript, token])

  const limitReached = error === 'limit_reached'
  const hasMessages = messages.length > 0 || isLoadingHistory

  const userInitial = user?.username?.[0]?.toUpperCase() ?? '?'
  const activityEvents: ActivityEvent[] = [
    ...messages.slice(-10).map((msg) => createActivityEvent({
      id: `msg-${msg.id}`,
      source: 'chat',
      title: `Message: ${msg.role}`,
      detail: msg.content.slice(0, 120) || '(empty message)',
    })),
    ...terminals.map((terminal) => createActivityEvent({
      id: `term-${terminal.id}`,
      source: 'terminal',
      title: 'Terminal session',
      detail: `${terminal.id} (${terminal.state})`,
    })),
  ]

  return (
    <TooltipProvider>
      <div className="fixed inset-0 flex flex-col overflow-hidden safe-top safe-bottom safe-left safe-right">
        <header
          className={`flex items-center px-2 sm:px-5 border-b shrink-0 gap-1 sm:gap-2 ${isElectron ? 'h-10 !pl-[0.8rem]' : 'h-14'}`}
          style={isElectron ? {
            WebkitAppRegion: 'drag',
            paddingLeft: desktopPlatform === 'darwin' ? 70 : undefined,
            paddingRight: desktopPlatform === 'win32' ? 140 : undefined,
          } as React.CSSProperties : undefined}
        >
          {/* Left: Logo — always visible */}
          <div className="flex items-center shrink-0" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 1024 1024" className="shrink-0">
              <path d="M318 372 L430 486 L318 600"
                    fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M610 258 L610 642 C610 734 549 796 455 796 C393 796 338 766 299 715"
                    fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* Center: Nav — scrollable on mobile */}
          <nav className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <Button
              variant={currentView === 'chat' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs shrink-0 px-2 sm:px-3"
              onClick={() => setCurrentView('chat')}
            >
              <MessageSquare className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Chat</span>
            </Button>
            <Button
              variant={currentView === 'jobs' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs shrink-0 px-2 sm:px-3"
              onClick={() => setCurrentView('jobs')}
            >
              <Calendar className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Jobs</span>
            </Button>
            <Button
              variant={currentView === 'network' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs shrink-0 px-2 sm:px-3"
              onClick={() => setCurrentView('network')}
            >
              <Wifi className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Network</span>
            </Button>
          </nav>

          {/* Spacer */}
          <div className="flex-1 min-w-0" />

          {/* Right: Context + Model + Account — always visible */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            {currentView === 'chat' && activeManagerThreads.length > 0 && (
              <ManagerActiveThreadsMenu
                threads={activeManagerThreads}
                getRepositoryForThread={automation.getRepositoryForThread}
                threadPrStates={automation.threadPrStates}
                ghAvailable={automation.ghAvailable}
                onOpenThread={(threadId) => {
                  if (viewMode !== 'manager') setViewMode('manager')
                  setCurrentView('chat')
                  automation.setSelectedThreadId(threadId)
                }}
                onStopThread={(threadId) => automation.handleStop(threadId)}
              />
            )}
            {screenShare.isActive && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 shrink-0">
                <Cast className="h-3 w-3 text-green-500 animate-pulse" />
                <span className="hidden sm:inline">Sharing</span>
              </span>
            )}
            <ContextIndicator usage={contextUsage} />
            {(() => {
              const displayProvider = chatProvider === 'codex' ? 'openai'
                : chatProvider === 'claude-code' ? 'anthropic'
                : provider ?? 'ollama'
              const displayModel = chatProvider === 'codex' ? (cliModel ?? 'Codex')
                : chatProvider === 'claude-code' ? (cliModel ?? 'Claude Code')
                : model ? getModelDisplayName(model) : null
              const tooltipText = chatProvider === 'codex' ? `OpenAI Codex CLI${cliModel ? ` · ${cliModel}` : ''}`
                : chatProvider === 'claude-code' ? `Anthropic Claude Code CLI${cliModel ? ` · ${cliModel}` : ''}`
                : model ?? ''
              return displayModel ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 sm:gap-1.5 sm:mr-2 px-1.5 sm:px-2 py-1 rounded-md bg-muted/50 cursor-default">
                      <ModelIcon provider={displayProvider} model={chatProvider === 'codex' ? 'codex' : chatProvider === 'claude-code' ? 'claude-3' : model ?? undefined} size={16} />
                      <span className="text-xs text-muted-foreground hidden sm:inline">{displayModel}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{tooltipText}</TooltipContent>
                </Tooltip>
              ) : null
            })()}
            {remainingPrompts !== null && remainingPrompts <= 5 && (
              <span className="text-xs text-muted-foreground mr-1 sm:mr-2 hidden sm:inline">{remainingPrompts} remaining</span>
            )}

            {updateInfo?.hasUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      if (appPlatform === 'web') {
                        setCurrentView('settings')
                      } else {
                        window.open(
                          'https://github.com/JakobWl/Jait/releases/latest',
                          '_blank',
                        )
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors text-xs"
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">v{updateInfo.latestVersion}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Update available — v{updateInfo.latestVersion}</TooltipContent>
              </Tooltip>
            )}

            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[11px]">{userInitial}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{user?.username}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setCurrentView('settings')}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Theme</span>
                    <div className="flex items-center h-7 w-fit rounded-full border bg-muted/50 p-0.5 mt-1.5">
                      {([['light', Sun], ['system', Monitor], ['dark', Moon]] as const).map(([mode, Icon]) => (
                        <Tooltip key={mode}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => { void handleThemeModeChange(mode as ThemeMode) }}
                              className={`relative flex items-center justify-center h-6 w-6 rounded-full transition-colors ${
                                themeMode === mode
                                  ? 'bg-background text-foreground shadow-sm'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{mode.charAt(0).toUpperCase() + mode.slice(1)}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowLoginDialog(true)}>
                Sign in
              </Button>
            )}

            {/* Linux custom window controls (Windows uses native titleBarOverlay, macOS uses traffic lights) */}
            {isElectron && desktopPlatform === 'linux' && (
              <div className="flex items-center ml-2 -mr-2">
                <button
                  onClick={() => (window as any).jaitDesktop.windowMinimize()}
                  className="flex items-center justify-center h-9 w-11 hover:bg-muted/80 transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => (window as any).jaitDesktop.windowMaximize()}
                  className="flex items-center justify-center h-9 w-11 hover:bg-muted/80 transition-colors"
                >
                  {isMaximized
                    ? <svg width="10" height="10" viewBox="0 0 10 10" className="fill-current"><path d="M2 0v2H0v8h8V8h2V0zm5 7H1V3h6zM9 1v6H8V2H3V1z"/></svg>
                    : <Square className="h-3 w-3" />
                  }
                </button>
                <button
                  onClick={() => (window as any).jaitDesktop.windowClose()}
                  className="flex items-center justify-center h-9 w-11 hover:bg-red-600 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Chat-specific toolbar */}
        {currentView === 'chat' && (
          <div className="flex items-center gap-1 px-2 sm:px-5 h-9 border-b shrink-0 bg-muted/30 overflow-x-auto scrollbar-none">
            {viewMode === 'developer' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showSidebar ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-6 text-[11px] px-2 shrink-0"
                    onClick={() => setShowSidebar(s => !s)}
                  >
                    {showSidebar
                      ? <PanelLeftClose className={`h-3 w-3 mr-1${isMobile ? ' rotate-90' : ''}`} />
                      : <PanelLeftOpen className={`h-3 w-3 mr-1${isMobile ? ' rotate-90' : ''}`} />
                    }
                    Sessions
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle sessions sidebar</TooltipContent>
              </Tooltip>
            )}

            {/* Developer-only buttons */}
            {viewMode === 'developer' && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showTerminal ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-6 text-[11px] px-2 shrink-0"
                      onClick={() => { void handleToggleTerminal() }}
                    >
                      <TerminalIcon className="h-3 w-3 mr-1" />
                      Terminal
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Toggle terminal panel</TooltipContent>
                </Tooltip>

                {/* Workspace button with close-confirmation popover */}
                <div className="relative flex items-center shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showWorkspace ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-6 text-[11px] px-2"
                        onClick={() => { void handleOpenWorkspace() }}
                      >
                        <FolderTree className="h-3 w-3 mr-1" />
                        Workspace
                        {showWorkspace && <X className="h-3 w-3 ml-1" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{showWorkspace ? 'Close workspace' : 'Open workspace'}</TooltipContent>
                  </Tooltip>

                  {showCloseWorkspaceConfirm && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowCloseWorkspaceConfirm(false)} />
                      <div
                        ref={closeConfirmRef}
                        className="absolute top-full left-0 mt-1 z-50 w-64 rounded-lg border bg-background shadow-lg p-3 space-y-2"
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <p className="font-medium">Close workspace?</p>
                            <p className="text-muted-foreground mt-0.5">
                              You have {changedFiles.length} unsaved file {changedFiles.length === 1 ? 'change' : 'changes'} that will be discarded.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setShowCloseWorkspaceConfirm(false)}>Cancel</Button>
                          <Button variant="destructive" size="sm" className="h-6 text-[11px] px-2" onClick={() => { setShowCloseWorkspaceConfirm(false); closeWorkspacePanel() }}>Discard & Close</Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {viewMode === 'developer' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showDebugPanel ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-6 text-[11px] px-2 shrink-0"
                    onClick={() => setShowDebugPanel(d => !d)}
                  >
                    <Bug className="h-3 w-3 mr-1" />
                    Debug
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">SSE debug stream</TooltipContent>
              </Tooltip>
            )}

            {/* Developer-only: Share */}
            {viewMode === 'developer' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showScreenShare ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-6 text-[11px] px-2 shrink-0"
                    onClick={() => showScreenShare ? closeScreenSharePanel() : openScreenSharePanel()}
                  >
                    <Cast className="h-3 w-3 mr-1" />
                    Share
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Screen sharing</TooltipContent>
              </Tooltip>
            )}

            {/* Manager mode: repos toggle (list view) / back button (thread view) + thread info */}
            {viewMode === 'manager' && (
              <>
                {automation.selectedThread ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2 shrink-0"
                    onClick={() => {
                      automation.setSelectedThreadId(null)
                      setInputValue('')
                    }}
                  >
                    <ArrowLeft className="h-3 w-3 mr-1" />
                    Back
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showManagerRepos ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-6 text-[11px] px-2 shrink-0"
                        onClick={() => setShowManagerRepos(s => !s)}
                      >
                        {showManagerRepos
                          ? <PanelLeftClose className={`h-3 w-3 mr-1${isMobile ? ' rotate-90' : ''}`} />
                          : <PanelLeftOpen className={`h-3 w-3 mr-1${isMobile ? ' rotate-90' : ''}`} />
                        }
                        Repositories
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Toggle repositories panel</TooltipContent>
                  </Tooltip>
                )}
                <div className="flex-1" />
                {automation.selectedThread ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <ManagerStatusDot status={automation.selectedThread.status} />
                    {isTitlePending(automation.selectedThread.title) ? (
                      <TitleSkeleton className="text-[11px] h-3.5 w-28" />
                    ) : (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                        {automation.selectedThread.title.replace(/^\[.*?\]\s*/, '')}
                      </span>
                    )}
                    {automation.selectedRepo && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                        {automation.selectedRepo.name} · {automation.selectedRepo.defaultBranch}
                      </span>
                    )}
                    {automation.selectedThread.branch && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                        {automation.selectedThread.branch}
                      </Badge>
                    )}
                    {automation.selectedThread.status === 'running' && (
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => void automation.handleStop(automation.selectedThread!.id)}>
                        <Square className="h-2.5 w-2.5" />
                      </Button>
                    )}
                    {automation.showGitActions && automation.selectedRepo && (
                      <div className="ml-2 shrink-0">
                        <ThreadActions
                          threadId={automation.selectedThread.id}
                          cwd={automation.selectedThread.workingDirectory ?? automation.selectedRepo.localPath}
                          branch={automation.selectedThread.branch}
                          baseBranch={automation.selectedRepo.defaultBranch}
                          threadTitle={automation.selectedThread.title}
                          threadStatus={automation.selectedThread.status}
                          prUrl={automation.selectedThread.prUrl}
                          prState={(automation.selectedThread.id in automation.threadPrStates ? automation.threadPrStates[automation.selectedThread.id] : automation.selectedThread.prState) as 'open' | 'closed' | 'merged' | null | undefined}
                          ghAvailable={automation.ghAvailable}
                        />
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}

        {currentView === 'jobs' ? (
          <div className="flex-1 overflow-y-auto">
            <JobsPage />
          </div>
        ) : currentView === 'network' ? (
          <div className="flex-1 overflow-y-auto">
            <NetworkPanel token={token} />
          </div>
        ) : currentView === 'settings' ? (
          <div className="flex-1 overflow-y-auto">
            <SettingsPage
              username={user?.username ?? ''}
              token={token}
              apiKeys={settings.api_keys}
              onSaveApiKeys={handleSaveApiKeys}
              sttProvider={settings.stt_provider}
              onSttProviderChange={async (next: SttProvider) => {
                await updateSettings({ stt_provider: next })
              }}
              onClearArchive={handleClearArchive}
              activityEvents={activityEvents}
              updateInfo={updateInfo}
              updateChecking={updateChecking}
              onCheckUpdate={() => { void handleCheckUpdate() }}
              onApplyUpdate={() => { void handleApplyUpdate() }}
              updateApplying={updateApplying}
              platform={appPlatform}
            />
          </div>
        ) : (
          <div className={`flex flex-1 min-h-0 overflow-hidden ${isMobile ? 'flex-col' : ''}`}>
            {viewMode === 'developer' && showSidebar && (
              <aside className={`overflow-hidden ${isMobile ? 'h-52 border-b shrink-0' : 'w-56 border-r shrink-0'}`}>
                <SessionSelector
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  onSelect={switchSession}
                  onCreate={() => createSession()}
                  onArchive={archiveSession}
                />
              </aside>
            )}

            {viewMode === 'developer' && showDesktopWorkspace && !activeDiff && (
              <WorkspacePanel
                ref={workspaceRef}
                autoOpenRemotePath={activeWorkspace?.workspaceRoot ?? null}
                surfaceId={activeWorkspace?.surfaceId ?? null}
                files={workspaceFiles}
                activeFileId={activeWorkspaceFileId}
                onActiveFileChange={setActiveWorkspaceFileId}
                onFileDrop={(files) => { void handleFileDrop(files) }}
                onReferenceFile={(file) => promptInputRef.current?.insertChip({ path: file.path, name: file.name })}
                onAvailableFilesChange={setAvailableFilesForMention}
                showTree={showWorkspaceTree}
                showEditor={showWorkspaceEditor}
                onToggleTree={toggleWorkspaceTree}
                onToggleEditor={toggleWorkspaceEditor}
                changedPaths={changedPaths}
                fsWatcherVersion={fsWatcherVersion}
              />
            )}

            {viewMode === 'developer' && showDesktopWorkspace && activeDiff && (
              <aside className="flex-[4] min-w-0 border-r bg-background overflow-hidden flex flex-col">
                <DiffView
                  filePath={activeDiff.filePath}
                  originalContent={activeDiff.originalContent}
                  modifiedContent={activeDiff.modifiedContent}
                  language={activeDiff.language}
                  onClose={handleDiffClose}
                  onApply={(result) => { void handleDiffApply(result) }}
                />
              </aside>
            )}



            {viewMode === 'developer' && showMobileWorkspace && !activeDiff && (showWorkspaceTree || showWorkspaceEditor) && (
              <section className={`shrink-0 border-b bg-background overflow-hidden ${hasMessages ? 'h-[50dvh] min-h-[220px]' : 'h-[55dvh] min-h-[260px]'}`}>
                <WorkspacePanel
                  ref={workspaceRef}
                  autoOpenRemotePath={activeWorkspace?.workspaceRoot ?? null}
                  surfaceId={activeWorkspace?.surfaceId ?? null}
                  files={workspaceFiles}
                  activeFileId={activeWorkspaceFileId}
                  onActiveFileChange={setActiveWorkspaceFileId}
                  onFileDrop={(files) => { void handleFileDrop(files) }}
                  onReferenceFile={(file) => promptInputRef.current?.insertChip({ path: file.path, name: file.name })}
                  onAvailableFilesChange={setAvailableFilesForMention}
                  showTree={showWorkspaceTree}
                  showEditor={showWorkspaceEditor}
                  onToggleTree={toggleWorkspaceTree}
                  onToggleEditor={toggleWorkspaceEditor}
                  changedPaths={changedPaths}
                  isMobile
                />
              </section>
            )}

            {/* Mobile: sticky show-panel buttons when workspace panels are hidden */}
            {viewMode === 'developer' && showMobileWorkspace && !activeDiff && (!showWorkspaceTree || !showWorkspaceEditor) && (
              <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/20 shrink-0">
                {!showWorkspaceTree && (
                  <button
                    onClick={showWorkspaceTreePanel}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <FolderTree className="h-3.5 w-3.5" />
                    {!isMobile && 'Show Files'}
                  </button>
                )}
                {!showWorkspaceEditor && (
                  <button
                    onClick={showWorkspaceEditorPanel}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <Code className="h-3.5 w-3.5" />
                    {!isMobile && 'Show Editor'}
                  </button>
                )}
              </div>
            )}

            {viewMode === 'developer' && showMobileWorkspace && activeDiff && (
              <section className={`shrink-0 border-b bg-background overflow-hidden ${hasMessages ? 'h-[50dvh] min-h-[220px]' : 'h-[55dvh] min-h-[260px]'}`}>
                <DiffView
                  filePath={activeDiff.filePath}
                  originalContent={activeDiff.originalContent}
                  modifiedContent={activeDiff.modifiedContent}
                  language={activeDiff.language}
                  onClose={handleDiffClose}
                  onApply={(result) => { void handleDiffApply(result) }}
                />
              </section>
            )}

            {viewMode === 'manager' ? (
              /* ── Manager main content ────────────────────────────── */
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                {automation.selectedThread ? (
                  <>
                    <Conversation className="min-h-0 flex-1 border-b" compact loading={automation.loadingActivities}>
                      {automationMessages.length === 0 && !automation.loadingActivities && (
                        <div className="text-center text-sm text-muted-foreground py-8">No activity yet</div>
                      )}
                      {automationMessages.map((msg, idx) => (
                        <Message
                          key={msg.id}
                          messageId={msg.id}
                          messageIndex={idx}
                          messageFromEnd={automationMessages.length - 1 - idx}
                          role={msg.role}
                          content={msg.content}
                          toolCalls={msg.toolCalls}
                          segments={msg.segments}
                          isStreaming={automation.selectedThread?.status === 'running' && idx === automationMessages.length - 1}
                          compact
                          preferLlmUi={false}
                        />
                      ))}
                    </Conversation>
                    <div className="shrink-0 py-3 px-4">
                      <div className="mx-auto max-w-3xl">
                        {automation.error && (
                          <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 mb-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 break-words">{automation.error}</span>
                          </div>
                        )}
                        <PromptInput
                          ref={promptInputRef}
                          value={inputValue}
                          onChange={setInputValue}
                          onSubmit={handleSubmit}
                          onStop={() => { if (automation.selectedThread) void automation.handleStop(automation.selectedThread.id) }}
                          isLoading={automation.selectedThread?.status === 'running'}
                          disabled={automation.creating}
                          placeholder={automation.selectedThread?.providerSessionId || automation.selectedThread?.status === 'running' ? 'Send a follow-up message...' : 'Describe what you want to do...'}
                          onVoiceInput={handleVoiceInput}
                          voiceRecording={voiceRecording}
                          voiceTranscribing={voiceTranscribing}
                          onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                          viewMode={viewMode}
                          onViewModeChange={setViewMode}
                          provider={chatProvider}
                          onProviderChange={setChatProvider}
                          cliModel={cliModel}
                          onCliModelChange={setCliModel}
                        />
                        <div className="flex items-center gap-2 px-1 mt-1.5">
                          {selectedThreadRepoRuntime && (
                            <ManagerRepoRuntimeMeta runtime={selectedThreadRepoRuntime} />
                          )}
                          {automation.selectedThread && automation.selectedThread.status !== 'running' && !automation.selectedThread.providerSessionId && (
                            <span className="text-[11px] text-muted-foreground truncate">
                              Thread finished — start a new one
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={`flex flex-1 min-h-0 ${isMobile ? 'flex-col' : ''}`}>
                    {/* Collapsible repos panel */}
                    {showManagerRepos && (
                      <div className={`overflow-hidden ${isMobile ? 'h-52 shrink-0 border-b' : 'w-56 shrink-0 border-r'}`}>
                        <ManagerRepositoryPanel
                          repositories={automation.repositories}
                          selectedRepoId={automation.selectedRepo?.id ?? null}
                          isMobile={isMobile}
                          getRuntimeInfo={automation.getRuntimeInfoForRepository}
                          onSelect={automation.setSelectedRepoId}
                          onAddRepository={() => automation.setFolderPickerOpen(true)}
                          onRemoveRepository={(repoId) => { void automation.removeRepository(repoId) }}
                          onOpenStrategy={(repo) => setStrategyRepo(repo)}
                          onOpenPlan={(repo) => setPlanRepo(repo)}
                        />
                      </div>
                    )}
                    {/* Main content */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                      {/* Title + composer */}
                      <div
                        className={`relative z-10 flex flex-col items-center px-4 pb-2 pt-4${managerAnimPhase !== 'idle' ? ' will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]' : ''}`}
                        style={managerAnimPhase === 'center' ? { transform: 'translateY(calc(50vh - 200px))' } : managerAnimPhase === 'top' ? { transform: 'translateY(0)' } : undefined}
                        onTransitionEnd={() => { if (managerAnimPhase === 'top') setManagerAnimPhase('idle') }}
                      >
                        <div className="w-full max-w-3xl">
                          <h1 className="mb-4 text-center text-2xl font-semibold tracking-tight">What do you want to build?</h1>
                          {automation.error && (
                            <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 mb-3">
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 break-words">{automation.error}</span>
                            </div>
                          )}
                          <PromptInput
                            ref={promptInputRef}
                            value={inputValue}
                            onChange={setInputValue}
                            onSubmit={handleSubmit}
                            disabled={managerComposerDisabled}
                            controlsDisabled={automation.creating}
                            placeholder={managerPlaceholder}
                            onVoiceInput={handleVoiceInput}
                            voiceRecording={voiceRecording}
                            voiceTranscribing={voiceTranscribing}
                            onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                            viewMode={viewMode}
                            onViewModeChange={setViewMode}
                            provider={chatProvider}
                            onProviderChange={setChatProvider}
                            cliModel={cliModel}
                            onCliModelChange={setCliModel}
                            footerLeadingContent={(
                              <ManagerRepoPicker
                                repositories={automation.repositories}
                                selectedRepo={automation.selectedRepo}
                                disabled={automation.creating}
                                getRuntimeInfo={automation.getRuntimeInfoForRepository}
                                onSelect={automation.setSelectedRepoId}
                                onAddRepository={() => automation.setFolderPickerOpen(true)}
                              />
                            )}
                          />
                          {selectedRepoRuntime && (
                            <ManagerRepoRuntimeMeta runtime={selectedRepoRuntime} className="mt-1 px-1" />
                          )}
                        </div>
                      </div>
                      {/* Thread list header + threads */}
                      <div className="flex-1 overflow-y-auto">
                        <div className="mx-auto w-full max-w-3xl">
                          {automation.selectedRepo && (
                            <div className="grid gap-3 px-3 py-3 md:grid-cols-2">
                              <ManagerRepoPageCard
                                icon={ScrollText}
                                title="Strategy"
                                meta={automation.selectedRepo.source === 'local' ? automation.selectedRepo.defaultBranch : 'Shared repository'}
                                description={
                                  automation.selectedRepo.source === 'local'
                                    ? summarizeManagerPreview(
                                        managerRepoStrategyPreview,
                                        'No strategy yet. Add build, test, and repo instructions so manager threads have clear context.',
                                      )
                                    : 'Add this repository locally to edit its strategy page.'
                                }
                                actionLabel="Open strategy"
                                loading={managerRepoPreviewLoading && automation.selectedRepo.source === 'local'}
                                disabled={automation.selectedRepo.source !== 'local'}
                                onOpen={() => setStrategyRepo(automation.selectedRepo)}
                              />
                              <ManagerRepoPageCard
                                icon={ListChecks}
                                title="Todos"
                                meta={
                                  automation.selectedRepo.source === 'local'
                                    ? selectedManagerPlan
                                      ? `${selectedManagerPlan.tasks.length} tasks · ${selectedManagerPlanProposedCount} proposed · ${selectedManagerPlanReadyCount} ready`
                                      : 'No todo plan yet'
                                    : 'Shared repository'
                                }
                                description={
                                  automation.selectedRepo.source === 'local'
                                    ? selectedManagerPlan
                                      ? summarizeManagerPreview(
                                          [
                                            selectedManagerPlan.title,
                                            ...selectedManagerPlan.tasks.slice(0, 2).map((task) => task.title),
                                          ].join(' • '),
                                          'No todo plan yet.',
                                        )
                                      : 'Generate a todo plan with proposed tasks before starting the next threads.'
                                    : 'Add this repository locally to open its todo page.'
                                }
                                actionLabel="Open todos"
                                loading={managerRepoPreviewLoading && automation.selectedRepo.source === 'local'}
                                disabled={automation.selectedRepo.source !== 'local'}
                                onOpen={() => setPlanRepo(automation.selectedRepo)}
                              />
                            </div>
                          )}
                          <div className="flex items-center justify-between border-b px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Threads</span>
                              <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
                                {managerThreads.length}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => void automation.refresh()}
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${automation.loading ? 'animate-spin' : ''}`} />
                            </Button>
                          </div>
                          {managerThreads.length === 0 ? (
                            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                              No threads yet
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              {managerThreads.map((thread) => {
                                const threadRepo = automation.getRepositoryForThread(thread)
                                const repoName = threadRepo?.name ?? inferThreadRepositoryName(thread) ?? 'Unknown repo'
                                return (
                                  <ManagerThreadListItem
                                    key={thread.id}
                                    thread={thread}
                                    repo={threadRepo}
                                    repoName={repoName}
                                    prState={thread.id in automation.threadPrStates ? automation.threadPrStates[thread.id] : thread.prState}
                                    ghAvailable={automation.ghAvailable}
                                    onOpen={() => automation.setSelectedThreadId(thread.id)}
                                    onStop={() => { void automation.handleStop(thread.id) }}
                                    onDelete={() => { void automation.handleDelete(thread.id) }}
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : !hasMessages ? (
              <div className={`flex-1 min-w-0 flex flex-col items-center justify-center px-4 ${developerAnimPhase === 'animating' ? 'animate-slide-from-top' : ''}`}
                onAnimationEnd={() => setDeveloperAnimPhase('idle')}
              >
                <div className="w-full max-w-3xl space-y-8">
                  <div className="text-center">
                    <h1 className="text-3xl font-semibold tracking-tight">Jait</h1>
                    <p className="text-base text-muted-foreground mt-1">Just Another Intelligent Tool</p>
                  </div>
                  <Suggestions suggestions={suggestions} onSelect={handleSuggestion} />
                  <PromptInput
                    ref={promptInputRef}
                    value={inputValue}
                    onChange={setInputValue}
                    onSubmit={handleSubmit}
                    onStop={cancelRequest}
                    onQueue={handleQueue}
                    isLoading={isLoading}
                    onVoiceInput={handleVoiceInput}
                    voiceRecording={voiceRecording}
                    voiceTranscribing={voiceTranscribing}
                    onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                    mode={chatMode}
                    onModeChange={setChatMode}
                    provider={chatProvider}
                    onProviderChange={setChatProvider}
                    cliModel={cliModel}
                    onCliModelChange={setCliModel}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    availableFiles={availableFilesForMention}
                    onSearchFiles={handleSearchFiles}
                    workspaceOpen={showWorkspace}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-w-0 min-h-0 transition-all duration-300 ease-out">
                {/* Sticky show-panel buttons when workspace panels are hidden */}
                {showWorkspace && (!showWorkspaceTree || !showWorkspaceEditor) && !isMobile && (
                  <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/20 shrink-0">
                    {!showWorkspaceTree && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={showWorkspaceTreePanel}
                            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Eye className="h-3 w-3" />
                            <FolderTree className="h-3 w-3" />
                            Show Files
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Show file tree</TooltipContent>
                      </Tooltip>
                    )}
                    {!showWorkspaceEditor && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={showWorkspaceEditorPanel}
                            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Eye className="h-3 w-3" />
                            <Code className="h-3 w-3" />
                            Show Editor
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Show editor</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
                <Conversation className="min-h-0 flex-1 border-b" compact={showDesktopWorkspace} loading={isLoadingHistory}>
                  {messages.map((msg, idx) => (
                    <Message
                      key={msg.id}
                      messageId={msg.id}
                      messageIndex={idx}
                      messageFromEnd={messages.length - 1 - idx}
                      role={msg.role}
                      content={msg.content}
                      displayContent={msg.displayContent}
                      referencedFiles={msg.referencedFiles}
                      thinking={msg.thinking}
                      thinkingDuration={msg.thinkingDuration}
                      toolCalls={msg.toolCalls}
                      segments={msg.segments}
                      isStreaming={isLoading && msg === messages[messages.length - 1]}
                      compact={showWorkspace || showScreenShare}
                      preferLlmUi
                      onOpenTerminal={handleOpenTerminalFromToolCall}
                      onEditMessage={handleEditPreviousMessage}
                    />
                  ))}
                </Conversation>

                <div className={`shrink-0 py-3 ${showDesktopWorkspace ? 'px-3' : 'px-4'}`}>
                  <div className={`mx-auto space-y-1.5 ${showDesktopWorkspace ? 'max-w-none' : 'max-w-3xl'}`}>
                    {todoList.length > 0 && (
                      <TodoList items={todoList} />
                    )}
                    {error && error !== 'login_required' && error !== 'limit_reached' && !isLoading && (
                      <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 dark:text-red-400 dark:border-red-400/40 dark:bg-red-400/10">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">{error}</span>
                      </div>
                    )}
                    {hitMaxRounds && !isLoading && (
                      <div className="flex items-center justify-center gap-2 py-1.5">
                        <button
                          onClick={() => continueChat({ token, sessionId: activeSessionId })}
                          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          Continue
                        </button>
                        <span className="text-[11px] text-muted-foreground">Agent stopped — hit the tool execution limit</span>
                      </div>
                    )}
                    <ConsentQueue
                      compact
                      sessionId={activeSessionId}
                      onApproveAllEnabled={() => setApproveAllInSession(true)}
                    />
                    {pendingPlan && (
                      <PlanReview
                        plan={pendingPlan}
                        onApprove={executePlan}
                        onReject={rejectPlan}
                        isExecuting={isLoading}
                      />
                    )}
                    {limitReached && (
                      <p className="text-center text-sm text-destructive">
                        Daily limit reached. Come back tomorrow.
                      </p>
                    )}
                    {changedFiles.length > 0 && (
                      <FilesChanged
                        files={changedFiles}
                        onAccept={acceptFile}
                        onReject={rejectFile}
                        onAcceptAll={acceptAllFiles}
                        onRejectAll={rejectAllFiles}
                        onFileClick={handleChangedFileClick}
                      />
                    )}
                    {messageQueue.length > 0 && (
                      <MessageQueue
                        items={messageQueue}
                        onRemove={dequeueMessage}
                        onEdit={updateQueueItem}
                      />
                    )}
                    <PromptInput
                      ref={promptInputRef}
                      value={inputValue}
                      onChange={setInputValue}
                      onSubmit={handleSubmit}
                      onStop={cancelRequest}
                      onQueue={handleQueue}
                      isLoading={isLoading}
                      disabled={limitReached}
                      onVoiceInput={handleVoiceInput}
                      voiceRecording={voiceRecording}
                      voiceTranscribing={voiceTranscribing}
                      onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                      mode={chatMode}
                      onModeChange={setChatMode}
                      provider={chatProvider}
                      onProviderChange={setChatProvider}
                      cliModel={cliModel}
                      onCliModelChange={setCliModel}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      availableFiles={availableFilesForMention}
                      onSearchFiles={handleSearchFiles}
                      workspaceOpen={showWorkspace}
                    />
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <button onClick={() => { clearMessages(); createSession() }} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0">
                          New chat
                        </button>
                        {(viewMode as string) === 'manager' && (
                          <button
                            onClick={() => automation.setSelectedThreadId(null)}
                            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          >
                            New thread
                          </button>
                        )}
                        {approveAllInSession && (
                          <>
                            <span className="text-[11px] text-green-600 dark:text-green-400 truncate">
                              Approved all commands for this session
                            </span>
                            <button
                              onClick={handleClearApproveAll}
                              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            >
                              Clear approve all
                            </button>
                          </>
                        )}
                      </div>
                      {remainingPrompts !== null && (
                        <span className="text-[11px] text-muted-foreground shrink-0">{remainingPrompts} remaining</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {showTerminal && currentView === 'chat' && viewMode === 'developer' && (
          <div className="shrink-0 border-t overflow-hidden" style={{ height: terminalHeight }}>
            <div
              onMouseDown={handleDragStart}
              className="h-1 cursor-row-resize hover:bg-primary/30 transition-colors"
            />
            <div className="relative">
              <TerminalTabs
                terminals={terminals}
                activeTerminalId={activeTerminalId}
                onSelect={setActiveTerminalId}
                onCreate={() => createTerminal(activeSessionId ?? 'default')}
                onKill={handleKillTerminal}
              />
              <button
                onClick={closeTerminalPanel}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close terminal"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {activeTerminalId ? (
              <TerminalView terminalId={activeTerminalId} className="h-[calc(100%-2rem)]" />
            ) : (
              <div className="flex items-center justify-center h-[calc(100%-2rem)] text-sm text-muted-foreground">
                <button
                  onClick={() => createTerminal(activeSessionId ?? 'default')}
                  className="hover:text-foreground transition-colors"
                >
                  + New Terminal
                </button>
              </div>
            )}
          </div>
        )}

        {viewMode === 'developer' && showDebugPanel && (
          <div className="fixed top-14 right-0 bottom-0 w-[420px] border-l z-50 shadow-xl">
            <SSEDebugPanel onClose={() => setShowDebugPanel(false)} />
          </div>
        )}

        <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
          <DialogContent className="sm:max-w-md">
            {gatewayStep === 'url' ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Connect to Gateway
                  </DialogTitle>
                  <DialogDescription>
                    Enter your Jait gateway URL to get started.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={checkGatewayHealth} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="gateway-url">Gateway URL</Label>
                    <Input
                      id="gateway-url"
                      placeholder="https://jait.example.com"
                      value={gatewayUrlInput}
                      onChange={(e) => { setGatewayUrlInput(e.target.value); setGatewayError(null) }}
                      autoFocus
                    />
                  </div>
                  {gatewayError && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <XCircle className="h-4 w-4 shrink-0" />
                      {gatewayError}
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={gatewayChecking}>
                    {gatewayChecking ? (
                      <>
                        <SpinnerIcon className="h-4 w-4 mr-2 animate-spin" />
                        Connecting…
                      </>
                    ) : (
                      'Connect'
                    )}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Account</DialogTitle>
                  <DialogDescription asChild>
                    {isStandaloneApp ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Server className="h-3 w-3 text-green-500" />
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{API_URL}</code>
                        <button
                          type="button"
                          className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
                          onClick={() => setGatewayStep('url')}
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <p>Sign in with a username and password.</p>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <Tabs value={authTab} onValueChange={(value) => setAuthTab(value as 'login' | 'register')}>
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="login">Login</TabsTrigger>
                    <TabsTrigger value="register">Register</TabsTrigger>
                  </TabsList>
                  <TabsContent value="login" className="pt-4">
                    <form className="space-y-4" onSubmit={handleLogin}>
                      <div className="space-y-1.5">
                        <Label htmlFor="login-username">Username</Label>
                        <Input
                          id="login-username"
                          value={loginUsername}
                          onChange={(event) => setLoginUsername(event.target.value)}
                          autoComplete="username"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="login-password">Password</Label>
                        <Input
                          id="login-password"
                          type="password"
                          value={loginPassword}
                          onChange={(event) => setLoginPassword(event.target.value)}
                          autoComplete="current-password"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full">Login</Button>
                    </form>
                  </TabsContent>
                  <TabsContent value="register" className="pt-4">
                    <form className="space-y-4" onSubmit={handleRegister}>
                      <div className="space-y-1.5">
                        <Label htmlFor="register-username">Username</Label>
                        <Input
                          id="register-username"
                          value={registerUsername}
                          onChange={(event) => setRegisterUsername(event.target.value)}
                          autoComplete="username"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="register-password">Password</Label>
                        <Input
                          id="register-password"
                          type="password"
                          value={registerPassword}
                          onChange={(event) => setRegisterPassword(event.target.value)}
                          autoComplete="new-password"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="register-password-confirm">Confirm password</Label>
                        <Input
                          id="register-password-confirm"
                          type="password"
                          value={registerPasswordConfirm}
                          onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                          autoComplete="new-password"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full">Create account</Button>
                    </form>
                  </TabsContent>
                </Tabs>
                {authError && <p className="text-sm text-destructive">{authError}</p>}
              </>
            )}
          </DialogContent>
        </Dialog>

        <FolderPickerDialog
          open={folderPickerOpen}
          onOpenChange={setFolderPickerOpen}
          onSelect={(path, nodeId) => {
            void openRemoteWorkspaceOnGateway(path, nodeId).catch((err) => {
              console.error('Failed to open workspace:', err)
              toast.error(`Failed to open workspace: ${err instanceof Error ? err.message : 'Unknown error'}`)
            })
          }}
        />

        {/* Folder picker for automation repos */}
        <FolderPickerDialog
          open={automation.folderPickerOpen}
          onOpenChange={automation.setFolderPickerOpen}
          onSelect={(path, _nodeId) => { void automation.handleFolderSelected(path) }}
        />

        {/* Strategy editor modal */}
        {strategyRepo && (
          <StrategyModal
            open={!!strategyRepo}
            onOpenChange={(open) => {
              if (!open) {
                setStrategyRepo(null)
                setManagerRepoPreviewVersion((version) => version + 1)
              }
            }}
            repoId={strategyRepo.id}
            repoName={strategyRepo.name}
          />
        )}

        {planRepo && (
          <PlanModal
            open={!!planRepo}
            onOpenChange={(open) => {
              if (!open) {
                setPlanRepo(null)
                setManagerRepoPreviewVersion((version) => version + 1)
              }
            }}
            repoId={planRepo.id}
            repoName={planRepo.name}
            defaultBranch={planRepo.defaultBranch}
            repoLocalPath={planRepo.localPath}
            onStartThread={(task, plan, _repo) => {
              void (async () => {
                const repo = planRepo!
                const branchName = `jait/${Math.random().toString(16).slice(2, 10)}`
                let worktreePath: string | undefined
                try {
                  const wt = await gitApi.createWorktree(repo.localPath, repo.defaultBranch, branchName)
                  worktreePath = wt.path
                } catch {
                  try { await gitApi.createBranch(repo.localPath, branchName, repo.defaultBranch) } catch { /* ignore */ }
                }
                const thread = await agentsApi.createThread({
                  title: `[${repo.name}] ${task.title}`,
                  providerId: chatProvider,
                  workingDirectory: worktreePath ?? repo.localPath,
                  branch: branchName,
                })
                await agentsApi.startThread(thread.id, {
                  message: task.description || task.title,
                  titleTask: task.title,
                  titlePrefix: `[${repo.name}] `,
                })
                // Update the task with the created thread ID
                const updatedTasks = plan.tasks.map((t: any) =>
                  t.id === task.id ? { ...t, status: 'running' as const, threadId: thread.id } : t
                )
                await agentsApi.updatePlan(plan.id, { tasks: updatedTasks })
              })()
            }}
          />
        )}

        {/* Floating screen share window */}
        {showScreenShare && (
          <div
            className="fixed z-50 bg-background border rounded-lg shadow-2xl overflow-hidden flex flex-col"
            style={{
              left: floatingSSPos.x < 0 ? undefined : floatingSSPos.x,
              top: floatingSSPos.y < 0 ? undefined : floatingSSPos.y,
              right: floatingSSPos.x < 0 ? 16 : undefined,
              bottom: floatingSSPos.y < 0 ? 16 : undefined,
              width: floatingSSSize.w,
              height: floatingSSSize.h,
            }}
          >
            <div
              className="flex items-center justify-between h-8 px-3 border-b bg-muted/30 shrink-0 cursor-move select-none"
              onMouseDown={onFloatingDragStart}
            >
              <span className="text-xs font-medium flex items-center gap-1.5">
                <Cast className="h-3 w-3" /> Screen Share
              </span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={closeScreenSharePanel}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <ScreenSharePanel screenShare={screenShare} />
            {/* Resize handle */}
            <div
              className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize opacity-50 hover:opacity-100"
              onMouseDown={onFloatingResizeStart}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" className="text-muted-foreground">
                <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

export default App
