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
  Globe,
  GitBranch,
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
  EllipsisVertical,
  Pause,
  CheckCircle2,
  XCircle,
  Circle,
  AlertCircle,
  Server,
  ScrollText,
  ListChecks,
  Boxes,
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
import { Conversation, Message, PromptInput, SessionSelector, SessionSwitcher, Suggestions, TodoList, MessageQueue, FilesChanged } from '@/components/chat'
import type { ReferencedFile, PromptInputHandle, ChangedFile } from '@/components/chat'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import type { ChatAttachment } from '@/hooks/useChat'
import type { QueuedMessage as QueuedChatMessage } from '@/components/chat/message-queue'
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
import { WorkspacePanel, workspaceLanguageForPath, type WorkspaceFile, type WorkspacePanelHandle, type WorkspaceTabsState } from '@/components/workspace'
import { DetachedTabView } from '@/components/workspace/detached-tab-view'
import { FolderPickerDialog } from '@/components/workspace/folder-picker-dialog'
import { createActivityEvent, type ActivityEvent } from '@jait/ui-shared'
import { ModelIcon, getModelDisplayName, JaitIcon } from '@/components/icons/model-icons'
import { useAuth, type ThemeMode, type SttProvider, type ChatProvider } from '@/hooks/useAuth'
import { useChat, type ChatMode } from '@/hooks/useChat'
import { useModelInfo } from '@/hooks/useModelInfo'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { useUICommands } from '@/hooks/useUICommands'
import { useSessionState } from '@/hooks/useSessionState'
import { useWorkspaceState } from '@/hooks/useWorkspaceState'
import { useAutomation } from '@/hooks/useAutomation'
import { useBrowserCollaboration } from '@/hooks/useBrowserCollaboration'
import { emitPreviewSession } from '@/lib/preview-events'
import { ViewModeSelector } from '@/components/chat/view-mode-selector'
import type { ViewMode } from '@/components/chat/view-mode-selector'
import type { SendTarget } from '@/components/chat/send-target-selector'
import type { WorkspaceOpenData, TerminalFocusData, FsChangesPayload, ArchitectureUpdateData, DevPreviewPanelState, WorkspaceUIState } from '@jait/shared'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/useIsMobile'

import { Badge } from '@/components/ui/badge'
import { BrowserCollaborationPanel } from '@/components/browser/browser-collaboration-panel'
import { getApiUrl, getStoredGatewayUrl, setStoredGatewayUrl, isGatewayConfigured } from '@/lib/gateway-url'
import {
  clampFloatingScreenSharePosition,
  clampFloatingScreenShareSize,
  getDefaultFloatingScreenSharePosition,
} from '@/lib/floating-screen-share'
import { inferThreadRepositoryName, type AutomationRepository, type RepositoryRuntimeInfo } from '@/lib/automation-repositories'
import { agentsApi, type AgentThread, type ProviderId, type RuntimeMode, type ThreadStatus } from '@/lib/agents-api'
import { gitApi } from '@/lib/git-api'
import { triggerSystemNotification } from '@/lib/system-notifications'
import { canStopThread } from '@/lib/thread-status'
import { isPathWithinWorkspace } from '@/lib/workspace-links'
import {
  collapseMobileWorkspace,
  showMobileWorkspacePane,
  toggleMobileWorkspacePane,
} from '@/lib/mobile-workspace-layout'
import {
  type UserMessageSegment,
  type UserTerminalReference,
  userMessageTextFromSegments,
  userReferencedFilesFromSegments,
  userReferencedTerminalsFromSegments,
  userReferencedWorkspacesFromSegments,
} from '@/lib/user-message-segments'

const API_URL = getApiUrl()
const VOICE_LEVEL_BAR_COUNT = 28
const VOICE_LEVEL_FLOOR = 0.05

function shouldAutoTitleSession(name: string | null | undefined) {
  const normalized = name?.trim() ?? ''
  return !normalized || normalized === 'New Chat' || normalized.startsWith('Session ')
}

function deriveSessionTitle(raw: string) {
  const singleLine = raw
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? ''
  if (!singleLine) return ''
  const cleaned = singleLine.replace(/\s+/g, ' ').trim()
  return cleaned.length > 80 ? `${cleaned.slice(0, 77).trimEnd()}...` : cleaned
}

function mergeImageAttachmentsIntoSegments(
  segments: UserMessageSegment[] | undefined,
  attachments: ChatAttachment[] | undefined,
) {
  const nextSegments = [...(segments ?? [])]
  for (const attachment of attachments ?? []) {
    if (!attachment.mimeType.startsWith('image/')) continue
    nextSegments.push({
      type: 'image',
      name: attachment.name,
      mimeType: attachment.mimeType,
      data: attachment.data,
    })
  }
  return nextSegments.length > 0 ? nextSegments : undefined
}

function createSilentVoiceLevels(): number[] {
  return Array.from({ length: VOICE_LEVEL_BAR_COUNT }, () => VOICE_LEVEL_FLOOR)
}

function normalizeTranscript(text: string): string {
  return text.trim()
}

function appendTranscript(prev: string, transcript: string): string {
  const normalizedPrev = prev.trim()
  const normalizedTranscript = normalizeTranscript(transcript)
  if (!normalizedTranscript) return normalizedPrev
  return normalizedPrev ? `${normalizedPrev} ${normalizedTranscript}` : normalizedTranscript
}

function buildFileSelectionReferenceSegments(
  file: ReferencedFile,
  selection: string,
  startLine: number,
  endLine: number,
): UserMessageSegment[] {
  const lineLabel = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`
  return [
    { type: 'text', text: `Selected ${lineLabel} from ${file.path}:\n\`\`\`\n${selection.trim()}\n\`\`\`\n` },
    { type: 'file', path: file.path, name: file.name, ...(file.kind ? { kind: file.kind } : {}) },
  ]
}

function buildTerminalSelectionReferenceSegments(
  terminal: UserTerminalReference,
  selection: string,
): UserMessageSegment[] {
  return [
    { type: 'text', text: `Selected terminal output from ${terminal.name}:\n\`\`\`\n${selection.trim()}\n\`\`\`\n` },
    { type: 'terminal', terminalId: terminal.terminalId, name: terminal.name, ...(terminal.workspaceRoot ? { workspaceRoot: terminal.workspaceRoot } : {}) },
  ]
}

type AppView = 'chat' | 'jobs' | 'network' | 'settings'
type CliProviderId = ProviderId

type ManagerQueuedMessage = QueuedChatMessage & {
  fullContent: string
  referencedFiles?: ReferencedFile[]
  displaySegments?: UserMessageSegment[]
  attachments?: string[]
  providerId: ProviderId
  runtimeMode?: RuntimeMode
  model?: string | null
}

type SavedQueuedMessage = QueuedChatMessage & {
  mode?: ChatMode
  provider?: string
  runtimeMode?: RuntimeMode
  model?: string | null
  referencedFiles?: { path: string; name: string }[]
  displaySegments?: UserMessageSegment[]
}

const suggestions = [
  'What can you help me with?',
  'Explain quantum computing',
  'Write a Python script',
  'What time is it?',
]

const workspaceSuggestions = [
  'Generate architecture diagram',
  'Explain this codebase',
  'Find potential issues',
  'What can you help me with?',
]

function loadLegacyCliModelsByProvider(currentProvider: ProviderId): Partial<Record<CliProviderId, string | null>> {
  const models: Partial<Record<CliProviderId, string | null>> = {}

  try {
    const raw = localStorage.getItem('cliModelsByProvider')
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      for (const providerId of ['jait', 'codex', 'claude-code'] as const) {
        const value = parsed[providerId]
        if (typeof value === 'string' && value.trim()) {
          models[providerId] = value
        }
      }
    }
  } catch {
    // Ignore invalid persisted data and fall back to an empty map.
  }

  const legacyModel = localStorage.getItem('cliModel')
  if (legacyModel && !models[currentProvider]) {
    models[currentProvider] = legacyModel
  }

  return models
}

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

function ThreadPrBadge({ prState }: { prState: 'creating' | 'open' | 'closed' | 'merged' | null | undefined }) {
  if (!prState) return null
  const label =
    prState === 'creating'
      ? 'PR creating'
      : prState === 'open'
      ? 'PR created'
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
    <Badge variant="outline" className={`h-4 shrink-0 whitespace-nowrap px-1 py-0 text-[9px] ${className}`}>
      {label}
    </Badge>
  )
}

function ThreadKindBadge({ kind }: { kind: 'delivery' | 'delegation' }) {
  return (
    <Badge
      variant="outline"
      className={`h-4 shrink-0 whitespace-nowrap px-1 py-0 text-[9px] ${
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
      {runtime.loading ? (
        <SpinnerIcon className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : !runtime.online && (
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
      <div className="flex h-[35px] items-center justify-between border-b px-3">
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
  prState: 'creating' | 'open' | 'closed' | 'merged' | null | undefined
  ghAvailable: boolean
  onOpen: () => void
  onStop: () => void
  onDelete: () => Promise<void>
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
  const [deleting, setDeleting] = useState(false)
  const showThreadActions = thread.kind === 'delivery' && repo != null && (thread.status === 'completed' || Boolean(thread.prUrl))
  const stopThreadVisible = canStopThread(thread)

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
      <div className="flex flex-col gap-0.5">
        <div className="flex w-full min-w-0 items-center gap-1.5">
          <ManagerStatusDot status={thread.status} />
          <div className="flex-1 truncate text-[13px] font-medium sm:text-sm">
            {isTitlePending(thread.title) ? (
              <TitleSkeleton className="h-3.5 w-28" />
            ) : (
              <span>{thread.title.replace(/^\[.*?\]\s*/, '')}</span>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[calc(0.75rem+6px)] text-[11px] leading-tight text-muted-foreground sm:flex-nowrap sm:gap-x-1 sm:gap-y-0 sm:text-xs">
          <span className="min-w-0 basis-full truncate sm:basis-auto">{repoName}</span>
          <ThreadKindBadge kind={thread.kind} />
          {thread.kind === 'delegation' && (
            <span className="shrink-0 text-amber-700 dark:text-amber-300">Helper thread</span>
          )}
          {thread.branch && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="max-w-full truncate font-mono">{thread.branch}</span>
            </>
          )}
          {thread.providerId && thread.providerId !== 'jait' && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="shrink-0 whitespace-nowrap">{thread.providerId}</span>
            </>
          )}
          {thread.executionNodeName && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="inline-flex max-w-full items-center gap-1 truncate text-blue-500 dark:text-blue-400">
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
              baseBranch={repo.defaultBranch}
              threadTitle={thread.title}
              threadStatus={thread.status}
              threadKind={thread.kind}
              prUrl={thread.prUrl}
              prState={prState}
              ghAvailable={ghAvailable}
              showStatusBadge={false}
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
          className="h-6 w-6 rounded-lg opacity-100 transition-opacity sm:h-7 sm:w-7"
          disabled={deleting}
          onClick={(event) => {
            event.stopPropagation()
            setDeleting(true)
            onDelete().finally(() => setDeleting(false))
          }}
        >
          {deleting ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}

interface ManagerActiveThreadsMenuProps {
  threads: AgentThread[]
  getRepositoryForThread: (thread: Pick<AgentThread, 'title' | 'workingDirectory'>) => AutomationRepository | null
  threadPrStates: Record<string, 'creating' | 'open' | 'closed' | 'merged' | null>
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
                    {thread.providerId && thread.providerId !== 'jait' && (
                      <Badge variant="outline" className="h-4 px-1 py-0 text-[9px]">
                        {thread.providerId}
                      </Badge>
                    )}
                    {thread.executionNodeName && (
                      <Badge variant="outline" className="h-4 px-1 py-0 text-[9px] text-blue-500 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                        <Monitor className="inline h-2.5 w-2.5 mr-0.5" />
                        {thread.executionNodeName}
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
                        threadKind={thread.kind}
                        prUrl={thread.prUrl}
                        prState={(thread.id in threadPrStates ? threadPrStates[thread.id] : thread.prState) as 'creating' | 'open' | 'closed' | 'merged' | null | undefined}
                        ghAvailable={ghAvailable}
                        showStatusBadge={false}
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

function App() {
  const [inputValue, setInputValue] = useState('')
  const [inputSegments, setInputSegments] = useState<UserMessageSegment[] | undefined>(undefined)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<AppView>('chat')
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [showSidebar, setShowSidebar] = useState(() => localStorage.getItem('showSessionsSidebar') === 'true')
  const [showTerminal, setShowTerminal] = useState(false)
  const [showManagerRepos, setShowManagerRepos] = useState(false)
  const [strategyRepo, setStrategyRepo] = useState<AutomationRepository | null>(null)
  const [planRepo, setPlanRepo] = useState<AutomationRepository | null>(null)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const showWorkspaceRef = useRef(false)
  const browserCollaborationSessionsRef = useRef<ReturnType<typeof useBrowserCollaboration>['sessions']>([])
  const suppressWorkspaceAutoOpenRef = useRef(false)
  const [devPreviewTarget, setDevPreviewTarget] = useState<string | null>(null)
  const [devPreviewBrowserSessionId, setDevPreviewBrowserSessionId] = useState<string | null>(null)
  const [workspacePreviewRequest, setWorkspacePreviewRequest] = useState<{ target?: string | null; browserSessionId?: string | null; key: number } | null>(null)
  const [workspacePreviewState, setWorkspacePreviewState] = useState<DevPreviewPanelState>({
    open: false,
    target: null,
    browserSessionId: null,
    displayState: 'hidden',
    displayTarget: null,
    storageScope: 'unknown',
  })
  const [showScreenShare, setShowScreenShare] = useState(false)
  const [showWorkspaceTree, setShowWorkspaceTree] = useState(true)
  const [showWorkspaceEditor, setShowWorkspaceEditor] = useState(true)
  const [mobileTreeTab, setMobileTreeTab] = useState<'files' | 'git'>('files')
  const [activeWorkspace, setActiveWorkspace] = useState<{ surfaceId: string; workspaceRoot: string; nodeId?: string } | null>(null)
  const [showDebugPanel, setShowDebugPanel] = useState(() => localStorage.getItem('showDebugPanel') === 'true')
  const [showArchitecture, setShowArchitecture] = useState(false)
  const [architectureDiagram, setArchitectureDiagram] = useState<string | null>(null)
  const [architectureGenerating, setArchitectureGenerating] = useState(false)
  const [architectureRequest, setArchitectureRequest] = useState<{ key: number } | null>(null)
  const architectureRenderRequestIdRef = useRef<string | null>(null)
  const loadedArchitectureWorkspaceRef = useRef<string | null>(null)
  const [terminalHeight, setTerminalHeight] = useState(240)
  const [floatingSSPos, setFloatingSSPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 })
  const [floatingSSSize, setFloatingSSSize] = useState<{ w: number; h: number }>({ w: 420, h: 320 })
  const floatingDragRef = useRef<{ pointerId: number; startX: number; startY: number; posX: number; posY: number } | null>(null)
  const floatingResizeRef = useRef<{ pointerId: number; startX: number; startY: number; w: number; h: number } | null>(null)
  const floatingDragCleanupRef = useRef<(() => void) | null>(null)
  const floatingResizeCleanupRef = useRef<(() => void) | null>(null)
  const [approveAllInSession, setApproveAllInSession] = useState(false)
  const [chatMode, setChatMode] = useState<ChatMode>('agent')
  const [sendTarget, setSendTarget] = useState<SendTarget>('agent')
  const [chatProvider, setChatProvider] = useState<ProviderId>('jait')
  const [chatProviderRuntimeMode, setChatProviderRuntimeMode] = useState<RuntimeMode>('full-access')
  const [cliModelsByProvider, setCliModelsByProvider] = useState<Partial<Record<CliProviderId, string | null>>>(
    () => loadLegacyCliModelsByProvider('jait')
  )
  const cliModel = cliModelsByProvider[chatProvider] ?? null
  const [viewMode, setViewMode] = useState<ViewMode>('developer')
  const prevViewModeRef = useRef<ViewMode>(viewMode)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('')
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [serverHasUsers, setServerHasUsers] = useState<boolean | null>(null)
  const [gatewayUrlInput, setGatewayUrlInput] = useState(() => getStoredGatewayUrl() ?? '')
  const isStandaloneApp = !!(window as any).jaitDesktop || !!(window as any).Capacitor
  const isElectron = !!(window as any).jaitDesktop
  const isCapacitor = !!(window as any).Capacitor
  const appPlatform: 'web' | 'electron' | 'capacitor' = isElectron ? 'electron' : isCapacitor ? 'capacitor' : 'web'
  const detachedWorkspaceTabId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('detachedWorkspaceTab')
    : null

  if (detachedWorkspaceTabId) {
    return <DetachedTabView detachedTabId={detachedWorkspaceTabId} />
  }

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
  const [availableFilesForMention, setAvailableFilesForMention] = useState<{ path: string; name: string; kind?: 'file' | 'dir' }[]>([])
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [workspacePickerMode, setWorkspacePickerMode] = useState<'workspace' | 'editor'>('workspace')
  const [changeDirectoryWorkspaceId, setChangeDirectoryWorkspaceId] = useState<string | null>(null)
  const [fsNodes, setFsNodes] = useState<import('@jait/shared').FsNode[]>([])
  const isDragging = useRef(false)
  const workspaceRef = useRef<WorkspacePanelHandle>(null)
  const promptInputRef = useRef<PromptInputHandle>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    showWorkspaceRef.current = showWorkspace
  }, [showWorkspace])

  // Native filesystem watcher — incremented whenever the server pushes fs.changes
  const [fsWatcherVersion, setFsWatcherVersion] = useState(0)
  const showDesktopWorkspace = !isMobile && showWorkspace
  const showMobileWorkspace = isMobile && showWorkspace
  const showWorkspaceEditorPanel = useCallback(() => {
    if (isMobile) {
      const nextLayout = showMobileWorkspacePane('editor')
      setShowWorkspaceTree(nextLayout.tree)
      setShowWorkspaceEditor(nextLayout.editor)
      return
    }
    setShowWorkspaceEditor(true)
  }, [isMobile])
  const showWorkspaceTreePanel = useCallback(() => {
    if (isMobile) {
      const nextLayout = showMobileWorkspacePane('tree')
      setShowWorkspaceTree(nextLayout.tree)
      setShowWorkspaceEditor(nextLayout.editor)
      return
    }
    setShowWorkspaceTree(true)
  }, [isMobile])
  const openArchitectureInWorkspace = useCallback((workspaceRoot?: string | null) => {
    const targetWorkspaceRoot = workspaceRoot?.trim() || activeWorkspace?.workspaceRoot || null
    if (!targetWorkspaceRoot) return
    setActiveWorkspace((prev) => {
      if (prev?.workspaceRoot === targetWorkspaceRoot) return prev
      return {
        surfaceId: prev?.surfaceId ?? '',
        workspaceRoot: targetWorkspaceRoot,
        nodeId: prev?.nodeId,
      }
    })
    setViewMode('developer')
    if (!showWorkspace) {
      showWorkspaceRef.current = true
      setShowWorkspace(true)
    }
    showWorkspaceEditorPanel()
    setArchitectureRequest({ key: Date.now() })
  }, [activeWorkspace?.workspaceRoot, showWorkspace, showWorkspaceEditorPanel])
  const closeWorkspacePreview = useCallback(() => {
    workspaceRef.current?.closePreviewTarget()
  }, [])
  const resolveBrowserSessionPreviewTarget = useCallback((browserSessionId?: string | null) => {
    const trimmedId = browserSessionId?.trim()
    if (!trimmedId) return null
    const session = browserCollaborationSessionsRef.current.find((item) => item.id === trimmedId)
    return session?.previewUrl?.trim() || session?.targetUrl?.trim() || null
  }, [])
  const routePreviewToWorkspace = useCallback((target?: string | null, workspaceRoot?: string | null, browserSessionId?: string | null) => {
    const trimmed = target?.trim() || resolveBrowserSessionPreviewTarget(browserSessionId) || null
    const nextBrowserSessionId = browserSessionId?.trim() || null
    setViewMode('developer')
    setDevPreviewTarget(trimmed)
    setDevPreviewBrowserSessionId(nextBrowserSessionId)
    if (workspaceRoot?.trim()) {
      setActiveWorkspace((prev) => {
        if (prev?.workspaceRoot === workspaceRoot.trim()) return prev
        return { surfaceId: prev?.surfaceId ?? '', workspaceRoot: workspaceRoot.trim(), nodeId: prev?.nodeId }
      })
    }
    if (!showWorkspace) {
      showWorkspaceRef.current = true
      setShowWorkspace(true)
    }
    showWorkspaceEditorPanel()
    setWorkspacePreviewRequest({ target: trimmed, browserSessionId: nextBrowserSessionId, key: Date.now() })
    return true
  }, [resolveBrowserSessionPreviewTarget, showWorkspace, showWorkspaceEditorPanel])

  const getFloatingViewport = useCallback(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }), [])

  const getDefaultFloatingPos = useCallback((size = floatingSSSize) => (
    getDefaultFloatingScreenSharePosition({
      size,
      viewport: getFloatingViewport(),
    })
  ), [floatingSSSize, getFloatingViewport])

  const onFloatingDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' && e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button, [role="button"], a, input, textarea, select')) return
    e.preventDefault()
    const dragTarget = e.currentTarget

    const viewport = getFloatingViewport()
    const nextSize = clampFloatingScreenShareSize({ size: floatingSSSize, viewport })
    const nextPos = floatingSSPos.x < 0 || floatingSSPos.y < 0
      ? getDefaultFloatingPos(nextSize)
      : clampFloatingScreenSharePosition({ position: floatingSSPos, size: nextSize, viewport })

    if (nextSize.w !== floatingSSSize.w || nextSize.h !== floatingSSSize.h) {
      setFloatingSSSize(nextSize)
    }
    if (nextPos.x !== floatingSSPos.x || nextPos.y !== floatingSSPos.y) {
      setFloatingSSPos(nextPos)
    }

    floatingDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      posX: nextPos.x,
      posY: nextPos.y,
    }

    const onMove = (ev: PointerEvent) => {
      if (!floatingDragRef.current || floatingDragRef.current.pointerId !== ev.pointerId) return
      setFloatingSSPos(clampFloatingScreenSharePosition({
        position: {
          x: floatingDragRef.current.posX + ev.clientX - floatingDragRef.current.startX,
          y: floatingDragRef.current.posY + ev.clientY - floatingDragRef.current.startY,
        },
        size: nextSize,
        viewport: getFloatingViewport(),
      }))
    }
    const cleanup = () => {
      if (dragTarget.hasPointerCapture?.(e.pointerId)) {
        dragTarget.releasePointerCapture?.(e.pointerId)
      }
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      floatingDragCleanupRef.current = null
    }
    const onUp = (ev: PointerEvent) => {
      if (!floatingDragRef.current || floatingDragRef.current.pointerId !== ev.pointerId) return
      floatingDragRef.current = null
      cleanup()
    }

    if (e.pointerType !== 'touch') {
      document.body.style.cursor = 'move'
    }
    document.body.style.userSelect = 'none'
    floatingDragCleanupRef.current?.()
    floatingDragCleanupRef.current = cleanup
    dragTarget.setPointerCapture?.(e.pointerId)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }, [floatingSSPos, floatingSSSize, getDefaultFloatingPos, getFloatingViewport])

  const onFloatingResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget

    const viewport = getFloatingViewport()
    const nextSize = clampFloatingScreenShareSize({ size: floatingSSSize, viewport })
    if (nextSize.w !== floatingSSSize.w || nextSize.h !== floatingSSSize.h) {
      setFloatingSSSize(nextSize)
    }

    floatingResizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      w: nextSize.w,
      h: nextSize.h,
    }

    const onMove = (ev: PointerEvent) => {
      if (!floatingResizeRef.current || floatingResizeRef.current.pointerId !== ev.pointerId) return
      const resized = clampFloatingScreenShareSize({
        size: {
          w: floatingResizeRef.current.w + ev.clientX - floatingResizeRef.current.startX,
          h: floatingResizeRef.current.h + ev.clientY - floatingResizeRef.current.startY,
        },
        viewport: getFloatingViewport(),
      })
      setFloatingSSSize(resized)
      setFloatingSSPos((prev) => (
        prev.x < 0 || prev.y < 0
          ? prev
          : clampFloatingScreenSharePosition({
            position: prev,
            size: resized,
            viewport: getFloatingViewport(),
          })
      ))
    }
    const cleanup = () => {
      if (target.hasPointerCapture?.(e.pointerId)) {
        target.releasePointerCapture?.(e.pointerId)
      }
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      floatingResizeCleanupRef.current = null
    }
    const onUp = (ev: PointerEvent) => {
      if (!floatingResizeRef.current || floatingResizeRef.current.pointerId !== ev.pointerId) return
      floatingResizeRef.current = null
      cleanup()
    }

    if (e.pointerType !== 'touch') {
      document.body.style.cursor = 'nwse-resize'
    }
    document.body.style.userSelect = 'none'
    floatingResizeCleanupRef.current?.()
    floatingResizeCleanupRef.current = cleanup
    target.setPointerCapture?.(e.pointerId)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }, [floatingSSSize, getFloatingViewport])

  useEffect(() => {
    if (showScreenShare) return
    floatingDragRef.current = null
    floatingResizeRef.current = null
    floatingDragCleanupRef.current?.()
    floatingResizeCleanupRef.current?.()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [showScreenShare])

  useEffect(() => {
    return () => {
      floatingDragCleanupRef.current?.()
      floatingResizeCleanupRef.current?.()
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  useEffect(() => {
    if (!showScreenShare) return

    const syncFloatingScreenShareBounds = () => {
      const viewport = getFloatingViewport()
      let clampedSize: { w: number; h: number } | undefined
      setFloatingSSSize(prev => {
        const next = clampFloatingScreenShareSize({ size: prev, viewport })
        clampedSize = next
        return (next.w === prev.w && next.h === prev.h) ? prev : next
      })
      setFloatingSSPos(prev => {
        if (prev.x < 0 && prev.y < 0) return prev
        const next = clampFloatingScreenSharePosition({
          position: prev,
          size: clampedSize!,
          viewport,
        })
        return (next.x === prev.x && next.y === prev.y) ? prev : next
      })
    }

    syncFloatingScreenShareBounds()
    window.addEventListener('resize', syncFloatingScreenShareBounds)
    return () => window.removeEventListener('resize', syncFloatingScreenShareBounds)
  }, [showScreenShare, getFloatingViewport])

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
  const browserCollaboration = useBrowserCollaboration(token, isAuthenticated)
  browserCollaborationSessionsRef.current = browserCollaboration.sessions

  // ── Update check/apply handlers ────────────────────────────────
  const handleCheckUpdate = useCallback(async () => {
    if (!token) return
    setUpdateChecking(true)
    try {
      if (isElectron) {
        const desktop = (window as any).jaitDesktop
        const [info, result, healthRes] = await Promise.all([
          desktop.getInfo?.() as Promise<{ appVersion: string }>,
          desktop.checkForUpdate() as Promise<{ updateAvailable: boolean; version?: string }>,
          fetch(`${API_URL}/health`).then(r => r.ok ? r.json() as Promise<{ version?: string }> : null).catch(() => null),
        ])
        const gatewayVersion = (healthRes as { version?: string } | null)?.version ?? ''
        setUpdateInfo({
          currentVersion: gatewayVersion,
          latestVersion: result.version ?? info?.appVersion ?? '',
          hasUpdate: result.updateAvailable,
        })
      } else {
        const res = await fetch(`${API_URL}/api/update/check`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          setUpdateInfo(await res.json() as UpdateInfo)
        }
      }
    } catch { /* ignore */ }
    setUpdateChecking(false)
  }, [token, isElectron])

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
    browserCollaboration.setWsConnected(connected)
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
  }, [handleCheckUpdate, browserCollaboration])

  // Auto-check for updates on mount (once authenticated)
  useEffect(() => {
    if (token) void handleCheckUpdate()
  }, [token, handleCheckUpdate])

  const onLoginRequired = useCallback(() => setShowLoginDialog(true), [])

  // Fetch filesystem nodes for workspace node tags
  useEffect(() => {
    if (!token) return
    void fetch(`${API_URL}/api/filesystem/nodes`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.nodes) setFsNodes(data.nodes) })
      .catch(() => {})
  }, [token])

  const {
    workspaces,
    archivedSessionsByWorkspace,
    activeWorkspaceId,
    activeSessionId,
    loading: workspacesLoading,
    createSession,
    createWorkspace,
    updateWorkspace,
    switchWorkspace,
    switchSession,
    fetchArchivedSessions,
    removeWorkspace,
    clearArchivedWorkspaces,
    fetchArchivedWorkspaces,
    restoreWorkspace,
    renameSession,
    fetchWorkspaces,
    hasMoreWorkspaces,
    showMoreWorkspaces,
    showFewerWorkspaces,
    workspaceListLimit,
  } = useWorkspaces(
    token,
    onLoginRequired,
  )
  useEffect(() => {
    suppressWorkspaceAutoOpenRef.current = false
  }, [activeSessionId])

  const activeWorkspaceRecord = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  )
  const activeSessionRecord = useMemo(
    () => activeWorkspaceRecord?.sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, activeWorkspaceRecord],
  )
  const activeWorkspaceSessions = useMemo(() => {
    if (!activeWorkspaceRecord) return []
    const active = activeWorkspaceRecord.sessions
    const archived = archivedSessionsByWorkspace[activeWorkspaceRecord.id] ?? []
    const seen = new Set<string>()
    return [...active, ...archived]
      .filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true })
      .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
  }, [activeWorkspaceRecord, archivedSessionsByWorkspace])
  const handleChangeDirectory = useCallback((workspaceId: string) => {
    setChangeDirectoryWorkspaceId(workspaceId)
    setFolderPickerOpen(true)
  }, [])

  const confirmDialog = useConfirmDialog()
  const handleRemoveWorkspace = useCallback(async (workspaceId: string) => {
    const workspace = workspaces.find(w => w.id === workspaceId)
    const confirmed = await confirmDialog({
      title: 'Archive workspace',
      description: `Are you sure you want to archive "${workspace?.title || workspace?.rootPath || 'this workspace'}"? You can clear archived workspaces later from Settings.`,
      confirmLabel: 'Archive',
      variant: 'destructive',
    })
    if (!confirmed) return
    const removed = await removeWorkspace(workspaceId)
    if (removed) {
      toast.success('Workspace archived.')
      return
    }
    toast.error('Failed to archive workspace.')
  }, [confirmDialog, removeWorkspace, workspaces])
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
    completionCount,
    contextUsage,
    sessionInfo,
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
    reorderQueueItem,
    setMessageQueueState,
    acceptFile,
    rejectFile,
    acceptAllFiles,
    rejectAllFiles,
    setTodoList,
    addChangedFile,
    setChangedFiles,
    setOnChangedFilesSync,
    refreshMessages,
  } = useChat(activeSessionId, token, onLoginRequired, activeWorkspace?.surfaceId ?? null)
  const [managerMessageQueues, setManagerMessageQueues] = useState<Record<string, ManagerQueuedMessage[]>>({})
  const [remoteMessageCompleteCount, setRemoteMessageCompleteCount] = useState(0)
  const managerQueueProcessingRef = useRef(new Set<string>())
  const { terminals, activeTerminalId, setActiveTerminalId, createTerminal, killTerminal, refresh } = useTerminals(token)
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
  const compactManagerToolbar = isMobile && viewMode === 'manager' && Boolean(automation.selectedThread)
  const selectedManagerQueue = useMemo(
    () => (automation.selectedThread ? managerMessageQueues[automation.selectedThread.id] ?? [] : []),
    [automation.selectedThread, managerMessageQueues],
  )
  const canTargetThread = automation.selectedRepo != null
  const selectedRepoOffline = selectedRepoRuntime != null && !selectedRepoRuntime.online && !selectedRepoRuntime.loading
  const threadComposerDisabled = automation.creating || !canTargetThread || selectedRepoOffline
  const threadPlaceholder = !automation.selectedRepo
    ? 'Select a repository to start a thread...'
    : selectedRepoOffline
      ? 'Repository is offline...'
      : automation.selectedThread
        ? 'Send a follow-up to the selected thread...'
        : 'Describe what you want to do...'
  const developerPlaceholder = sendTarget === 'thread'
    ? threadPlaceholder
    : 'Ask anything...'


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
  const wsFullStateReceivedRef = useRef(false)
  const suppressedUiSyncKeysRef = useRef<Set<string>>(new Set())

  // Workspace-scoped state delivered by WS full-state push that depends on
  // activeWorkspaceRecord (loaded async from REST). Stashed here by
  // handleFullState and applied by a deferred effect once the record loads.
  const pendingWsWorkspaceStateRef = useRef<{
    workspaceId: string
    ui: WorkspaceUIState
  } | null>(null)
  // Bumped when the ref is set so the deferred effect re-runs even if
  // activeWorkspaceRecord was already available before the WS push arrived.
  const [pendingWsVersion, setPendingWsVersion] = useState(0)

  const suppressNextUiSync = useCallback((key: string) => {
    suppressedUiSyncKeysRef.current.add(key)
  }, [])

  const consumeSuppressedUiSync = useCallback((key: string): boolean => {
    if (!suppressedUiSyncKeysRef.current.has(key)) return false
    suppressedUiSyncKeysRef.current.delete(key)
    return true
  }, [])

  // Reset the flag on session switch so the next full-state push takes effect
  useEffect(() => {
    wsFullStateReceivedRef.current = false
  }, [activeSessionId])

  useEffect(() => {
    setInputSegments(undefined)
  }, [activeSessionId])

  const handleMessageComplete = useCallback(() => {
    refreshMessages()
    setRemoteMessageCompleteCount((prev) => prev + 1)
  }, [refreshMessages])

  const chatQueueSeenRef = useRef(false)
  const lastChatNotificationSignalRef = useRef(0)
  const chatNotificationSessionRef = useRef<string | null>(activeSessionId)
  const suppressNextChatNotificationRef = useRef(false)
  const threadQueueSeenRef = useRef<Record<string, boolean>>({})
  const pendingThreadCompletionRef = useRef<Record<string, AgentThread>>({})
  const previousThreadStatusesRef = useRef<Record<string, ThreadStatus>>({})

  useEffect(() => {
    if (messageQueue.length > 0) {
      chatQueueSeenRef.current = true
    }
  }, [messageQueue.length])

  const chatCompletionSignal = completionCount + remoteMessageCompleteCount

  useEffect(() => {
    if (chatNotificationSessionRef.current === activeSessionId) return
    chatNotificationSessionRef.current = activeSessionId
    setRemoteMessageCompleteCount(0)
    chatQueueSeenRef.current = false
    suppressNextChatNotificationRef.current = false
    lastChatNotificationSignalRef.current = chatCompletionSignal
  }, [activeSessionId, chatCompletionSignal])

  useEffect(() => {
    if (isLoading) {
      suppressNextChatNotificationRef.current = false
    }
  }, [isLoading])

  useEffect(() => {
    if (chatCompletionSignal <= lastChatNotificationSignalRef.current) return
    if (isLoading || isLoadingHistory || messageQueue.length > 0) return

    const queueFinished = chatQueueSeenRef.current
    lastChatNotificationSignalRef.current = chatCompletionSignal
    chatQueueSeenRef.current = false
    if (suppressNextChatNotificationRef.current) {
      suppressNextChatNotificationRef.current = false
      return
    }

    void triggerSystemNotification({
      id: `chat-complete:${activeSessionId ?? 'global'}:${chatCompletionSignal}`,
      title: queueFinished ? 'Queued chat finished' : 'Chat finished',
      body: queueFinished
        ? 'All queued chat messages finished generating.'
        : 'Agent response finished generating.',
      level: 'success',
      includeToast: false,
    })
  }, [activeSessionId, chatCompletionSignal, isLoading, isLoadingHistory, messageQueue.length])

  useEffect(() => {
    const nextStatuses: Record<string, ThreadStatus> = {}
    const activeThreadIds = new Set<string>()

    for (const thread of automation.threads) {
      activeThreadIds.add(thread.id)
      nextStatuses[thread.id] = thread.status
      const queueLength = managerMessageQueues[thread.id]?.length ?? 0
      if (queueLength > 0) {
        threadQueueSeenRef.current[thread.id] = true
      }

      const previousStatus = previousThreadStatusesRef.current[thread.id]
      if (previousStatus === 'running' && thread.status !== 'running') {
        pendingThreadCompletionRef.current[thread.id] = thread
      } else if (pendingThreadCompletionRef.current[thread.id]) {
        pendingThreadCompletionRef.current[thread.id] = thread
      }

      if (pendingThreadCompletionRef.current[thread.id] && queueLength === 0) {
        const completedThread = pendingThreadCompletionRef.current[thread.id]
        const queueFinished = threadQueueSeenRef.current[thread.id] === true

        delete pendingThreadCompletionRef.current[thread.id]
        delete threadQueueSeenRef.current[thread.id]

        if (completedThread.status === 'interrupted') {
          continue
        }

        const title = queueFinished ? 'Queued thread finished' : 'Thread finished'
        const body = completedThread.status === 'completed'
          ? `"${completedThread.title}" completed.`
          : `"${completedThread.title}" ended with status ${completedThread.status}.`

        void triggerSystemNotification({
          id: `thread-complete:${thread.id}:${completedThread.updatedAt}`,
          title,
          body,
          level: completedThread.status === 'completed' ? 'success' : 'warning',
          includeToast: false,
        })
      }
    }

    for (const threadId of Object.keys(previousThreadStatusesRef.current)) {
      if (activeThreadIds.has(threadId)) continue
      delete threadQueueSeenRef.current[threadId]
      delete pendingThreadCompletionRef.current[threadId]
    }

    previousThreadStatusesRef.current = nextStatuses
  }, [automation.threads, managerMessageQueues])

  const handleCancelRequest = useCallback(() => {
    suppressNextChatNotificationRef.current = true
    cancelRequest()
  }, [cancelRequest])

  // ── Unified workspace UI state (single DB row) ─────────────────────
  const [workspaceUI, setWorkspaceUI] = useWorkspaceState<WorkspaceUIState>(
    activeWorkspaceId, 'workspace.ui', token,
  )
  const workspaceUIRef = useRef<WorkspaceUIState | null>(null)
  workspaceUIRef.current = workspaceUI

  // Merge helper: updates one slice of the unified state and persists.
  // Eagerly update the ref so consecutive calls within the same render
  // cycle each see the previous call's updates instead of clobbering them.
  const updateWorkspaceUI = useCallback(<K extends keyof WorkspaceUIState>(
    key: K, value: WorkspaceUIState[K],
  ) => {
    const prev = workspaceUIRef.current ?? { panel: null, tabs: null, layout: null, terminal: null, preview: null }
    const next = { ...prev, [key]: value }
    workspaceUIRef.current = next
    setWorkspaceUI(next)
  }, [setWorkspaceUI])

  // Derived convenience setters matching previous per-key API
  const setSavedWorkspace = useCallback((v: { open: boolean; remotePath: string; surfaceId?: string; nodeId?: string } | null) => {
    updateWorkspaceUI('panel', v)
  }, [updateWorkspaceUI])

  const setSavedTerminal = useCallback((v: { open: boolean } | null) => {
    updateWorkspaceUI('terminal', v)
  }, [updateWorkspaceUI])

  const setSavedDevPreview = useCallback((v: DevPreviewPanelState | null) => {
    updateWorkspaceUI('preview', v)
  }, [updateWorkspaceUI])

  const loadingWorkspaceLayout = !workspaceUI && !!activeWorkspaceId && !!token
  const setSavedWorkspaceLayout = useCallback((v: { tree: boolean; editor: boolean } | null) => {
    updateWorkspaceUI('layout', v)
  }, [updateWorkspaceUI])

  const setSavedWorkspaceTabs = useCallback((v: WorkspaceTabsState | null) => {
    updateWorkspaceUI('tabs', v)
  }, [updateWorkspaceUI])

  const savedDevPreview = workspaceUI?.preview ?? null

  const [, setSavedScreenShare] = useSessionState<{ open: boolean }>(
    activeSessionId, 'screen-share.panel', token,
  )
  const [, setSavedChatMode, loadingChatMode] = useSessionState<ChatMode>(
    activeSessionId, 'chat.mode', token,
  )
  const [, setSavedProviderRuntimeMode, loadingProviderRuntimeMode] = useSessionState<RuntimeMode>(
    activeSessionId, 'chat.providerRuntimeMode', token,
  )
  const [, setSavedCliModels, loadingCliModels] = useSessionState<Partial<Record<CliProviderId, string | null>>>(
    activeSessionId, 'chat.cliModels', token,
  )
  const [, setSavedChatView, loadingChatView] = useSessionState<ViewMode>(
    activeSessionId, 'chat.view', token,
  )
  const [, setSavedQueuedMessages] = useSessionState<SavedQueuedMessage[]>(
    activeSessionId, 'queued_messages', token,
  )
  const [workspaceTabsState, setWorkspaceTabsState] = useState<WorkspaceTabsState | null>(null)
  const [workspaceStateReady, setWorkspaceStateReady] = useState(false)

  useEffect(() => {
    setWorkspaceTabsState(null)
    setWorkspaceStateReady(false)
  }, [activeWorkspaceId])

  useEffect(() => {
    setWorkspacePreviewRequest(null)
  }, [activeWorkspaceId])

  // Reset active workspace state when switching workspaces so the editor
  // doesn't keep showing the previous workspace's directory.
  useEffect(() => {
    setActiveWorkspace(null)
  }, [activeWorkspaceId])

  // ── Persistent session state for changed files ─────────────────────
  type SavedChangedFile = ChangedFile | { path: string; name: string; state?: 'undecided' | 'accepted' | 'rejected' | null }
  const [, setSavedChangedFiles] = useSessionState<SavedChangedFile[]>(activeSessionId, 'changed_files', token)

  // ── Deferred workspace state from WS push ──────────────────────────
  // Panel and preview fields depend on activeWorkspaceRecord (loaded async
  // from REST). This effect applies the stashed WS state once available.
  useEffect(() => {
    const pending = pendingWsWorkspaceStateRef.current
    if (!pending) {
      // No stashed WS state to apply — if the workspace record is loaded,
      // we know there's nothing deferred and can unblock persisting.
      if (activeWorkspaceRecord) setWorkspaceStateReady(true)
      return
    }
    if (!activeWorkspaceRecord) return
    if (pending.workspaceId !== activeWorkspaceId) return

    const { ui } = pending

    // Apply workspace panel
    const wp = ui.panel
    if (wp) {
      const savedPath = wp.remotePath?.trim() || null
      const recordedPath = activeWorkspaceRecord.rootPath?.trim() || null
      const restoredPath = recordedPath || savedPath
      if (restoredPath) {
        const pathMatchesRecord = Boolean(savedPath && recordedPath && savedPath === recordedPath)
        setActiveWorkspace({
          surfaceId: pathMatchesRecord ? (wp.surfaceId ?? '') : '',
          workspaceRoot: restoredPath,
          nodeId: activeWorkspaceRecord.nodeId ?? wp.nodeId,
        })
        showWorkspaceRef.current = wp.open === true
        setShowWorkspace(wp.open === true)
      }
    }

    // Re-apply workspace tabs — the reset effect
    // (setWorkspaceTabsState(null) on activeWorkspaceId change) may have
    // wiped the value that handleFullState set if the session state loaded
    // (changing activeWorkspaceId) after the WS push arrived.
    if (ui.tabs) setWorkspaceTabsState(ui.tabs)

    // Apply dev preview
    const dp = ui.preview
    if (dp) {
      const nextTarget = dp.target?.trim() || null
      if (nextTarget) setDevPreviewTarget(nextTarget)
      setDevPreviewBrowserSessionId(dp.browserSessionId?.trim() || null)
      if (dp.open) {
        routePreviewToWorkspace(nextTarget, dp.workspaceRoot ?? null, dp.browserSessionId ?? null)
      }
    }

    pendingWsWorkspaceStateRef.current = null
    setWorkspaceStateReady(true)
  }, [activeWorkspaceRecord, activeWorkspaceId, pendingWsVersion, routePreviewToWorkspace]) // eslint-disable-line react-hooks/exhaustive-deps

  const mobileWorkspaceInitKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!showMobileWorkspace) {
      mobileWorkspaceInitKeyRef.current = null
      return
    }
    const workspaceKey = `${activeWorkspaceId ?? 'no-workspace'}:${activeWorkspace?.surfaceId ?? activeWorkspace?.workspaceRoot ?? 'no-workspace'}`
    if (mobileWorkspaceInitKeyRef.current === workspaceKey) return
    mobileWorkspaceInitKeyRef.current = workspaceKey
    if (!showWorkspaceTree || !showWorkspaceEditor) return
    const nextLayout = collapseMobileWorkspace()
    setShowWorkspaceTree(nextLayout.tree)
    setShowWorkspaceEditor(nextLayout.editor)
  }, [showMobileWorkspace, activeWorkspaceId, activeWorkspace?.surfaceId, activeWorkspace?.workspaceRoot, showWorkspaceTree, showWorkspaceEditor])

  // ── Cross-client state sync handler ───────────────────────────────
  const handleStateSync = useCallback((key: string, value: unknown) => {
    suppressNextUiSync(key)
    switch (key) {
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
      case 'chat.mode':
        if (value === 'ask' || value === 'agent' || value === 'plan') {
          setChatMode(value)
        }
        break
      case 'chat.providerRuntimeMode':
        if (value === 'supervised' || value === 'full-access') {
          setChatProviderRuntimeMode(value)
        } else if (value === null) {
          setChatProviderRuntimeMode('full-access')
        }
        break
      case 'chat.cliModels':
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          setCliModelsByProvider(value as Partial<Record<CliProviderId, string | null>>)
        } else if (value === null) {
          setCliModelsByProvider({})
        }
        break
      case 'chat.view':
        if (value === 'developer' || value === 'manager') {
          setViewMode(value)
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
      case 'queued_messages': {
        if (Array.isArray(value)) {
          setMessageQueueState(value as SavedQueuedMessage[])
        } else if (value === null) {
          setMessageQueueState([])
        }
        break
      }
    }
  }, [setTodoList, addChangedFile, setChangedFiles, setMessageQueueState, routePreviewToWorkspace, closeWorkspacePreview, isMobile, suppressNextUiSync])

  // ── Full state hydration from backend (authoritative, pushed on subscribe) ──
  // This is called when the WebSocket delivers the initial full-state push.
  // It contains ALL session-scoped state AND workspace-scoped state (in the
  // `_workspace` envelope) so the UI can hydrate in a single message without
  // waiting for REST round-trips.
  //
  // AGENT NOTE: To handle a new persisted state key here:
  //   1. Add a case below for the key (session-scoped keys directly,
  //      workspace-scoped keys in the `_workspace.state` section).
  //   2. Session keys: apply directly in this callback.
  //      Workspace keys that depend on activeWorkspaceRecord: stash in
  //      `pendingWsWorkspaceStateRef` — the deferred effect will apply them.
  //   3. Backend: session keys are automatically included.  Workspace keys
  //      are automatically included via `_workspace` in index.ts.
  const handleFullState = useCallback((state: Record<string, unknown>) => {
    wsFullStateReceivedRef.current = true
    for (const key of Object.keys(state)) suppressNextUiSync(key)

    // ── Session-scoped state ──────────────────────────────────────

    // Screen share panel
    const sp = state['screen-share.panel'] as { open?: boolean } | null | undefined
    if (sp && sp.open !== false) {
      setShowScreenShare(true)
    } else {
      setShowScreenShare(false)
    }

    const cm = state['chat.mode']
    if (cm === 'ask' || cm === 'agent' || cm === 'plan') {
      setChatMode(cm)
    }

    const cprm = state['chat.providerRuntimeMode']
    if (cprm === 'supervised' || cprm === 'full-access') {
      setChatProviderRuntimeMode(cprm)
    } else {
      setChatProviderRuntimeMode('full-access')
    }

    const ccm = state['chat.cliModels']
    if (ccm && typeof ccm === 'object' && !Array.isArray(ccm)) {
      setCliModelsByProvider(ccm as Partial<Record<CliProviderId, string | null>>)
    } else {
      const migrated = loadLegacyCliModelsByProvider(chatProvider)
      setCliModelsByProvider(migrated)
    }

    const cv = state['chat.view']
    if (cv === 'developer' || cv === 'manager') {
      setViewMode(cv)
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
    } else {
      setChangedFiles([])
    }

    const qm = state['queued_messages']
    if (Array.isArray(qm)) {
      setMessageQueueState(qm as SavedQueuedMessage[])
    } else {
      setMessageQueueState([])
    }

    // ── Workspace-scoped state (bundled inside _workspace envelope) ──
    // All workspace UI state is stored under a single `workspace.ui` key.
    // Simple fields are applied immediately; fields that depend on
    // activeWorkspaceRecord are stashed for deferred application.
    const wsEnvelope = state._workspace as { id: string; state: Record<string, unknown> } | null | undefined
    if (wsEnvelope?.id && wsEnvelope.state) {
      const ui = wsEnvelope.state['workspace.ui'] as WorkspaceUIState | null | undefined

      if (ui) {
        // Terminal panel
        if (ui.terminal?.open) {
          setShowTerminal(true)
        } else {
          setShowTerminal(false)
        }

        // Workspace tabs
        if (ui.tabs) setWorkspaceTabsState(ui.tabs)

        // Workspace layout
        if (ui.layout) {
          setShowWorkspaceTree(ui.layout.tree !== false)
          setShowWorkspaceEditor(ui.layout.editor !== false)
        }

        // Stash the full UI state for deferred panel + preview application
        pendingWsWorkspaceStateRef.current = {
          workspaceId: wsEnvelope.id,
          ui,
        }
        setPendingWsVersion(v => v + 1)
      }
    }
  }, [setTodoList, setChangedFiles, setMessageQueueState, chatProvider, suppressNextUiSync, isMobile])

  const { sendUIState, sendArchitectureRenderResult } = useUICommands({
    sessionId: activeSessionId,
    token,
    onStateSync: handleStateSync,
    onFullState: handleFullState,
    onMessageComplete: handleMessageComplete,
    onThreadEvent: automation.handleThreadEvent,
    onConnectionStateChange: handleUiConnectionStateChange,
    onFsChanges: useCallback((_payload: FsChangesPayload) => {
      setFsWatcherVersion(v => v + 1)
    }, []),
    listeners: {
      'workspace.open': useCallback((data: WorkspaceOpenData) => {
        setActiveWorkspace({ surfaceId: data.surfaceId, workspaceRoot: data.workspaceRoot, nodeId: data.nodeId })
        const state = { open: showWorkspaceRef.current, remotePath: data.workspaceRoot, surfaceId: data.surfaceId, nodeId: data.nodeId }
        setSavedWorkspace(state)
      }, [setSavedWorkspace]),
      'workspace.close': useCallback(() => {
        showWorkspaceRef.current = false
        setShowWorkspace(false)
        setActiveWorkspace(null)
        setShowArchitecture(false)
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
      'dev-preview.open': useCallback((data: { target?: string | null; workspaceRoot?: string | null }) => {
        const target = typeof data.target === 'string' ? data.target.trim() : ''
        setCurrentView('chat')
        setDevPreviewTarget(target || null)
        setSavedDevPreview({ open: true, target: target || null, workspaceRoot: data.workspaceRoot ?? null })
        routePreviewToWorkspace(target || null, data.workspaceRoot ?? null)
      }, [routePreviewToWorkspace, setSavedDevPreview]),
      'screen-share.open': useCallback(() => {
        setShowScreenShare(true)
        setSavedScreenShare({ open: true })
      }, [setSavedScreenShare]),
      'screen-share.close': useCallback(() => {
        setShowScreenShare(false)
        setSavedScreenShare(null)
      }, [setSavedScreenShare]),
      'architecture.update': useCallback((data: ArchitectureUpdateData) => {
        if (data.diagram) {
          architectureRenderRequestIdRef.current = data.requestId ?? null
          setArchitectureDiagram(data.diagram)
          setArchitectureGenerating(false)
          setShowArchitecture(true)
          if (data.workspaceRoot?.trim()) {
            loadedArchitectureWorkspaceRef.current = data.workspaceRoot.trim()
          }
          openArchitectureInWorkspace(data.workspaceRoot)
        }
      }, [openArchitectureInWorkspace]),
    },
    onBrowserCollaborationEvent: browserCollaboration.handleWsEvent,
    onPreviewSessionEvent: emitPreviewSession,
  })

  const handleArchitectureRenderResult = useCallback((result: { ok: true } | { ok: false; error: string }) => {
    const requestId = architectureRenderRequestIdRef.current
    if (!requestId) return
    architectureRenderRequestIdRef.current = null
    sendArchitectureRenderResult(requestId, result)
  }, [sendArchitectureRenderResult])

  const handleWorkspaceTabsStateChange = useCallback((state: WorkspaceTabsState | null) => {
    setWorkspaceTabsState(state)
    setSavedWorkspaceTabs(state)
  }, [setSavedWorkspaceTabs])

  useEffect(() => {
    const workspaceRoot = activeWorkspace?.workspaceRoot?.trim() || null
    if (!workspaceRoot || !token) {
      loadedArchitectureWorkspaceRef.current = null
      setArchitectureDiagram(null)
      setArchitectureGenerating(false)
      return
    }
    if (loadedArchitectureWorkspaceRef.current === workspaceRoot) return
    loadedArchitectureWorkspaceRef.current = workspaceRoot
    setArchitectureDiagram(null)
    let cancelled = false

    void fetch(`${API_URL}/api/architecture?workspaceRoot=${encodeURIComponent(workspaceRoot)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) return null
        const data = await response.json() as {
          diagram: { workspaceRoot: string; diagram: string; updatedAt: string } | null
        }
        return data.diagram
      })
      .then((saved) => {
        if (cancelled) return
        setArchitectureDiagram(saved?.diagram ?? null)
      })
      .catch(() => {
        if (!cancelled) setArchitectureDiagram(null)
      })

    return () => {
      cancelled = true
    }
  }, [activeWorkspace?.workspaceRoot, token])

  const prevWorkspaceLayoutPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeWorkspaceId && token && loadingWorkspaceLayout) return
    const layout = { tree: showWorkspaceTree, editor: showWorkspaceEditor }
    const serialized = JSON.stringify(layout)
    if (serialized === prevWorkspaceLayoutPayloadRef.current) return
    prevWorkspaceLayoutPayloadRef.current = serialized
    setSavedWorkspaceLayout(layout)
  }, [showWorkspaceTree, showWorkspaceEditor, setSavedWorkspaceLayout, activeWorkspaceId, loadingWorkspaceLayout, token])

  const prevChatModePayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeSessionId && token && loadingChatMode) return
    if (chatMode === prevChatModePayloadRef.current) return
    prevChatModePayloadRef.current = chatMode
    setSavedChatMode(chatMode)
    if (consumeSuppressedUiSync('chat.mode')) return
    sendUIState('chat.mode', chatMode, activeSessionId)
  }, [chatMode, setSavedChatMode, sendUIState, activeSessionId, loadingChatMode, token, consumeSuppressedUiSync])

  const prevProviderRuntimeModePayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeSessionId && token && loadingProviderRuntimeMode) return
    if (chatProviderRuntimeMode === prevProviderRuntimeModePayloadRef.current) return
    prevProviderRuntimeModePayloadRef.current = chatProviderRuntimeMode
    setSavedProviderRuntimeMode(chatProviderRuntimeMode)
    if (consumeSuppressedUiSync('chat.providerRuntimeMode')) return
    sendUIState('chat.providerRuntimeMode', chatProviderRuntimeMode, activeSessionId)
  }, [chatProviderRuntimeMode, setSavedProviderRuntimeMode, sendUIState, activeSessionId, loadingProviderRuntimeMode, token, consumeSuppressedUiSync])

  const prevChatViewPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeSessionId && token && loadingChatView) return
    if (viewMode === prevChatViewPayloadRef.current) return
    prevChatViewPayloadRef.current = viewMode
    setSavedChatView(viewMode)
    if (consumeSuppressedUiSync('chat.view')) return
    sendUIState('chat.view', viewMode, activeSessionId)
  }, [viewMode, setSavedChatView, sendUIState, activeSessionId, loadingChatView, token, consumeSuppressedUiSync])

  const prevQueuePayloadRef = useRef<string | null>(null)
  useEffect(() => {
    const payload = (messageQueue as SavedQueuedMessage[]).length > 0 ? (messageQueue as SavedQueuedMessage[]) : null
    const serialized = JSON.stringify(payload)
    if (serialized === prevQueuePayloadRef.current) return
    prevQueuePayloadRef.current = serialized
    setSavedQueuedMessages(payload)
    if (consumeSuppressedUiSync('queued_messages')) return
    sendUIState('queued_messages', payload, activeSessionId)
  }, [messageQueue, setSavedQueuedMessages, sendUIState, activeSessionId, consumeSuppressedUiSync])

  // Register broadcast callback: when file decisions change, sync to other clients
  useEffect(() => {
    setOnChangedFilesSync((files: ChangedFile[]) => {
      const payload = files.length > 0 ? files : null
      setSavedChangedFiles(payload)
      if (consumeSuppressedUiSync('changed_files')) return
      sendUIState('changed_files', payload, activeSessionId)
    })
    return () => setOnChangedFilesSync(null)
  }, [sendUIState, activeSessionId, setOnChangedFilesSync, consumeSuppressedUiSync, setSavedChangedFiles])

  useEffect(() => {
    localStorage.setItem('showSessionsSidebar', showSidebar ? 'true' : 'false')
  }, [showSidebar])

  useEffect(() => {
    localStorage.setItem('showDebugPanel', showDebugPanel ? 'true' : 'false')
  }, [showDebugPanel])

  const handleChatProviderChange = useCallback((provider: ProviderId) => {
    setChatProvider(provider)
  }, [])

  const handleChatProviderRuntimeModeChange = useCallback((runtimeMode: RuntimeMode) => {
    setChatProviderRuntimeMode(runtimeMode)
  }, [])

  const handleCliModelChange = useCallback((model: string | null) => {
    setCliModelsByProvider((current) => ({
      ...current,
      [chatProvider]: model,
    }))
  }, [chatProvider])

  const prevCliModelsPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeSessionId && token && loadingCliModels) return
    const nextModels: Partial<Record<CliProviderId, string | null>> = {}
    for (const providerId of ['jait', 'codex', 'claude-code'] as const) {
      const value = cliModelsByProvider[providerId]
      if (typeof value === 'string' && value.trim()) {
        nextModels[providerId] = value
      }
    }

    const payload = Object.keys(nextModels).length > 0 ? nextModels : null
    const serialized = JSON.stringify(payload)
    if (serialized === prevCliModelsPayloadRef.current) return
    prevCliModelsPayloadRef.current = serialized
    setSavedCliModels(payload)
    if (consumeSuppressedUiSync('chat.cliModels')) return
    sendUIState('chat.cliModels', payload, activeSessionId)

    localStorage.removeItem('cliModelsByProvider')
    localStorage.removeItem('cliModel')
  }, [cliModelsByProvider, activeSessionId, loadingCliModels, sendUIState, setSavedCliModels, token, consumeSuppressedUiSync])

  // Track whether the initial server sync has happened so we don't PATCH on mount
  const chatProviderInitialized = useRef(false)

  useEffect(() => {
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
    if (consumeSuppressedUiSync('screen-share.panel')) return
    sendUIState('screen-share.panel', { open: true }, activeSessionId)
  }, [setSavedScreenShare, sendUIState, activeSessionId, consumeSuppressedUiSync])

  const closeScreenSharePanel = useCallback(() => {
    setShowScreenShare(false)
    setSavedScreenShare(null)
    if (consumeSuppressedUiSync('screen-share.panel')) return
    sendUIState('screen-share.panel', null, activeSessionId)
  }, [setSavedScreenShare, sendUIState, activeSessionId, consumeSuppressedUiSync])

  const closeDevPreviewPanel = useCallback(async () => {
    if (token && activeSessionId) {
      await fetch(`${getApiUrl()}/api/preview/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      }).catch(() => {})
    }
    closeWorkspacePreview()
    setDevPreviewBrowserSessionId(null)
    setSavedDevPreview(null)
  }, [token, activeSessionId, closeWorkspacePreview, setSavedDevPreview])

  const prevPreviewSyncRef = useRef<string>('')
  const handleWorkspacePreviewOpenChange = useCallback((state: { open: boolean; target: string | null; browserSessionId?: string | null }) => {
    const nextBrowserSessionId = state.browserSessionId?.trim() || null
    const resolvedDisplayTarget = state.target?.trim() || resolveBrowserSessionPreviewTarget(nextBrowserSessionId) || null
    const displayState: DevPreviewPanelState['displayState'] = !state.open
      ? 'hidden'
      : (resolvedDisplayTarget || nextBrowserSessionId)
        ? 'connected'
        : 'blank'
    const nextPreviewState: DevPreviewPanelState = {
      open: state.open,
      target: resolvedDisplayTarget,
      browserSessionId: nextBrowserSessionId,
      displayState,
      displayTarget: displayState === 'connected' ? resolvedDisplayTarget : null,
      storageScope: state.open ? 'isolated-browser-session' : 'unknown',
    }
    setWorkspacePreviewState((prev) => {
      if (
        prev.open === nextPreviewState.open
        && prev.target === nextPreviewState.target
        && prev.browserSessionId === nextPreviewState.browserSessionId
        && prev.displayState === nextPreviewState.displayState
        && prev.displayTarget === nextPreviewState.displayTarget
      ) return prev
      return nextPreviewState
    })
    if (state.open) {
      const nextState: DevPreviewPanelState = {
        open: true,
        target: resolvedDisplayTarget ?? devPreviewTarget ?? null,
        workspaceRoot: activeWorkspace?.workspaceRoot ?? null,
        browserSessionId: nextBrowserSessionId || devPreviewBrowserSessionId,
        displayState,
        displayTarget: displayState === 'connected' ? (resolvedDisplayTarget ?? devPreviewTarget ?? null) : null,
        storageScope: 'isolated-browser-session',
      }
      const key = `${nextState.open}:${nextState.target ?? ''}:${nextState.workspaceRoot ?? ''}:${nextState.browserSessionId ?? ''}:${nextState.displayState ?? ''}:${nextState.displayTarget ?? ''}:${nextState.storageScope ?? ''}`
      if (key === prevPreviewSyncRef.current) return
      prevPreviewSyncRef.current = key
      setSavedDevPreview(nextState)
      return
    }
    if (prevPreviewSyncRef.current === '') return
    prevPreviewSyncRef.current = ''
    setDevPreviewBrowserSessionId(null)
    setSavedDevPreview(null)
  }, [activeWorkspace?.workspaceRoot, devPreviewBrowserSessionId, devPreviewTarget, resolveBrowserSessionPreviewTarget, setSavedDevPreview])

  const previewOpen = savedDevPreview?.open === true || workspacePreviewState.open

  const openTerminalPanel = useCallback(() => {
    if (!showWorkspaceRef.current) {
      showWorkspaceRef.current = true
      setShowWorkspace(true)
      setShowWorkspaceEditor(true)
    }
    setShowTerminal(true)
    setSavedTerminal({ open: true })
    if (consumeSuppressedUiSync('terminal.panel')) return
    sendUIState('terminal.panel', { open: true }, activeSessionId)
  }, [setSavedTerminal, sendUIState, activeSessionId, consumeSuppressedUiSync])

  const closeTerminalPanel = useCallback(() => {
    setShowTerminal(false)
    setSavedTerminal(null)
    if (consumeSuppressedUiSync('terminal.panel')) return
    sendUIState('terminal.panel', null, activeSessionId)
  }, [setSavedTerminal, sendUIState, activeSessionId, consumeSuppressedUiSync])

  const closeWorkspacePanel = useCallback(() => {
    suppressWorkspaceAutoOpenRef.current = true
    showWorkspaceRef.current = false
    setShowWorkspace(false)
    if (activeWorkspace) {
      setSavedWorkspace({
        open: false,
        remotePath: activeWorkspace.workspaceRoot,
        surfaceId: activeWorkspace.surfaceId,
        nodeId: activeWorkspace.nodeId,
      })
    }
    setShowArchitecture(false)
  }, [activeWorkspace, setSavedWorkspace])

  const toggleWorkspaceTree = useCallback(() => {
    if (isMobile) {
      const nextLayout = toggleMobileWorkspacePane({ tree: showWorkspaceTree, editor: showWorkspaceEditor }, 'tree')
      setShowWorkspaceTree(nextLayout.tree)
      setShowWorkspaceEditor(nextLayout.editor)
      return
    }
    setShowWorkspaceTree(prev => !prev)
  }, [isMobile, showWorkspaceTree, showWorkspaceEditor])

  const toggleWorkspaceEditor = useCallback(() => {
    if (isMobile) {
      const nextLayout = toggleMobileWorkspacePane({ tree: showWorkspaceTree, editor: showWorkspaceEditor }, 'editor')
      setShowWorkspaceTree(nextLayout.tree)
      setShowWorkspaceEditor(nextLayout.editor)
      return
    }
    setShowWorkspaceEditor(prev => !prev)
  }, [isMobile, showWorkspaceTree, showWorkspaceEditor])

  const showMobileWorkspaceTreeTab = useCallback((tab: 'files' | 'git') => {
    setMobileTreeTab(tab)
    const nextLayout = showMobileWorkspacePane('tree')
    setShowWorkspaceTree(nextLayout.tree)
    setShowWorkspaceEditor(nextLayout.editor)
  }, [])

  const showMobileWorkspaceEditorTab = useCallback(() => {
    const nextLayout = showMobileWorkspacePane('editor')
    setShowWorkspaceTree(nextLayout.tree)
    setShowWorkspaceEditor(nextLayout.editor)
  }, [])

  const openDevPreviewPanel = useCallback((target?: string | null) => {
    setCurrentView('chat')
    const nextTarget = target?.trim() || devPreviewTarget?.trim() || null
    setDevPreviewTarget(nextTarget)
    setDevPreviewBrowserSessionId(null)
    const state = { open: true, target: nextTarget, workspaceRoot: activeWorkspace?.workspaceRoot ?? null, browserSessionId: null }
    setSavedDevPreview(state)
    routePreviewToWorkspace(nextTarget, activeWorkspace?.workspaceRoot ?? null, null)
  }, [setSavedDevPreview, devPreviewTarget, routePreviewToWorkspace, activeWorkspace?.workspaceRoot])

  // Helper: create a filesystem surface on the gateway so ALL clients
  // can browse the directory remotely (enables cross-device sync).
  const openRemoteWorkspaceOnGateway = useCallback(async (dirPath: string, nodeId?: string, sessionIdOverride?: string | null) => {
    const sessionId = sessionIdOverride ?? activeSessionId
    const res = await fetch(`${API_URL}/api/workspace/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath, sessionId, nodeId: nodeId || 'gateway' }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error((err as { message?: string }).message ?? 'Failed to open workspace')
    }
    if (token) {
      void updateSettings({
        workspace_picker_path: dirPath,
        workspace_picker_node_id: nodeId || 'gateway',
      }).catch(() => {
        // Best-effort persistence only; workspace open already succeeded.
      })
    }
    // The gateway broadcasts `workspace.open` via WS and persists state.
    // All clients (including this one) will receive it and hydrate automatically.
  }, [activeSessionId, token, updateSettings])

  // Wrap switchWorkspace so clicking a workspace also opens its remote directory
  // and shows the correct files/session in the editor.
  const handleSwitchWorkspace = useCallback(async (workspaceId: string) => {
    const workspace = workspaces.find((w) => w.id === workspaceId)
    if (!workspace) return

    // Determine which session to activate (mirrors switchWorkspace logic)
    const hasCurrentSession = workspace.sessions.some((s) => s.id === activeSessionId)
    const nextSessionId = hasCurrentSession ? activeSessionId : workspace.sessions[0]?.id ?? null

    switchWorkspace(workspaceId)

    // Open the workspace directory on the gateway and directly hydrate from the
    // response rather than relying on the WS `workspace.open` event, which is
    // session-scoped and may arrive before the WS re-subscribes to the new session.
    if (workspace.rootPath) {
      try {
        const res = await fetch(`${API_URL}/api/workspace/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: workspace.rootPath, sessionId: nextSessionId, nodeId: workspace.nodeId || 'gateway' }),
        })
        if (!res.ok) return
        const data = await res.json() as { surfaceId: string; workspaceRoot: string; nodeId?: string }
        const resolvedNodeId = data.nodeId || workspace.nodeId || undefined
        setActiveWorkspace({ surfaceId: data.surfaceId, workspaceRoot: data.workspaceRoot, nodeId: resolvedNodeId })
        showWorkspaceRef.current = true
        setShowWorkspace(true)
        setSavedWorkspace({ open: true, remotePath: data.workspaceRoot, surfaceId: data.surfaceId, nodeId: resolvedNodeId })
      } catch (e) {
        console.error('Failed to open workspace:', e)
      }
    }
  }, [workspaces, activeSessionId, switchWorkspace, setSavedWorkspace])

  const handleCreateWorkspace = useCallback(() => {
    setWorkspacePickerMode('workspace')
    setFolderPickerOpen(true)
  }, [])

  const handleSessionSwitcherOpen = useCallback((open: boolean) => {
    if (!open || !activeWorkspaceId) return
    if (!archivedSessionsByWorkspace[activeWorkspaceId]) {
      void fetchArchivedSessions(activeWorkspaceId)
    }
  }, [activeWorkspaceId, archivedSessionsByWorkspace, fetchArchivedSessions])

  const promptForWorkspaceSelection = useCallback(() => {
    setWorkspacePickerMode('workspace')
    setFolderPickerOpen(true)
    toast('Select a workspace directory first.')
  }, [])

  const handleWorkspaceFolderSelected = useCallback(async (
    path: string,
    nodeId: string,
    options?: { openEditor?: boolean },
  ) => {
    // If we're changing the directory of an existing workspace
    if (changeDirectoryWorkspaceId) {
      setChangeDirectoryWorkspaceId(null)
      await updateWorkspace(changeDirectoryWorkspaceId, { rootPath: path, nodeId })
      return
    }
    const workspace = await createWorkspace({ rootPath: path, nodeId })
    if (!workspace) {
      throw new Error('Failed to create workspace')
    }
    const session = workspace.sessions[0] ?? await createSession(workspace.id)
    if (!session) {
      throw new Error('Failed to create workspace session')
    }
    const nextOpen = options?.openEditor ?? workspacePickerMode === 'editor'
    showWorkspaceRef.current = nextOpen
    await openRemoteWorkspaceOnGateway(path, nodeId, session.id)
    setShowWorkspace(nextOpen)
    setSavedWorkspace({ open: nextOpen, remotePath: path, nodeId })
  }, [changeDirectoryWorkspaceId, createSession, createWorkspace, updateWorkspace, openRemoteWorkspaceOnGateway, setSavedWorkspace, workspacePickerMode])

  const handleToggleEditor = useCallback(async () => {
    if (showWorkspace) {
      closeWorkspacePanel()
      return
    }

    suppressWorkspaceAutoOpenRef.current = false

    if (viewMode === 'manager' && automation.selectedThread) {
      const threadWorkspace = automation.selectedThread.workingDirectory ?? selectedThreadRepo?.localPath
      if (threadWorkspace) {
        if (activeWorkspace?.workspaceRoot === threadWorkspace) {
          showWorkspaceRef.current = true
          setShowWorkspace(true)
          setShowWorkspaceTree(true)
          const state = { open: true, remotePath: activeWorkspace.workspaceRoot, surfaceId: activeWorkspace.surfaceId, nodeId: activeWorkspace.nodeId }
          setSavedWorkspace(state)
          return
        }
        let workspaceSessionId = activeSessionId
        if (!workspaceSessionId) {
          await handleWorkspaceFolderSelected(threadWorkspace, selectedThreadRepo?.deviceId ?? 'gateway', { openEditor: true })
          return
        }
        if (!workspaceSessionId) return
        await openRemoteWorkspaceOnGateway(threadWorkspace, selectedThreadRepo?.deviceId ?? undefined, workspaceSessionId)
        return
      }
    }

    // If there's an existing remote workspace, just reopen the panel
    if (activeWorkspace) {
      showWorkspaceRef.current = true
      setShowWorkspace(true)
      setShowWorkspaceTree(true)
      const state = { open: true, remotePath: activeWorkspace.workspaceRoot, surfaceId: activeWorkspace.surfaceId, nodeId: activeWorkspace.nodeId }
      setSavedWorkspace(state)
      return
    }

    // If a workspace record exists with a rootPath, open it directly instead of showing the picker
    if (activeWorkspaceRecord?.rootPath) {
      await handleWorkspaceFolderSelected(activeWorkspaceRecord.rootPath, activeWorkspaceRecord.nodeId ?? 'gateway', { openEditor: true })
      return
    }

    setWorkspacePickerMode('editor')
    setFolderPickerOpen(true)
  }, [
    showWorkspace,
    activeWorkspace,
    activeWorkspaceRecord,
    closeWorkspacePanel,
    setSavedWorkspace,
    activeSessionId,
    openRemoteWorkspaceOnGateway,
    viewMode,
    automation.selectedThread,
    selectedThreadRepo,
    createSession,
    handleWorkspaceFolderSelected,
  ])

  // Verify workspace surface is alive; re-create if stale (e.g. after gateway restart)
  useEffect(() => {
    if (!activeWorkspace?.workspaceRoot || !activeSessionId) return
    let cancelled = false
    ;(async () => {
      try {
        if (activeWorkspace.surfaceId) {
          const res = await fetch(`${API_URL}/api/workspace/list?path=${encodeURIComponent(activeWorkspace.workspaceRoot)}&surfaceId=${encodeURIComponent(activeWorkspace.surfaceId)}`)
          if (res.ok || cancelled) return // surface is alive
        }
        // Surface is missing or stale — re-create it
        const openRes = await fetch(`${API_URL}/api/workspace/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: activeWorkspace.workspaceRoot,
            sessionId: activeSessionId,
            nodeId: activeWorkspace.nodeId || 'gateway',
          }),
        })
        if (!openRes.ok || cancelled) return
        const data = (await openRes.json()) as { surfaceId: string; workspaceRoot: string; nodeId?: string }
        if (cancelled) return
        setActiveWorkspace({ surfaceId: data.surfaceId, workspaceRoot: data.workspaceRoot, nodeId: data.nodeId })
        const state = { open: showWorkspaceRef.current, remotePath: data.workspaceRoot, surfaceId: data.surfaceId, nodeId: data.nodeId }
        setSavedWorkspace(state)
      } catch { /* network error — ignore, panel will show error naturally */ }
    })()
    return () => { cancelled = true }
  }, [activeWorkspace?.nodeId, activeWorkspace?.surfaceId, activeWorkspace?.workspaceRoot, activeSessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open workspace panel when the agent modifies files
  useEffect(() => {
    if (changedFiles.length === 0) return
    if (suppressWorkspaceAutoOpenRef.current) return
    if (!showWorkspace) {
      showWorkspaceRef.current = true
      setShowWorkspace(true)
    }
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
      setChatProvider(settings.chat_provider as ProviderId)
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

      // Check if any users exist — if not, default to the Register tab
      fetch(`${getApiUrl()}/health`, { signal: AbortSignal.timeout(4000) })
        .then((r) => r.ok ? r.json() as Promise<{ hasUsers?: boolean }> : null)
        .then((data) => {
          if (data && typeof data.hasUsers === 'boolean') {
            setServerHasUsers(data.hasUsers)
            if (!data.hasUsers) setAuthTab('register')
          }
        })
        .catch(() => {
          // If the gateway is supposedly configured but unreachable, send the user
          // back to the URL step so they can correct it instead of being stuck
          // on an auth form that can't reach the server.
          if (isStandaloneApp && isGatewayConfigured()) {
            setGatewayStep('url')
            setGatewayError('Gateway is unreachable. Check the URL or try a different one.')
            setGatewayUrlInput(getStoredGatewayUrl() ?? '')
          }
        })

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

  const handleTerminalDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startY = e.clientY
    const startH = terminalHeight
    const maxH = window.innerHeight * 0.6
    const cleanup = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onWindowBlur)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startY - ev.clientY
      setTerminalHeight(Math.min(maxH, Math.max(160, startH + delta)))
    }
    const onUp = () => {
      cleanup()
    }
    const onWindowBlur = () => {
      cleanup()
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onWindowBlur)
  }, [terminalHeight])

  const activeWorkspaceRoot = activeWorkspace?.workspaceRoot ?? activeWorkspaceRecord?.rootPath ?? null

  // Filter terminals to only show those belonging to the active workspace
  const workspaceTerminals = useMemo(() => {
    if (!activeWorkspaceRoot) return terminals
    return terminals.filter((t) => {
      if (!t.workspaceRoot) return false
      // Normalize path separators for comparison
      const tRoot = t.workspaceRoot.replace(/\\/g, '/').toLowerCase()
      const wRoot = activeWorkspaceRoot.replace(/\\/g, '/').toLowerCase()
      return tRoot === wRoot
    })
  }, [terminals, activeWorkspaceRoot])

  const ensureActiveTerminal = useCallback(async (preferredTerminalId: string | null = null) => {
    const refreshed = await refresh()
    // Filter refreshed terminals to current workspace
    const wsRoot = activeWorkspaceRoot
    const wsTerminals = wsRoot
      ? refreshed.filter((t) => {
          const tRoot = (t.workspaceRoot ?? '').replace(/\\/g, '/').toLowerCase()
          return tRoot === wsRoot.replace(/\\/g, '/').toLowerCase()
        })
      : refreshed

    if (preferredTerminalId) {
      const preferredExists = wsTerminals.some((t) => t.id === preferredTerminalId)
      if (preferredExists) {
        setActiveTerminalId(preferredTerminalId)
        return preferredTerminalId
      }
    }

    if (activeTerminalId && wsTerminals.some((t) => t.id === activeTerminalId)) {
      return activeTerminalId
    }

    if (wsTerminals.length > 0) {
      const fallbackId = wsTerminals[wsTerminals.length - 1]!.id
      setActiveTerminalId(fallbackId)
      return fallbackId
    }

    const created = await createTerminal(activeSessionId ?? 'default', activeWorkspaceRoot ?? undefined)
    return created.id
  }, [refresh, setActiveTerminalId, activeTerminalId, createTerminal, activeSessionId, activeWorkspaceRoot])

  const handleOpenTerminalFromToolCall = useCallback(async (terminalId: string | null) => {
    setCurrentView('chat')
    openTerminalPanel()
    await ensureActiveTerminal(terminalId)
  }, [ensureActiveTerminal, openTerminalPanel])

  const handleMobileWorkspaceDropdownAction = useCallback(async (target: 'files' | 'git' | 'editor' | 'terminal' | 'hide') => {
    if (target === 'hide') {
      closeTerminalPanel()
      closeWorkspacePanel()
      return
    }

    if (target === 'terminal') {
      setCurrentView('chat')
      openTerminalPanel()
      await ensureActiveTerminal()
      return
    }

    if (showTerminal) {
      closeTerminalPanel()
    }

    if (!showWorkspace) {
      await handleToggleEditor()
    }

    if (target === 'editor') {
      showMobileWorkspaceEditorTab()
      return
    }

    showMobileWorkspaceTreeTab(target)
  }, [closeTerminalPanel, closeWorkspacePanel, ensureActiveTerminal, handleToggleEditor, openTerminalPanel, showMobileWorkspaceEditorTab, showMobileWorkspaceTreeTab, setCurrentView, showTerminal, showWorkspace])

  const handleReferenceFile = useCallback((file: ReferencedFile) => {
    promptInputRef.current?.insertChip(file)
    promptInputRef.current?.focus()
  }, [])

  const handleReferenceFileSelection = useCallback((file: ReferencedFile, selection: string, startLine: number, endLine: number) => {
    const trimmed = selection.trim()
    if (!trimmed) return
    promptInputRef.current?.insertSegments(buildFileSelectionReferenceSegments(file, trimmed, startLine, endLine))
    promptInputRef.current?.focus()
  }, [])

  const handleReferenceTerminalSelection = useCallback((terminalId: string, selection: string, workspaceRoot?: string | null) => {
    const trimmed = selection.trim()
    if (!trimmed) return
    const name = terminalId.replace(/^term-/, '').slice(0, 8) || terminalId
    promptInputRef.current?.insertSegments(buildTerminalSelectionReferenceSegments({
      terminalId,
      name,
      ...(workspaceRoot ? { workspaceRoot } : {}),
    }, trimmed))
    promptInputRef.current?.focus()
  }, [])

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
    const isLastWorkspaceTerminal = workspaceTerminals.length === 1 && workspaceTerminals[0]?.id === id
    await killTerminal(id)
    if (isLastWorkspaceTerminal) {
      closeTerminalPanel()
    }
  }, [workspaceTerminals, killTerminal, closeTerminalPanel])

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

  const resolveKnownWorkspaceRootForFile = useCallback((filePath: string) => {
    if (isPathWithinWorkspace(filePath, activeWorkspace?.workspaceRoot)) {
      return activeWorkspace?.workspaceRoot ?? null
    }
    if (activeWorkspaceRecord?.rootPath && isPathWithinWorkspace(filePath, activeWorkspaceRecord.rootPath)) {
      return activeWorkspaceRecord.rootPath
    }
    return null
  }, [activeWorkspace?.workspaceRoot, activeWorkspaceRecord?.rootPath])

  /** Open a changed file in the diff view (fetches backup + current content) */
  const handleChangedFileClick = useCallback(async (filePath: string) => {
    try {
      const targetWorkspaceRoot = resolveKnownWorkspaceRootForFile(filePath)

      if (!targetWorkspaceRoot) {
        toast('File is outside the active workspace. Open its directory explicitly to browse it.')
        return
      }

      if (targetWorkspaceRoot && (!activeWorkspace || activeWorkspace.workspaceRoot !== targetWorkspaceRoot)) {
        await openRemoteWorkspaceOnGateway(targetWorkspaceRoot, activeWorkspace?.nodeId, activeSessionId)
      }

      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const surfaceQuery = activeWorkspace?.surfaceId && targetWorkspaceRoot === activeWorkspace.workspaceRoot
        ? `&surfaceId=${encodeURIComponent(activeWorkspace.surfaceId)}`
        : ''
      const name = filePath.split(/[\/\\]/).pop() ?? filePath
      const language = workspaceLanguageForPath(name)

      const openReviewDiff = async (path: string, originalContent: string | null | undefined, modifiedContent: string) => {
        await workspaceRef.current?.openReviewDiff({
          path,
          originalContent: originalContent ?? '',
          modifiedContent,
          language,
        })
        if (!showWorkspace) {
          showWorkspaceRef.current = true
          setShowWorkspace(true)
        }
        showWorkspaceEditorPanel()
      }

      const openGitDiffFallback = async (path: string, currentContent: string): Promise<boolean> => {
        if (!targetWorkspaceRoot) return false
        try {
          const diffs = await gitApi.fileDiffs(targetWorkspaceRoot)
          const normalizedPath = path.replace(/\\/g, '/')
          const entry = diffs.find((diff) => diff.path === normalizedPath)
            ?? diffs.find((diff) => normalizedPath.endsWith(`/${diff.path}`))
          if (!entry) return false
          await openReviewDiff(path, entry.original, currentContent || entry.modified)
          return true
        } catch {
          return false
        }
      }

      // Try to fetch the backup (original) content from the gateway
      const backupRes = await fetch(
        `${API_URL}/api/workspace/backup?path=${encodeURIComponent(filePath)}${surfaceQuery}`,
        { headers },
      )

      if (backupRes.ok) {
        const data = await backupRes.json() as {
          path: string
          originalContent: string | null
          currentContent: string
        }
        await openReviewDiff(data.path, data.originalContent, data.currentContent)
        return
      }

      const file = await workspaceRef.current?.readFileByPath(filePath)
      if (file) {
        if (await openGitDiffFallback(file.path, file.content)) return
        await openReviewDiff(file.path, file.content, file.content)
        return
      }
      // Fallback: fetch from the workspace REST API and still open a review diff
      const readRes = await fetch(
        `${API_URL}/api/workspace/read?path=${encodeURIComponent(filePath)}${surfaceQuery}`,
        { headers },
      )
      if (!readRes.ok) return
      const readData = await readRes.json() as { path: string; content: string }
      if (await openGitDiffFallback(readData.path, readData.content)) return
      await openReviewDiff(readData.path, readData.content, readData.content)
      return
    } catch {
      // silently ignore
    }
  }, [activeSessionId, activeWorkspace, openRemoteWorkspaceOnGateway, resolveKnownWorkspaceRootForFile, token, showWorkspace, showWorkspaceEditorPanel])

  const handleOpenMessagePath = useCallback(async (filePath: string) => {
    try {
      const targetWorkspaceRoot = resolveKnownWorkspaceRootForFile(filePath)

      if (!targetWorkspaceRoot) {
        const existing = workspaceFiles.find((file) => file.path === filePath)
        if (existing) {
          mergeWorkspaceFiles([existing])
          setActiveWorkspaceFileId(existing.id)
          if (!showWorkspace) {
            showWorkspaceRef.current = true
            setShowWorkspace(true)
          }
          showWorkspaceEditorPanel()
          return
        }
        toast('File is outside the active workspace. Open its directory explicitly to browse it.')
        return
      }

      if (targetWorkspaceRoot && (!activeWorkspace || activeWorkspace.workspaceRoot !== targetWorkspaceRoot)) {
        await openRemoteWorkspaceOnGateway(targetWorkspaceRoot, activeWorkspace?.nodeId, activeSessionId)
      }

      const openedInTree = await workspaceRef.current?.openFileByPath(filePath)
      if (openedInTree) {
        if (!showWorkspace) {
          showWorkspaceRef.current = true
          setShowWorkspace(true)
        }
        showWorkspaceEditorPanel()
        return
      }

      const existing = workspaceFiles.find((file) => file.path === filePath)
      if (existing) {
        mergeWorkspaceFiles([existing])
        setActiveWorkspaceFileId(existing.id)
      } else {
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const readRes = await fetch(
          `${API_URL}/api/workspace/read?path=${encodeURIComponent(filePath)}`,
          { headers },
        )
        if (!readRes.ok) {
          throw new Error(`Failed to open file: ${readRes.status}`)
        }

        const readData = await readRes.json() as { path: string; content: string }
        const name = filePath.split(/[\\/]/).pop() ?? filePath
        const file: WorkspaceFile = {
          id: readData.path,
          name,
          path: readData.path,
          content: readData.content,
          language: workspaceLanguageForPath(name),
        }
        mergeWorkspaceFiles([file])
        setActiveWorkspaceFileId(file.id)
      }

      if (!showWorkspace) {
        showWorkspaceRef.current = true
        setShowWorkspace(true)
      }
      showWorkspaceEditorPanel()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to open linked file')
    }
  }, [
    activeSessionId,
    activeWorkspace,
    mergeWorkspaceFiles,
    openRemoteWorkspaceOnGateway,
    resolveKnownWorkspaceRootForFile,
    showWorkspace,
    showWorkspaceEditorPanel,
    token,
    workspaceFiles,
  ])

  /** Apply the merged diff result — write to server and clear backup */
  const handleApplyWorkspaceDiff = useCallback(async (filePath: string, resultContent: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      await fetch(`${API_URL}/api/workspace/apply-diff`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: filePath, content: resultContent }),
      })
    } catch { /* ignore */ }
    // Mark the file as accepted in the changed-files list.
    acceptFile(filePath)
  }, [token, acceptFile])

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

  const preparePromptSubmission = useCallback(async (
    rawValue: string,
    chipFiles?: ReferencedFile[],
    displaySegments?: UserMessageSegment[],
  ) => {
    const normalizedSegments = displaySegments?.length ? displaySegments : undefined
    const text = (normalizedSegments ? userMessageTextFromSegments(normalizedSegments) : rawValue).trim()
    const referencedFiles = normalizedSegments?.length
      ? userReferencedFilesFromSegments(normalizedSegments)
      : chipFiles?.length
        ? chipFiles.map((file) => ({ path: file.path, name: file.name }))
        : []
    const referencedWorkspaces = normalizedSegments?.length
      ? userReferencedWorkspacesFromSegments(normalizedSegments)
      : []
    const referencedTerminals = normalizedSegments?.length
      ? userReferencedTerminalsFromSegments(normalizedSegments)
      : []

    if (!text && referencedFiles.length === 0 && referencedWorkspaces.length === 0 && referencedTerminals.length === 0) return null

    const fileContents: { path: string; content: string }[] = []
    const attachments = new Set<string>()

    if (referencedFiles.length) {
      const seen = new Set<string>()
      for (const fileRef of referencedFiles) {
        if (seen.has(fileRef.path)) continue
        seen.add(fileRef.path)
        attachments.add(fileRef.path)

        const cached = workspaceFiles.find((file) => file.path === fileRef.path)
        if (cached) {
          fileContents.push({ path: cached.path, content: cached.content })
          continue
        }

        const referenced = await workspaceRef.current?.readReferencePath(fileRef.path)
        if (referenced?.length) {
          for (const file of referenced) {
            if (fileContents.some((entry) => entry.path === file.path)) continue
            fileContents.push({ path: file.path, content: file.content })
          }
        }
      }
    }

    const referenceSections: string[] = []

    if (referencedWorkspaces.length > 0) {
      referenceSections.push(`Referenced workspaces:\n${referencedWorkspaces
        .map((workspace) => `- ${workspace.path}`)
        .join('\n')}`)
    }

    if (referencedTerminals.length > 0) {
      referenceSections.push(`Referenced terminals:\n${referencedTerminals
        .map((terminal) => `- ${terminal.terminalId}${terminal.workspaceRoot ? ` (workspace: ${terminal.workspaceRoot})` : ''}`)
        .join('\n')}\nUse the terminal ID when you need to run commands in one of these existing terminals.`)
    }

    if (fileContents.length > 0) {
      referenceSections.push(`Referenced files:\n${fileContents
        .map((file) => `- ${file.path}\n\`\`\`\n${file.content.slice(0, 2000)}\n\`\`\``)
        .join('\n')}`)
    }

    const promptWithReferences = referenceSections.length > 0
      ? `${text}${text ? '\n\n' : ''}${referenceSections.join('\n\n')}`
      : text

    return {
      promptWithReferences,
      displayContent: text,
      referencedFiles: referencedFiles.length > 0 ? referencedFiles : undefined,
      displaySegments: normalizedSegments,
      attachments: attachments.size > 0 ? [...attachments] : undefined,
    }
  }, [workspaceFiles])

  const handleQueue = useCallback(async (
    chipFiles?: ReferencedFile[],
    fileAttachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    const prepared = await preparePromptSubmission(inputValue, chipFiles, displaySegments)
    if (!prepared) return
    const nextDisplaySegments = mergeImageAttachmentsIntoSegments(prepared.displaySegments, fileAttachments)
    enqueueMessage({
      content: prepared.promptWithReferences,
      displayContent: prepared.displayContent || prepared.promptWithReferences,
      mode: chatMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      model: cliModel ?? undefined,
      referencedFiles: prepared.referencedFiles,
      displaySegments: nextDisplaySegments,
      attachments: fileAttachments,
    })
    setInputValue('')
    setInputSegments(undefined)
  }, [chatMode, chatProvider, chatProviderRuntimeMode, cliModel, enqueueMessage, inputValue, preparePromptSubmission])

  const ensureSessionTitle = useCallback(async (sessionId: string, prompt: string) => {
    if (!shouldAutoTitleSession(activeSessionRecord?.name)) return
    const nextTitle = deriveSessionTitle(prompt)
    if (!nextTitle || nextTitle === 'New Chat') return
    await renameSession(sessionId, nextTitle)
  }, [activeSessionRecord?.name, renameSession])


  const handleSubmit = async (
    chipFiles?: ReferencedFile[],
    fileAttachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    if (viewMode === 'manager' || sendTarget === 'thread') {
      return handleThreadSubmit(chipFiles, displaySegments)
    }
    const prepared = await preparePromptSubmission(inputValue, chipFiles, displaySegments)
    if (!prepared && (!fileAttachments || fileAttachments.length === 0)) return
    if (!token) {
      setShowLoginDialog(true)
      return
    }

    const promptText = prepared?.promptWithReferences ?? inputValue.trim()
    const nextDisplaySegments = mergeImageAttachmentsIntoSegments(prepared?.displaySegments, fileAttachments)
    const generatedTitle = deriveSessionTitle(prepared?.displayContent || promptText)

    let sid = activeSessionId
    if (!sid) {
      if (!activeWorkspaceId) {
        promptForWorkspaceSelection()
        return
      }
      const session = await createSession(undefined, generatedTitle)
      sid = session?.id ?? null
    }
    if (!sid) return
    await ensureSessionTitle(sid, prepared?.displayContent || promptText)

    if (isLoading || messageQueue.length > 0) {
      enqueueMessage({
        content: promptText,
        displayContent: prepared?.displayContent || promptText,
        mode: chatMode,
        provider: chatProvider,
        runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
        model: cliModel ?? undefined,
        referencedFiles: prepared?.referencedFiles,
        displaySegments: nextDisplaySegments,
        attachments: fileAttachments,
      })
      setInputValue('')
      setInputSegments(undefined)
      return
    }

    sendMessage(promptText, {
      token,
      sessionId: sid,
      mode: chatMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      model: cliModel ?? undefined,
      onLoginRequired: () => setShowLoginDialog(true),
      attachments: fileAttachments,
      ...(prepared?.displayContent ? { displayContent: prepared.displayContent || promptText } : {}),
      ...(prepared?.referencedFiles ? { referencedFiles: prepared.referencedFiles } : {}),
      ...(nextDisplaySegments?.length ? { displaySegments: nextDisplaySegments } : {}),
    })
    setInputValue('')
    setInputSegments(undefined)
  }

  /** Submit to an automation thread from either developer or manager mode. */
  const handleThreadSubmit = async (chipFiles?: ReferencedFile[], displaySegments?: UserMessageSegment[]) => {
    const prepared = await preparePromptSubmission(inputValue, chipFiles, displaySegments)
    if (!prepared || threadComposerDisabled) return
    setInputValue('')
    setInputSegments(undefined)
    await automation.handleSend(
      prepared.promptWithReferences,
      chatProvider,
      chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      cliModel ?? undefined,
      {
        displayContent: prepared.displayContent || prepared.promptWithReferences,
        referencedFiles: prepared.referencedFiles,
        displaySegments: prepared.displaySegments,
        attachments: prepared.attachments,
      },
    )
  }

  const chatQueueProcessingRef = useRef(false)

  useEffect(() => {
    if (viewMode === 'manager' || sendTarget === 'thread') return
    if (!token || !activeSessionId) return
    if (isLoading || isLoadingHistory) return
    if (chatQueueProcessingRef.current) return

    const [nextItem] = messageQueue
    if (!nextItem) return

    chatQueueProcessingRef.current = true
    dequeueMessage(nextItem.id)

    void Promise.resolve(sendMessage(nextItem.content, {
      token,
      sessionId: activeSessionId,
      mode: nextItem.mode,
      provider: nextItem.provider,
      runtimeMode: nextItem.runtimeMode,
      model: nextItem.model,
      onLoginRequired: () => setShowLoginDialog(true),
      ...(nextItem.attachments?.length ? { attachments: nextItem.attachments } : {}),
      ...(nextItem.displayContent ? { displayContent: nextItem.displayContent } : {}),
      ...(nextItem.referencedFiles?.length ? { referencedFiles: nextItem.referencedFiles } : {}),
      ...(nextItem.displaySegments?.length ? { displaySegments: nextItem.displaySegments } : {}),
    })).catch((err) => {
      enqueueMessage({
        content: nextItem.content,
        displayContent: nextItem.displayContent,
        mode: nextItem.mode,
        provider: nextItem.provider,
        runtimeMode: nextItem.runtimeMode,
        model: nextItem.model,
        referencedFiles: nextItem.referencedFiles,
        displaySegments: nextItem.displaySegments,
        attachments: nextItem.attachments,
      })
      toast.error(err instanceof Error ? err.message : 'Failed to send queued message')
    }).finally(() => {
      chatQueueProcessingRef.current = false
    })
  }, [
    activeSessionId,
    dequeueMessage,
    enqueueMessage,
    isLoading,
    isLoadingHistory,
    messageQueue,
    sendMessage,
    sendTarget,
    token,
    viewMode,
  ])

  const enqueueManagerMessage = useCallback((threadId: string, item: ManagerQueuedMessage) => {
    setManagerMessageQueues((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] ?? []), item],
    }))
  }, [])

  const dequeueManagerMessage = useCallback((threadId: string, id: string) => {
    setManagerMessageQueues((prev) => {
      const existing = prev[threadId] ?? []
      const nextQueue = existing.filter((item) => item.id !== id)
      if (nextQueue.length === existing.length) return prev
      if (nextQueue.length === 0) {
        const { [threadId]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [threadId]: nextQueue }
    })
  }, [])

  const updateManagerQueueItem = useCallback((threadId: string, id: string, content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    setManagerMessageQueues((prev) => {
      const existing = prev[threadId] ?? []
      if (existing.length === 0) return prev
      return {
        ...prev,
        [threadId]: existing.map((item) => item.id === id
          ? {
            ...item,
            content: trimmed,
            displayContent: trimmed,
            fullContent: trimmed,
            referencedFiles: undefined,
            displaySegments: undefined,
            attachments: undefined,
          }
          : item),
      }
    })
  }, [])

  const reorderManagerQueueItem = useCallback((threadId: string, sourceId: string, targetId: string | null, placement: 'before' | 'after') => {
    setManagerMessageQueues((prev) => {
      const existing = prev[threadId] ?? []
      if (existing.length === 0) return prev
      const sourceIndex = existing.findIndex((item) => item.id === sourceId)
      if (sourceIndex < 0) return prev

      const nextQueue = [...existing]
      const [moved] = nextQueue.splice(sourceIndex, 1)
      if (!moved) return prev

      if (targetId == null) {
        nextQueue.push(moved)
      } else {
        const targetIndex = nextQueue.findIndex((item) => item.id === targetId)
        if (targetIndex < 0) return prev
        nextQueue.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, moved)
      }

      if (nextQueue === existing) return prev
      return { ...prev, [threadId]: nextQueue }
    })
  }, [])

  const sendManagerQueueItemToParallelThread = useCallback((id: string) => {
    const thread = automation.selectedThread
    const repo = automation.selectedRepo
    if (!thread || !repo) return
    const item = managerMessageQueues[thread.id]?.find((i) => i.id === id)
    if (!item) return
    dequeueManagerMessage(thread.id, id)
    void (async () => {
      const branchName = `jait/${Math.random().toString(16).slice(2, 10)}`
      let worktreePath: string | undefined
      try {
        const wt = await gitApi.createWorktree(repo.localPath, repo.defaultBranch, branchName)
        worktreePath = wt.path
      } catch {
        try { await gitApi.createBranch(repo.localPath, branchName, repo.defaultBranch) } catch { /* ignore */ }
      }
      const newThread = await agentsApi.createThread({
        title: `[${repo.name}] Generating title…`,
        providerId: item.providerId,
        runtimeMode: item.runtimeMode,
        ...(item.model ? { model: item.model } : {}),
        kind: 'delivery',
        workingDirectory: worktreePath ?? repo.localPath,
        branch: branchName,
      })
      await agentsApi.startThread(newThread.id, {
        message: item.fullContent,
        titlePrefix: `[${repo.name}] `,
        ...(item.displayContent ? { displayContent: item.displayContent } : {}),
        ...(item.referencedFiles ? { referencedFiles: item.referencedFiles } : {}),
        ...(item.attachments ? { attachments: item.attachments } : {}),
      })
    })()
  }, [automation.selectedThread, automation.selectedRepo, managerMessageQueues, dequeueManagerMessage])

  const handleManagerQueue = useCallback(async (
    chipFiles?: ReferencedFile[],
    _attachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    const thread = automation.selectedThread
    if (!thread) return
    const prepared = await preparePromptSubmission(inputValue, chipFiles, displaySegments)
    if (!prepared) return
    enqueueManagerMessage(thread.id, {
      id: `mq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: prepared.displayContent || prepared.promptWithReferences,
      displayContent: prepared.displayContent || prepared.promptWithReferences,
      fullContent: prepared.promptWithReferences,
      referencedFiles: prepared.referencedFiles,
      displaySegments: prepared.displaySegments,
      attachments: prepared.attachments,
      providerId: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      model: cliModel ?? undefined,
      queuedAt: Date.now(),
    })
    setInputValue('')
    setInputSegments(undefined)
  }, [automation.selectedThread, chatProvider, chatProviderRuntimeMode, cliModel, enqueueManagerMessage, inputValue, preparePromptSubmission])

  useEffect(() => {
    for (const [threadId, queue] of Object.entries(managerMessageQueues)) {
      if (queue.length === 0 || managerQueueProcessingRef.current.has(threadId)) continue

      const thread = automation.threads.find((candidate) => candidate.id === threadId)
      if (!thread) {
        setManagerMessageQueues((prev) => {
          if (!(threadId in prev)) return prev
          const { [threadId]: _removed, ...rest } = prev
          return rest
        })
        continue
      }
      if (thread.status === 'running') continue

      const [nextItem] = queue
      if (!nextItem) continue

      managerQueueProcessingRef.current.add(threadId)
      setManagerMessageQueues((prev) => {
        const existing = prev[threadId] ?? []
        const [, ...restQueue] = existing
        if (restQueue.length === 0) {
          const { [threadId]: _removed, ...rest } = prev
          return rest
        }
        return { ...prev, [threadId]: restQueue }
      })

      void automation.handleSendToThread(
        threadId,
        nextItem.fullContent,
        nextItem.providerId,
        nextItem.runtimeMode,
        nextItem.model,
        {
          displayContent: nextItem.displayContent ?? nextItem.content,
          referencedFiles: nextItem.referencedFiles,
          attachments: nextItem.attachments,
        },
      ).catch((err) => {
        setManagerMessageQueues((prev) => ({
          ...prev,
          [threadId]: [nextItem, ...(prev[threadId] ?? [])],
        }))
        automation.setError(err instanceof Error ? err.message : 'Failed to process queued thread message')
      }).finally(() => {
        managerQueueProcessingRef.current.delete(threadId)
      })
    }
  }, [
    automation.handleSendToThread,
    automation.setError,
    automation.threads,
    managerMessageQueues,
  ])

  /** Move the selected repo to run on the gateway instead of its current device. */
  const handleMoveRepoToGateway = useCallback(async () => {
    const repo = automation.selectedRepo
    if (!repo) return
    try {
      await agentsApi.updateRepo(repo.id, { deviceId: '' })
      await automation.refresh()
    } catch {
      automation.setError('Failed to move repository to gateway')
    }
  }, [automation.selectedRepo, automation.refresh, automation.setError])

  const handleSuggestion = async (suggestion: string) => {
    if (!token) {
      setShowLoginDialog(true)
      return
    }
    let sid = activeSessionId
    if (!sid) {
      if (!activeWorkspaceId) {
        promptForWorkspaceSelection()
        return
      }
      const session = await createSession()
      sid = session?.id ?? null
    }
    if (!sid) return
    // Handle architecture generation suggestion
    if (suggestion === 'Generate architecture diagram') {
      setArchitectureGenerating(true)
      setShowArchitecture(true)
      sendMessage(
        'Analyze the workspace architecture and generate a mermaid diagram using the architecture.generate tool. Include all major modules, their relationships, data flow, and external dependencies.',
        { token, sessionId: sid, mode: chatMode, provider: chatProvider, runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined, model: cliModel ?? undefined, onLoginRequired: () => setShowLoginDialog(true) },
      )
      return
    }
    sendMessage(suggestion, { token, sessionId: sid, mode: chatMode, provider: chatProvider, runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined, model: cliModel ?? undefined, onLoginRequired: () => setShowLoginDialog(true) })
  }

  const handleEditPreviousMessage = useCallback(async (
    messageId: string,
    newContent: string,
    messageIndex?: number,
    messageFromEnd?: number,
    metadata?: {
      referencedFiles?: { path: string; name: string }[]
      displaySegments?: UserMessageSegment[]
    },
  ) => {
    if (!activeSessionId || !token) return
    const prepared = await preparePromptSubmission(newContent, metadata?.referencedFiles, metadata?.displaySegments)
    if (!prepared) return
    await restartFromMessage(messageId, prepared.promptWithReferences, messageIndex, messageFromEnd, {
      token,
      sessionId: activeSessionId,
      mode: chatMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      model: cliModel ?? undefined,
      displayContent: prepared.displayContent,
      referencedFiles: prepared.referencedFiles,
      displaySegments: prepared.displaySegments,
      onLoginRequired: () => setShowLoginDialog(true),
    })
  }, [activeSessionId, restartFromMessage, token, chatMode, chatProvider, chatProviderRuntimeMode, cliModel, preparePromptSubmission])

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
      // First-time user: auto-open workspace picker so they set up immediately
      requestAnimationFrame(() => {
        setWorkspacePickerMode('workspace')
        setFolderPickerOpen(true)
      })
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
    await fetchWorkspaces()
    return result.removed
  }

  const handleClearArchivedWorkspaces = async () => {
    const removed = await clearArchivedWorkspaces()
    await fetchWorkspaces()
    return removed
  }

  const handleRestoreWorkspace = async (workspaceId: string) => {
    const restored = await restoreWorkspace(workspaceId)
    if (restored) await fetchWorkspaces()
    return restored
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
    const normalizedTranscript = normalizeTranscript(transcript)
    if (!normalizedTranscript) return

    if (viewMode === 'manager' || sendTarget === 'thread') {
      const thread = automation.selectedThread
      if (thread?.status === 'running') {
        enqueueManagerMessage(thread.id, {
          id: `mq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          content: normalizedTranscript,
          displayContent: normalizedTranscript,
          fullContent: normalizedTranscript,
          referencedFiles: undefined,
          attachments: undefined,
          providerId: chatProvider,
          runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
          model: cliModel ?? undefined,
          queuedAt: Date.now(),
        })
        return
      }
      await automation.handleSend(
        normalizedTranscript,
        chatProvider,
        chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
        cliModel ?? undefined,
      )
      return
    }

    const generatedTitle = deriveSessionTitle(normalizedTranscript)

    let sid = activeSessionId
    if (!sid) {
      if (!activeWorkspaceId) {
        promptForWorkspaceSelection()
        return
      }
      const session = await createSession(undefined, generatedTitle)
      sid = session?.id ?? null
    }
    if (!sid || !token) return
    await ensureSessionTitle(sid, normalizedTranscript)

    if (isLoading || messageQueue.length > 0) {
      enqueueMessage({
        content: normalizedTranscript,
        displayContent: normalizedTranscript,
        mode: chatMode,
        provider: chatProvider,
        runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
        model: cliModel ?? undefined,
      })
      return
    }

    sendMessage(normalizedTranscript, {
      token,
      sessionId: sid,
      mode: chatMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      model: cliModel ?? undefined,
      onLoginRequired: () => setShowLoginDialog(true),
    })
  }, [activeSessionId, activeWorkspaceId, automation.handleSend, automation.selectedThread, chatMode, chatProvider, chatProviderRuntimeMode, cliModel, createSession, enqueueManagerMessage, enqueueMessage, ensureSessionTitle, isLoading, messageQueue.length, promptForWorkspaceSelection, sendMessage, sendTarget, token, viewMode])

  // ── Push-to-talk voice recording state ─────────────────────────
  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceTranscribing, setVoiceTranscribing] = useState(false)
  const [voiceLevels, setVoiceLevels] = useState<number[]>(() => createSilentVoiceLevels())
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioStreamRef = useRef<MediaStream | null>(null)
  const voiceLevelsRef = useRef<number[]>(createSilentVoiceLevels())
  const voiceAudioContextRef = useRef<AudioContext | null>(null)
  const voiceAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null)
  const voiceLevelDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const voiceLevelFrameRef = useRef<number | null>(null)

  const resetVoiceLevels = useCallback(() => {
    const silent = createSilentVoiceLevels()
    voiceLevelsRef.current = silent
    setVoiceLevels(silent)
  }, [])

  const stopVoiceVisualizer = useCallback(() => {
    if (voiceLevelFrameRef.current !== null) {
      cancelAnimationFrame(voiceLevelFrameRef.current)
      voiceLevelFrameRef.current = null
    }
    voiceAudioSourceRef.current?.disconnect()
    voiceAudioSourceRef.current = null
    voiceAnalyserRef.current = null
    voiceLevelDataRef.current = null

    const audioContext = voiceAudioContextRef.current
    voiceAudioContextRef.current = null
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => {})
    }

    resetVoiceLevels()
  }, [resetVoiceLevels])

  const startVoiceVisualizer = useCallback((stream: MediaStream) => {
    stopVoiceVisualizer()

    try {
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.58

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
      voiceAudioContextRef.current = audioContext
      voiceAudioSourceRef.current = source
      voiceAnalyserRef.current = analyser
      voiceLevelDataRef.current = data

      const tick = () => {
        const analyserNode = voiceAnalyserRef.current
        const samples = voiceLevelDataRef.current
        if (!analyserNode || !samples) return

        analyserNode.getByteTimeDomainData(samples)
        let total = 0
        for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
          total += Math.abs((samples[sampleIndex] - 128) / 128)
        }
        const average = samples.length > 0 ? total / samples.length : 0
        const boostedLevel = Math.pow(Math.min(1, average * 6.8), 0.78)
        const targetLevel = Math.min(1, Math.max(VOICE_LEVEL_FLOOR, boostedLevel))
        const previousTail = voiceLevelsRef.current[voiceLevelsRef.current.length - 1] ?? VOICE_LEVEL_FLOOR
        const nextLevel = previousTail * 0.2 + targetLevel * 0.8
        const timeline = [
          ...voiceLevelsRef.current.slice(-(VOICE_LEVEL_BAR_COUNT - 1)),
          nextLevel,
        ]

        voiceLevelsRef.current = timeline
        setVoiceLevels(timeline)
        voiceLevelFrameRef.current = requestAnimationFrame(tick)
      }

      tick()
    } catch (error) {
      console.warn('Voice visualizer unavailable:', error)
      resetVoiceLevels()
    }
  }, [resetVoiceLevels, stopVoiceVisualizer])

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
    stopVoiceVisualizer()

    // Stop MediaRecorder and collect audio
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      audioStreamRef.current?.getTracks().forEach((t) => t.stop())
      audioStreamRef.current = null
      mediaRecorderRef.current = null
      return
    }

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

    if (settings.stt_provider === 'wyoming' || settings.stt_provider === 'whisper') {
      // Convert to WAV and send to backend
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
          body: JSON.stringify({
            audioBase64,
            sessionId: activeSessionId ?? 'voice-input',
            provider: settings.stt_provider,
          }),
        })
        const data = (await res.json()) as { text?: string; error?: string; details?: string }
        if (data.text) {
          setInputValue((prev) => appendTranscript(prev, data.text ?? ''))
        } else {
          console.warn('Transcription failed:', data.details ?? data.error)
        }
      } catch (err) {
        console.error('Transcription error:', err)
      } finally {
        setVoiceTranscribing(false)
      }
    }
  }, [activeSessionId, buildWavBlob, settings.stt_provider, token])

  const handleVoiceInput = useCallback(async () => {
    if (!token) {
      setShowLoginDialog(true)
      return
    }

    // Whisper / Wyoming provider: push-to-talk with MediaRecorder
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      })
      audioStreamRef.current = stream
      audioChunksRef.current = []
      startVoiceVisualizer(stream)

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.start()
      setVoiceRecording(true)
    } catch (err) {
      stopVoiceVisualizer()
      console.error('Microphone access denied:', err)
      window.alert('Microphone access is required for push-to-talk.')
    }
  }, [activeSessionId, settings.stt_provider, startVoiceVisualizer, stopVoiceVisualizer, submitVoiceTranscript, token])

  useEffect(() => {
    return () => {
      stopVoiceVisualizer()
      audioStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [stopVoiceVisualizer])

  const limitReached = error === 'limit_reached'
  const hasMessages = messages.length > 0 || isLoadingHistory
  const requiresAuthGate = !authLoading && !isAuthenticated
  const showMobileWorkspaceFullscreen =
    isMobile &&
    showMobileWorkspace &&
    !showTerminal &&
    (showWorkspaceTree || showWorkspaceEditor)
  const showMobileTerminalFullscreen =
    isMobile &&
    currentView === 'chat' &&
    viewMode === 'developer' &&
    showTerminal

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
        {!requiresAuthGate && (
          <>
            <header
              className={`relative flex items-center gap-1 border-b bg-background px-2 sm:gap-2 sm:px-5 shrink-0 ${isElectron ? 'h-10 !pl-[0.8rem]' : 'h-14'}`}
              style={isElectron ? {
                WebkitAppRegion: 'drag',
                paddingLeft: desktopPlatform === 'darwin' ? 70 : undefined,
                paddingRight: desktopPlatform === 'win32' ? 140 : undefined,
              } as React.CSSProperties : undefined}
            >
          {/* Left: Logo — always visible */}
          <div className="flex items-center shrink-0" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <JaitIcon size={20} className="shrink-0" />
          </div>

          {/* Nav — hidden on mobile, visible on md+ */}
          <nav className="hidden md:flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <Button
              variant={currentView === 'chat' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 shrink-0 rounded-lg px-2.5 text-xs sm:px-3"
              onClick={() => setCurrentView('chat')}
            >
              <MessageSquare className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Chat</span>
            </Button>
            <Button
              variant={currentView === 'jobs' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 shrink-0 rounded-lg px-2.5 text-xs sm:px-3"
              onClick={() => setCurrentView('jobs')}
            >
              <Calendar className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Jobs</span>
            </Button>
            <Button
              variant={currentView === 'network' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 shrink-0 rounded-lg px-2.5 text-xs sm:px-3"
              onClick={() => setCurrentView('network')}
            >
              <Wifi className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Network</span>
            </Button>
            {viewMode === 'developer' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showScreenShare ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 shrink-0 rounded-lg px-2.5 text-xs sm:px-3"
                    onClick={() => showScreenShare ? closeScreenSharePanel() : openScreenSharePanel()}
                  >
                    <Cast className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Share</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Screen sharing</TooltipContent>
              </Tooltip>
            )}
          </nav>

          {/* ViewModeSelector — absolutely centered in header */}
          {currentView === 'chat' && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
              <ViewModeSelector mode={viewMode} onChange={setViewMode} compact={isMobile} />
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1 min-w-0" />

          {/* Right: Context + Model + Account */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            {currentView === 'chat' && activeManagerThreads.length > 0 && (
              <ManagerActiveThreadsMenu
                threads={activeManagerThreads}
                getRepositoryForThread={automation.getRepositoryForThread}
                threadPrStates={automation.threadPrStates}
                ghAvailable={automation.ghAvailable}
                onOpenThread={(threadId) => {
                  setCurrentView('chat')
                  automation.setSelectedThreadId(threadId)
                  setSendTarget('thread')
                }}
                onStopThread={(threadId) => automation.handleStop(threadId)}
              />
            )}
            {/* Desktop status items — hidden on mobile */}
            <div className="hidden md:flex items-center gap-1 sm:gap-1.5">
            {screenShare.isActive && (
              <span className="ui-pill shrink-0">
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
                    <div className="ui-pill cursor-default sm:mr-2">
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

            </div>

            {updateInfo?.hasUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={async () => {
                      if (appPlatform === 'web') {
                        setCurrentView('settings')
                      } else if (appPlatform === 'electron') {
                        const desktop = (window as any).jaitDesktop
                        toast.info('Downloading update...')
                        const dl = await desktop.downloadUpdate()
                        if (dl?.ok) {
                          toast.success('Update downloaded. Restarting...')
                          await desktop.installUpdate()
                        } else {
                          toast.error('Download failed')
                        }
                      } else {
                        window.open(
                          'https://github.com/Widev-e-U/Jait/releases/latest',
                          '_blank',
                        )
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 border-amber-500/30 bg-amber-500/10 px-2 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300"
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">v{updateInfo.latestVersion}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Update available — v{updateInfo.latestVersion}</TooltipContent>
              </Tooltip>
            )}

            {/* Mobile overflow menu */}
            <div className="md:hidden shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Navigate</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setCurrentView('chat')}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Chat
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCurrentView('jobs')}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Jobs
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCurrentView('network')}>
                    <Wifi className="h-4 w-4 mr-2" />
                    Network
                  </DropdownMenuItem>
                  {viewMode === 'developer' && (
                    <DropdownMenuItem onSelect={() => showScreenShare ? closeScreenSharePanel() : openScreenSharePanel()}>
                      <Cast className="h-4 w-4 mr-2" />
                      {showScreenShare ? 'Hide Share' : 'Screen Share'}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setCurrentView('settings')}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

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
              <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs" onClick={() => setShowLoginDialog(true)}>
                Sign in
              </Button>
            )}

            {/* Linux custom window controls (Windows uses native titleBarOverlay, macOS uses traffic lights) */}
            {isElectron && desktopPlatform === 'linux' && (
              <div className="flex items-center ml-2 -mr-2">
                <button
                  onClick={() => (window as any).jaitDesktop.windowMinimize()}
                  className="flex h-[35px] w-11 items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => (window as any).jaitDesktop.windowMaximize()}
                  className="flex h-[35px] w-11 items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  {isMaximized
                    ? <svg width="10" height="10" viewBox="0 0 10 10" className="fill-current"><path d="M2 0v2H0v8h8V8h2V0zm5 7H1V3h6zM9 1v6H8V2H3V1z"/></svg>
                    : <Square className="h-3 w-3" />
                  }
                </button>
                <button
                  onClick={() => (window as any).jaitDesktop.windowClose()}
                  className="flex h-[35px] w-11 items-center justify-center hover:bg-red-600 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
            </header>

            {/* Chat-specific toolbar */}
            {currentView === 'chat' && (
              <div
                className={`flex border-b bg-muted/30 px-2 sm:px-5 shrink-0 ${
                  compactManagerToolbar
                    ? 'min-h-[35px] flex-wrap items-start gap-2 py-1.5'
                    : 'h-[35px] items-center gap-1 overflow-x-auto scrollbar-none'
                }`}
              >
            {viewMode === 'developer' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showSidebar ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 shrink-0 rounded-md px-2 text-xs"
                    onClick={() => setShowSidebar(s => !s)}
                  >
                    {showSidebar
                      ? <PanelLeftClose className={`h-3 w-3 mr-1${isMobile ? ' rotate-90' : ''}`} />
                      : <PanelLeftOpen className={`h-3 w-3 mr-1${isMobile ? ' rotate-90' : ''}`} />
                    }
                    Workspaces
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle workspaces sidebar</TooltipContent>
              </Tooltip>
            )}

            {/* Chat workspace / terminal controls */}
            {(viewMode === 'developer' || (viewMode === 'manager' && automation.selectedThread)) && (
              <>
                {viewMode === 'developer' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showTerminal ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 shrink-0 rounded-md px-2 text-xs"
                        onClick={() => { void handleToggleTerminal() }}
                      >
                        <TerminalIcon className="h-3 w-3 mr-1" />
                        Terminal
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Toggle terminal panel</TooltipContent>
                  </Tooltip>
                )}

                <div className="relative flex items-center shrink-0">
                  {isMobile ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={showWorkspace ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 rounded-md px-2 text-xs"
                        >
                          <Code className="h-3 w-3 mr-1" />
                          Editor
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => { void handleMobileWorkspaceDropdownAction('files') }}>
                          <FolderTree className="h-4 w-4 mr-2" />
                          Files
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { void handleMobileWorkspaceDropdownAction('git') }}>
                          <GitBranch className="h-4 w-4 mr-2" />
                          Changes
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { void handleMobileWorkspaceDropdownAction('editor') }}>
                          <Code className="h-4 w-4 mr-2" />
                          Editor
                        </DropdownMenuItem>
                        {viewMode === 'developer' && (
                          <DropdownMenuItem onSelect={() => { void handleMobileWorkspaceDropdownAction('terminal') }}>
                            <TerminalIcon className="h-4 w-4 mr-2" />
                            Terminal
                          </DropdownMenuItem>
                        )}
                        {showWorkspace && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => { void handleMobileWorkspaceDropdownAction('hide') }}>
                              <X className="h-4 w-4 mr-2" />
                              Hide workspace
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={showWorkspace ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 rounded-md px-2 text-xs"
                          onClick={() => { void handleToggleEditor() }}
                        >
                          <Code className="h-3 w-3 mr-1" />
                          Editor
                          {showWorkspace && <X className="h-3 w-3 ml-1" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{showWorkspace ? 'Hide editor' : 'Show editor'}</TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {viewMode === 'developer' && showWorkspace && activeWorkspace && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={previewOpen ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 shrink-0 rounded-md px-2 text-xs"
                        onClick={() => {
                          if (previewOpen) {
                            if (workspacePreviewState.open) {
                              workspaceRef.current?.closePreviewTarget()
                            } else {
                              closeDevPreviewPanel()
                            }
                          } else {
                            const nextTarget = workspacePreviewState.target
                              ?? devPreviewTarget?.trim()
                              ?? savedDevPreview?.target?.trim()
                              ?? null
                            if (routePreviewToWorkspace(nextTarget, activeWorkspace?.workspaceRoot ?? null)) {
                              return
                            }
                            openDevPreviewPanel()
                          }
                        }}
                      >
                        <Globe className="h-3 w-3 mr-1" />
                        Preview
                        {previewOpen && <X className="h-3 wer-3 ml-1" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{previewOpen ? 'Close preview' : 'Open dev preview'}</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}

            {viewMode === 'developer' && showWorkspace && activeWorkspace && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showArchitecture ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 shrink-0 rounded-md px-2 text-xs"
                    onClick={() => {
                      if (showArchitecture) {
                        workspaceRef.current?.closeArchitectureTab()
                        setShowArchitecture(false)
                      } else {
                        setShowArchitecture(true)
                        openArchitectureInWorkspace()
                      }
                    }}
                  >
                    <Boxes className="h-3 w-3 mr-1" />
                    Architecture
                    {showArchitecture && <X className="h-3 w-3 ml-1" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Software architecture diagram</TooltipContent>
              </Tooltip>
            )}

            {viewMode === 'developer' && showWorkspace && activeWorkspace && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showDebugPanel ? 'secondary' : 'ghost'}
                    size="sm"
                    className="ml-auto h-6 w-6 shrink-0 p-0"
                    onClick={() => setShowDebugPanel(d => !d)}
                  >
                    <Bug className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">SSE debug stream</TooltipContent>
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
                  <>
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
                  {automation.selectedRepo && automation.selectedRepo.source === 'local' && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] px-2 shrink-0"
                            onClick={() => setStrategyRepo(automation.selectedRepo)}
                          >
                            <ScrollText className="h-3 w-3 mr-1" />
                            Strategy
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Open repository strategy</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] px-2 shrink-0"
                            onClick={() => setPlanRepo(automation.selectedRepo)}
                          >
                            <ListChecks className="h-3 w-3 mr-1" />
                            Todos
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Open todo plan</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                  </>
                )}
                <div className="flex-1" />
                {automation.selectedThread ? (
                  <div className={isMobile ? 'flex min-w-0 basis-full items-start gap-1.5' : 'flex min-w-0 items-center gap-2 shrink-0'}>
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <ManagerStatusDot status={automation.selectedThread.status} />
                      <div className={`min-w-0 ${isMobile ? 'flex-1' : 'flex items-center gap-2'}`}>
                        {isTitlePending(automation.selectedThread.title) ? (
                          <TitleSkeleton className="text-[11px] h-3.5 w-28" />
                        ) : (
                          <span className={`text-[10px] text-muted-foreground truncate sm:text-[11px] ${isMobile ? 'block leading-tight' : 'max-w-[200px]'}`}>
                            {automation.selectedThread.title.replace(/^\[.*?\]\s*/, '')}
                          </span>
                        )}
                        <ThreadKindBadge kind={automation.selectedThread.kind} />
                        {(automation.selectedRepo || (isMobile && automation.selectedThread.branch)) && (
                          <span className={`text-[10px] text-muted-foreground truncate ${isMobile ? 'mt-0.5 block leading-tight' : 'max-w-[160px]'}`}>
                            {automation.selectedRepo
                              ? `${automation.selectedRepo.name} · ${automation.selectedRepo.defaultBranch}`
                              : ''}
                            {isMobile && automation.selectedThread.branch
                              ? `${automation.selectedRepo ? ' · ' : ''}${automation.selectedThread.branch}`
                              : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                      {!isMobile && automation.selectedThread.branch && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                          {automation.selectedThread.branch}
                        </Badge>
                      )}
                      {canStopThread(automation.selectedThread) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-[18px] w-[18px] sm:h-5 sm:w-5"
                          onClick={() => void automation.handleStop(automation.selectedThread!.id)}
                          title={automation.selectedThread.kind === 'delegation' ? 'End helper thread' : 'Stop thread'}
                        >
                          <Square className="h-2.5 w-2.5" />
                        </Button>
                      )}
                      {automation.showGitActions && automation.selectedRepo && (
                        <div className={isMobile ? 'shrink-0' : 'ml-2 shrink-0'}>
                          <ThreadActions
                            threadId={automation.selectedThread.id}
                            cwd={automation.selectedThread.workingDirectory ?? automation.selectedRepo.localPath}
                            branch={automation.selectedThread.branch}
                            baseBranch={automation.selectedRepo.defaultBranch}
                            threadTitle={automation.selectedThread.title}
                            threadStatus={automation.selectedThread.status}
                            threadKind={automation.selectedThread.kind}
                            prUrl={automation.selectedThread.prUrl}
                            prState={(automation.selectedThread.id in automation.threadPrStates ? automation.threadPrStates[automation.selectedThread.id] : automation.selectedThread.prState) as 'creating' | 'open' | 'closed' | 'merged' | null | undefined}
                            ghAvailable={automation.ghAvailable}
                            showStatusBadge={!isMobile}
                          />
                        </div>
                      )}
                    </div>
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
              jaitBackend={settings.jait_backend ?? 'openai'}
              onJaitBackendChange={async (next) => {
                await updateSettings({ jait_backend: next })
              }}
              onClearArchive={handleClearArchive}
              onClearArchivedWorkspaces={handleClearArchivedWorkspaces}
              onFetchArchivedWorkspaces={fetchArchivedWorkspaces}
              onRestoreWorkspace={handleRestoreWorkspace}
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
            <div className={isMobile ? 'contents' : 'relative flex min-h-0 shrink-0'}>
              {viewMode === 'developer' && showSidebar && (
                <aside className={`overflow-hidden ${isMobile ? 'h-52 border-b shrink-0' : 'w-64 border-r shrink-0'}`}>
                  <SessionSelector
                    workspaces={workspaces}
                    activeWorkspaceId={activeWorkspaceId}
                    loading={workspacesLoading}
                    hasMoreWorkspaces={hasMoreWorkspaces}
                    showFewerWorkspaces={workspaces.length > workspaceListLimit}
                    onSelectWorkspace={handleSwitchWorkspace}
                    onCreateWorkspace={handleCreateWorkspace}
                    onRemoveWorkspace={(workspaceId) => { void handleRemoveWorkspace(workspaceId) }}
                    onChangeDirectory={handleChangeDirectory}
                    onShowMore={showMoreWorkspaces}
                    onShowFewer={showFewerWorkspaces}
                    sessionInfo={sessionInfo}
                    nodes={fsNodes}
                  />
                </aside>
              )}

              {((viewMode === 'developer' && currentView === 'chat' && (showDesktopWorkspace || showTerminal))
                || (viewMode === 'manager' && automation.selectedThread && showDesktopWorkspace)) && (
                <div
                  className="flex min-h-0 shrink-0 flex-col"
                  style={!showDesktopWorkspace && showTerminal ? { width: 480, maxWidth: '70vw' } : undefined}
                >
                {(viewMode === 'developer' || (viewMode === 'manager' && automation.selectedThread)) && showDesktopWorkspace && (
                  <div className="flex min-h-0 flex-1">
                    <WorkspacePanel
                      ref={workspaceRef}
                      autoOpenRemotePath={activeWorkspace?.workspaceRoot ?? null}
                      surfaceId={activeWorkspace?.surfaceId ?? null}
                      files={workspaceFiles}
                      activeFileId={activeWorkspaceFileId}
                      onActiveFileChange={setActiveWorkspaceFileId}
                      onFileDrop={(files) => { void handleFileDrop(files) }}
                    onReferenceFile={handleReferenceFile}
                    onReferenceSelection={handleReferenceFileSelection}
                      onAvailableFilesChange={setAvailableFilesForMention}
                      showTree={showWorkspaceTree}
                      showEditor={showWorkspaceEditor}
                      onToggleTree={toggleWorkspaceTree}
                      onToggleEditor={toggleWorkspaceEditor}
                      changedPaths={changedPaths}
                      fsWatcherVersion={fsWatcherVersion}
                      savedTabsState={workspaceTabsState}
                      stateReady={workspaceStateReady}
                      previewRequest={workspacePreviewRequest}
                      onTabsStateChange={handleWorkspaceTabsStateChange}
                      onPreviewOpenChange={handleWorkspacePreviewOpenChange}
                      previewSessionId={activeSessionId}
                      previewToken={token}
                      previewWorkspaceRoot={activeWorkspace?.workspaceRoot ?? null}
                      previewInitialTarget={devPreviewTarget}
                      previewBrowserSessionId={devPreviewBrowserSessionId}
                      browserSessions={browserCollaboration.sessions}
                      browserInterventions={browserCollaboration.interventions}
                      onTakeBrowserControl={browserCollaboration.takeControl}
                      onReturnBrowserControl={browserCollaboration.returnControl}
                      onResumeBrowserSession={browserCollaboration.resume}
                      onResolveBrowserIntervention={browserCollaboration.resolveIntervention}
                      architectureDiagram={architectureDiagram}
                      architectureGenerating={architectureGenerating}
                      architectureRequest={architectureRequest}
                      onArchitectureOpenChange={setShowArchitecture}
                      onArchitectureRenderResult={handleArchitectureRenderResult}
                      onGenerateArchitecture={() => {
                        setArchitectureGenerating(true)
                        handleSuggestion('Analyze the workspace architecture and generate a mermaid diagram using the architecture.generate tool. Include all major modules, their relationships, data flow, and external dependencies.')
                      }}
                      onApplyDiff={handleApplyWorkspaceDiff}
                      provider={chatProvider}
                      cliModel={cliModel}
                    />
                  </div>
                )}
                {viewMode === 'developer' && showTerminal && !isMobile && currentView === 'chat' && (
                  <div className="flex min-h-0 shrink-0 flex-col border-r border-t bg-background" style={{ height: terminalHeight }}>
                    <div
                      onMouseDown={handleTerminalDragStart}
                      className="h-1 cursor-row-resize hover:bg-primary/30 transition-colors shrink-0"
                    />
                    <div className="relative">
                      <TerminalTabs
                        terminals={workspaceTerminals}
                        activeTerminalId={activeTerminalId}
                        onSelect={setActiveTerminalId}
                        onCreate={() => createTerminal(activeSessionId ?? 'default', activeWorkspaceRoot ?? undefined)}
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
                      <TerminalView
                        terminalId={activeTerminalId}
                        className="flex-1 min-h-0"
                        token={token}
                        workspaceRoot={activeWorkspaceRoot ?? undefined}
                        onReferenceSelection={handleReferenceTerminalSelection}
                      />
                    ) : (
                      <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
                        <button
                          onClick={() => createTerminal(activeSessionId ?? 'default', activeWorkspaceRoot ?? undefined)}
                          className="hover:text-foreground transition-colors"
                        >
                          + New Terminal
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>
            {showMobileTerminalFullscreen && (
              <section className="flex flex-1 min-h-0 flex-col border-b bg-background overflow-hidden">
                <div className="relative shrink-0 border-b">
                  <TerminalTabs
                    terminals={workspaceTerminals}
                    activeTerminalId={activeTerminalId}
                    onSelect={setActiveTerminalId}
                    onCreate={() => createTerminal(activeSessionId ?? 'default', activeWorkspaceRoot ?? undefined)}
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
                  <TerminalView
                    terminalId={activeTerminalId}
                    className="flex-1 min-h-0"
                    token={token}
                    workspaceRoot={activeWorkspaceRoot ?? undefined}
                    onReferenceSelection={handleReferenceTerminalSelection}
                  />
                ) : (
                  <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
                    <button
                      onClick={() => createTerminal(activeSessionId ?? 'default', activeWorkspaceRoot ?? undefined)}
                      className="hover:text-foreground transition-colors"
                    >
                      + New Terminal
                    </button>
                  </div>
                )}
              </section>
            )}
            {(viewMode === 'developer' || (viewMode === 'manager' && automation.selectedThread)) && showMobileWorkspaceFullscreen && (
              <section className="flex-1 min-h-0 border-b bg-background overflow-hidden">
                <WorkspacePanel
                  ref={workspaceRef}
                  autoOpenRemotePath={activeWorkspace?.workspaceRoot ?? null}
                  surfaceId={activeWorkspace?.surfaceId ?? null}
                  files={workspaceFiles}
                  activeFileId={activeWorkspaceFileId}
                  onActiveFileChange={setActiveWorkspaceFileId}
                  onFileDrop={(files) => { void handleFileDrop(files) }}
                  onReferenceFile={handleReferenceFile}
                  onReferenceSelection={handleReferenceFileSelection}
                  onAvailableFilesChange={setAvailableFilesForMention}
                  showTree={showWorkspaceTree}
                  showEditor={showWorkspaceEditor}
                  onToggleTree={toggleWorkspaceTree}
                  onToggleEditor={toggleWorkspaceEditor}
                  treeTab={mobileTreeTab}
                  onTreeTabChange={setMobileTreeTab}
                  changedPaths={changedPaths}
                  isMobile
                  savedTabsState={workspaceTabsState}
                  stateReady={workspaceStateReady}
                  previewRequest={workspacePreviewRequest}
                  onTabsStateChange={handleWorkspaceTabsStateChange}
                  onPreviewOpenChange={handleWorkspacePreviewOpenChange}
                  previewSessionId={activeSessionId}
                  previewToken={token}
                  previewWorkspaceRoot={activeWorkspace?.workspaceRoot ?? null}
                  previewInitialTarget={devPreviewTarget}
                  previewBrowserSessionId={devPreviewBrowserSessionId}
                  browserSessions={browserCollaboration.sessions}
                  browserInterventions={browserCollaboration.interventions}
                  onTakeBrowserControl={browserCollaboration.takeControl}
                  onReturnBrowserControl={browserCollaboration.returnControl}
                  onResumeBrowserSession={browserCollaboration.resume}
                  onResolveBrowserIntervention={browserCollaboration.resolveIntervention}
                  architectureDiagram={architectureDiagram}
                  architectureGenerating={architectureGenerating}
                  architectureRequest={architectureRequest}
                  onArchitectureOpenChange={setShowArchitecture}
                  onArchitectureRenderResult={handleArchitectureRenderResult}
                  onGenerateArchitecture={() => {
                    setArchitectureGenerating(true)
                    handleSuggestion('Analyze the workspace architecture and generate a mermaid diagram using the architecture.generate tool. Include all major modules, their relationships, data flow, and external dependencies.')
                  }}
                  onApplyDiff={handleApplyWorkspaceDiff}
                  provider={chatProvider}
                  cliModel={cliModel}
                />
              </section>
            )}

            {!showMobileWorkspaceFullscreen && (viewMode === 'manager' ? (
              /* ── Manager main content ────────────────────────────── */
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                {automation.selectedThread ? (
                  <>
                    {showWorkspace && (!showWorkspaceTree || !showWorkspaceEditor) && !isMobile && (
                      <div className="flex h-[35px] items-center gap-1 px-2 border-b bg-muted/20 shrink-0">
                        {!showWorkspaceTree && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={showWorkspaceTreePanel}
                                className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              >
                                <Eye className="h-3 w-3" />
                                <FolderTree className="h-3 w-3" />
                                <GitBranch className="h-3 w-3" />
                                Show Files + Changes
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Show files and source control</TooltipContent>
                          </Tooltip>
                        )}
                        {!showWorkspaceEditor && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={showWorkspaceEditorPanel}
                                className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                    <Conversation
                      key={automation.selectedThread?.id ?? 'manager-empty'}
                      className="min-h-0 flex-1 border-b"
                      loading={automation.loadingActivities}
                    >
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
                          provider={automation.selectedThread?.providerId as ProviderId | undefined}
                          onOpenPath={handleOpenMessagePath}
                          onOpenDiff={handleChangedFileClick}
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
                        {selectedManagerQueue.length > 0 && automation.selectedThread && (
                          <MessageQueue
                            items={selectedManagerQueue}
                            onRemove={(id) => dequeueManagerMessage(automation.selectedThread!.id, id)}
                            onEdit={(id, content) => updateManagerQueueItem(automation.selectedThread!.id, id, content)}
                            onReorder={(sourceId, targetId, placement) => reorderManagerQueueItem(automation.selectedThread!.id, sourceId, targetId, placement)}
                            onSendToParallelThread={sendManagerQueueItemToParallelThread}
                            className="mb-2"
                          />
                        )}
                        <PromptInput
                          ref={promptInputRef}
                          draftStateKey={`manager:${automation.selectedThread?.id ?? 'new-thread'}`}
                          value={inputValue}
                          onChange={setInputValue}
                          onSubmit={handleSubmit}
                          onQueue={handleManagerQueue}
                          onStop={() => { if (automation.selectedThread) void automation.handleStop(automation.selectedThread.id) }}
                          isLoading={automation.selectedThread?.status === 'running'}
                          disabled={automation.creating}
                          placeholder={automation.selectedThread?.providerSessionId || automation.selectedThread?.status === 'running' ? 'Send a follow-up message...' : 'Describe what you want to do...'}
                          onVoiceInput={handleVoiceInput}
                          voiceRecording={voiceRecording}
                          voiceLevels={voiceLevels}
                          voiceTranscribing={voiceTranscribing}
                          onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                          provider={chatProvider}
                          onProviderChange={handleChatProviderChange}
                          providerRuntimeMode={chatProviderRuntimeMode}
                          onProviderRuntimeModeChange={handleChatProviderRuntimeModeChange}
                          cliModel={cliModel}
                          onCliModelChange={handleCliModelChange}
                          repoRuntime={selectedThreadRepoRuntime}
                          onMoveToGateway={handleMoveRepoToGateway}
                          availableFiles={availableFilesForMention}
                          onSearchFiles={handleSearchFiles}
                          workspaceOpen={showWorkspace}
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
                      <div className="relative z-10 flex flex-col items-center px-3 pb-1.5 pt-3 sm:px-4 sm:pb-2 sm:pt-4">
                        <div className="w-full max-w-3xl">
                          <h1 className="mb-3 text-center text-xl font-semibold tracking-tight sm:mb-4 sm:text-2xl">What do you want to build?</h1>
                          {automation.error && (
                            <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 mb-3">
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 break-words">{automation.error}</span>
                            </div>
                          )}
                          <PromptInput
                          ref={promptInputRef}
                          draftStateKey={`manager:${automation.selectedRepo?.id ?? 'repo-draft'}`}
                          value={inputValue}
                          onChange={setInputValue}
                          onSubmit={handleSubmit}
                          disabled={threadComposerDisabled}
                          controlsDisabled={automation.creating || selectedRepoOffline}
                          placeholder={threadPlaceholder}
                          onVoiceInput={handleVoiceInput}
                          voiceRecording={voiceRecording}
                          voiceLevels={voiceLevels}
                          voiceTranscribing={voiceTranscribing}
                          onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                          provider={chatProvider}
                          onProviderChange={handleChatProviderChange}
                            providerRuntimeMode={chatProviderRuntimeMode}
                            onProviderRuntimeModeChange={handleChatProviderRuntimeModeChange}
                            cliModel={cliModel}
                            onCliModelChange={handleCliModelChange}
                            repoRuntime={selectedRepoRuntime}
                            onMoveToGateway={handleMoveRepoToGateway}
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

                          <div className="flex h-[35px] items-center justify-between border-b px-2.5 sm:px-3">
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
                            <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:py-12">
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
                                    onDelete={() => automation.handleDelete(thread.id)}
                                  />
                                )
                              })}
                              {automation.hasMoreThreads && (
                                <button
                                  className="px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:px-4 sm:py-2"
                                  onClick={automation.showMoreThreads}
                                >
                                  Show more threads
                                </button>
                              )}
                              {managerThreads.length > automation.threadListLimit && (
                                <button
                                  className="px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:px-4 sm:py-2"
                                  onClick={automation.showFewerThreads}
                                >
                                  Show less
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : !hasMessages ? (
              <div className="flex-1 min-w-0 flex flex-col items-center justify-center px-4">
                <div className="w-full max-w-3xl space-y-8">
                  <div className="text-center">
                    <h1 className="text-3xl font-semibold tracking-tight">Jait</h1>
                    <p className="text-base text-muted-foreground mt-1">Just Another Intelligent Tool</p>
                  </div>
                  {!workspacesLoading && workspaces.length === 0 ? (
                    <div className="text-center space-y-3">
                      <p className="text-sm text-muted-foreground">Add a workspace folder to start chatting with your code.</p>
                      <Button variant="default" size="lg" onClick={() => { setWorkspacePickerMode('workspace'); setFolderPickerOpen(true) }}>
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Add Workspace
                      </Button>
                    </div>
                  ) : (
                    <Suggestions suggestions={showWorkspace && activeWorkspace ? workspaceSuggestions : suggestions} onSelect={handleSuggestion} />
                  )}
                  <PromptInput
                    ref={promptInputRef}
                    draftStateKey={`developer:${activeSessionId ?? 'new-chat'}`}
                    value={inputValue}
                    segments={inputSegments}
                    onChange={setInputValue}
                    onSubmit={handleSubmit}
                    onStop={handleCancelRequest}
                    onQueue={handleQueue}
                    isLoading={isLoading}
                    placeholder={developerPlaceholder}
                    onVoiceInput={handleVoiceInput}
                    voiceRecording={voiceRecording}
                    voiceLevels={voiceLevels}
                    voiceTranscribing={voiceTranscribing}
                    onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                    mode={chatMode}
                    onModeChange={setChatMode}
                    sendTarget={sendTarget}
                    onSendTargetChange={setSendTarget}
                    provider={chatProvider}
                    onProviderChange={handleChatProviderChange}
                    providerRuntimeMode={chatProviderRuntimeMode}
                    onProviderRuntimeModeChange={handleChatProviderRuntimeModeChange}
                    cliModel={cliModel}
                    onCliModelChange={handleCliModelChange}
                    repoRuntime={sendTarget === 'thread' ? selectedRepoRuntime : null}
                    onMoveToGateway={sendTarget === 'thread' ? handleMoveRepoToGateway : undefined}
                    footerLeadingContent={sendTarget === 'thread' ? (
                      <ManagerRepoPicker
                        repositories={automation.repositories}
                        selectedRepo={automation.selectedRepo}
                        disabled={automation.creating}
                        getRuntimeInfo={automation.getRuntimeInfoForRepository}
                        onSelect={automation.setSelectedRepoId}
                        onAddRepository={() => automation.setFolderPickerOpen(true)}
                      />
                    ) : undefined}
                    availableFiles={availableFilesForMention}
                    onSearchFiles={handleSearchFiles}
                    workspaceOpen={showWorkspace}
                    sessionInfo={sessionInfo}
                    workspaceNodeId={activeWorkspace?.nodeId}
                  />
                  {viewMode === 'developer' && (
                    <div className="flex items-center justify-start px-1">
                      <SessionSwitcher
                        sessions={activeWorkspaceSessions}
                        activeSessionId={activeSessionId}
                        workspaceTitle={activeWorkspaceRecord?.title ?? null}
                        onSelectSession={(sessionId) => { if (activeWorkspaceId) switchSession(activeWorkspaceId, sessionId) }}
                        onNewSession={() => { void createSession() }}
                        onOpenChange={handleSessionSwitcherOpen}
                        showTitle={false}
                        triggerLabel="History"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-w-0 min-h-0 transition-all duration-300 ease-out">
                {/* Sticky show-panel buttons when workspace panels are hidden */}
                {showWorkspace && (!showWorkspaceTree || !showWorkspaceEditor) && !isMobile && (
                  <div className="flex h-[35px] items-center gap-1 px-2 border-b bg-muted/20 shrink-0">
                    {!showWorkspaceTree && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={showWorkspaceTreePanel}
                            className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Eye className="h-3 w-3" />
                            <FolderTree className="h-3 w-3" />
                            <GitBranch className="h-3 w-3" />
                            Show Files + Changes
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Show files and source control</TooltipContent>
                      </Tooltip>
                    )}
                    {!showWorkspaceEditor && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={showWorkspaceEditorPanel}
                            className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                <Conversation
                  key={activeSessionId ?? 'developer-empty'}
                  className="min-h-0 flex-1 border-b"
                  compact={showDesktopWorkspace}
                  loading={isLoadingHistory}
                >
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
                      displaySegments={msg.displaySegments}
                      attachments={msg.attachments}
                      thinking={msg.thinking}
                      thinkingDuration={msg.thinkingDuration}
                      toolCalls={msg.toolCalls}
                      segments={msg.segments}
                      isStreaming={isLoading && msg === messages[messages.length - 1]}
                      compact={showWorkspace || showScreenShare || previewOpen}
                      preferLlmUi
                      provider={chatProvider}
                      onOpenTerminal={handleOpenTerminalFromToolCall}
                      onEditMessage={handleEditPreviousMessage}
                      editComposer={{
                        onVoiceInput: handleVoiceInput,
                        voiceRecording,
                        voiceLevels,
                        voiceTranscribing,
                        onVoiceStop: () => { void stopRecordingAndTranscribe() },
                        mode: chatMode,
                        onModeChange: setChatMode,
                        sendTarget,
                        onSendTargetChange: setSendTarget,
                        provider: chatProvider,
                        onProviderChange: handleChatProviderChange,
                        providerRuntimeMode: chatProviderRuntimeMode,
                        onProviderRuntimeModeChange: handleChatProviderRuntimeModeChange,
                        cliModel,
                        onCliModelChange: handleCliModelChange,
                        repoRuntime: sendTarget === 'thread' ? selectedRepoRuntime : null,
                        onMoveToGateway: sendTarget === 'thread' ? handleMoveRepoToGateway : undefined,
                        footerLeadingContent: sendTarget === 'thread' ? (
                          <ManagerRepoPicker
                            repositories={automation.repositories}
                            selectedRepo={automation.selectedRepo}
                            disabled={automation.creating}
                            getRuntimeInfo={automation.getRuntimeInfoForRepository}
                            onSelect={automation.setSelectedRepoId}
                            onAddRepository={() => automation.setFolderPickerOpen(true)}
                          />
                        ) : undefined,
                        availableFiles: availableFilesForMention,
                        onSearchFiles: handleSearchFiles,
                        workspaceOpen: showWorkspace,
                        sessionInfo,
                        workspaceNodeId: activeWorkspace?.nodeId,
                      }}
                      onOpenPath={handleOpenMessagePath}
                      onOpenDiff={handleChangedFileClick}
                    />
                  ))}
                  {messageQueue.length > 0 && (
                    <MessageQueue
                      items={messageQueue}
                      onRemove={dequeueMessage}
                      onEdit={updateQueueItem}
                      onReorder={reorderQueueItem}
                    />
                  )}
                </Conversation>

                <div className={`shrink-0 py-3 ${showDesktopWorkspace ? 'px-3' : 'px-4'}`}>
                  <div className="mx-auto w-full max-w-3xl space-y-1.5">
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
                    <PromptInput
                      ref={promptInputRef}
                      draftStateKey={`developer:${activeSessionId ?? 'new-chat'}`}
                      value={inputValue}
                      segments={inputSegments}
                      onChange={setInputValue}
                      onSubmit={handleSubmit}
                      onStop={handleCancelRequest}
                      onQueue={handleQueue}
                      isLoading={isLoading}
                      disabled={limitReached}
                      placeholder={developerPlaceholder}
                      onVoiceInput={handleVoiceInput}
                      voiceRecording={voiceRecording}
                      voiceLevels={voiceLevels}
                      voiceTranscribing={voiceTranscribing}
                      onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                      mode={chatMode}
                      onModeChange={setChatMode}
                      sendTarget={sendTarget}
                      onSendTargetChange={setSendTarget}
                      provider={chatProvider}
                      onProviderChange={handleChatProviderChange}
                      providerRuntimeMode={chatProviderRuntimeMode}
                      onProviderRuntimeModeChange={handleChatProviderRuntimeModeChange}
                      cliModel={cliModel}
                      onCliModelChange={handleCliModelChange}
                      repoRuntime={sendTarget === 'thread' ? selectedRepoRuntime : null}
                      onMoveToGateway={sendTarget === 'thread' ? handleMoveRepoToGateway : undefined}
                      footerLeadingContent={sendTarget === 'thread' ? (
                        <ManagerRepoPicker
                          repositories={automation.repositories}
                          selectedRepo={automation.selectedRepo}
                          disabled={automation.creating}
                          getRuntimeInfo={automation.getRuntimeInfoForRepository}
                          onSelect={automation.setSelectedRepoId}
                          onAddRepository={() => automation.setFolderPickerOpen(true)}
                        />
                      ) : undefined}
                      availableFiles={availableFilesForMention}
                      onSearchFiles={handleSearchFiles}
                      workspaceOpen={showWorkspace}
                      sessionInfo={sessionInfo}
                      workspaceNodeId={activeWorkspace?.nodeId}
                    />
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {viewMode === 'developer' && (
                          <SessionSwitcher
                            sessions={activeWorkspaceSessions}
                            activeSessionId={activeSessionId}
                            workspaceTitle={activeWorkspaceRecord?.title ?? null}
                            onSelectSession={(sessionId) => { if (activeWorkspaceId) switchSession(activeWorkspaceId, sessionId) }}
                            onNewSession={() => { void createSession() }}
                            onOpenChange={handleSessionSwitcherOpen}
                            showTitle={false}
                            triggerLabel="History"
                          />
                        )}
                        <button onClick={() => {
                          clearMessages()
                          if (!activeWorkspaceId) {
                            promptForWorkspaceSelection()
                            return
                          }
                          void createSession()
                        }} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0">
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
            ))}
          </div>
        )}

            {/* Terminal panel rendered as sidebar-adjacent column above */}

            {viewMode === 'developer' && showDebugPanel && (
              <div className="fixed top-14 right-0 bottom-0 w-[420px] border-l z-50 shadow-xl">
                <SSEDebugPanel onClose={() => setShowDebugPanel(false)} />
              </div>
            )}
          </>
        )}

        {/* Electron drag region when auth gate is active (no header visible) */}
        {requiresAuthGate && isElectron && (
          <div
            className="fixed top-0 left-0 right-0 h-10 z-[60]"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          />
        )}

        {/* Auth gate — rendered as a plain full-screen layout (no Radix Dialog)
            to avoid focus-trap / pointer-event overhead that causes lag during
            Electron window drag on Windows. */}
        {requiresAuthGate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(220,17%,10%)]">
            <div className="w-full max-w-md border bg-background p-6 shadow-sm rounded-lg">
              {gatewayStep === 'url' ? (
                <>
                  <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                    <h2 className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
                      <Server className="h-5 w-5" />
                      Connect to Gateway
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Enter your Jait gateway URL to get started.
                    </p>
                  </div>
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
                  <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                    <h2 className="text-lg font-semibold leading-none tracking-tight">
                      {serverHasUsers === false ? 'Welcome to Jait' : 'Account'}
                    </h2>
                    <div className="text-sm text-muted-foreground">
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
                      ) : serverHasUsers === false ? (
                        <p>Create your account to get started.</p>
                      ) : (
                        <p>Sign in with a username and password.</p>
                      )}
                    </div>
                  </div>
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
                        <Button type="submit" className="w-full">{serverHasUsers === false ? 'Get Started' : 'Create account'}</Button>
                      </form>
                    </TabsContent>
                  </Tabs>
                  {authError && <p className="text-sm text-destructive">{authError}</p>}
                </>
              )}
            </div>
          </div>
        )}

        {/* Non-gate login dialog (user already authenticated, re-login) */}
        <Dialog
          open={showLoginDialog && !requiresAuthGate}
          onOpenChange={(open) => {
            setShowLoginDialog(open)
          }}
        >
          <DialogContent
            className="sm:max-w-md"
          >
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
                  <DialogTitle>{serverHasUsers === false ? 'Welcome to Jait' : 'Account'}</DialogTitle>
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
                    ) : serverHasUsers === false ? (
                      <p>Create your account to get started.</p>
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
                      <Button type="submit" className="w-full">{serverHasUsers === false ? 'Get Started' : 'Create account'}</Button>
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
          onOpenChange={(open) => { setFolderPickerOpen(open); if (!open) setChangeDirectoryWorkspaceId(null) }}
          initialPath={settings.workspace_picker_path}
          initialNodeId={settings.workspace_picker_node_id}
          onSelect={(path, nodeId) => {
            void handleWorkspaceFolderSelected(path, nodeId).catch((err) => {
              console.error('Failed to select workspace:', err)
              toast.error(`Failed to select workspace: ${err instanceof Error ? err.message : 'Unknown error'}`)
            })
          }}
        />

        {/* Folder picker for automation repos */}
        <FolderPickerDialog
          open={automation.folderPickerOpen}
          onOpenChange={automation.setFolderPickerOpen}
          onSelect={(path, nodeId) => { void automation.handleFolderSelected(path, nodeId) }}
        />

        {/* Strategy editor modal */}
        {strategyRepo && (
          <StrategyModal
            open={!!strategyRepo}
            onOpenChange={(open) => {
              if (!open) {
                setStrategyRepo(null)
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
              }
            }}
            repoId={planRepo.id}
            repoName={planRepo.name}
            defaultBranch={planRepo.defaultBranch}
            repoLocalPath={planRepo.localPath}
            provider={chatProvider}
            model={cliModel}
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
                  runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
                  kind: 'delivery',
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
              onPointerDown={onFloatingDragStart}
              style={{ touchAction: 'none' }}
            >
              <span className="text-xs font-medium flex items-center gap-1.5">
                <Cast className="h-3 w-3" /> Screen Share
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={closeScreenSharePanel}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <ScreenSharePanel screenShare={screenShare} />
            {/* Resize handle */}
            <div
              className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize opacity-50 hover:opacity-100"
              onPointerDown={onFloatingResizeStart}
              style={{ touchAction: 'none' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" className="text-muted-foreground">
                <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        )}

        <BrowserCollaborationPanel
          sessions={browserCollaboration.sessions}
          interventions={browserCollaboration.interventions}
          loading={browserCollaboration.loading}
          previewState={workspacePreviewState.open ? workspacePreviewState : savedDevPreview}
          onRefresh={browserCollaboration.refresh}
          onOpenLiveSession={routePreviewToWorkspace}
          onResolveIntervention={browserCollaboration.resolveIntervention}
        />
      </div>
    </TooltipProvider>
  )
}

export default App
