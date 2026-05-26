import { useState, useEffect, useCallback, useRef, useMemo, type FocusEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowUpCircle,
  AlertTriangle,
  Calendar,
  Bug,
  Cast,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  Eye,
  EyeOff,
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
  Timer,
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
  Brain,
  ScrollText,
  ListChecks,
  Boxes,
  Maximize2,
  Minimize2,
  ExternalLink,
  Mic,
  MicOff,
  PhoneOff,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ErrorBoundary } from '@/components/error-boundary'
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
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Conversation, Message, PromptInput, SessionSelector, SessionSwitcher, Suggestions, TodoList, MessageQueue, FilesChanged } from '@/components/chat'
import type { ReferencedFile, PromptInputHandle, ChangedFile, TodoItem, ToolCallInfo } from '@/components/chat'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import type { ChatAttachment } from '@/hooks/useChat'
import type { QueuedMessage as QueuedChatMessage } from '@/components/chat/message-queue'
import { PlanReview } from '@/components/chat/plan-review'
import { ContextIndicator } from '@/components/chat/context-indicator'
import { ConsentQueue } from '@/components/consent'
import { SSEDebugPanel } from '@/components/debug/sse-debug-panel'
import { JobsPage } from '@/components/jobs'
import { TodoPage } from '@/components/todo'
import { MemoryPage } from '@/components/reminders'
import { ThreadActions } from '@/components/automation/ThreadActions'
import { ThreadSkillPicker } from '@/components/automation/ThreadSkillPicker'
import { shouldRenderThreadActions } from '@/components/automation/thread-actions-state'
import { StrategyModal } from '@/components/automation/StrategyModal'
import { PlanModal } from '@/components/automation/PlanModal'
import { activitiesToMessages } from '@/lib/activity-to-messages'
import { SettingsPage, type UpdateInfo } from '@/components/settings/SettingsPage'
import { NetworkPanel } from '@/components/network'
import { ScreenSharePanel } from '@/components/screen-share'
import { useScreenShare } from '@/hooks/useScreenShare'
import { TerminalTabs, TerminalView, useTerminals, useAvailableShells } from '@/components/terminal'
import type { TerminalViewHandle } from '@/components/terminal'
import { ProjectPanel, projectLanguageForPath, type ProjectFile, type ProjectPanelHandle, type ProjectTabsState } from '@/components/project'
import type { PreviewInspectInteractiveElement } from '@/components/project/project-preview-inspect-panel'
import { DetachedTabView } from '@/components/project/detached-tab-view'
import { DetachedTerminalView, saveDetachedTerminal } from '@/components/terminal/detached-terminal-view'
import { FolderPickerDialog } from '@/components/project/folder-picker-dialog'
import { GatewayUnavailable } from '@/components/gateway-unavailable'
import { createActivityEvent, type ActivityEvent } from '@jait/ui-shared'
import { ModelIcon, formatModelDisplayLabel, getModelDisplayName, JaitIcon } from '@/components/icons/model-icons'
import { useAuth, type ThemeMode, type SttProvider, type ChatProvider } from '@/hooks/useAuth'
import { useChat, type ChatMode } from '@/hooks/useChat'
import { useModelInfo } from '@/hooks/useModelInfo'
import { useProjects } from '@/hooks/useProjects'
import { useUICommands } from '@/hooks/useUICommands'
import { useSessionState } from '@/hooks/useSessionState'
import { useProjectState } from '@/hooks/useProjectState'
import { useAutomation } from '@/hooks/useAutomation'
import { normalizeChangedFiles } from '@/lib/changed-files'
import { emitPreviewSession } from '@/lib/preview-events'
import { ViewModeSelector } from '@/components/chat/view-mode-selector'
import type { ViewMode } from '@/components/chat/view-mode-selector'
import { SendTargetSelector } from '@/components/chat/send-target-selector'
import type { SendTarget } from '@/components/chat/send-target-selector'
import type { ProjectOpenData, TerminalFocusData, FsChangesPayload, ArchitectureUpdateData, DevPreviewPanelState, ProjectUIState, ResponseStyle } from '@jait/shared'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useConfiguredTheme } from '@/hooks/use-configured-theme'
import { useWakeWord } from '@/hooks/useWakeWord'
import { useVoiceAssistant } from '@/hooks/useVoiceAssistant'
import { AgentAudioVisualizerWave } from '@/components/agent-audio-visualizer-wave'
import { getActiveVsCodeTheme, setActiveVsCodeTheme } from '@/lib/vscode-theme-store'
import {
  normalizePersistedSelectedRepo,
  resolvePersistedSelectedRepoId,
  type PersistedSelectedRepo,
} from '@/lib/automation-selection-storage'
import { resolveDeveloperThreadRepoAutoSelect } from '@/lib/developer-thread-repo-selection'

import { Badge } from '@/components/ui/badge'
import { getApiUrl, getStoredGatewayUrl, getWsUrl, setStoredGatewayUrl, isGatewayConfigured } from '@/lib/gateway-url'
import {
  clampFloatingScreenSharePosition,
  clampFloatingScreenShareSize,
  getDefaultFloatingScreenSharePosition,
} from '@/lib/floating-screen-share'
import { inferThreadRepositoryName, type AutomationRepository, type RepositoryRuntimeInfo } from '@/lib/automation-repositories'
import { getProjectRepositoryId } from '@/lib/project-repositories'
import { getLatestProjectSessionId } from '@/lib/project-sessions'
import { agentsApi, type AgentThread, type ProviderId, type RuntimeMode, type ThreadStatus } from '@/lib/agents-api'
import { gitApi, type GitStatusResult } from '@/lib/git-api'
import { triggerSystemNotification } from '@/lib/system-notifications'
import { canStopThread } from '@/lib/thread-status'
import { getDeveloperChatSubmitLoading, getDeveloperChatUiState } from '@/lib/developer-chat-state'
import {
  buildMemoryFeedbackReminder,
  getMemoryFeedbackSuccessMessage,
  type MemoryFeedbackKind,
} from '@/lib/memory-feedback'
import {
  secretRequestMatchesTool,
  shouldRenderSecretRequestDialog,
  shouldRenderSecretRequestInline,
  type SecretInputRequest,
} from '@/lib/secret-input'
import { mergeHydratedTodoState, normalizeTodoStateValue, toPersistedTodoState } from '@/lib/todo-state'
import { isPathWithinProject } from '@/lib/project-links'
import {
  collapseMobileProject,
  getReopenedMobileProjectLayout,
  normalizeHydratedProjectLayout,
  showMobileProjectPane,
  toggleMobileProjectPane,
} from '@/lib/mobile-project-layout'
import { toggleDesktopProjectTreeVisibility } from '@/components/project/project-panel-layout'
import {
  getMobileProjectActiveTarget,
  isMobileProjectTargetActive,
  shouldRenderSessionSidebar,
  type MobileProjectTarget,
} from '@/lib/mobile-project-controls'
import {
  formatLineRange,
  type UserMessageSegment,
  type UserTerminalReference,
  userMessageTextFromSegments,
  userReferencedFilesFromSegments,
  userReferencedTerminalsFromSegments,
  userReferencedProjectsFromSegments,
} from '@/lib/user-message-segments'
import { appendTranscript, normalizeTranscript } from '@/lib/transcript-merge'

const API_URL = getApiUrl()
const WS_URL = getWsUrl()
const VOICE_LEVEL_BAR_COUNT = 28
const VOICE_LEVEL_FLOOR = 0.05

type AvailableFileForMention = { path: string; name: string; kind?: 'file' | 'dir' }
type ActiveProjectState = { surfaceId: string; projectRoot: string; nodeId?: string } | null
const VIEW_MODE_STORAGE_KEY = 'jait.viewMode'

function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function getRelativeProjectPath(path: string, projectRoot: string | null): string {
  const normalizedPath = normalizeProjectPath(path)
  if (!projectRoot) return normalizedPath
  const normalizedRoot = normalizeProjectPath(projectRoot)
  return normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : normalizedPath
}

function buildGitDiffCountMap(status: GitStatusResult | null, projectRoot: string | null): Map<string, { insertions: number; deletions: number }> {
  const counts = new Map<string, { insertions: number; deletions: number }>()
  if (!status) return counts

  const addCounts = (path: string, insertions: number, deletions: number) => {
    const normalizedPath = normalizeProjectPath(path)
    const existing = counts.get(normalizedPath) ?? { insertions: 0, deletions: 0 }
    counts.set(normalizedPath, {
      insertions: existing.insertions + insertions,
      deletions: existing.deletions + deletions,
    })
  }

  for (const file of [...status.index.files, ...status.workingTree.files]) {
    addCounts(file.path, file.insertions, file.deletions)
    if (projectRoot) {
      addCounts(`${normalizeProjectPath(projectRoot)}/${normalizeProjectPath(file.path)}`, file.insertions, file.deletions)
    }
  }

  return counts
}

function enrichChangedFilesWithDiffCounts(
  files: ChangedFile[],
  status: GitStatusResult | null,
  projectRoot: string | null,
): ChangedFile[] {
  const counts = buildGitDiffCountMap(status, projectRoot)
  if (counts.size === 0) return files

  return files.map((file) => {
    const normalizedPath = normalizeProjectPath(file.path)
    const relativePath = getRelativeProjectPath(file.path, projectRoot)
    const diffCounts = counts.get(normalizedPath) ?? counts.get(relativePath)
    return diffCounts ? { ...file, ...diffCounts } : file
  })
}

function areAvailableFilesEqual(a: AvailableFileForMention[], b: AvailableFileForMention[]) {
  if (a.length !== b.length) return false
  return a.every((file, index) => {
    const other = b[index]
    return other
      && file.path === other.path
      && file.name === other.name
      && file.kind === other.kind
  })
}

function areActiveProjectsEqual(a: ActiveProjectState, b: ActiveProjectState) {
  return a?.surfaceId === b?.surfaceId
    && a?.projectRoot === b?.projectRoot
    && (a?.nodeId ?? 'gateway') === (b?.nodeId ?? 'gateway')
}

function getProjectUiRestoreKey(projectId: string, ui: ProjectUIState) {
  const panel = ui.panel
    ? {
        open: ui.panel.open,
        remotePath: ui.panel.remotePath,
        nodeId: ui.panel.nodeId,
      }
    : null
  return JSON.stringify({
    projectId,
    panel,
    tabs: ui.tabs,
    layout: ui.layout,
    terminal: ui.terminal,
    preview: ui.preview,
  })
}


function areProjectUiValuesEqual(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function readStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'developer'
  const value = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
  return value === 'manager' ? 'manager' : 'developer'
}

function useSecretInputPrompt({
  token,
  sessionId,
}: {
  token: string | null
  sessionId: string | null
}) {
  const [requests, setRequests] = useState<SecretInputRequest[]>([])
  const [value, setValue] = useState('')
  const [remember, setRemember] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const activeRequest = requests[0] ?? null
  const renderInline = shouldRenderSecretRequestInline(activeRequest)

  const authHeaders = useCallback((contentType = false) => {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (contentType) headers['Content-Type'] = 'application/json'
    return headers
  }, [token])

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/secrets/requests`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) return
      const data = await res.json() as { requests: SecretInputRequest[] }
      setRequests(data.requests.filter((request) => !sessionId || request.sessionId === sessionId || shouldRenderSecretRequestInline(request)))
    } catch {
      // gateway down or reconnecting
    }
  }, [authHeaders, sessionId, token])

  useEffect(() => {
    if (!token) return
    void refresh()
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; sessionId?: string; payload?: unknown }
        if (msg.type === 'secret.requested') {
          const request = msg.payload as SecretInputRequest
          if (!sessionId || request.sessionId === sessionId || shouldRenderSecretRequestInline(request)) {
            setRequests((prev) => [request, ...prev.filter((item) => item.id !== request.id)])
          }
        }
        if (msg.type === 'secret.resolved') {
          const resolved = msg.payload as { id?: string }
          if (resolved.id) {
            setRequests((prev) => prev.filter((item) => item.id !== resolved.id))
            setValue('')
            setRemember(false)
          }
        }
      } catch {
        // ignore malformed events
      }
    }
    return () => ws.close()
  }, [refresh, sessionId, token])

  const submitSecret = useCallback(async () => {
    if (!activeRequest || !value) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/secrets/requests/${activeRequest.id}/submit`, {
        method: 'POST',
        headers: authHeaders(true),
        credentials: 'include',
        body: JSON.stringify({ value, remember: activeRequest.rememberable ? remember : false }),
      })
      if (!res.ok) throw new Error('Failed to submit secret')
      setRequests((prev) => prev.filter((item) => item.id !== activeRequest.id))
      setValue('')
      setRemember(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit secret')
    } finally {
      setSubmitting(false)
    }
  }, [activeRequest, authHeaders, remember, value])

  const cancelSecret = useCallback(async () => {
    if (!activeRequest) return
    setSubmitting(true)
    try {
      await fetch(`${API_URL}/api/secrets/requests/${activeRequest.id}/cancel`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      setRequests((prev) => prev.filter((item) => item.id !== activeRequest.id))
      setValue('')
      setRemember(false)
    } finally {
      setSubmitting(false)
    }
  }, [activeRequest, authHeaders])

  const form = activeRequest ? (
    <SecretInputForm
      request={activeRequest}
      value={value}
      onValueChange={setValue}
      submitting={submitting}
      showPassword={showPassword}
      onShowPasswordChange={setShowPassword}
      remember={remember}
      onRememberChange={setRemember}
      onSubmit={submitSecret}
      onCancel={cancelSecret}
      showTitle={renderInline}
    />
  ) : null

  const dialog = shouldRenderSecretRequestDialog(activeRequest) ? (
    <Dialog open onOpenChange={(open) => { if (!open) void cancelSecret() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{activeRequest.title}</DialogTitle>
          <DialogDescription>
            Enter the secret to continue.
          </DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  ) : null

  return {
    activeRequest,
    renderInline,
    form,
    dialog,
  }
}

function SecretInputForm({
  request,
  value,
  onValueChange,
  submitting,
  showPassword,
  onShowPasswordChange,
  remember,
  onRememberChange,
  onSubmit,
  onCancel,
  showTitle = false,
}: {
  request: SecretInputRequest
  value: string
  onValueChange: (value: string) => void
  submitting: boolean
  showPassword: boolean
  onShowPasswordChange: (value: boolean | ((prev: boolean) => boolean)) => void
  remember: boolean
  onRememberChange: (value: boolean) => void
  onSubmit: () => Promise<void>
  onCancel: () => Promise<void>
  showTitle?: boolean
}) {
  return (
    <div className="space-y-2.5">
      {showTitle && (
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium leading-4 text-foreground">{request.title}</p>
          <p className="text-[11px] leading-4 text-muted-foreground">This prompt is attached to the running tool call.</p>
        </div>
      )}
      <div>
        <p className="text-xs leading-5 text-muted-foreground">
          {request.prompt ?? 'Enter the secret to continue.'} <span className="hidden sm:inline">The value goes directly to the local gateway and is not sent to the model.</span>
        </p>
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`secret-input-${request.id}`}>Secret</Label>
        <div className="relative">
          <Input
            id={`secret-input-${request.id}`}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Password"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void onSubmit()
            }}
            className="h-9 pr-10 text-sm"
            autoFocus
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onShowPasswordChange((prev) => !prev)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {request.rememberable && (
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-2.5 py-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={remember}
            onChange={(event) => onRememberChange(event.target.checked)}
          />
          <span className="min-w-0 flex-1">
            Remember for {request.rememberLabel || request.prompt || request.title}
          </span>
        </label>
      )}
      <div className="flex justify-end gap-1.5">
        <Button className="h-8 px-3 text-xs" variant="ghost" onClick={() => void onCancel()} disabled={submitting}>Cancel</Button>
        <Button className="h-8 px-3 text-xs" onClick={() => void onSubmit()} disabled={submitting || !value}>Submit</Button>
      </div>
    </div>
  )
}

interface UserQuestionOption {
  label: string
  description?: string
  recommended?: boolean
}

interface UserQuestionItem {
  id: string
  header: string
  question: string
  multiSelect?: boolean
  options?: UserQuestionOption[]
  allowFreeformInput?: boolean
}

interface UserQuestionRequest {
  id: string
  sessionId: string
  requestedBy: string | null
  title: string
  questions: UserQuestionItem[]
  expiresAt: string
  status: 'pending' | 'submitted' | 'cancelled' | 'timeout'
}

interface UserQuestionAnswer {
  selected: string[]
  freeText: string | null
  skipped: boolean
}

function useUserQuestionPrompt({
  token,
  sessionId,
}: {
  token: string | null
  sessionId: string | null
}) {
  const [requests, setRequests] = useState<UserQuestionRequest[]>([])
  const [answers, setAnswers] = useState<Record<string, UserQuestionAnswer>>({})
  const [submitting, setSubmitting] = useState(false)
  const activeRequest = requests[0] ?? null

  const authHeaders = useCallback((contentType = false) => {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (contentType) headers['Content-Type'] = 'application/json'
    return headers
  }, [token])

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/user-questions/requests`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) return
      const data = await res.json() as { requests: UserQuestionRequest[] }
      setRequests(data.requests.filter((request) => !sessionId || request.sessionId === sessionId))
    } catch {
      // gateway down or reconnecting
    }
  }, [authHeaders, sessionId, token])

  useEffect(() => {
    if (!token) return
    void refresh()
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; payload?: unknown }
        if (msg.type === 'user-question.requested') {
          const request = msg.payload as UserQuestionRequest
          if (!sessionId || request.sessionId === sessionId) {
            setRequests((prev) => [request, ...prev.filter((item) => item.id !== request.id)])
          }
        }
        if (msg.type === 'user-question.resolved') {
          const resolved = msg.payload as { id?: string }
          if (resolved.id) {
            setRequests((prev) => prev.filter((item) => item.id !== resolved.id))
            setAnswers({})
          }
        }
      } catch {
        // ignore malformed events
      }
    }
    return () => ws.close()
  }, [refresh, sessionId, token])

  useEffect(() => {
    if (!activeRequest) {
      setAnswers({})
      return
    }
    setAnswers(Object.fromEntries(activeRequest.questions.map((question) => [
      question.id,
      { selected: [], freeText: null, skipped: false },
    ])))
  }, [activeRequest])

  const submitAnswers = useCallback(async () => {
    if (!activeRequest) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/user-questions/requests/${activeRequest.id}/submit`, {
        method: 'POST',
        headers: authHeaders(true),
        credentials: 'include',
        body: JSON.stringify({ answers }),
      })
      if (!res.ok) throw new Error('Failed to submit answers')
      setRequests((prev) => prev.filter((item) => item.id !== activeRequest.id))
      setAnswers({})
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit answers')
    } finally {
      setSubmitting(false)
    }
  }, [activeRequest, answers, authHeaders])

  const cancelRequest = useCallback(async () => {
    if (!activeRequest) return
    setSubmitting(true)
    try {
      await fetch(`${API_URL}/api/user-questions/requests/${activeRequest.id}/cancel`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      setRequests((prev) => prev.filter((item) => item.id !== activeRequest.id))
      setAnswers({})
    } finally {
      setSubmitting(false)
    }
  }, [activeRequest, authHeaders])

  const setAnswer = useCallback((questionId: string, update: Partial<UserQuestionAnswer>) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? { selected: [], freeText: null, skipped: false }), ...update },
    }))
  }, [])

  const dialog = activeRequest ? (
    <Dialog open onOpenChange={(open) => { if (!open) void cancelRequest() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{activeRequest.title}</DialogTitle>
          <DialogDescription>Jait needs your input to continue.</DialogDescription>
        </DialogHeader>
        <UserQuestionForm
          request={activeRequest}
          answers={answers}
          submitting={submitting}
          onAnswerChange={setAnswer}
          onSubmit={submitAnswers}
          onCancel={cancelRequest}
        />
      </DialogContent>
    </Dialog>
  ) : null

  return { activeRequest, dialog }
}

function UserQuestionForm({
  request,
  answers,
  submitting,
  onAnswerChange,
  onSubmit,
  onCancel,
}: {
  request: UserQuestionRequest
  answers: Record<string, UserQuestionAnswer>
  submitting: boolean
  onAnswerChange: (questionId: string, update: Partial<UserQuestionAnswer>) => void
  onSubmit: () => Promise<void>
  onCancel: () => Promise<void>
}) {
  const canSubmit = request.questions.some((question) => {
    const answer = answers[question.id]
    return answer?.skipped || Boolean(answer?.freeText?.trim()) || (answer?.selected.length ?? 0) > 0
  })

  return (
    <div className="space-y-4">
      {request.questions.map((question) => {
        const answer = answers[question.id] ?? { selected: [], freeText: null, skipped: false }
        return (
          <div key={question.id} className="space-y-2">
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-5 text-foreground">{question.header}</p>
              <p className="text-xs leading-5 text-muted-foreground">{question.question}</p>
            </div>
            {question.options?.length ? (
              <div className="space-y-1">
                {question.options.map((option) => {
                  const checked = answer.selected.includes(option.label)
                  return (
                    <label key={option.label} className="flex cursor-pointer items-start gap-2 rounded-md border border-border/70 px-2.5 py-2 text-xs">
                      <input
                        type={question.multiSelect ? 'checkbox' : 'radio'}
                        name={`user-question-${request.id}-${question.id}`}
                        className="mt-0.5 h-4 w-4 accent-primary"
                        checked={checked}
                        onChange={(event) => {
                          const selected = question.multiSelect
                            ? event.target.checked
                              ? [...answer.selected, option.label]
                              : answer.selected.filter((item) => item !== option.label)
                            : [option.label]
                          onAnswerChange(question.id, { selected, skipped: false })
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">{option.label}</span>
                        {option.recommended && <span className="ml-1 text-primary">Recommended</span>}
                        {option.description && <span className="block text-muted-foreground">{option.description}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : null}
            {question.allowFreeformInput !== false && (
              <Textarea
                value={answer.freeText ?? ''}
                placeholder="Type an answer..."
                className="min-h-20 text-sm"
                onChange={(event) => onAnswerChange(question.id, { freeText: event.target.value, skipped: false })}
              />
            )}
          </div>
        )
      })}
      <div className="flex justify-end gap-1.5">
        <Button className="h-8 px-3 text-xs" variant="ghost" onClick={() => void onCancel()} disabled={submitting}>Cancel</Button>
        <Button className="h-8 px-3 text-xs" onClick={() => void onSubmit()} disabled={submitting || !canSubmit}>Submit</Button>
      </div>
    </div>
  )
}

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

function summarizeForVoice(text: string, maxLength = 220): string {
  const normalized = text
    .replace(/```[\s\S]*?```/g, ' code omitted ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''
  const firstSentence = normalized.match(/[^.!?]+[.!?]/)?.[0]?.trim() ?? normalized
  if (firstSentence.length <= maxLength) return firstSentence
  return `${firstSentence.slice(0, maxLength - 1).trimEnd()}…`
}

function getPersistablePreviewTarget(target?: string | null): string | null {
  const trimmed = target?.trim() || ''
  return trimmed && trimmed !== '__preview__' ? trimmed : null
}

function getNonEmptyMessage(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function buildFileSelectionReferenceSegments(
  file: ReferencedFile,
  startLine: number,
  endLine: number,
): UserMessageSegment[] {
  return [
    { type: 'file', path: file.path, name: file.name, ...(file.kind ? { kind: file.kind } : {}), lineRange: { startLine, endLine } },
  ]
}

function buildTerminalSelectionReferenceSegments(
  terminal: UserTerminalReference,
  selection: string,
  startLine?: number,
  endLine?: number,
): UserMessageSegment[] {
  const lineCount = Math.max(1, selection.split(/\r?\n/).length)
  const lineRange = startLine && endLine && endLine >= startLine
    ? { startLine, endLine }
    : { startLine: 1, endLine: lineCount }
  return [
    {
      type: 'terminal',
      terminalId: terminal.terminalId,
      name: terminal.name,
      ...(terminal.projectRoot ? { projectRoot: terminal.projectRoot } : {}),
      lineRange,
      selectedText: selection.trim(),
    },
  ]
}

function buildPreviewElementReferenceSegments(
  element: PreviewInspectInteractiveElement,
): UserMessageSegment[] {
  const label = element.name?.trim() || element.text?.trim() || element.placeholder?.trim() || 'unnamed element'
  const kind = element.role ?? element.tagName ?? 'element'
  const details = [
    `Selected preview element: ${kind} "${label}"`,
    element.selector ? `Selector: ${element.selector}` : null,
    element.placeholder ? `Placeholder: ${element.placeholder}` : null,
    element.value ? `Value: ${element.value}` : null,
  ].filter(Boolean).join('\n')
  return [{ type: 'text', text: `${details}\n` }]
}

type AppView = 'chat' | 'todo' | 'memory' | 'jobs' | 'network' | 'settings'
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
  responseStyle?: ResponseStyle
  model?: string | null
  referencedFiles?: { path: string; name: string }[]
  displaySegments?: UserMessageSegment[]
}

type SavedQueuedThreadMessages = Record<string, ManagerQueuedMessage[]>

function isResponseStyle(value: unknown): value is ResponseStyle {
  return value === 'normal' || value === 'simple' || value === 'caveman' || value === 'caveman-ultra'
}

const suggestions = [
  'What can you help me with?',
  'Explain quantum computing',
  'Write a Python script',
  'What time is it?',
]

const projectSuggestions = [
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

function ManagerStatusDot({ status, kind }: { status: string; kind?: AgentThread['kind'] }) {
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

type ThreadPrState = 'creating' | 'open' | 'closed' | 'merged' | null | undefined

function getVisibleThreadPrState(thread: Pick<AgentThread, 'prState' | 'prUrl'>, polledPrState?: ThreadPrState): ThreadPrState {
  const prState = polledPrState !== undefined ? polledPrState : thread.prState
  return prState ?? (thread.prUrl ? 'open' : null)
}

function ThreadPrBadge({ prState }: { prState: ThreadPrState }) {
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

function ThreadKindBadge({ kind }: { kind: 'delivery' | 'delegation' }) {
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

function ManagerRepoPicker({
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

function App() {
  // Input value lives in a ref to avoid re-rendering the entire App on every keystroke.
  // inputVersion is bumped when the value is externally changed (clear on submit, voice, etc.)
  // so PromptInput can re-sync its contentEditable.
  const inputValueRef = useRef('')
  const [inputVersion, setInputVersion] = useState(0)
  const setInputValue = useCallback((valOrFn: string | ((prev: string) => string)) => {
    const next = typeof valOrFn === 'function' ? valOrFn(inputValueRef.current) : valOrFn
    inputValueRef.current = next
    setInputVersion((v) => v + 1)
  }, [])
  const handleInputChange = useCallback((text: string) => {
    inputValueRef.current = text
  }, [])
  const [inputSegments, setInputSegments] = useState<UserMessageSegment[] | undefined>(undefined)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<AppView>(() => {
    const validViews: AppView[] = ['chat', 'todo', 'memory', 'jobs', 'network', 'settings']
    const path = window.location.pathname.replace(/^\/+/, '').split('/')[0]
    const view = path === 'reminders' ? 'memory' : path as AppView
    return validViews.includes(view) ? view : 'chat'
  })
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [showSidebar, setShowSidebar] = useState(() => localStorage.getItem('showSessionsSidebar') === 'true')
  const [showTerminal, setShowTerminal] = useState(false)
  const [showManagerRepos, setShowManagerRepos] = useState(false)
  const [strategyRepo, setStrategyRepo] = useState<AutomationRepository | null>(null)
  const [planRepo, setPlanRepo] = useState<AutomationRepository | null>(null)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const [showProject, setShowProject] = useState(false)
  const [showMobileToolbar, setShowMobileToolbar] = useState(false)
  const showProjectRef = useRef(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const projectRestoreRef = useRef<(() => void) | null>(null)
  const closeProjectPanelRef = useRef<(() => void) | null>(null)
  const suppressProjectAutoOpenRef = useRef(false)
  const [devPreviewTarget, setDevPreviewTarget] = useState<string | null>(null)
  const [projectPreviewRequest, setProjectPreviewRequest] = useState<{ target?: string | null; key: number } | null>(null)
  const [projectPreviewState, setProjectPreviewState] = useState<DevPreviewPanelState>({
    open: false,
    target: null,
    displayState: 'hidden',
    displayTarget: null,
  })
  const [showScreenShare, setShowScreenShare] = useState(false)
  const [showProjectTree, setShowProjectTree] = useState(true)
  const [showProjectEditor, setShowProjectEditor] = useState(true)
  const [mobileTreeTab, setMobileTreeTab] = useState<'files' | 'git'>('files')
  const [activeProject, setActiveProject] = useState<ActiveProjectState>(null)
  const setActiveProjectIfChanged = useCallback((next: ActiveProjectState) => {
    setActiveProject((prev) => areActiveProjectsEqual(prev, next) ? prev : next)
  }, [])
  const activeProjectRef = useRef(activeProject)
  activeProjectRef.current = activeProject
  const [showDebugPanel, setShowDebugPanel] = useState(() => localStorage.getItem('showDebugPanel') === 'true')
  const [showArchitecture, setShowArchitecture] = useState(false)
  const [architectureDiagram, setArchitectureDiagram] = useState<string | null>(null)
  const [architectureFilePath, setArchitectureFilePath] = useState<string | null>(null)
  const [architectureGenerating, setArchitectureGenerating] = useState(false)
  const [architectureRequest, setArchitectureRequest] = useState<{ key: number } | null>(null)
  const architectureRenderRequestIdRef = useRef<string | null>(null)
  const loadedArchitectureProjectRef = useRef<string | null>(null)
  const defaultTerminalHeight = 360
  const [terminalHeight, setTerminalHeight] = useState(defaultTerminalHeight)
  const [terminalFullscreen, setTerminalFullscreen] = useState(false)
  const terminalHeightBeforeFullscreenRef = useRef(defaultTerminalHeight)
  const [terminalColumnWidth, setTerminalColumnWidth] = useState(480)
  const [chatMeasuredWidth, setChatMeasuredWidth] = useState<number | null>(null)
  const chatPanelRef = useRef<HTMLDivElement | null>(null)
  const chatPanelResizeObserverRef = useRef<ResizeObserver | null>(null)
  const [floatingSSPos, setFloatingSSPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 })
  const [floatingSSSize, setFloatingSSSize] = useState<{ w: number; h: number }>({ w: 420, h: 320 })
  const floatingDragRef = useRef<{ pointerId: number; startX: number; startY: number; posX: number; posY: number } | null>(null)
  const floatingResizeRef = useRef<{ pointerId: number; startX: number; startY: number; w: number; h: number } | null>(null)
  const floatingDragCleanupRef = useRef<(() => void) | null>(null)
  const floatingResizeCleanupRef = useRef<(() => void) | null>(null)
  const [approveAllInSession, setApproveAllInSession] = useState(false)
  const [chatMode, setChatMode] = useState<ChatMode>('agent')
  const [chatResponseStyle, setChatResponseStyle] = useState<ResponseStyle>('normal')
  const [sendTarget, setSendTarget] = useState<SendTarget>('agent')
  const [chatProvider, setChatProvider] = useState<ProviderId>('jait')
  const [chatProviderRuntimeMode, setChatProviderRuntimeMode] = useState<RuntimeMode>('full-access')
  const [cliModelsByProvider, setCliModelsByProvider] = useState<Partial<Record<CliProviderId, string | null>>>(
    () => loadLegacyCliModelsByProvider('jait')
  )
  const cliModel = cliModelsByProvider[chatProvider] ?? null
  const [viewMode, setViewMode] = useState<ViewMode>(() => readStoredViewMode())
  const prevViewModeRef = useRef<ViewMode>(viewMode)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('')
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false)
  const [serverHasUsers, setServerHasUsers] = useState<boolean | null>(null)
  const [gatewayUrlInput, setGatewayUrlInput] = useState(() => getStoredGatewayUrl() ?? '')
  const isStandaloneApp = !!(window as any).jaitDesktop || !!(window as any).Capacitor
  const isElectron = !!(window as any).jaitDesktop
  const isCapacitor = !!(window as any).Capacitor
  const appPlatform: 'web' | 'electron' | 'capacitor' = isElectron ? 'electron' : isCapacitor ? 'capacitor' : 'web'
  const { resolvedTheme: appliedThemeMode } = useConfiguredTheme(themeMode)
  const detachedProjectTabId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('detachedProjectTab')
    : null

  const detachedTerminalId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('detachedTerminal')
    : null

  // ── Gateway reachability ───────────────────────────────────────
  const [gatewayReachable, setGatewayReachable] = useState<boolean | null>(null)
  const gatewayCheckRef = useRef(false)

  const checkGatewayReachable = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/health`, { signal: AbortSignal.timeout(5000) })
      setGatewayReachable(res.ok)
    } catch {
      setGatewayReachable(false)
    }
  }, [])

  useEffect(() => {
    if (gatewayCheckRef.current) return
    gatewayCheckRef.current = true
    void checkGatewayReachable()
  }, [checkGatewayReachable])

  // ── Update state ───────────────────────────────────────────────
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateApplying, setUpdateApplying] = useState(false)
  const [updateAwaitingRestart, setUpdateAwaitingRestart] = useState(false)
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
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([])
  const [activeProjectFileId, setActiveProjectFileId] = useState<string | null>(null)
  const [availableFilesForMention, setAvailableFilesForMention] = useState<AvailableFileForMention[]>([])
  const handleAvailableFilesForMentionChange = useCallback((files: AvailableFileForMention[]) => {
    setAvailableFilesForMention((prev) => areAvailableFilesEqual(prev, files) ? prev : files)
  }, [])
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [projectPickerMode, setProjectPickerMode] = useState<'project' | 'editor'>('project')
  const [changeDirectoryProjectId, setChangeDirectoryProjectId] = useState<string | null>(null)
  const [fsNodes, setFsNodes] = useState<import('@jait/shared').FsNode[]>([])
  const isDragging = useRef(false)
  const projectRef = useRef<ProjectPanelHandle>(null)
  const promptInputRef = useRef<PromptInputHandle>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    showProjectRef.current = showProject
  }, [showProject])

  // ── Sync currentView ↔ URL path ────────────────────────────────
  // Push to history when view changes (skip on mount to avoid duplicate entry)
  const isInitialViewRef = useRef(true)
  useEffect(() => {
    if (isInitialViewRef.current) {
      // On mount, replace the URL to match the resolved view (e.g. '/' → '/chat')
      const target = currentView === 'chat' ? '/' : `/${currentView}`
      if (window.location.pathname !== target) {
        window.history.replaceState(null, '', target + window.location.search)
      }
      isInitialViewRef.current = false
      return
    }
    const target = currentView === 'chat' ? '/' : `/${currentView}`
    if (window.location.pathname !== target) {
      window.history.pushState(null, '', target)
    }
  }, [currentView])

  // Handle browser back/forward
  useEffect(() => {
    const validViews: AppView[] = ['chat', 'todo', 'memory', 'jobs', 'network', 'settings']
    const onPopState = () => {
      const path = window.location.pathname.replace(/^\/+/, '').split('/')[0]
      const view = path === 'reminders' ? 'memory' : path as AppView
      const next = validViews.includes(view) ? view : 'chat'
      setCurrentView(next)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // ── Deep link: jait:// protocol handler ───────────────────────
  // When a jait:// URL is opened, the browser navigates to /?jait=<full-url>.
  // Parse it once on mount to jump to the requested view.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('jait')
    if (!raw) return
    try {
      const url = new URL(raw)
      const rawView = url.hostname || url.pathname.replace(/^\/+/, '')
      const view = rawView === 'reminders' ? 'memory' : rawView
      const validViews = ['chat', 'todo', 'memory', 'jobs', 'network', 'settings'] as const
      type ValidView = typeof validViews[number]
      if (validViews.includes(view as ValidView)) {
        setCurrentView(view as ValidView)
      }
    } catch {
      // malformed URL — ignore
    }
    // Remove the ?jait param from the address bar without reloading
    const clean = new URL(window.location.href)
    clean.searchParams.delete('jait')
    window.history.replaceState(null, '', clean.toString())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── PWA file_handlers: launchQueue ────────────────────────────
  // When the OS opens a file with Jait (via file_handlers in manifest.json),
  // the browser hands us the files through launchQueue. We read them and add
  // them as attachments to the chat input.
  useEffect(() => {
    const lq = (window as any).launchQueue
    if (!lq) return
    lq.setConsumer(async (launchParams: { files: FileSystemFileHandle[] }) => {
      if (!launchParams.files.length) return
      for (const handle of launchParams.files) {
        try {
          const file: File = await handle.getFile()
          const mimeType = file.type || 'application/octet-stream'
          const reader = new FileReader()
          reader.onload = () => {
            const data = (reader.result as string).split(',')[1] ?? ''
            const preview = mimeType.startsWith('image/') ? (reader.result as string) : undefined
            promptInputRef.current?.addAttachment({ name: file.name, mimeType, data, preview })
            promptInputRef.current?.focus()
          }
          if (file.type.startsWith('image/')) {
            reader.readAsDataURL(file)
          } else {
            reader.readAsDataURL(new Blob([await file.arrayBuffer()], { type: mimeType }))
          }
        } catch {
          // skip unreadable file
        }
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [fsWatcherVersion, setFsWatcherVersion] = useState(0)
  const [fsWatcherPayload, setFsWatcherPayload] = useState<FsChangesPayload | null>(null)
  const showDesktopProject = !isMobile && showProject
  const showMobileProject = isMobile && showProject
  const shouldUseCompactDeveloperComposer =
    viewMode === 'developer' &&
    currentView === 'chat' &&
    showDesktopProject &&
    !chatCollapsed
  const compactDeveloperComposer = isMobile || (shouldUseCompactDeveloperComposer && (chatMeasuredWidth ?? 640) < 560)
  const setChatPanelElement = useCallback((el: HTMLDivElement | null) => {
    chatPanelResizeObserverRef.current?.disconnect()
    chatPanelResizeObserverRef.current = null
    chatPanelRef.current = el

    if (!el || typeof ResizeObserver === 'undefined') {
      setChatMeasuredWidth(null)
      return
    }

    const updateWidth = () => {
      setChatMeasuredWidth(Math.round(el.getBoundingClientRect().width))
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(el)
    chatPanelResizeObserverRef.current = observer
  }, [])

  useEffect(() => {
    return () => chatPanelResizeObserverRef.current?.disconnect()
  }, [])
  const showProjectEditorPanel = useCallback(() => {
    if (isMobile) {
      const nextLayout = showMobileProjectPane('editor')
      setShowProjectTree(nextLayout.tree)
      setShowProjectEditor(nextLayout.editor)
      return
    }
    setShowProjectEditor(true)
  }, [isMobile])
  const openArchitectureInProject = useCallback((projectRoot?: string | null) => {
    const targetProjectRoot = projectRoot?.trim() || activeProject?.projectRoot || null
    if (!targetProjectRoot) return
    setActiveProject((prev) => {
      if (prev?.projectRoot === targetProjectRoot) return prev
      return {
        surfaceId: prev?.surfaceId ?? '',
        projectRoot: targetProjectRoot,
        nodeId: prev?.nodeId,
      }
    })
    setViewMode('developer')
    if (!showProject) {
      showProjectRef.current = true
      setShowProject(true)
    }
    showProjectEditorPanel()
    setArchitectureRequest({ key: Date.now() })
  }, [activeProject?.projectRoot, showProject, showProjectEditorPanel])
  const closeProjectPreview = useCallback(() => {
    projectRef.current?.closePreviewTarget()
  }, [])
  const routePreviewToProject = useCallback((target?: string | null, projectRoot?: string | null) => {
    const trimmed = target?.trim() || null
    const nextPreviewState: DevPreviewPanelState = {
      open: true,
      target: trimmed,
      projectRoot: projectRoot?.trim() || activeProject?.projectRoot || null,
      displayState: trimmed ? 'connected' : 'blank',
      displayTarget: trimmed,
    }
    setViewMode('developer')
    setDevPreviewTarget(trimmed)
    setProjectPreviewState(nextPreviewState)
    if (!showProject) {
      showProjectRef.current = true
      setShowProject(true)
    }
    showProjectEditorPanel()
    setProjectPreviewRequest({ target: trimmed, key: Date.now() })
    return true
  }, [activeProject?.projectRoot, showProject, showProjectEditorPanel])

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
        setUpdateAwaitingRestart(true)
        toast.success(`Updated to v${updateInfo.latestVersion}. Gateway is restarting...`)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(getNonEmptyMessage((data as any).error, 'Update failed'))
      }
    } catch { toast.error('Update request failed') }
    setUpdateApplying(false)
  }, [token, updateInfo])

  const hardReloadAfterUpdate = useCallback(() => {
    const reloadUrl = new URL(window.location.href)
    reloadUrl.searchParams.set('_jaitUpdate', Date.now().toString())

    void (async () => {
      try {
        if ('caches' in window) {
          const cacheKeys = await caches.keys()
          await Promise.all(cacheKeys.map((key) => caches.delete(key)))
        }
      } catch {
        // Ignore cache API failures and still reload.
      }
      window.location.replace(reloadUrl.toString())
    })()
  }, [])

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
      setUpdateAwaitingRestart(false)
      if (appPlatform === 'web') {
        toast.success(`Gateway restarted on v${version}. Refreshing...`)
        hardReloadAfterUpdate()
        return
      }
      toast.success(`Gateway restarted on v${version}.`)
      void handleCheckUpdate()
    }
  }, [appPlatform, handleCheckUpdate, hardReloadAfterUpdate])

  // Auto-check for updates on mount (once authenticated)
  useEffect(() => {
    if (token) void handleCheckUpdate()
  }, [token, handleCheckUpdate])

  const onLoginRequired = useCallback(() => setShowLoginDialog(true), [])

  // Fetch filesystem nodes for project node tags
  useEffect(() => {
    if (!token) return
    void fetch(`${API_URL}/api/filesystem/nodes`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.nodes) setFsNodes(data.nodes) })
      .catch(() => {})
  }, [token])

  const {
    projects,
    personalSessions,
    archivedSessionsByProject,
    activeProjectId,
    activeSessionId,
    loading: projectsLoading,
    createSession,
    createProject,
    updateProject,
    assignProjectRepository,
    switchProject,
    switchSession,
    fetchArchivedSessions,
    removeProject,
    clearArchivedProjects,
    fetchArchivedProjects,
    restoreProject,
    renameSession,
    fetchProjects,
    hasMoreProjects,
    showMoreProjects,
    showFewerProjects,
    projectListLimit,
  } = useProjects(
    token,
    onLoginRequired,
  )
  useEffect(() => {
    suppressProjectAutoOpenRef.current = false
  }, [activeSessionId])

  const secretInput = useSecretInputPrompt({ token, sessionId: activeSessionId })
  const userQuestionInput = useUserQuestionPrompt({ token, sessionId: activeSessionId })
  const renderInlineSecretPrompt = useCallback((call: ToolCallInfo): ReactNode => {
    if (!secretInput.renderInline || !secretInput.form || !secretInput.activeRequest) return null
    if (call.status !== 'running' && call.status !== 'pending') return null
    if (!secretRequestMatchesTool(secretInput.activeRequest, call.tool, call.args)) return null
    return secretInput.form
  }, [secretInput.activeRequest, secretInput.form, secretInput.renderInline])

  const activeProjectRecord = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  )
  const tokenRef = useRef(token)
  tokenRef.current = token
  const authLoadingRef = useRef(authLoading)
  authLoadingRef.current = authLoading
  const projectsLoadingRef = useRef(projectsLoading)
  projectsLoadingRef.current = projectsLoading
  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const activeProjectRecordRef = useRef(activeProjectRecord)
  activeProjectRecordRef.current = activeProjectRecord
  const activeSessionRecord = useMemo(
    () => activeProjectRecord?.sessions.find((session) => session.id === activeSessionId)
      ?? personalSessions.find((session) => session.id === activeSessionId)
      ?? null,
    [activeSessionId, activeProjectRecord, personalSessions],
  )
  const activeProjectSessions = useMemo(() => {
    if (!activeProjectRecord) return personalSessions
    const active = activeProjectRecord.sessions
    const archived = archivedSessionsByProject[activeProjectRecord.id] ?? []
    const seen = new Set<string>()
    return [...active, ...archived]
      .filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true })
      .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
  }, [activeProjectRecord, archivedSessionsByProject, personalSessions])
  const waitForProjectHydration = useCallback(async () => {
    const deadline = Date.now() + 1500
    while (Date.now() < deadline) {
      if (!authLoadingRef.current && !projectsLoadingRef.current) return
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    }
  }, [])
  const handleChangeDirectory = useCallback((projectId: string) => {
    setChangeDirectoryProjectId(projectId)
    setFolderPickerOpen(true)
  }, [])

  const confirmDialog = useConfirmDialog()
  const handleRemoveProject = useCallback(async (projectId: string) => {
    const project = projects.find(w => w.id === projectId)
    const confirmed = await confirmDialog({
      title: 'Archive project',
      description: `Are you sure you want to archive "${project?.title || project?.rootPath || 'this project'}"? You can clear archived projects later from Settings.`,
      confirmLabel: 'Archive',
      variant: 'destructive',
    })
    if (!confirmed) return
    const removed = await removeProject(projectId)
    if (removed) {
      toast.success('Project archived.')
      return
    }
    toast.error('Failed to archive project.')
  }, [confirmDialog, removeProject, projects])
  const {
    messages,
    isLoading,
    isLoadingHistory,
    remainingPrompts,
    error,
    hitMaxRounds,
    hasMore: hasMoreMessages,
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
    loadOlderMessages,
  } = useChat(activeSessionId, token, onLoginRequired, activeProject?.surfaceId ?? null)
  const messageContents = useMemo(() => messages.map((msg) => msg.content), [messages])
  const [managerMessageQueues, setManagerMessageQueues] = useState<Record<string, ManagerQueuedMessage[]>>({})
  const [remoteMessageCompleteCount, setRemoteMessageCompleteCount] = useState(0)
  const [sourceControlRefreshSignal, setSourceControlRefreshSignal] = useState(0)
  const managerQueueProcessingRef = useRef(new Set<string>())
  const { terminals, activeTerminalId, setActiveTerminalId, createTerminal, killTerminal, refresh } = useTerminals(token)
  const terminalShells = useAvailableShells(token)
  const terminalViewRef = useRef<TerminalViewHandle>(null)

  // Focus the terminal whenever the active terminal or panel visibility changes
  useEffect(() => {
    if (showTerminal && activeTerminalId) {
      // Small delay to let the DOM settle after mount/re-render
      const id = setTimeout(() => terminalViewRef.current?.focus(), 50)
      return () => clearTimeout(id)
    }
  }, [showTerminal, activeTerminalId])

  const { provider, model } = useModelInfo()

  // ── Screen share (always active so Electron auto-registers) ───────
  const screenShare = useScreenShare({ token })

  // ── Automation / Manager mode state ───────────────────────────────
  const automation = useAutomation()
  automationRefreshRef.current = automation.refresh
  const activeProjectRepositoryId = useMemo(
    () => getProjectRepositoryId(activeProjectRecord),
    [activeProjectRecord],
  )
  const handleAssignProjectRepository = useCallback(async (projectId: string) => {
    const result = await assignProjectRepository(projectId)
    if (!result) {
      toast.error('No repository could be assigned. Make sure the project folder contains .git.')
      return
    }
    await automation.refresh()
    automation.setSelectedRepoId(result.repo.id)
    toast.success(result.skipped ? `Repository already assigned: ${result.repo.name}` : `Assigned repository: ${result.repo.name}`)
  }, [assignProjectRepository, automation.refresh, automation.setSelectedRepoId])

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
  const threadTargetRepo = automation.selectedRepo
  const threadTargetRepoRuntime = useMemo(
    () => (threadTargetRepo ? automation.getRuntimeInfoForRepository(threadTargetRepo) : null),
    [automation.getRuntimeInfoForRepository, threadTargetRepo],
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
  const canTargetThread = threadTargetRepo != null
  const selectedRepoOffline = threadTargetRepoRuntime != null && !threadTargetRepoRuntime.online && !threadTargetRepoRuntime.loading
  const threadComposerDisabled = automation.creating || !canTargetThread || selectedRepoOffline
  const threadPlaceholder = !threadTargetRepo
    ? 'Select a repository to start a thread...'
    : selectedRepoOffline
      ? 'Repository is offline...'
      : automation.selectedThread
        ? 'Send a follow-up to the selected thread...'
        : 'Describe what you want to do...'
  const developerPlaceholder = sendTarget === 'thread'
    ? threadPlaceholder
    : sendTarget === 'swarm'
      ? 'Describe a multi-agent task...'
      : 'Ask anything...'

  const developerThreadRepoAutoSelectRef = useRef<string | null>(null)

  useEffect(() => {
    const nextSelection = resolveDeveloperThreadRepoAutoSelect({
      viewMode,
      sendTarget,
      projectId: activeProjectId,
      projectRepoId: activeProjectRepositoryId,
      repositories: automation.repositories,
      lastAppliedKey: developerThreadRepoAutoSelectRef.current,
    })

    if (!nextSelection) return

    developerThreadRepoAutoSelectRef.current = nextSelection.nextAppliedKey
    if (nextSelection.repoId && automation.selectedRepoId !== nextSelection.repoId) {
      automation.setSelectedRepoId(nextSelection.repoId)
    }
  }, [
    activeProjectId,
    activeProjectRepositoryId,
    automation.repositories,
    automation.selectedRepoId,
    automation.setSelectedRepoId,
    sendTarget,
    viewMode,
  ])


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

  // Project-scoped state delivered by WS full-state push that depends on
  // activeProjectRecord (loaded async from REST). Stashed here by
  // handleFullState and applied by a deferred effect once the record loads.
  const pendingWsProjectStateRef = useRef<{
    projectId: string
    ui: ProjectUIState
  } | null>(null)

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

  const previousChangedFilesCountRef = useRef<number | null>(null)
  useEffect(() => {
    previousChangedFilesCountRef.current = null
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
  const voiceAssistantRef = useRef<ReturnType<typeof useVoiceAssistant> | null>(null)
  const voiceOverlayOpenRef = useRef(false)

  useEffect(() => {
    if (messageQueue.length > 0) {
      chatQueueSeenRef.current = true
    }
  }, [messageQueue.length])

  const chatCompletionSignal = completionCount + remoteMessageCompleteCount
  const sourceControlCompletionCountRef = useRef(completionCount)
  const sourceControlRemoteCompletionCountRef = useRef(remoteMessageCompleteCount)

  useEffect(() => {
    if (completionCount === sourceControlCompletionCountRef.current) return
    sourceControlCompletionCountRef.current = completionCount
    setSourceControlRefreshSignal((prev) => prev + 1)
  }, [completionCount])

  useEffect(() => {
    if (remoteMessageCompleteCount === sourceControlRemoteCompletionCountRef.current) return
    const shouldRefresh = remoteMessageCompleteCount > sourceControlRemoteCompletionCountRef.current
    sourceControlRemoteCompletionCountRef.current = remoteMessageCompleteCount
    if (shouldRefresh) setSourceControlRefreshSignal((prev) => prev + 1)
  }, [remoteMessageCompleteCount])

  useEffect(() => {
    if (chatNotificationSessionRef.current === activeSessionId) return
    chatNotificationSessionRef.current = activeSessionId
    setRemoteMessageCompleteCount(0)
    sourceControlRemoteCompletionCountRef.current = 0
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

  // ── Voice-assistant session (OpenAI Realtime via gateway) ───
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false)

  const voiceAssistant = useVoiceAssistant({
    authToken: token,
    onError: (err) => {
      console.warn('[voice] error:', err)
    },
    onDisconnected: () => {
      setVoiceOverlayOpen(false)
    },
  })
  voiceAssistantRef.current = voiceAssistant
  voiceOverlayOpenRef.current = voiceOverlayOpen

  useEffect(() => {
    const announceThreadResult = async (completedThread: AgentThread) => {
      try {
        const activities = await agentsApi.getActivities(completedThread.id, 40)
        const lastAssistantActivity = [...activities].reverse().find((activity) => {
          if (activity.kind !== 'message') return false
          const payload = (activity.payload ?? {}) as Record<string, unknown>
          return payload.role === 'assistant' && (typeof payload.content === 'string' || typeof activity.summary === 'string')
        })

        const payload = (lastAssistantActivity?.payload ?? {}) as Record<string, unknown>
        const assistantText = typeof payload.content === 'string'
          ? payload.content
          : (lastAssistantActivity?.summary ?? '')
        const summary = summarizeForVoice(assistantText)
        const spokenUpdate = summary
          ? `${completedThread.title} finished. ${summary}`
          : completedThread.status === 'completed'
            ? `${completedThread.title} finished successfully.`
            : `${completedThread.title} finished with status ${completedThread.status}.`
        voiceAssistantRef.current?.announce(spokenUpdate)
      } catch {
        const fallback = completedThread.status === 'completed'
          ? `${completedThread.title} finished successfully.`
          : `${completedThread.title} finished with status ${completedThread.status}.`
        voiceAssistantRef.current?.announce(fallback)
      }
    }

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

        setSourceControlRefreshSignal((prev) => prev + 1)

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

        if (voiceOverlayOpenRef.current) {
          void announceThreadResult(completedThread)
        }
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

  // ── Unified project UI state (single DB row) ─────────────────────
  const [projectUI, setProjectUI, loadingProjectUI] = useProjectState<ProjectUIState>(
    activeProjectId, 'project.ui', token,
  )
  const projectUIRef = useRef<ProjectUIState | null>(null)
  projectUIRef.current = projectUI

  // Merge helper: updates one slice of the unified state and persists.
  // Eagerly update the ref so consecutive calls within the same render
  // cycle each see the previous call's updates instead of clobbering them.
  const updateProjectUI = useCallback(<K extends keyof ProjectUIState>(
    key: K, value: ProjectUIState[K], options?: { immediate?: boolean },
  ) => {
    const prev = projectUIRef.current ?? { panel: null, tabs: null, layout: null, terminal: null, preview: null }
    if (areProjectUiValuesEqual(prev[key], value)) return
    if (key === 'panel' || key === 'layout') {
          }
    const next = { ...prev, [key]: value }
    projectUIRef.current = next
    setProjectUI(next, options)
  }, [activeProjectId, setProjectUI])

  // Derived convenience setters matching previous per-key API
  const setSavedProject = useCallback((v: { open: boolean; remotePath: string; surfaceId?: string; nodeId?: string } | null, options?: { immediate?: boolean }) => {
    updateProjectUI('panel', v, { immediate: options?.immediate ?? true })
  }, [updateProjectUI])

  const setSavedTerminal = useCallback((v: { open: boolean } | null, options?: { immediate?: boolean }) => {
    updateProjectUI('terminal', v, options)
  }, [updateProjectUI])

  const setSavedDevPreview = useCallback((v: DevPreviewPanelState | null) => {
    updateProjectUI('preview', v)
  }, [updateProjectUI])

  const loadingProjectLayout = loadingProjectUI && !!activeProjectId && !!token
  const setSavedProjectLayout = useCallback((v: { tree: boolean; editor: boolean } | null, options?: { immediate?: boolean }) => {
    updateProjectUI('layout', v, { immediate: options?.immediate ?? true })
  }, [updateProjectUI])

  const setSavedProjectTabs = useCallback((v: ProjectTabsState | null) => {
    updateProjectUI('tabs', v)
  }, [updateProjectUI])

  const savedDevPreview = projectUI?.preview ?? null

  const [, setSavedScreenShare] = useSessionState<{ open: boolean }>(
    activeSessionId, 'screen-share.panel', token,
  )
  const [, setSavedChatMode, loadingChatMode] = useSessionState<ChatMode>(
    activeSessionId, 'chat.mode', token,
  )
  const [, setSavedChatResponseStyle, loadingChatResponseStyle] = useSessionState<ResponseStyle>(
    activeSessionId, 'chat.responseStyle', token,
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
  const [, setSavedTodoList] = useSessionState<TodoItem[]>(
    activeSessionId, 'todo_list', token,
  )
  const [, setSavedQueuedThreadMessages] = useSessionState<SavedQueuedThreadMessages>(
    activeSessionId, 'queued_thread_messages', token,
  )
  const [savedManagerSelectedRepo, setSavedManagerSelectedRepo, loadingManagerSelectedRepo] = useSessionState<PersistedSelectedRepo>(
    activeSessionId, 'manager.selectedRepo', token,
  )
  const [projectTabsState, setProjectTabsState] = useState<ProjectTabsState | null>(null)
  const [projectStateReady, setProjectStateReady] = useState(false)
  const [managerRepoStateReady, setManagerRepoStateReady] = useState(false)
  const projectUiRestoreKeyRef = useRef<string | null>(null)
  const projectSurfaceFallbackKeyRef = useRef<string | null>(null)

  const normalizedSavedManagerSelectedRepo = useMemo(
    () => normalizePersistedSelectedRepo(savedManagerSelectedRepo),
    [savedManagerSelectedRepo],
  )

  useEffect(() => {
        setProjectTabsState(null)
    setProjectStateReady(false)
    projectUiRestoreKeyRef.current = null
    projectSurfaceFallbackKeyRef.current = null
  }, [activeProjectId])

  useEffect(() => {
    managerRepoRestoreAppliedRef.current = false
    setManagerRepoStateReady(false)
  }, [activeSessionId])

  const managerRepoRestoreAppliedRef = useRef(false)

  useEffect(() => {
    if (!activeSessionId) {
      managerRepoRestoreAppliedRef.current = false
      setManagerRepoStateReady(false)
      return
    }
    if (loadingManagerSelectedRepo) return
    if (managerRepoRestoreAppliedRef.current) {
      if (!managerRepoStateReady) {
        setManagerRepoStateReady(true)
      }
      return
    }

    const persisted = normalizedSavedManagerSelectedRepo
    if (!persisted.repoId && !persisted.localPath) {
      managerRepoRestoreAppliedRef.current = true
      setManagerRepoStateReady(true)
      return
    }

    const resolvedRepoId = resolvePersistedSelectedRepoId(automation.repositories, persisted)
    if (!resolvedRepoId) {
      if (automation.repositories.length === 0) return
      managerRepoRestoreAppliedRef.current = true
      setManagerRepoStateReady(true)
      return
    }

    if (automation.selectedRepoId !== resolvedRepoId) {
      automation.setSelectedRepoId(resolvedRepoId)
      return
    }

    managerRepoRestoreAppliedRef.current = true
    setManagerRepoStateReady(true)
  }, [
    activeSessionId,
    automation.repositories,
    automation.selectedRepoId,
    automation.setSelectedRepoId,
    loadingManagerSelectedRepo,
    managerRepoStateReady,
    normalizedSavedManagerSelectedRepo,
  ])

  const managerRepoPersistInitRef = useRef(false)
  const prevManagerRepoPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    managerRepoPersistInitRef.current = false
    prevManagerRepoPayloadRef.current = null
  }, [activeSessionId])

  useEffect(() => {
    if (!activeSessionId || !token || loadingManagerSelectedRepo || !managerRepoStateReady) return

    const payload: PersistedSelectedRepo | null = automation.selectedRepo
      ? {
          repoId: automation.selectedRepo.id,
          localPath: automation.selectedRepo.localPath,
        }
      : null
    const serialized = JSON.stringify(payload)

    if (!managerRepoPersistInitRef.current) {
      managerRepoPersistInitRef.current = true
      prevManagerRepoPayloadRef.current = serialized
      if (serialized === JSON.stringify(normalizedSavedManagerSelectedRepo)) return
    } else if (serialized === prevManagerRepoPayloadRef.current) {
      return
    }

    prevManagerRepoPayloadRef.current = serialized
    setSavedManagerSelectedRepo(payload)
  }, [
    activeSessionId,
    automation.selectedRepo,
    loadingManagerSelectedRepo,
    managerRepoStateReady,
    normalizedSavedManagerSelectedRepo,
    setSavedManagerSelectedRepo,
    token,
  ])

  useEffect(() => {
    setProjectPreviewRequest(null)
  }, [activeProjectId])

  // Reset active project state when switching projects so the editor
  // doesn't keep showing the previous project's directory.
  useEffect(() => {
    setActiveProjectIfChanged(null)
  }, [activeProjectId, setActiveProjectIfChanged])

  // ── Persistent session state for changed files ─────────────────────
  type SavedChangedFile = ChangedFile | { path: string; name: string; state?: 'undecided' | 'accepted' | 'rejected' | null }
  const [, setSavedChangedFiles] = useSessionState<SavedChangedFile[]>(activeSessionId, 'changed_files', token)

  // ── Deferred project state from WS push ──────────────────────────
  // Panel and preview fields depend on activeProjectRecord (loaded async
  // from REST). This effect applies the stashed WS state once available.
  useEffect(() => {
    const pending = pendingWsProjectStateRef.current
    if (!pending) {
      // No stashed WS state to apply — if the project record is loaded,
      // we know there's nothing deferred and can unblock persisting.
      if (activeProjectRecord && !loadingProjectUI && !projectUI) {
                setProjectStateReady(true)
      }
      return
    }
    if (!activeProjectRecord) return
    if (!activeSessionId) return
    if (pending.projectId !== activeProjectId) return

    const { ui } = pending
    let cancelled = false

    const applyPendingProjectUI = async () => {
            // Apply project panel
      const wp = ui.panel
      if (wp) {
        const savedPath = wp.remotePath?.trim() || null
        const recordedPath = activeProjectRecord.rootPath?.trim() || null
        const restoredPath = recordedPath || savedPath
        if (restoredPath) {
          const requestedNodeId = activeProjectRecord.nodeId ?? wp.nodeId ?? 'gateway'
          suppressNextUiSync('project.panel')
          showProjectRef.current = wp.open === true
          setShowProject(wp.open === true)
          
          const currentProject = activeProjectRef.current
          const currentNodeId = currentProject?.nodeId ?? 'gateway'
          if (
            currentProject?.projectRoot === restoredPath
            && currentNodeId === requestedNodeId
            && currentProject.surfaceId
          ) {
            setActiveProjectIfChanged(currentProject)
          } else {
            try {
              const response = activeSessionId
                ? await fetch(`${API_URL}/api/project/open`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: restoredPath, sessionId: activeSessionId, nodeId: requestedNodeId }),
                  })
                : null
              if (response && !response.ok) throw new Error('Failed to open project')
              const data = response
                ? await response.json() as { surfaceId: string; projectRoot: string; nodeId?: string }
                : null
              if (cancelled) return
              setActiveProjectIfChanged({
                surfaceId: data?.surfaceId ?? wp.surfaceId ?? '',
                projectRoot: data?.projectRoot ?? restoredPath,
                nodeId: data?.nodeId || requestedNodeId,
              })
            } catch (error) {
              if (cancelled) return
              console.error('Failed to restore project editor:', error)
              setActiveProjectIfChanged({
                surfaceId: wp.surfaceId ?? '',
                projectRoot: restoredPath,
                nodeId: requestedNodeId,
              })
            }
          }
        }
      }

      // Re-apply project tabs — the reset effect
      // (setProjectTabsState(null) on activeProjectId change) may have
      // wiped the value that handleFullState set if the session state loaded
      // (changing activeProjectId) after the WS push arrived.
      if (ui.tabs) setProjectTabsState(ui.tabs)

      // Apply dev preview
      const dp = ui.preview
      if (dp) {
        const nextTarget = getPersistablePreviewTarget(dp.target)
        if (nextTarget) setDevPreviewTarget(nextTarget)
        if (dp.open && ui.panel?.open === true && nextTarget) {
          routePreviewToProject(nextTarget, dp.projectRoot ?? null)
        }
      }

      pendingWsProjectStateRef.current = null
      if (!cancelled) {
                setProjectStateReady(true)
      }
    }

    void applyPendingProjectUI()

    return () => {
      cancelled = true
    }
  }, [activeSessionId, activeProjectRecord, activeProjectId, loadingProjectUI, routePreviewToProject, projectUI]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeProjectId || !token || !activeSessionId) return
    if (loadingProjectUI) return
    if (!activeProjectRecord) return
    if (pendingWsProjectStateRef.current?.projectId === activeProjectId) return

    if (!projectUI) {
            setProjectStateReady(true)
      return
    }

    const restoreKey = getProjectUiRestoreKey(activeProjectId, projectUI)
    if (projectUiRestoreKeyRef.current === restoreKey) {
      if (!projectStateReady) setProjectStateReady(true)
      return
    }
    projectUiRestoreKeyRef.current = restoreKey

    let cancelled = false

    const applyProjectUI = async () => {
      const ui = projectUI
      
      if (ui.layout) {
        suppressNextUiSync('project.layout')
        const hydratedLayout = normalizeHydratedProjectLayout({
          tree: ui.layout.tree !== false,
          editor: ui.layout.editor !== false,
        }, isMobile)
                setShowProjectTree(hydratedLayout.tree)
        setShowProjectEditor(hydratedLayout.editor)
      }

      if (ui.tabs) setProjectTabsState(ui.tabs)

      const wp = ui.panel
      if (wp) {
        const savedPath = wp.remotePath?.trim() || null
        const recordedPath = activeProjectRecord.rootPath?.trim() || null
        const restoredPath = recordedPath || savedPath
        const shouldOpen = wp.open === true
        showProjectRef.current = shouldOpen
        setShowProject(shouldOpen)
        
        if (restoredPath) {
          const requestedNodeId = activeProjectRecord.nodeId ?? wp.nodeId ?? 'gateway'
          suppressNextUiSync('project.panel')
          const currentProject = activeProjectRef.current
          const currentNodeId = currentProject?.nodeId ?? 'gateway'
          if (
            currentProject?.projectRoot === restoredPath
            && currentNodeId === requestedNodeId
            && currentProject.surfaceId
          ) {
            setActiveProjectIfChanged(currentProject)
          } else {
            try {
              const response = await fetch(`${API_URL}/api/project/open`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: restoredPath, sessionId: activeSessionId, nodeId: requestedNodeId }),
              })
              if (!response.ok) throw new Error('Failed to open project')
              const data = await response.json() as { surfaceId: string; projectRoot: string; nodeId?: string }
              if (cancelled) return
              setActiveProjectIfChanged({
                surfaceId: data.surfaceId,
                projectRoot: data.projectRoot,
                nodeId: data.nodeId || requestedNodeId,
              })
            } catch (error) {
              if (cancelled) return
              console.error('Failed to restore project editor:', error)
              setActiveProjectIfChanged({
                surfaceId: wp.surfaceId ?? '',
                projectRoot: restoredPath,
                nodeId: requestedNodeId,
              })
            }
          }
        }
      } else {
        showProjectRef.current = false
        setShowProject(false)
              }

      const dp = ui.preview
      if (dp) {
        const nextTarget = getPersistablePreviewTarget(dp.target)
        if (nextTarget) setDevPreviewTarget(nextTarget)
        if (dp.open && ui.panel?.open === true && nextTarget) {
          routePreviewToProject(nextTarget, dp.projectRoot ?? null)
        }
      }

      if (!cancelled) {
                setProjectStateReady(true)
      }
    }

    void applyProjectUI()

    return () => {
      cancelled = true
    }
  }, [
    activeSessionId,
    activeProjectId,
    activeProjectRecord,
    isMobile,
    loadingProjectUI,
    routePreviewToProject,
    suppressNextUiSync,
    token,
    projectStateReady,
    projectUI,
  ])

  useEffect(() => {
    if (!activeProjectId || !activeSessionId || !activeProjectRecord?.rootPath) return
    if (activeProject) return
    if (!showProject) return
    if (!projectStateReady && loadingProjectUI) return

    const projectRoot = activeProjectRecord.rootPath.trim()
    if (!projectRoot) return
    const requestedNodeId = activeProjectRecord.nodeId ?? 'gateway'
    const restoreKey = `${activeProjectId}:${activeSessionId}:${projectRoot}:${requestedNodeId}`
    if (projectSurfaceFallbackKeyRef.current === restoreKey) return
    projectSurfaceFallbackKeyRef.current = restoreKey

    
    let cancelled = false
    void fetch(`${API_URL}/api/project/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectRoot, sessionId: activeSessionId, nodeId: requestedNodeId }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to open project')
        return response.json() as Promise<{ surfaceId: string; projectRoot: string; nodeId?: string }>
      })
      .then((data) => {
        if (cancelled) return
                setActiveProjectIfChanged({
          surfaceId: data.surfaceId,
          projectRoot: data.projectRoot,
          nodeId: data.nodeId || requestedNodeId,
        })
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to recover project editor surface:', error)
          projectSurfaceFallbackKeyRef.current = null
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    activeSessionId,
    activeProject,
    activeProjectId,
    activeProjectRecord?.nodeId,
    activeProjectRecord?.rootPath,
    loadingProjectUI,
    showProject,
    projectStateReady,
  ])

  const mobileProjectInitKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!showMobileProject) {
      mobileProjectInitKeyRef.current = null
      return
    }
    const projectKey = `${activeProjectId ?? 'no-project'}:${activeProject?.surfaceId ?? activeProject?.projectRoot ?? 'no-project'}`
    if (mobileProjectInitKeyRef.current === projectKey) return
    mobileProjectInitKeyRef.current = projectKey
    if (!showProjectTree || !showProjectEditor) return
    const nextLayout = collapseMobileProject()
    setShowProjectTree(nextLayout.tree)
    setShowProjectEditor(nextLayout.editor)
  }, [showMobileProject, activeProjectId, activeProject?.surfaceId, activeProject?.projectRoot, showProjectTree, showProjectEditor])

  // ── Cross-client state sync handler ───────────────────────────────
  const handleStateSync = useCallback((key: string, value: unknown) => {
    suppressNextUiSync(key)
    switch (key) {
      case 'project.panel':
        // Legacy session-scoped panel sync is intentionally ignored. Project
        // panel visibility is restored from project.ui; applying this older
        // channel can fight the project-scoped state and toggle forever.
        break
      case 'project.layout':
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const hydratedLayout = normalizeHydratedProjectLayout({
            tree: (value as { tree?: boolean }).tree !== false,
            editor: (value as { editor?: boolean }).editor !== false,
          }, isMobile)
          setShowProjectTree(hydratedLayout.tree)
          setShowProjectEditor(hydratedLayout.editor)
        }
        break
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
      case 'footer.menu':
        if (!value) {
          setShowMobileToolbar(false)
        } else {
          const v = value as { open?: boolean }
          setShowMobileToolbar(v.open === true)
        }
        break
      case 'chat.mode':
        if (value === 'ask' || value === 'agent' || value === 'swarm' || value === 'plan') {
          setChatMode(value)
        }
        break
      case 'chat.responseStyle':
        if (isResponseStyle(value)) {
          setChatResponseStyle(value)
        } else if (value === null) {
          setChatResponseStyle('normal')
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
        setTodoList(normalizeTodoStateValue(value))
        break
      case 'file_changed': {
        const fc = value as { path?: string; name?: string } | null
        if (fc?.path) addChangedFile(fc.path, fc.name ?? fc.path.split('/').pop() ?? fc.path)
        break
      }
      case 'changed_files': {
        // Full state sync of all changed files (including accept/reject decisions)
        if (Array.isArray(value)) {
          setChangedFiles(normalizeChangedFiles(value))
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
      case 'queued_thread_messages': {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          setManagerMessageQueues(value as SavedQueuedThreadMessages)
        } else if (value === null) {
          setManagerMessageQueues({})
        }
        break
      }
    }
  }, [setTodoList, addChangedFile, setChangedFiles, setMessageQueueState, routePreviewToProject, closeProjectPreview, isMobile, suppressNextUiSync, activeProject?.nodeId, activeProject?.surfaceId, activeProject?.projectRoot])

  // ── Full state hydration from backend (authoritative, pushed on subscribe) ──
  // This is called when the WebSocket delivers the initial full-state push.
  // It contains ALL session-scoped state AND project-scoped state (in the
  // `_project` envelope) so the UI can hydrate in a single message without
  // waiting for REST round-trips.
  //
  // AGENT NOTE: To handle a new persisted state key here:
  //   1. Add a case below for the key (session-scoped keys directly,
  //      project-scoped keys in the `_project.state` section).
  //   2. Session keys: apply directly in this callback.
  //      Project keys that depend on activeProjectRecord: stash in
  //      `pendingWsProjectStateRef` — the deferred effect will apply them.
  //   3. Backend: session keys are automatically included.  Project keys
  //      are automatically included via `_project` in index.ts.
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
    if (cm === 'ask' || cm === 'agent' || cm === 'swarm' || cm === 'plan') {
      setChatMode(cm)
    }

    const crs = state['chat.responseStyle']
    if (isResponseStyle(crs)) {
      setChatResponseStyle(crs)
    } else {
      setChatResponseStyle('normal')
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
      const storedViewMode = readStoredViewMode()
      if (storedViewMode === cv) {
        setViewMode(cv)
      } else {
              }
    }

    // Todo list
    setTodoList((current) => mergeHydratedTodoState(current, state['todo_list']))

    // Changed files
    const cf = state['changed_files']
    if (Array.isArray(cf)) {
      setChangedFiles(normalizeChangedFiles(cf))
    } else {
      setChangedFiles([])
    }

    const qm = state['queued_messages']
    if (Array.isArray(qm)) {
      setMessageQueueState(qm as SavedQueuedMessage[])
    } else {
      setMessageQueueState([])
    }

    const qtm = state['queued_thread_messages']
    if (qtm && typeof qtm === 'object' && !Array.isArray(qtm)) {
      setManagerMessageQueues(qtm as SavedQueuedThreadMessages)
    } else {
      setManagerMessageQueues({})
    }

    const fm = state['footer.menu']
    if (fm && typeof fm === 'object' && !Array.isArray(fm)) {
      const footerMenu = fm as { open?: boolean }
      setShowMobileToolbar(footerMenu.open === true)
    } else {
      setShowMobileToolbar(false)
    }

    // ── Project-scoped state (bundled inside _project envelope) ──
    // The project state hook is authoritative for project.ui. The
    // full-state packet can arrive after REST hydration and may contain an
    // older panel/layout snapshot, which would close the editor after reload.
    const wsEnvelope = state._project as { id: string; state: Record<string, unknown> } | null | undefined
    if (wsEnvelope?.id && wsEnvelope.state) {
          }
  }, [activeProjectId, setTodoList, setChangedFiles, setMessageQueueState, chatProvider, suppressNextUiSync])

  const loadArchitectureDiagramForProject = useCallback((projectRoot: string, signal?: AbortSignal) => {
    return fetch(`${API_URL}/api/architecture?projectRoot=${encodeURIComponent(projectRoot)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
      .then(async (response) => {
        if (!response.ok) return null
        const data = await response.json() as {
          diagram: { projectRoot: string; diagram: string; updatedAt: string; filePath?: string | null } | null
        }
        return data.diagram
      })
  }, [token])

  const { sendUIState, sendArchitectureRenderResult } = useUICommands({
    sessionId: activeSessionId,
    token,
    onStateSync: handleStateSync,
    onFullState: handleFullState,
    onMessageComplete: handleMessageComplete,
    onThreadEvent: automation.handleThreadEvent,
    onConnectionStateChange: handleUiConnectionStateChange,
    onFsChanges: useCallback((payload: FsChangesPayload) => {
      const activeSurfaceId = activeProjectRef.current?.surfaceId ?? null
      if (payload.surfaceId && activeSurfaceId && payload.surfaceId !== activeSurfaceId) return
      setFsWatcherPayload(payload)
      setFsWatcherVersion(v => v + 1)
      const projectRoot = activeProjectRef.current?.projectRoot?.trim() || null
      if (!projectRoot || loadedArchitectureProjectRef.current !== projectRoot) return
      const architectureRelativePath = architectureFilePath?.startsWith(projectRoot)
        ? architectureFilePath.slice(projectRoot.length).replace(/^[/\\]+/, '').replace(/\\/g, '/')
        : '.jait/architecture.mmd'
      const architectureChanged = payload.changes.some((change) => {
        const changedPath = change.path.replace(/\\/g, '/')
        return changedPath === architectureRelativePath || changedPath === 'architecture.mmd'
      })
      if (!architectureChanged) return
      void loadArchitectureDiagramForProject(projectRoot)
        .then((saved) => {
          setArchitectureDiagram(saved?.diagram ?? null)
          setArchitectureFilePath(saved?.filePath ?? null)
        })
        .catch(() => {
          setArchitectureDiagram(null)
          setArchitectureFilePath(null)
        })
    }, [architectureFilePath, loadArchitectureDiagramForProject]),
    listeners: {
      'project.open': useCallback((data: ProjectOpenData) => {
        setActiveProjectIfChanged({ surfaceId: data.surfaceId, projectRoot: data.projectRoot, nodeId: data.nodeId })
      }, [setActiveProjectIfChanged]),
      'project.close': useCallback(() => {
        setActiveProjectIfChanged(null)
      }, [setActiveProjectIfChanged]),
      'terminal.focus': useCallback((data: TerminalFocusData) => {
        setCurrentView('chat')
        setShowTerminal(true)
        setSavedTerminal({ open: true })
        void refresh()
        if (data.terminalId) {
          setActiveTerminalId(data.terminalId)
        }
        if (data.reason === 'interactive-input-required') {
          toast(data.message ?? 'Terminal wartet auf deine Eingabe (z. B. sudo Passwort).', {
            description: 'Klicke ins Terminal und gib die erforderliche Eingabe ein.',
            duration: 10000,
          })
        }
      }, [refresh, setSavedTerminal, setActiveTerminalId]),
      'dev-preview.open': useCallback((data: { target?: string | null; projectRoot?: string | null }) => {
        const target = typeof data.target === 'string' ? data.target.trim() : ''
        setCurrentView('chat')
        setDevPreviewTarget(target || null)
        setSavedDevPreview({ open: true, target: target || null, projectRoot: data.projectRoot ?? null })
        routePreviewToProject(target || null, data.projectRoot ?? null)
      }, [routePreviewToProject, setSavedDevPreview]),
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
          setArchitectureFilePath(data.filePath ?? null)
          setArchitectureGenerating(false)
          setShowArchitecture(true)
          if (data.projectRoot?.trim()) {
            loadedArchitectureProjectRef.current = data.projectRoot.trim()
          }
          openArchitectureInProject(data.projectRoot)
        }
      }, [openArchitectureInProject]),
    },
    onPreviewSessionEvent: emitPreviewSession,
  })

  const handleArchitectureRenderResult = useCallback((result: { ok: true } | { ok: false; error: string }) => {
    const requestId = architectureRenderRequestIdRef.current
    if (!requestId) return
    architectureRenderRequestIdRef.current = null
    sendArchitectureRenderResult(requestId, result)
  }, [sendArchitectureRenderResult])

  const handleProjectTabsStateChange = useCallback((state: ProjectTabsState | null) => {
    setProjectTabsState((prev) => areProjectUiValuesEqual(prev, state) ? prev : state)
    setSavedProjectTabs(state)
  }, [setSavedProjectTabs])

  useEffect(() => {
    const projectRoot = activeProject?.projectRoot?.trim() || null
    if (!projectRoot || !token) {
      loadedArchitectureProjectRef.current = null
      setArchitectureDiagram(null)
      setArchitectureFilePath(null)
      setArchitectureGenerating(false)
      return
    }
    if (loadedArchitectureProjectRef.current === projectRoot) return
    loadedArchitectureProjectRef.current = projectRoot
    setArchitectureDiagram(null)
    setArchitectureFilePath(null)
    let cancelled = false
    const controller = new AbortController()

    void loadArchitectureDiagramForProject(projectRoot, controller.signal)
      .then((saved) => {
        if (cancelled) return
        setArchitectureDiagram(saved?.diagram ?? null)
        setArchitectureFilePath(saved?.filePath ?? null)
      })
      .catch(() => {
        if (!cancelled) {
          setArchitectureDiagram(null)
          setArchitectureFilePath(null)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeProject?.projectRoot, loadArchitectureDiagramForProject, token])

  const prevProjectPanelPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeProjectId && token && !projectStateReady) {
            return
    }
    const hasHydratedProjectRecord = Boolean(activeProjectId && token && activeProjectRecord?.rootPath?.trim())
    if (hasHydratedProjectRecord && !activeProject && projectUI?.panel?.open === true) {
            return
    }
    const panel = activeProject
      ? {
          open: showProject,
          remotePath: activeProject.projectRoot,
          surfaceId: activeProject.surfaceId,
          nodeId: activeProject.nodeId,
        }
      : null
    const serialized = JSON.stringify(panel)
    if (serialized === prevProjectPanelPayloadRef.current) return
    prevProjectPanelPayloadRef.current = serialized
        setSavedProject(panel)
  }, [activeProject, activeProjectId, activeProjectRecord?.rootPath, setSavedProject, showProject, token, projectStateReady, projectUI?.panel?.open])

  const prevProjectLayoutPayloadRef = useRef<string | null>(null)
  const applyProjectLayout = useCallback((
    layout: { tree: boolean; editor: boolean },
    options?: { immediateSync?: boolean },
  ) => {
    setShowProjectTree(layout.tree)
    setShowProjectEditor(layout.editor)
    if (!layout.tree && !layout.editor) {
      showProjectRef.current = false
      setShowProject(false)
    }

    if (!options?.immediateSync) return

    prevProjectLayoutPayloadRef.current = JSON.stringify(layout)
    setSavedProjectLayout(layout, { immediate: true })
    if (activeSessionId) {
      sendUIState('project.layout', layout, activeSessionId)
    }
  }, [activeSessionId, sendUIState, setSavedProjectLayout])

  useEffect(() => {
    if (activeProjectId && token && (!projectStateReady || loadingProjectLayout)) {
            return
    }
    const layout = { tree: showProjectTree, editor: showProjectEditor }
    const serialized = JSON.stringify(layout)
    if (serialized === prevProjectLayoutPayloadRef.current) return
    prevProjectLayoutPayloadRef.current = serialized
        setSavedProjectLayout(layout)
    if (activeSessionId) {
      if (consumeSuppressedUiSync('project.layout')) return
      sendUIState('project.layout', layout, activeSessionId)
    }
  }, [showProjectTree, showProjectEditor, setSavedProjectLayout, activeProjectId, loadingProjectLayout, token, activeSessionId, consumeSuppressedUiSync, sendUIState, projectStateReady])

  const prevChatModePayloadRef = useRef<string | null>(null)
  const prevFooterMenuPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeSessionId && token && !wsFullStateReceivedRef.current) return
    const payload = { open: showMobileToolbar }
    const serialized = JSON.stringify(payload)
    if (serialized === prevFooterMenuPayloadRef.current) return
    prevFooterMenuPayloadRef.current = serialized
    if (consumeSuppressedUiSync('footer.menu')) return
    sendUIState('footer.menu', payload, activeSessionId)
  }, [activeSessionId, consumeSuppressedUiSync, sendUIState, showMobileToolbar, token])

  useEffect(() => {
    if (activeSessionId && token && loadingChatMode) return
    if (chatMode === prevChatModePayloadRef.current) return
    prevChatModePayloadRef.current = chatMode
    setSavedChatMode(chatMode)
    if (consumeSuppressedUiSync('chat.mode')) return
    sendUIState('chat.mode', chatMode, activeSessionId)
  }, [chatMode, setSavedChatMode, sendUIState, activeSessionId, loadingChatMode, token, consumeSuppressedUiSync])

  const prevChatResponseStylePayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeSessionId && token && loadingChatResponseStyle) return
    if (chatResponseStyle === prevChatResponseStylePayloadRef.current) return
    prevChatResponseStylePayloadRef.current = chatResponseStyle
    setSavedChatResponseStyle(chatResponseStyle)
    if (consumeSuppressedUiSync('chat.responseStyle')) return
    sendUIState('chat.responseStyle', chatResponseStyle, activeSessionId)
  }, [chatResponseStyle, setSavedChatResponseStyle, sendUIState, activeSessionId, loadingChatResponseStyle, token, consumeSuppressedUiSync])

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

  const prevTodoListPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeSessionId && token && !wsFullStateReceivedRef.current) return
    const payload = toPersistedTodoState(todoList)
    const serialized = `${activeSessionId ?? ''}:${JSON.stringify(payload)}`
    if (serialized === prevTodoListPayloadRef.current) return
    prevTodoListPayloadRef.current = serialized
    setSavedTodoList(payload)
    if (consumeSuppressedUiSync('todo_list')) return
    sendUIState('todo_list', payload, activeSessionId)
  }, [todoList, setSavedTodoList, sendUIState, activeSessionId, consumeSuppressedUiSync, token])

  const prevThreadQueuePayloadRef = useRef<string | null>(null)
  useEffect(() => {
    const payload = Object.keys(managerMessageQueues).length > 0 ? managerMessageQueues : null
    const serialized = `${activeSessionId ?? ''}:${JSON.stringify(payload)}`
    if (serialized === prevThreadQueuePayloadRef.current) return
    prevThreadQueuePayloadRef.current = serialized
    setSavedQueuedThreadMessages(payload)
    if (consumeSuppressedUiSync('queued_thread_messages')) return
    sendUIState('queued_thread_messages', payload, activeSessionId)
  }, [managerMessageQueues, setSavedQueuedThreadMessages, sendUIState, activeSessionId, consumeSuppressedUiSync])

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
    if (!showSidebar) return

    const frame = window.requestAnimationFrame(() => {
      sidebarRef.current?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [showSidebar])

  const handleSidebarBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    if (!isMobile) return
    const nextTarget = event.relatedTarget
    if (nextTarget && event.currentTarget.contains(nextTarget as Node)) return

    window.requestAnimationFrame(() => {
      const sidebar = sidebarRef.current
      const activeElement = document.activeElement
      if (!sidebar || (activeElement && sidebar.contains(activeElement))) return
      setShowSidebar(false)
    })
  }, [isMobile])

  useEffect(() => {
    localStorage.setItem('showDebugPanel', showDebugPanel ? 'true' : 'false')
  }, [showDebugPanel])

  const handleChatProviderChange = useCallback((provider: ProviderId) => {
    setChatProvider(provider)
  }, [])

  const handleChatResponseStyleChange = useCallback((style: ResponseStyle) => {
    setChatResponseStyle(style)
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
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
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

  const closeDevPreviewPanel = useCallback(() => {
    closeProjectPreview()
    setDevPreviewTarget(null)
    setProjectPreviewRequest(null)
    setProjectPreviewState({ open: false, target: null, displayState: 'hidden', displayTarget: null })
    setSavedDevPreview(null)
  }, [closeProjectPreview, setSavedDevPreview])

  const prevPreviewSyncRef = useRef<string>('')
  const handleProjectPreviewOpenChange = useCallback((state: { open: boolean; target: string | null }) => {
    const persistedTarget = getPersistablePreviewTarget(state.target)
    const displayState: DevPreviewPanelState['displayState'] = !state.open
      ? 'hidden'
      : persistedTarget
        ? 'connected'
        : 'blank'
    const nextPreviewState: DevPreviewPanelState = {
      open: state.open,
      target: persistedTarget,
      displayState,
      displayTarget: displayState === 'connected' ? persistedTarget : null,
    }
    setProjectPreviewState((prev) => {
      if (
        prev.open === nextPreviewState.open
        && prev.target === nextPreviewState.target
        && prev.displayState === nextPreviewState.displayState
        && prev.displayTarget === nextPreviewState.displayTarget
      ) return prev
      return nextPreviewState
    })
    if (state.open && persistedTarget) {
      const nextState: DevPreviewPanelState = {
        open: true,
        target: persistedTarget ?? devPreviewTarget ?? null,
        projectRoot: activeProject?.projectRoot ?? null,
        displayState,
        displayTarget: displayState === 'connected' ? (persistedTarget ?? devPreviewTarget ?? null) : null,
      }
      const key = `${nextState.open}:${nextState.target ?? ''}:${nextState.projectRoot ?? ''}:${nextState.displayState ?? ''}:${nextState.displayTarget ?? ''}`
      if (key === prevPreviewSyncRef.current) return
      prevPreviewSyncRef.current = key
      setSavedDevPreview(nextState)
      return
    }
    if (prevPreviewSyncRef.current === '') return
    prevPreviewSyncRef.current = ''
    setSavedDevPreview(null)
  }, [activeProject?.projectRoot, devPreviewTarget, setSavedDevPreview])

  const previewOpen = savedDevPreview?.open === true || projectPreviewState.open

  const openTerminalPanel = useCallback(() => {
    setShowTerminal(true)
    setSavedTerminal({ open: true }, { immediate: isMobile })
    if (consumeSuppressedUiSync('terminal.panel')) return
    sendUIState('terminal.panel', { open: true }, activeSessionId)
  }, [setSavedTerminal, sendUIState, activeSessionId, consumeSuppressedUiSync, isMobile])

  const closeTerminalPanel = useCallback(() => {
    setShowTerminal(false)
    setTerminalFullscreen(false)
    setSavedTerminal(null, { immediate: isMobile })
    if (consumeSuppressedUiSync('terminal.panel')) return
    sendUIState('terminal.panel', null, activeSessionId)
  }, [setSavedTerminal, sendUIState, activeSessionId, consumeSuppressedUiSync, isMobile])

  const closeProjectPanel = useCallback(() => {
    suppressProjectAutoOpenRef.current = true
    showProjectRef.current = false
    setShowProject(false)
    const nextPanel = activeProject
      ? {
          open: false,
          remotePath: activeProject.projectRoot,
          surfaceId: activeProject.surfaceId,
          nodeId: activeProject.nodeId,
        }
      : null
    prevProjectPanelPayloadRef.current = JSON.stringify(nextPanel)
    if (isMobile) {
      const collapsedLayout = collapseMobileProject()
      applyProjectLayout(collapsedLayout, { immediateSync: true })
    }
    if (nextPanel) {
      setSavedProject(nextPanel, { immediate: true })
    }
    // Don't clear showArchitecture or architectureRequest — they should
    // persist so architecture restores when the editor is reopened
    // (same behavior as preview). Only explicit close via the header
    // button should dismiss them.
  }, [activeProject, applyProjectLayout, isMobile, setSavedProject])
  closeProjectPanelRef.current = closeProjectPanel

  const toggleProjectTree = useCallback(() => {
    if (isMobile) {
      const nextLayout = toggleMobileProjectPane({ tree: showProjectTree, editor: showProjectEditor }, 'tree')
      applyProjectLayout(nextLayout, { immediateSync: true })
      return
    }
    const nextLayout = toggleDesktopProjectTreeVisibility({
      tree: showProjectTree,
      editor: showProjectEditor,
    })
    applyProjectLayout(nextLayout, { immediateSync: true })
  }, [applyProjectLayout, isMobile, showProjectTree, showProjectEditor])

  const toggleProjectEditor = useCallback(() => {
    if (isMobile) {
      const nextLayout = toggleMobileProjectPane({ tree: showProjectTree, editor: showProjectEditor }, 'editor')
      applyProjectLayout(nextLayout, { immediateSync: true })
      return
    }
    applyProjectLayout({ tree: showProjectTree, editor: !showProjectEditor }, { immediateSync: true })
  }, [applyProjectLayout, isMobile, showProjectTree, showProjectEditor])

  const showMobileProjectTreeTab = useCallback((tab: 'files' | 'git') => {
    setMobileTreeTab(tab)
    const nextLayout = showMobileProjectPane('tree')
    applyProjectLayout(nextLayout, { immediateSync: true })
  }, [applyProjectLayout])

  const showMobileProjectEditorTab = useCallback(() => {
    const nextLayout = showMobileProjectPane('editor')
    applyProjectLayout(nextLayout, { immediateSync: true })
  }, [applyProjectLayout])

  const openDevPreviewPanel = useCallback((target?: string | null) => {
    setCurrentView('chat')
    const nextTarget = target?.trim() || devPreviewTarget?.trim() || null
    setDevPreviewTarget(nextTarget)
    const state = { open: true, target: nextTarget, projectRoot: activeProject?.projectRoot ?? null }
    setSavedDevPreview(state)
    routePreviewToProject(nextTarget, activeProject?.projectRoot ?? null)
  }, [setSavedDevPreview, devPreviewTarget, routePreviewToProject, activeProject?.projectRoot])

  // Helper: create a filesystem surface on the gateway so ALL clients
  // can browse the directory remotely (enables cross-device sync).
  const openRemoteProjectOnGateway = useCallback(async (dirPath: string, nodeId?: string, sessionIdOverride?: string | null) => {
    const sessionId = sessionIdOverride ?? activeSessionId
    const res = await fetch(`${API_URL}/api/project/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath, sessionId, nodeId: nodeId || 'gateway' }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error((err as { message?: string }).message ?? 'Failed to open project')
    }
    if (token) {
      void updateSettings({
        project_picker_path: dirPath,
        project_picker_node_id: nodeId || 'gateway',
      }).catch(() => {
        // Best-effort persistence only; project open already succeeded.
      })
    }
    // The gateway broadcasts `project.open` via WS and persists state.
    // All clients (including this one) will receive it and hydrate automatically.
  }, [activeSessionId, token, updateSettings])

  const handleOpenMemorySource = useCallback((source: { sourceId?: string; sourceSurface?: string }) => {
    if (source.sourceSurface === 'chat' && source.sourceId) {
      const project = projects.find((candidate) => candidate.sessions.some((session) => session.id === source.sourceId))
      if (project) {
        setCurrentView('chat')
        switchSession(project.id, source.sourceId)
        return
      }
      if (personalSessions.some((session) => session.id === source.sourceId)) {
        setCurrentView('chat')
        switchSession(null, source.sourceId)
        return
      }
    }
    setCurrentView('memory')
  }, [personalSessions, projects, switchSession])

  const handleMemoryFeedback = useCallback(async (feedback: {
    messageId: string
    kind: MemoryFeedbackKind
    content: string
  }) => {
    if (!activeSessionId) {
      const error = new Error('No active chat session')
      toast.error(error.message)
      throw error
    }

    try {
      await agentsApi.createReminder(buildMemoryFeedbackReminder({
        kind: feedback.kind,
        messageId: feedback.messageId,
        sessionId: activeSessionId,
        projectId: activeProjectId,
        answerContent: feedback.content,
      }))
      toast.success(getMemoryFeedbackSuccessMessage(feedback.kind))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save memory feedback')
      throw error
    }
  }, [activeProjectId, activeSessionId])

  // Wrap switchProject so clicking a project also opens its remote directory
  // and shows the correct files/session in the editor.
  const handleSwitchProject = useCallback(async (projectId: string) => {
    const project = projects.find((w) => w.id === projectId)
    if (!project) return

    if (isMobile) {
      setShowSidebar(false)
    }

    // Determine which session to activate (mirrors switchProject logic)
    const nextSessionId = getLatestProjectSessionId(project)

    switchProject(projectId)

    // Open the project directory on the gateway and directly hydrate from the
    // response rather than relying on the WS `project.open` event, which is
    // session-scoped and may arrive before the WS re-subscribes to the new session.
    if (project.rootPath) {
      try {
        const res = await fetch(`${API_URL}/api/project/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: project.rootPath, sessionId: nextSessionId, nodeId: project.nodeId || 'gateway' }),
        })
        if (!res.ok) return
        const data = await res.json() as { surfaceId: string; projectRoot: string; nodeId?: string }
        const resolvedNodeId = data.nodeId || project.nodeId || undefined
        setActiveProjectIfChanged({ surfaceId: data.surfaceId, projectRoot: data.projectRoot, nodeId: resolvedNodeId })
        showProjectRef.current = true
        setShowProject(true)
        setSavedProject({ open: true, remotePath: data.projectRoot, surfaceId: data.surfaceId, nodeId: resolvedNodeId })
      } catch (e) {
        console.error('Failed to open project:', e)
      }
    }
  }, [projects, switchProject, setSavedProject, isMobile])

  const handleCreateProject = useCallback(() => {
    setProjectPickerMode('project')
    setFolderPickerOpen(true)
  }, [])

  const handleSessionSwitcherOpen = useCallback((open: boolean) => {
    if (!open || !activeProjectId) return
    if (!archivedSessionsByProject[activeProjectId]) {
      void fetchArchivedSessions(activeProjectId)
    }
  }, [activeProjectId, archivedSessionsByProject, fetchArchivedSessions])

  const handleProjectFolderSelected = useCallback(async (
    path: string,
    nodeId: string,
    options?: { openEditor?: boolean },
  ) => {
    // If we're changing the directory of an existing project
    if (changeDirectoryProjectId) {
      setChangeDirectoryProjectId(null)
      await updateProject(changeDirectoryProjectId, { rootPath: path, nodeId })
      void automation.refresh()
      return
    }
    const project = await createProject({ rootPath: path, nodeId })
    if (!project) {
      throw new Error('Failed to create project')
    }
    const session = project.sessions[0] ?? await createSession(project.id)
    if (!session) {
      throw new Error('Failed to create project session')
    }
    const nextOpen = options?.openEditor ?? projectPickerMode === 'editor'
    showProjectRef.current = nextOpen
    await openRemoteProjectOnGateway(path, nodeId, session.id)
    void automation.refresh()
    setShowProject(nextOpen)
    if (nextOpen && isMobile) {
      const nextLayout = showMobileProjectPane('editor')
      applyProjectLayout(nextLayout, { immediateSync: true })
    }
    setSavedProject({ open: nextOpen, remotePath: path, nodeId })
  }, [applyProjectLayout, automation.refresh, changeDirectoryProjectId, createSession, createProject, isMobile, updateProject, openRemoteProjectOnGateway, setSavedProject, projectPickerMode])

  const reopenPersistedProject = useCallback(async (
    path: string,
    nodeId?: string | null,
    sessionIdOverride?: string | null,
    options?: { mobileTarget?: 'background' | 'editor' },
  ) => {
    await openRemoteProjectOnGateway(path, nodeId ?? undefined, sessionIdOverride)
    showProjectRef.current = true
    setShowProject(true)
    if (isMobile) {
      applyProjectLayout(getReopenedMobileProjectLayout(options?.mobileTarget), { immediateSync: true })
    } else {
      setShowProjectTree(true)
      showProjectEditorPanel()
    }
    setSavedProject({ open: true, remotePath: path, nodeId: nodeId ?? undefined })
  }, [applyProjectLayout, isMobile, openRemoteProjectOnGateway, setSavedProject, showProjectEditorPanel])

  const ensureProjectReadyForSidebarAction = useCallback(async () => {
    if (!activeProjectRef.current && !activeProjectRecordRef.current && (authLoadingRef.current || projectsLoadingRef.current)) {
      await waitForProjectHydration()
    }

    if (activeProjectRef.current) return activeProjectRef.current

    const currentActiveProjectRecord = activeProjectRecordRef.current
    const currentActiveSessionId = activeSessionIdRef.current

    if (currentActiveProjectRecord?.rootPath) {
      await reopenPersistedProject(
        currentActiveProjectRecord.rootPath,
        currentActiveProjectRecord.nodeId ?? 'gateway',
        currentActiveSessionId,
      )
      return activeProjectRef.current
    }

    const pendingProjectPanel = pendingWsProjectStateRef.current?.ui.panel
    const pendingProjectRoot = pendingProjectPanel?.remotePath?.trim() || null
    if (pendingProjectRoot && currentActiveSessionId) {
      await reopenPersistedProject(
        pendingProjectRoot,
        pendingProjectPanel?.nodeId ?? undefined,
        currentActiveSessionId,
      )
      return activeProjectRef.current
    }

    const persistedProjectPanel = projectUIRef.current?.panel
    const persistedProjectRoot = persistedProjectPanel?.remotePath?.trim() || null
    if (persistedProjectRoot && currentActiveSessionId) {
      await reopenPersistedProject(
        persistedProjectRoot,
        persistedProjectPanel?.nodeId ?? undefined,
        currentActiveSessionId,
      )
      return activeProjectRef.current
    }

    return null
  }, [reopenPersistedProject, waitForProjectHydration])

  const handleSidebarPreviewToggle = useCallback(async () => {
    const project = await ensureProjectReadyForSidebarAction()
    if (!project) return

    if (previewOpen) {
      closeDevPreviewPanel()
      return
    }

    const nextTarget = projectPreviewState.target
      ?? devPreviewTarget?.trim()
      ?? savedDevPreview?.target?.trim()
      ?? null
    if (routePreviewToProject(nextTarget, project.projectRoot ?? null)) return
    openDevPreviewPanel(nextTarget)
  }, [closeDevPreviewPanel, devPreviewTarget, ensureProjectReadyForSidebarAction, openDevPreviewPanel, previewOpen, routePreviewToProject, savedDevPreview?.target, projectPreviewState.target])

  const handleSidebarArchitectureToggle = useCallback(async () => {
    const project = await ensureProjectReadyForSidebarAction()
    if (!project) return

    if (showArchitecture) {
      projectRef.current?.closeArchitectureTab()
      setArchitectureRequest(null)
      setShowArchitecture(false)
      return
    }

    setShowArchitecture(true)
    openArchitectureInProject(project.projectRoot)
  }, [ensureProjectReadyForSidebarAction, openArchitectureInProject, showArchitecture])

  const handleToggleEditor = useCallback(async () => {
    if (showProject) {
      closeProjectPanel()
      return
    }

    suppressProjectAutoOpenRef.current = false

    if (!activeProjectRef.current && !activeProjectRecordRef.current && (authLoadingRef.current || projectsLoadingRef.current)) {
      await waitForProjectHydration()
    }

    const currentActiveProject = activeProjectRef.current
    const currentActiveProjectRecord = activeProjectRecordRef.current
    const currentActiveSessionId = activeSessionIdRef.current
    const currentProjects = projectsRef.current
    const currentToken = tokenRef.current

    if (viewMode === 'manager' && automation.selectedThread) {
      const threadProject = automation.selectedThread.workingDirectory ?? selectedThreadRepo?.localPath
      if (threadProject) {
        if (currentActiveProject?.projectRoot === threadProject) {
          showProjectRef.current = true
          setShowProject(true)
          if (isMobile) showMobileProjectEditorTab()
          else {
            applyProjectLayout({ tree: true, editor: true }, { immediateSync: true })
          }
          const state = { open: true, remotePath: currentActiveProject.projectRoot, surfaceId: currentActiveProject.surfaceId, nodeId: currentActiveProject.nodeId }
          setSavedProject(state)
          return
        }
        let projectSessionId = currentActiveSessionId
        if (!projectSessionId) {
          await handleProjectFolderSelected(threadProject, selectedThreadRepo?.deviceId ?? 'gateway', { openEditor: true })
          return
        }
        if (!projectSessionId) return
        await reopenPersistedProject(threadProject, selectedThreadRepo?.deviceId ?? undefined, projectSessionId, { mobileTarget: 'editor' })
        return
      }
    }

    // If there's an existing remote project, just reopen the panel
    if (currentActiveProject) {
      showProjectRef.current = true
      setShowProject(true)
      if (isMobile) showMobileProjectEditorTab()
      else {
        applyProjectLayout({ tree: true, editor: true }, { immediateSync: true })
      }
      const state = { open: true, remotePath: currentActiveProject.projectRoot, surfaceId: currentActiveProject.surfaceId, nodeId: currentActiveProject.nodeId }
      setSavedProject(state)
      return
    }

    // If a project record exists with a rootPath, open it directly instead of showing the picker
    if (currentActiveProjectRecord?.rootPath) {
      await reopenPersistedProject(currentActiveProjectRecord.rootPath, currentActiveProjectRecord.nodeId ?? 'gateway', currentActiveSessionId, { mobileTarget: 'editor' })
      return
    }

    const pendingProjectPanel = pendingWsProjectStateRef.current?.ui.panel
    const pendingProjectRoot = pendingProjectPanel?.remotePath?.trim() || null
    if (pendingProjectRoot && currentActiveSessionId) {
      await reopenPersistedProject(
        pendingProjectRoot,
        pendingProjectPanel?.nodeId ?? undefined,
        currentActiveSessionId,
        { mobileTarget: 'editor' },
      )
      return
    }

    const persistedProjectPanel = projectUIRef.current?.panel
    const persistedProjectRoot = persistedProjectPanel?.remotePath?.trim() || null
    if (persistedProjectRoot && currentActiveSessionId) {
      await reopenPersistedProject(
        persistedProjectRoot,
        persistedProjectPanel?.nodeId ?? undefined,
        currentActiveSessionId,
        { mobileTarget: 'editor' },
      )
      return
    }

    // Fallback: the mobile UI can race ahead of project hydration after a
    // reconnect/reload. Recover from the loaded project list instead of
    // dropping the user into the picker when we already know the project.
    const fallbackProject = (
      (currentActiveSessionId
        ? currentProjects.find((project) => project.sessions.some((session) => session.id === currentActiveSessionId))
        : null)
      ?? (currentProjects.length === 1 ? currentProjects[0] ?? null : null)
    )
    const fallbackRoot = fallbackProject?.rootPath?.trim() || null
    if (fallbackProject && fallbackRoot) {
      const fallbackSession = fallbackProject.sessions.find((session) => session.id === currentActiveSessionId)
        ?? fallbackProject.sessions[0]
        ?? null
      if (fallbackSession) {
        switchSession(fallbackProject.id, fallbackSession.id)
        await reopenPersistedProject(fallbackRoot, fallbackProject.nodeId ?? undefined, fallbackSession.id, { mobileTarget: 'editor' })
        return
      }
      await handleProjectFolderSelected(fallbackRoot, fallbackProject.nodeId ?? 'gateway', { openEditor: true })
      return
    }

    if (currentActiveSessionId && currentToken) {
      try {
        const sessionRes = await fetch(`${API_URL}/api/sessions/${currentActiveSessionId}`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        })
        if (sessionRes.ok) {
          const session = await sessionRes.json() as {
            id: string
            projectId?: string | null
            projectPath?: string | null
          }
          let serverProject: { id: string; rootPath?: string | null; nodeId?: string | null } | null = null
          if (session.projectId) {
            const projectRes = await fetch(`${API_URL}/api/projects/${session.projectId}`, {
              headers: { Authorization: `Bearer ${currentToken}` },
            })
            if (projectRes.ok) {
              serverProject = await projectRes.json() as { id: string; rootPath?: string | null; nodeId?: string | null }
            }
          }

          const serverRoot = serverProject?.rootPath?.trim() || session.projectPath?.trim() || null
          if (serverRoot) {
            if (serverProject?.id) switchSession(serverProject.id, session.id)
            await reopenPersistedProject(serverRoot, serverProject?.nodeId ?? undefined, session.id, { mobileTarget: 'editor' })
            return
          }
        }
      } catch {
        // Fall through to the picker when server recovery also fails.
      }
    }

    if (currentToken) {
      try {
        const lastActiveRes = await fetch(`${API_URL}/api/projects/last-active`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        })
        if (lastActiveRes.ok) {
          const lastActive = await lastActiveRes.json() as {
            project: { id: string; rootPath?: string | null; nodeId?: string | null } | null
            session: { id: string } | null
          }
          const lastActiveRoot = lastActive.project?.rootPath?.trim() || persistedProjectRoot
          const lastActiveSessionId = lastActive.session?.id ?? currentActiveSessionId
          if (lastActive.project?.id && lastActiveRoot && lastActiveSessionId) {
            switchSession(lastActive.project.id, lastActiveSessionId)
            await reopenPersistedProject(
              lastActiveRoot,
              lastActive.project.nodeId ?? persistedProjectPanel?.nodeId ?? undefined,
              lastActiveSessionId,
              { mobileTarget: 'editor' },
            )
            return
          }
        }
      } catch {
        // Fall through to the picker when last-active recovery also fails.
      }
    }

    setProjectPickerMode('editor')
    setFolderPickerOpen(true)
  }, [
    showProject,
    activeProject,
    activeProjectRecord,
    closeProjectPanel,
    setSavedProject,
    activeSessionId,
    viewMode,
    automation.selectedThread,
    selectedThreadRepo,
    projects,
    switchSession,
    token,
    handleProjectFolderSelected,
    isMobile,
    showMobileProjectEditorTab,
    applyProjectLayout,
    reopenPersistedProject,
    waitForProjectHydration,
  ])

  // Verify project surface is alive; re-create if stale (e.g. after gateway restart)
  useEffect(() => {
    if (!activeProject?.projectRoot || !activeSessionId) return
    let cancelled = false
    ;(async () => {
      try {
        if (activeProject.surfaceId) {
          const res = await fetch(`${API_URL}/api/project/list?path=${encodeURIComponent(activeProject.projectRoot)}&surfaceId=${encodeURIComponent(activeProject.surfaceId)}`)
          if (res.ok || cancelled) return // surface is alive
        }
        // Surface is missing or stale — re-create it
        const openRes = await fetch(`${API_URL}/api/project/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: activeProject.projectRoot,
            sessionId: activeSessionId,
            nodeId: activeProject.nodeId || 'gateway',
          }),
        })
        if (!openRes.ok || cancelled) return
        const data = (await openRes.json()) as { surfaceId: string; projectRoot: string; nodeId?: string }
        if (cancelled) return
        setActiveProjectIfChanged({ surfaceId: data.surfaceId, projectRoot: data.projectRoot, nodeId: data.nodeId })
        const state = { open: showProjectRef.current, remotePath: data.projectRoot, surfaceId: data.surfaceId, nodeId: data.nodeId }
        setSavedProject(state)
      } catch { /* network error — ignore, panel will show error naturally */ }
    })()
    return () => { cancelled = true }
  }, [activeProject?.nodeId, activeProject?.surfaceId, activeProject?.projectRoot, activeSessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open project panel when the agent modifies files
  useEffect(() => {
    const previousCount = previousChangedFilesCountRef.current
    previousChangedFilesCountRef.current = changedFiles.length

    if (previousCount === null) return
    if (changedFiles.length === 0) return
    if (changedFiles.length <= previousCount) return
    if (suppressProjectAutoOpenRef.current) return
    if (!showProject) {
      showProjectRef.current = true
      setShowProject(true)
    }
  }, [changedFiles.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Absolute paths of files the agent has modified (undecided only), used to auto-refresh the project editor
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
    if (!(isElectron && desktopPlatform === 'win32')) return
    const styles = getComputedStyle(document.documentElement)
    const background = styles.getPropertyValue('--background').trim()
    const foreground = styles.getPropertyValue('--foreground').trim()
    ;(window as any).jaitDesktop?.setTitleBarOverlay?.({
      color: background ? `hsl(${background})` : (appliedThemeMode === 'dark' ? '#202020' : '#e8ecf1'),
      symbolColor: foreground ? `hsl(${foreground})` : (appliedThemeMode === 'dark' ? '#f2f2f2' : '#0a0a0a'),
      height: 39,
    })
  }, [appliedThemeMode, desktopPlatform, isElectron])

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
    const previousVsCodeThemeId = getActiveVsCodeTheme()?.id ?? null
    setThemeMode(next)
    setActiveVsCodeTheme(null)
    try {
      await updateSettings({ theme: next })
    } catch {
      setThemeMode(previous)
      setActiveVsCodeTheme(previousVsCodeThemeId)
    }
  }, [themeMode, updateSettings])

  const handleTerminalDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startY = e.clientY
    const startH = terminalHeight
    const maxH = window.innerHeight * 0.9
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

  const handleTerminalColumnDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = terminalColumnWidth
    const maxW = window.innerWidth * 0.7
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      setTerminalColumnWidth(Math.min(maxW, Math.max(280, startW + delta)))
    }
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', cleanup)
      window.removeEventListener('blur', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', cleanup)
    window.addEventListener('blur', cleanup)
  }, [terminalColumnWidth])

  const activeProjectRoot = activeProject?.projectRoot ?? activeProjectRecord?.rootPath ?? null
  const [composerGitStatus, setComposerGitStatus] = useState<GitStatusResult | null>(null)
  const changedFilesKey = useMemo(
    () => changedFiles.map((file) => file.path).join('\0'),
    [changedFiles],
  )
  useEffect(() => {
    if (!activeProjectRoot || changedFiles.length === 0) {
      setComposerGitStatus(null)
      return
    }

    let cancelled = false
    gitApi.status(activeProjectRoot)
      .then((status) => {
        if (!cancelled) setComposerGitStatus(status)
      })
      .catch(() => {
        if (!cancelled) setComposerGitStatus(null)
      })

    return () => {
      cancelled = true
    }
  }, [activeProjectRoot, changedFiles.length, changedFilesKey, sourceControlRefreshSignal])
  const changedFilesForComposer = useMemo(
    () => enrichChangedFilesWithDiffCounts(changedFiles, composerGitStatus, activeProjectRoot),
    [activeProjectRoot, changedFiles, composerGitStatus],
  )
  const previewProjectRoot =
    projectPreviewState.projectRoot
    ?? savedDevPreview?.projectRoot
    ?? activeProject?.projectRoot
    ?? null
  const activeProjectDisplayName = useMemo(() => {
    const title = activeProjectRecord?.title?.trim()
    if (title) return title
    const root = activeProjectRoot?.trim()
    if (!root) return null
    const normalizedRoot = root.replace(/[\\/]+$/, '')
    return normalizedRoot.split(/[\\/]/).pop() || normalizedRoot
  }, [activeProjectRecord?.title, activeProjectRoot])

  // Filter terminals to only show those belonging to the active project
  const projectTerminals = useMemo(() => {
    if (!activeProjectRoot) return terminals
    return terminals.filter((t) => {
      if (!t.projectRoot) return false
      // Normalize path separators for comparison
      const tRoot = t.projectRoot.replace(/\\/g, '/').toLowerCase()
      const wRoot = activeProjectRoot.replace(/\\/g, '/').toLowerCase()
      return tRoot === wRoot
    })
  }, [terminals, activeProjectRoot])

  const ensureActiveTerminal = useCallback(async (preferredTerminalId: string | null = null) => {
    const refreshed = await refresh()
    // Filter refreshed terminals to current project
    const wsRoot = activeProjectRoot
    const wsTerminals = wsRoot
      ? refreshed.filter((t) => {
          const tRoot = (t.projectRoot ?? '').replace(/\\/g, '/').toLowerCase()
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

    const created = await createTerminal(activeSessionId ?? 'default', activeProjectRoot ?? undefined)
    return created.id
  }, [refresh, setActiveTerminalId, activeTerminalId, createTerminal, activeSessionId, activeProjectRoot])

  const handleOpenTerminalFromToolCall = useCallback(async (terminalId: string | null) => {
    setCurrentView('chat')
    openTerminalPanel()
    await ensureActiveTerminal(terminalId)
  }, [ensureActiveTerminal, openTerminalPanel])

  const handleMobileProjectTargetAction = useCallback(async (target: MobileProjectTarget) => {
    if (showSidebar) {
      setShowSidebar(false)
    }

    // Simple switch: always navigate to the target, no toggle-off logic
    if (target === 'terminal') {
      setCurrentView('chat')
      closeProjectPanel()
      openTerminalPanel()
      await ensureActiveTerminal()
      return
    }

    if (showTerminal) {
      closeTerminalPanel()
    }

    if (target === 'editor') {
      if (!showProject) {
        await handleToggleEditor()
      }
      showMobileProjectEditorTab()
      return
    }

    // files / git
    if (!showProject) {
      await handleToggleEditor()
    }
    showMobileProjectTreeTab(target)
  }, [closeTerminalPanel, closeProjectPanel, ensureActiveTerminal, handleToggleEditor, openTerminalPanel, setCurrentView, showMobileProjectEditorTab, showMobileProjectTreeTab, showSidebar, showTerminal, showProject])

  const handleReferenceFile = useCallback((file: ReferencedFile) => {
    promptInputRef.current?.insertChip(file)
    promptInputRef.current?.focus()
  }, [])

  const handleReferenceFileSelection = useCallback((file: ReferencedFile, selection: string, startLine: number, endLine: number) => {
    const trimmed = selection.trim()
    if (!trimmed) return
    promptInputRef.current?.insertSegments(buildFileSelectionReferenceSegments(file, startLine, endLine))
    promptInputRef.current?.focus()
  }, [])

  const handleReferenceTerminalSelection = useCallback((terminalId: string, selection: string, projectRoot?: string | null, startLine?: number, endLine?: number) => {
    const trimmed = selection.trim()
    if (!trimmed) return
    const name = terminalId.replace(/^term-/, '').slice(0, 8) || terminalId
    promptInputRef.current?.insertSegments(buildTerminalSelectionReferenceSegments({
      terminalId,
      name,
      ...(projectRoot ? { projectRoot } : {}),
    }, trimmed, startLine, endLine))
    promptInputRef.current?.focus()
  }, [])

  const handleReferencePreviewElement = useCallback((element: PreviewInspectInteractiveElement) => {
    if (!element.selector) return
    promptInputRef.current?.insertSegments(buildPreviewElementReferenceSegments(element))
    promptInputRef.current?.focus()
    setCurrentView('chat')
  }, [setCurrentView])

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
    const isLastProjectTerminal = projectTerminals.length === 1 && projectTerminals[0]?.id === id
    await killTerminal(id)
    if (isLastProjectTerminal) {
      closeTerminalPanel()
    }
  }, [projectTerminals, killTerminal, closeTerminalPanel])

  const handleDetachTerminal = useCallback((terminalId: string) => {
    const t = projectTerminals.find(term => term.id === terminalId)
    const detachedId = `detached-terminal-${terminalId}-${Date.now()}`
    saveDetachedTerminal({
      id: detachedId,
      terminalId,
      token: token ?? null,
      label: (t?.metadata?.cwd as string) ?? `Terminal ${terminalId.slice(0, 6)}`,
      theme: appliedThemeMode === 'dark' ? 'dark' : 'light',
      projectRoot: (t?.projectRoot as string) ?? activeProjectRoot ?? null,
    })
    const detachedUrl = `${window.location.origin}${window.location.pathname}?detachedTerminal=${encodeURIComponent(detachedId)}`
    if ((window as any).jaitDesktop?.openProjectWindow) {
      void (window as any).jaitDesktop.openProjectWindow({ url: detachedUrl, title: 'Terminal' })
    } else {
      const popup = window.open(detachedUrl, `jait-detached-terminal-${terminalId}`, 'popup=yes,width=800,height=600,resizable=yes,scrollbars=yes')
      popup?.focus?.()
    }
  }, [projectTerminals, token, appliedThemeMode, activeProjectRoot])

  const mergeProjectFiles = useCallback((incoming: ProjectFile[]) => {
    if (incoming.length === 0) return
    setProjectFiles((prev) => {
      const next = [...prev]
      for (const file of incoming) {
        const idx = next.findIndex((existing) => existing.path === file.path)
        if (idx >= 0) next[idx] = file
        else next.push(file)
      }
      return next
    })
    setActiveProjectFileId((prev) => prev ?? incoming[0]?.id ?? null)
  }, [])

  const resolveKnownProjectRootForFile = useCallback((filePath: string) => {
    if (isPathWithinProject(filePath, activeProject?.projectRoot)) {
      return activeProject?.projectRoot ?? null
    }
    if (activeProjectRecord?.rootPath && isPathWithinProject(filePath, activeProjectRecord.rootPath)) {
      return activeProjectRecord.rootPath
    }
    return null
  }, [activeProject?.projectRoot, activeProjectRecord?.rootPath])

  /** Open a changed file in the diff view (fetches backup + current content) */
  const handleChangedFileClick = useCallback(async (filePath: string) => {
    try {
      const targetProjectRoot = resolveKnownProjectRootForFile(filePath)

      if (!targetProjectRoot) {
        toast('File is outside the active project. Open its directory explicitly to browse it.')
        return
      }

      if (targetProjectRoot && (!activeProject || activeProject.projectRoot !== targetProjectRoot)) {
        await openRemoteProjectOnGateway(targetProjectRoot, activeProject?.nodeId, activeSessionId)
      }

      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const surfaceQuery = activeProject?.surfaceId && targetProjectRoot === activeProject.projectRoot
        ? `&surfaceId=${encodeURIComponent(activeProject.surfaceId)}`
        : ''
      const name = filePath.split(/[/\\]/).pop() ?? filePath
      const language = projectLanguageForPath(name)

      const ensureProjectDiffHostReady = async () => {
        if (!showProject) {
          showProjectRef.current = true
          setShowProject(true)
        }
        showProjectEditorPanel()
        if (projectRef.current) return true
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        return projectRef.current != null
      }

      const openReviewDiff = async (path: string, originalContent: string | null | undefined, modifiedContent: string) => {
        const ready = await ensureProjectDiffHostReady()
        if (!ready) return
        await projectRef.current?.openReviewDiff({
          path,
          originalContent: originalContent ?? '',
          modifiedContent,
          language,
        })
        showProjectEditorPanel()
      }

      const openGitDiffFallback = async (path: string, currentContent: string): Promise<boolean> => {
        if (!targetProjectRoot) return false
        try {
          const diffs = await gitApi.fileDiffs(targetProjectRoot)
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
        `${API_URL}/api/project/backup?path=${encodeURIComponent(filePath)}${surfaceQuery}`,
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

      const file = await projectRef.current?.readFileByPath(filePath)
      if (file) {
        if (await openGitDiffFallback(file.path, file.content)) return
        await openReviewDiff(file.path, file.content, file.content)
        return
      }
      // Fallback: fetch from the project REST API and still open a review diff
      const readRes = await fetch(
        `${API_URL}/api/project/read?path=${encodeURIComponent(filePath)}${surfaceQuery}`,
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
  }, [activeSessionId, activeProject, openRemoteProjectOnGateway, resolveKnownProjectRootForFile, token, showProject, showProjectEditorPanel])

  const handleOpenMessagePath = useCallback(async (filePath: string) => {
    try {
      const targetProjectRoot = resolveKnownProjectRootForFile(filePath)

      if (!targetProjectRoot) {
        const existing = projectFiles.find((file) => file.path === filePath)
        if (existing) {
          mergeProjectFiles([existing])
          setActiveProjectFileId(existing.id)
          if (!showProject) {
            showProjectRef.current = true
            setShowProject(true)
          }
          showProjectEditorPanel()
          return
        }
        toast('File is outside the active project. Open its directory explicitly to browse it.')
        return
      }

      if (targetProjectRoot && (!activeProject || activeProject.projectRoot !== targetProjectRoot)) {
        await openRemoteProjectOnGateway(targetProjectRoot, activeProject?.nodeId, activeSessionId)
      }

      const openedInTree = await projectRef.current?.openFileByPath(filePath)
      if (openedInTree) {
        if (!showProject) {
          showProjectRef.current = true
          setShowProject(true)
        }
        showProjectEditorPanel()
        return
      }

      const existing = projectFiles.find((file) => file.path === filePath)
      if (existing) {
        mergeProjectFiles([existing])
        setActiveProjectFileId(existing.id)
      } else {
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const readRes = await fetch(
          `${API_URL}/api/project/read?path=${encodeURIComponent(filePath)}`,
          { headers },
        )
        if (!readRes.ok) {
          throw new Error(`Failed to open file: ${readRes.status}`)
        }

        const readData = await readRes.json() as { path: string; content: string }
        const name = filePath.split(/[\\/]/).pop() ?? filePath
        const file: ProjectFile = {
          id: readData.path,
          name,
          path: readData.path,
          content: readData.content,
          language: projectLanguageForPath(name),
        }
        mergeProjectFiles([file])
        setActiveProjectFileId(file.id)
      }

      if (!showProject) {
        showProjectRef.current = true
        setShowProject(true)
      }
      showProjectEditorPanel()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to open linked file')
    }
  }, [
    activeSessionId,
    activeProject,
    mergeProjectFiles,
    openRemoteProjectOnGateway,
    resolveKnownProjectRootForFile,
    showProject,
    showProjectEditorPanel,
    token,
    projectFiles,
  ])

  /** Apply the merged diff result — write to server and clear backup */
  const handleApplyProjectDiff = useCallback(async (filePath: string, resultContent: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      await fetch(`${API_URL}/api/project/apply-diff`, {
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
            language: projectLanguageForPath(path),
          } satisfies ProjectFile
        }),
    )
    mergeProjectFiles(resolved)
  }, [mergeProjectFiles])

  /** Lazy search files in the project directory for @ mention autocomplete */
  const handleSearchFiles = useCallback(async (query: string, limit: number, signal?: AbortSignal) => {
    return projectRef.current?.searchFiles(query, limit, signal) ?? []
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
        ? chipFiles.map((file) => ({ path: file.path, name: file.name, ...(file.lineRange ? { lineRange: file.lineRange } : {}) }))
        : []
    const referencedProjects = normalizedSegments?.length
      ? userReferencedProjectsFromSegments(normalizedSegments)
      : []
    const referencedTerminals = normalizedSegments?.length
      ? userReferencedTerminalsFromSegments(normalizedSegments)
      : []

    if (!text && referencedFiles.length === 0 && referencedProjects.length === 0 && referencedTerminals.length === 0) return null

    const fileContents: { path: string; content: string; lineRange?: { startLine: number; endLine: number } }[] = []
    const attachments = new Set<string>()

    if (referencedFiles.length) {
      const seen = new Set<string>()
      for (const fileRef of referencedFiles) {
        const seenKey = `${fileRef.path}:${fileRef.lineRange?.startLine ?? ''}:${fileRef.lineRange?.endLine ?? ''}`
        if (seen.has(seenKey)) continue
        seen.add(seenKey)
        attachments.add(fileRef.path)

        const applyLineRange = (content: string) => {
          if (!fileRef.lineRange) return content
          const lines = content.split('\n')
          return lines.slice(fileRef.lineRange.startLine - 1, fileRef.lineRange.endLine).join('\n')
        }

        const cached = projectFiles.find((file) => file.path === fileRef.path)
        if (cached) {
          fileContents.push({ path: cached.path, content: applyLineRange(cached.content), ...(fileRef.lineRange ? { lineRange: fileRef.lineRange } : {}) })
          continue
        }

        const referenced = await projectRef.current?.readReferencePath(fileRef.path)
        if (referenced?.length) {
          for (const file of referenced) {
            if (fileContents.some((entry) => entry.path === file.path && entry.lineRange?.startLine === fileRef.lineRange?.startLine && entry.lineRange?.endLine === fileRef.lineRange?.endLine)) continue
            fileContents.push({ path: file.path, content: applyLineRange(file.content), ...(fileRef.lineRange ? { lineRange: fileRef.lineRange } : {}) })
          }
        }
      }
    }

    const referenceSections: string[] = []

    if (referencedProjects.length > 0) {
      referenceSections.push(`Referenced projects:\n${referencedProjects
        .map((project) => `- ${project.path}`)
        .join('\n')}`)
    }

    if (referencedTerminals.length > 0) {
      referenceSections.push(`Referenced terminals:\n${referencedTerminals
        .map((terminal) => [
          `- ${terminal.terminalId}${terminal.lineRange ? ` (${formatLineRange(terminal.lineRange)} selected)` : ''}${terminal.projectRoot ? ` (project: ${terminal.projectRoot})` : ''}`,
          terminal.selectedText ? `\`\`\`\n${terminal.selectedText.slice(0, 2000)}\n\`\`\`` : null,
        ].filter(Boolean).join('\n'))
        .join('\n')}\nUse the terminal ID when you need to run commands in one of these existing terminals.`)
    }

    if (fileContents.length > 0) {
      referenceSections.push(`Referenced files:\n${fileContents
        .map((file) => `- ${file.path}${file.lineRange ? ` (${formatLineRange(file.lineRange)})` : ''}\n\`\`\`\n${file.content.slice(0, 2000)}\n\`\`\``)
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
  }, [projectFiles])

  const handleQueue = useCallback(async (
    chipFiles?: ReferencedFile[],
    fileAttachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    const prepared = await preparePromptSubmission(inputValueRef.current, chipFiles, displaySegments)
    if (!prepared) return
    const nextDisplaySegments = mergeImageAttachmentsIntoSegments(prepared.displaySegments, fileAttachments)
    const outboundMode: ChatMode = sendTarget === 'swarm' ? 'swarm' : chatMode
    enqueueMessage({
      content: prepared.promptWithReferences,
      displayContent: prepared.displayContent || prepared.promptWithReferences,
      mode: outboundMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      responseStyle: chatResponseStyle,
      model: cliModel ?? undefined,
      referencedFiles: prepared.referencedFiles,
      displaySegments: nextDisplaySegments,
      attachments: fileAttachments,
    })
    setInputValue('')
    setInputSegments(undefined)
  }, [chatMode, chatProvider, chatProviderRuntimeMode, chatResponseStyle, cliModel, enqueueMessage, preparePromptSubmission, sendTarget, setInputValue])

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
      return handleThreadSubmit(chipFiles, fileAttachments, displaySegments)
    }
    const prepared = await preparePromptSubmission(inputValueRef.current, chipFiles, displaySegments)
    if (!prepared && (!fileAttachments || fileAttachments.length === 0)) return
    if (!token) {
      setShowLoginDialog(true)
      return
    }

    const promptText = prepared?.promptWithReferences ?? inputValueRef.current.trim()
    const nextDisplaySegments = mergeImageAttachmentsIntoSegments(prepared?.displaySegments, fileAttachments)
    const generatedTitle = deriveSessionTitle(prepared?.displayContent || promptText)
    const outboundMode: ChatMode = sendTarget === 'swarm' ? 'swarm' : chatMode

    let sid = activeSessionId
    if (!sid) {
      const session = await createSession(undefined, generatedTitle)
      sid = session?.id ?? null
    }
    if (!sid) return
    await ensureSessionTitle(sid, prepared?.displayContent || promptText)

    if (isLoading || messageQueue.length > 0) {
      enqueueMessage({
        content: promptText,
        displayContent: prepared?.displayContent || promptText,
        mode: outboundMode,
        provider: chatProvider,
        runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
        responseStyle: chatResponseStyle,
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
      mode: outboundMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      responseStyle: chatResponseStyle,
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
  const handleThreadSubmit = async (
    chipFiles?: ReferencedFile[],
    fileAttachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    const prepared = await preparePromptSubmission(inputValueRef.current, chipFiles, displaySegments)
    if (!prepared || threadComposerDisabled) return
    const nextDisplaySegments = mergeImageAttachmentsIntoSegments(prepared.displaySegments, fileAttachments)
    const selectedThreadQueueLength = automation.selectedThread
      ? managerMessageQueues[automation.selectedThread.id]?.length ?? 0
      : 0
    if (automation.selectedThread && (automation.selectedThread.status === 'running' || selectedThreadQueueLength > 0)) {
      enqueueManagerMessage(automation.selectedThread.id, {
        id: `mq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        content: prepared.displayContent || prepared.promptWithReferences,
        displayContent: prepared.displayContent || prepared.promptWithReferences,
        fullContent: prepared.promptWithReferences,
        referencedFiles: prepared.referencedFiles,
        displaySegments: nextDisplaySegments,
        attachments: prepared.attachments,
        providerId: chatProvider,
        runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
        model: cliModel ?? undefined,
        queuedAt: Date.now(),
      })
      setInputValue('')
      setInputSegments(undefined)
      return
    }
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
        displaySegments: nextDisplaySegments,
        attachments: prepared.attachments,
      },
      threadTargetRepo?.id ?? undefined,
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
        responseStyle: nextItem.responseStyle,
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
        responseStyle: nextItem.responseStyle,
        model: nextItem.model,
        referencedFiles: nextItem.referencedFiles,
        displaySegments: nextItem.displaySegments,
        attachments: nextItem.attachments,
      })
      toast.error(getNonEmptyMessage(err instanceof Error ? err.message : null, 'Failed to send queued message'))
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

  const steerQueuedChatMessage = useCallback((id: string) => {
    const item = messageQueue.find((queued) => queued.id === id)
    if (!item || !activeSessionId) return
    if (!isLoading) {
      toast.info('Steering is only available while the agent is running.')
      return
    }

    void (async () => {
      const response = await fetch(`${API_URL}/api/sessions/${encodeURIComponent(activeSessionId)}/steer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: item.content }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as Record<string, unknown>
        const details = typeof err.details === 'string' ? err.details : null
        const error = typeof err.error === 'string' ? err.error : null
        throw new Error(details || error || `Failed to steer: ${response.statusText}`)
      }
      dequeueMessage(id)
      toast.success('Steered with queued message')
    })().catch((err) => {
      toast.error(getNonEmptyMessage(err instanceof Error ? err.message : null, 'Failed to steer with queued message'))
    })
  }, [activeSessionId, dequeueMessage, isLoading, messageQueue, token])

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
      const baseBranch = thread.branch ?? thread.prBaseBranch ?? repo.defaultBranch
      let worktreePath: string | undefined
      try {
        const wt = await gitApi.createWorktree(repo.localPath, baseBranch, branchName)
        worktreePath = wt.path
      } catch {
        try { await gitApi.createBranch(repo.localPath, branchName, baseBranch) } catch { /* ignore */ }
      }
      const newThread = await agentsApi.createThread({
        title: `[${repo.name}] Generating title…`,
        providerId: item.providerId,
        runtimeMode: item.runtimeMode,
        ...(item.model ? { model: item.model } : {}),
        kind: 'delivery',
        workingDirectory: worktreePath ?? repo.localPath,
        branch: branchName,
        prBaseBranch: baseBranch,
      })
      await agentsApi.startThread(newThread.id, {
        message: item.fullContent,
        titlePrefix: `[${repo.name}] `,
        ...(item.displayContent ? { displayContent: item.displayContent } : {}),
        ...(item.referencedFiles ? { referencedFiles: item.referencedFiles } : {}),
        ...(item.displaySegments ? { displaySegments: item.displaySegments } : {}),
        ...(item.attachments ? { attachments: item.attachments } : {}),
      })
    })()
  }, [automation.selectedThread, automation.selectedRepo, managerMessageQueues, dequeueManagerMessage])

  const steerManagerQueueItem = useCallback((id: string) => {
    const thread = automation.selectedThread
    if (!thread) return
    const item = managerMessageQueues[thread.id]?.find((queued) => queued.id === id)
    if (!item) return
    if (thread.status !== 'running') {
      toast.info('Steering is only available while the thread is running.')
      return
    }

    void agentsApi.steerThread(thread.id, item.fullContent)
      .then(() => {
        dequeueManagerMessage(thread.id, id)
        toast.success('Steered with queued message')
      })
      .catch((err) => {
        toast.error(getNonEmptyMessage(err instanceof Error ? err.message : null, 'Failed to steer with queued message'))
      })
  }, [automation.selectedThread, dequeueManagerMessage, managerMessageQueues])

  const handleManagerQueue = useCallback(async (
    chipFiles?: ReferencedFile[],
    fileAttachments?: ChatAttachment[],
    displaySegments?: UserMessageSegment[],
  ) => {
    const thread = automation.selectedThread
    if (!thread) return
    const prepared = await preparePromptSubmission(inputValueRef.current, chipFiles, displaySegments)
    if (!prepared) return
    const nextDisplaySegments = mergeImageAttachmentsIntoSegments(prepared.displaySegments, fileAttachments)
    enqueueManagerMessage(thread.id, {
      id: `mq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: prepared.displayContent || prepared.promptWithReferences,
      displayContent: prepared.displayContent || prepared.promptWithReferences,
      fullContent: prepared.promptWithReferences,
      referencedFiles: prepared.referencedFiles,
      displaySegments: nextDisplaySegments,
      attachments: prepared.attachments,
      providerId: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      model: cliModel ?? undefined,
      queuedAt: Date.now(),
    })
    setInputValue('')
    setInputSegments(undefined)
  }, [automation.selectedThread, chatProvider, chatProviderRuntimeMode, cliModel, enqueueManagerMessage, preparePromptSubmission, setInputValue])

  useEffect(() => {
    if (activeSessionId) return

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
          displaySegments: nextItem.displaySegments,
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
    activeSessionId,
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
      const session = await createSession()
      sid = session?.id ?? null
    }
    if (!sid) return
    const outboundMode: ChatMode = sendTarget === 'swarm' ? 'swarm' : chatMode
    // Handle architecture generation suggestion
    if (suggestion === 'Generate architecture diagram') {
      setArchitectureGenerating(true)
      setShowArchitecture(true)
      sendMessage(
        'Analyze the project architecture and generate a mermaid diagram using the architecture.generate tool. Include all major modules, their relationships, data flow, and external dependencies.',
        { token, sessionId: sid, mode: outboundMode, provider: chatProvider, runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined, model: cliModel ?? undefined, onLoginRequired: () => setShowLoginDialog(true) },
      )
      return
    }
    sendMessage(suggestion, { token, sessionId: sid, mode: outboundMode, provider: chatProvider, runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined, model: cliModel ?? undefined, onLoginRequired: () => setShowLoginDialog(true) })
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
    const outboundMode: ChatMode = sendTarget === 'swarm' ? 'swarm' : chatMode
    await restartFromMessage(messageId, prepared.promptWithReferences, messageIndex, messageFromEnd, {
      token,
      sessionId: activeSessionId,
      mode: outboundMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      model: cliModel ?? undefined,
      displayContent: prepared.displayContent,
      referencedFiles: prepared.referencedFiles,
      displaySegments: prepared.displaySegments,
      onLoginRequired: () => setShowLoginDialog(true),
    })
  }, [activeSessionId, restartFromMessage, token, chatMode, chatProvider, chatProviderRuntimeMode, cliModel, preparePromptSubmission, sendTarget])

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    if (authSubmitting) return
    setAuthError(null)
    setAuthSubmitting(true)
    try {
      await login(loginUsername, loginPassword)
      setShowLoginDialog(false)
      setLoginPassword('')
      setCurrentView('chat')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault()
    if (authSubmitting) return
    setAuthError(null)
    if (!registerUsername || !registerPassword) {
      setAuthError('Username and password are required')
      return
    }
    if (registerPassword !== registerPasswordConfirm) {
      setAuthError('Passwords do not match')
      return
    }
    setAuthSubmitting(true)
    try {
      await register(registerUsername, registerPassword)
      setShowLoginDialog(false)
      setRegisterPassword('')
      setRegisterPasswordConfirm('')
      setCurrentView('chat')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setAuthSubmitting(false)
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

  const handleStartNewChat = useCallback(() => {
    clearMessages()
    void createSession()
  }, [clearMessages, createSession])

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
    await fetchProjects()
    return result.removed
  }

  const handleClearArchivedProjects = async () => {
    const removed = await clearArchivedProjects()
    await fetchProjects()
    return removed
  }

  const handleRestoreProject = async (projectId: string) => {
    const restored = await restoreProject(projectId)
    if (restored) await fetchProjects()
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
      const selectedThreadQueueLength = thread ? managerMessageQueues[thread.id]?.length ?? 0 : 0
      if (thread && (thread.status === 'running' || selectedThreadQueueLength > 0)) {
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
        undefined,
        threadTargetRepo?.id ?? undefined,
      )
      return
    }

    const generatedTitle = deriveSessionTitle(normalizedTranscript)

    let sid = activeSessionId
    if (!sid) {
      const session = await createSession(undefined, generatedTitle)
      sid = session?.id ?? null
    }
    if (!sid || !token) return
    await ensureSessionTitle(sid, normalizedTranscript)
    const outboundMode: ChatMode = sendTarget === 'swarm' ? 'swarm' : chatMode

    if (isLoading || messageQueue.length > 0) {
      enqueueMessage({
        content: normalizedTranscript,
        displayContent: normalizedTranscript,
        mode: outboundMode,
        provider: chatProvider,
        runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
        model: cliModel ?? undefined,
      })
      return
    }

    sendMessage(normalizedTranscript, {
      token,
      sessionId: sid,
      mode: outboundMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      model: cliModel ?? undefined,
      onLoginRequired: () => setShowLoginDialog(true),
    })
  }, [activeSessionId, automation.handleSend, automation.selectedThread, chatMode, chatProvider, chatProviderRuntimeMode, cliModel, createSession, enqueueManagerMessage, enqueueMessage, ensureSessionTitle, isLoading, managerMessageQueues, messageQueue.length, sendMessage, sendTarget, threadTargetRepo?.id, token, viewMode])

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
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        resolve(new Blob(audioChunksRef.current, { type: recorder.mimeType }))
      }
      const timeout = window.setTimeout(finish, 1500)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = finish
      recorder.onerror = finish
      try {
        recorder.requestData()
      } catch {
        // Some browsers throw if the recorder is already stopping.
      }
      try {
        recorder.stop()
      } catch {
        finish()
      }
    })

    // Stop mic
    audioStreamRef.current?.getTracks().forEach((t) => t.stop())
    audioStreamRef.current = null
    mediaRecorderRef.current = null

    if (audioBlob.size === 0) return

    if (settings.stt_provider === 'wyoming' || settings.stt_provider === 'whisper' || settings.stt_provider === 'gpt' || settings.stt_provider === 'elevenlabs') {
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
  }, [activeSessionId, buildWavBlob, settings.stt_provider, stopVoiceVisualizer, token])

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

  // ── Always-on wake word listener ──────────────────────────────
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => {
    try { return localStorage.getItem('jait:wake-word') === 'true' } catch { return false }
  })
  const toggleWakeWord = useCallback(() => {
    setWakeWordEnabled(prev => {
      const next = !prev
      try { localStorage.setItem('jait:wake-word', String(next)) } catch {}
      return next
    })
  }, [])

  const startVoiceSession = useCallback(() => {
    setVoiceOverlayOpen(true)
    void voiceAssistant.connect()
  }, [voiceAssistant])

  const wakeWord = useWakeWord({
    enabled: wakeWordEnabled && isAuthenticated && !voiceRecording && !voiceOverlayOpen,
    lang: navigator.language,
    onCommand: () => {
      // When the user says "Hey Jait <command>", start the voice session.
      // The command will be picked up by the mic once the session opens.
      startVoiceSession()
    },
    onWakeWordDetected: () => {
      // Just the wake word — start voice session immediately
      startVoiceSession()
    },
  })

  useEffect(() => {
    return () => {
      stopVoiceVisualizer()
      audioStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [stopVoiceVisualizer])

  const limitReached = error === 'limit_reached'
  const requiresAuthGate = !authLoading && !isAuthenticated
  const developerChatSubmitLoading = getDeveloperChatSubmitLoading({
    viewMode,
    currentView,
    requiresAuthGate,
    authLoading,
    projectsLoading,
    activeSessionId,
    isLoadingHistory,
    loadingChatMode,
    loadingProviderRuntimeMode,
    loadingCliModels,
    loadingChatView,
  })
  const developerChatHydrating = developerChatSubmitLoading && messages.length === 0
  const hasMessages = messages.length > 0 || isLoadingHistory
  const developerChatUiState = getDeveloperChatUiState({
    developerChatHydrating,
    isLoadingHistory,
    todoCount: todoList.length,
  })
  const mobileActiveProjectTarget = useMemo(
    () => getMobileProjectActiveTarget({
      showProject,
      showTerminal,
      showProjectTree,
      showProjectEditor,
      treeTab: mobileTreeTab,
    }),
    [mobileTreeTab, showTerminal, showProject, showProjectEditor, showProjectTree],
  )
  const showMobileProjectFullscreen =
    isMobile &&
    showMobileProject &&
    mobileActiveProjectTarget !== null &&
    mobileActiveProjectTarget !== 'terminal'
  const showMobileTerminalFullscreen =
    isMobile &&
    currentView === 'chat' &&
    viewMode === 'developer' &&
    mobileActiveProjectTarget === 'terminal'
  const mobileProjectControlState = useMemo(() => ({
    showProject,
    showTerminal,
    showProjectTree,
    showProjectEditor,
    treeTab: mobileTreeTab,
  }), [mobileTreeTab, showTerminal, showProject, showProjectEditor, showProjectTree])
  const mobileProjectMenuActive = showSidebar || activeProjectId !== null

  const userInitial = user?.username?.[0]?.toUpperCase() ?? '?'

  // ── Memoised edit-composer bag (prevents every Message from re-rendering) ──
  const handleVoiceStop = useCallback(() => { void stopRecordingAndTranscribe() }, [stopRecordingAndTranscribe])
  const handleFolderPickerOpen = useCallback(() => { automation.setFolderPickerOpen(true) }, [automation.setFolderPickerOpen])
  const developerChatPanelStyle: React.CSSProperties = chatCollapsed
    ? {
        flex: '0 0 0px',
        width: 0,
        minWidth: 0,
        visibility: 'hidden',
      }
    : {
        flex: '1 1 0%',
        minWidth: 0,
      }
  const developerThreadToolbarRepoPicker = sendTarget === 'thread' ? (
    <ManagerRepoPicker
      repositories={automation.repositories}
      selectedRepo={threadTargetRepo}
      disabled={automation.creating}
      compact={compactDeveloperComposer}
      className={compactDeveloperComposer ? 'w-full' : ''}
      getRuntimeInfo={automation.getRuntimeInfoForRepository}
      onSelect={automation.setSelectedRepoId}
      onAddRepository={handleFolderPickerOpen}
    />
  ) : null
  const isManagerThread = viewMode === 'manager' && automation.selectedThread
  const mobileFooterToolbarControls = isMobile && currentView === 'chat' ? (
    <div
      className="flex flex-col items-center gap-1 rounded-lg border bg-background/85 px-1.5 py-1.5 shadow-lg backdrop-blur-lg"
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
    >
      {!isManagerThread && (
        <>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={!showProject && !showTerminal && !showSidebar ? 'secondary' : 'ghost'} size="sm" className="h-10 w-10 shrink-0 rounded-lg p-0" onClick={() => { closeProjectPanel(); closeTerminalPanel(); setShowSidebar(false); setShowMobileToolbar(false) }} aria-label="Chat">
              <MessageSquare className="h-5 w-5" />
            </Button>
          </TooltipTrigger><TooltipContent side="left">Chat</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={mobileProjectMenuActive ? 'secondary' : 'ghost'} size="sm" className="h-9 w-9 shrink-0 rounded-lg p-0" onClick={() => setShowSidebar(s => !s)} aria-label="Projects">
              {showSidebar ? <PanelLeftClose className="h-4 w-4 rotate-90" /> : <PanelLeftOpen className="h-4 w-4 rotate-90" />}
            </Button>
          </TooltipTrigger><TooltipContent side="left">Projects</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={isMobileProjectTargetActive(mobileProjectControlState, 'terminal') ? 'secondary' : 'ghost'} size="sm" className="h-10 w-10 shrink-0 rounded-lg p-0" onClick={() => { void handleMobileProjectTargetAction('terminal') }} aria-label="Terminal">
              <TerminalIcon className="h-5 w-5" />
            </Button>
          </TooltipTrigger><TooltipContent side="left">Terminal</TooltipContent></Tooltip>
        </>
      )}
      {activeProjectId && (
        <>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={isMobileProjectTargetActive(mobileProjectControlState, 'files') ? 'secondary' : 'ghost'} size="sm" className="h-10 w-10 shrink-0 rounded-lg p-0" onClick={() => { void handleMobileProjectTargetAction('files') }} aria-label="Files">
              <FolderOpen className="h-5 w-5" />
            </Button>
          </TooltipTrigger><TooltipContent side="left">Files</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={isMobileProjectTargetActive(mobileProjectControlState, 'git') ? 'secondary' : 'ghost'} size="sm" className="relative h-10 w-10 shrink-0 rounded-lg p-0" onClick={() => { void handleMobileProjectTargetAction('git') }} aria-label="Changes">
              <GitBranch className="h-5 w-5" />
              {changedFiles.length > 0 && <span className="absolute -right-1 -top-1 z-10 min-w-[14px] rounded-full bg-primary px-1 text-2xs font-bold leading-[14px] text-primary-foreground">{changedFiles.length > 99 ? '99+' : changedFiles.length}</span>}
            </Button>
          </TooltipTrigger><TooltipContent side="left">Changes</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant={isMobileProjectTargetActive(mobileProjectControlState, 'editor') ? 'secondary' : 'ghost'} size="sm" className="h-10 w-10 shrink-0 rounded-lg p-0" onClick={() => { void handleMobileProjectTargetAction('editor') }} aria-label="Editor">
              <Code className="h-5 w-5" />
            </Button>
          </TooltipTrigger><TooltipContent side="left">Editor</TooltipContent></Tooltip>
        </>
      )}
    </div>
  ) : null
  const developerComposerControlRow = viewMode === 'developer' ? (
    <div className={`${compactDeveloperComposer ? 'overflow-hidden px-0.5' : 'overflow-x-auto px-1'}`}>
      <div className={`${compactDeveloperComposer ? 'flex w-full min-w-0 items-center gap-2' : 'grid min-w-max grid-cols-[1fr_auto_1fr] gap-3 whitespace-nowrap'} items-center`}>
        <div className={`${compactDeveloperComposer ? 'flex min-w-0 flex-1 items-center gap-1 overflow-hidden' : 'flex min-w-0 flex-1 items-center gap-2'}`}>
          {sendTarget === 'thread' ? (
            developerThreadToolbarRepoPicker
          ) : (
            <SessionSwitcher
              sessions={activeProjectSessions}
              activeSessionId={activeSessionId}
              projectTitle={activeProjectRecord?.title ?? 'Personal chat'}
              onSelectSession={(sessionId) => { switchSession(activeProjectId, sessionId) }}
              onNewSession={() => { void createSession() }}
              onOpenChange={handleSessionSwitcherOpen}
              showTitle={false}
              triggerLabel="History"
            />
          )}
          {approveAllInSession && (
            compactDeveloperComposer ? (
              <button
                type="button"
                onClick={handleClearApproveAll}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-600 transition-colors hover:bg-green-500/20 dark:text-green-400"
                title="Auto-approved. Clear approve all"
                aria-label="Auto-approved. Clear approve all"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600 dark:text-green-400">
                Auto-approved
                <button
                  type="button"
                  onClick={handleClearApproveAll}
                  className="rounded-full p-0.5 hover:bg-green-500/20 transition-colors"
                  title="Clear approve all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </span>
            )
          )}
        </div>
        {!compactDeveloperComposer && (
          <div className="justify-self-center">
            <SendTargetSelector
              target={sendTarget}
              onChange={setSendTarget}
              disabled={developerChatUiState.disableSendTargetSelector}
            />
          </div>
        )}
        <div className={`${compactDeveloperComposer ? 'ml-auto flex shrink-0 items-center gap-2' : 'flex shrink-0 items-center justify-self-end gap-2'}`}>
          {sendTarget !== 'thread' && (
            <button
              type="button"
              onClick={handleStartNewChat}
              className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              New chat
            </button>
          )}
          {compactDeveloperComposer && (
            <div className="shrink-0">
              <SendTargetSelector
                target={sendTarget}
                onChange={setSendTarget}
                disabled={developerChatUiState.disableSendTargetSelector}
                compact
              />
            </div>
          )}
          {remainingPrompts !== null && (
            <span className={`${compactDeveloperComposer ? 'hidden' : 'shrink-0'} text-xs text-muted-foreground`}>{remainingPrompts} remaining</span>
          )}
        </div>
      </div>
    </div>
  ) : null
  const editComposerBag = useMemo(() => ({
    onVoiceInput: handleVoiceInput,
    voiceRecording,
    voiceLevels,
    voiceTranscribing,
    onVoiceStop: handleVoiceStop,
    mode: chatMode,
    onModeChange: setChatMode,
    provider: chatProvider,
    onProviderChange: handleChatProviderChange,
    responseStyle: chatResponseStyle,
    onResponseStyleChange: handleChatResponseStyleChange,
    providerRuntimeMode: chatProviderRuntimeMode,
    onProviderRuntimeModeChange: handleChatProviderRuntimeModeChange,
    cliModel,
    onCliModelChange: handleCliModelChange,
    availableFiles: availableFilesForMention,
    onSearchFiles: handleSearchFiles,
    projectOpen: showProject,
    sessionInfo,
    projectNodeId: activeProject?.nodeId,
  }), [
    handleVoiceInput, voiceRecording, voiceLevels, voiceTranscribing, handleVoiceStop,
    chatMode, setChatMode, chatProvider, handleChatProviderChange,
    chatResponseStyle, handleChatResponseStyleChange,
    chatProviderRuntimeMode, handleChatProviderRuntimeModeChange, cliModel, handleCliModelChange,
    availableFilesForMention, handleSearchFiles, showProject, sessionInfo, activeProject?.nodeId,
  ])

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

  // ── Early returns for special/detached views (must come after all hooks) ──
  if (detachedProjectTabId) {
    return <DetachedTabView detachedTabId={detachedProjectTabId} />
  }

  if (detachedTerminalId) {
    return <DetachedTerminalView detachedId={detachedTerminalId} />
  }

  if (gatewayReachable === false) {
    return <GatewayUnavailable onRetry={() => { gatewayCheckRef.current = false; setGatewayReachable(null); void checkGatewayReachable() }} />
  }

  return (
    <TooltipProvider>
      <div className="fixed inset-0 flex flex-col overflow-hidden safe-top safe-bottom safe-left safe-right">
        {!requiresAuthGate && (
          <>
            <header
              className={
                isMobile
                  ? 'fixed top-2 left-2 right-2 z-40 flex items-center gap-1 pointer-events-none h-10'
                  : `relative flex items-center gap-1 shrink-0 border-b bg-background px-2 sm:gap-2 sm:px-5 ${isElectron ? 'h-10 !pl-[0.8rem]' : 'h-14'}`
              }
              style={isElectron ? {
                WebkitAppRegion: 'drag',
                paddingLeft: desktopPlatform === 'darwin' ? 70 : undefined,
                paddingRight: desktopPlatform === 'win32' ? 140 : undefined,
              } as React.CSSProperties : undefined}
            >
          {/* Left: Logo + mobile mic */}
          <div className={`flex items-center gap-1 shrink-0 ${isMobile ? 'pointer-events-auto rounded-2xl bg-background/70 backdrop-blur-lg shadow-lg border px-2 h-10' : ''}`} style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <JaitIcon size={20} className="shrink-0" />
            {wakeWord.isSupported && (
              <button
                className={`md:hidden flex items-center justify-center h-8 w-8 rounded-lg shrink-0 transition-colors ${
                  voiceOverlayOpen
                    ? 'text-green-400 bg-green-500/10'
                    : wakeWordEnabled
                      ? wakeWord.isListening
                        ? 'text-green-400 bg-green-500/10'
                        : 'text-blue-400 bg-blue-500/10'
                      : 'text-muted-foreground hover:bg-accent'
                }`}
                onClick={voiceOverlayOpen ? () => { voiceAssistant.disconnect(); setVoiceOverlayOpen(false) } : toggleWakeWord}
                aria-label={voiceOverlayOpen ? 'Disconnect voice' : wakeWordEnabled ? 'Disable wake word' : 'Enable wake word'}
              >
                {voiceOverlayOpen ? (
                  <Mic className="h-4 w-4 animate-pulse" />
                ) : wakeWordEnabled ? (
                  <Mic className={`h-4 w-4 ${wakeWord.isListening ? 'animate-pulse' : ''}`} />
                ) : (
                  <MicOff className="h-4 w-4" />
                )}
              </button>
            )}
            {isMobile && currentView === 'chat' && activeManagerThreads.length > 0 && (
              <ManagerActiveThreadsMenu
                threads={activeManagerThreads}
                getRepositoryForThread={automation.getRepositoryForThread}
                threadPrStates={automation.threadPrStates}
                ghAvailable={automation.ghAvailable}
                onOpenThread={(threadId) => {
                  setCurrentView('chat')
                  automation.setSelectedThreadId(threadId)
                  setSendTarget('thread')
                  setShowProject(false)
                  setShowProjectEditor(false)
                }}
                onStopThread={(threadId) => automation.handleStop(threadId)}
              />
            )}
          </div>

          {/* Nav — hidden on mobile, visible on md+ */}
          <nav className="hidden md:flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'chat' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('chat')}
                  aria-label="Chat"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Chat</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Chat</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'todo' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('todo')}
                  aria-label="Todo"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  <span>Todo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Todo</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'memory' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('memory')}
                  aria-label="Memory"
                >
                  <Brain className="h-3.5 w-3.5" />
                  <span>Memory</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Memory</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'jobs' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('jobs')}
                  aria-label="Jobs"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Jobs</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Jobs</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={currentView === 'network' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                  onClick={() => setCurrentView('network')}
                  aria-label="Network"
                >
                  <Wifi className="h-3.5 w-3.5" />
                  <span>Network</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Network</TooltipContent>
            </Tooltip>
            {viewMode === 'developer' && !isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showScreenShare ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 shrink-0 rounded-lg gap-1.5 px-2 text-xs"
                    onClick={() => showScreenShare ? closeScreenSharePanel() : openScreenSharePanel()}
                    aria-label="Screen sharing"
                  >
                    <Cast className="h-3.5 w-3.5" />
                    <span>Screen Share</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Screen sharing</TooltipContent>
              </Tooltip>
            )}
          </nav>

          {/* Center: ViewModeSelector OR voice controls when voice active */}
          {voiceOverlayOpen ? (
            <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm px-1.5 py-1 ${isMobile ? 'pointer-events-auto' : ''}`} style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
              {/* Mute toggle */}
              <button
                onClick={voiceAssistant.toggleMic}
                className={`flex items-center justify-center h-7 w-7 rounded-full transition-colors ${
                  voiceAssistant.micActive
                    ? 'bg-muted hover:bg-muted/80 text-foreground'
                    : 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                }`}
                aria-label={voiceAssistant.micActive ? 'Mute' : 'Unmute'}
              >
                {voiceAssistant.micActive ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
              </button>

              {/* Wave visualizer */}
              <AgentAudioVisualizerWave
                state={voiceAssistant.assistantSpeaking ? 'speaking' : voiceAssistant.status}
                size="sm"
                lineWidth={2}
                className="!aspect-auto !h-7 w-24 sm:w-36"
              />

              {/* Hang up */}
              <button
                onClick={() => { voiceAssistant.disconnect(); setVoiceOverlayOpen(false) }}
                className="flex items-center justify-center h-7 w-7 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                aria-label="End call"
              >
                <PhoneOff className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : currentView === 'chat' ? (
            <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 ${isMobile ? 'pointer-events-auto rounded-2xl bg-background/70 backdrop-blur-lg shadow-lg border px-1.5 h-10 flex items-center' : ''}`} style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
              <ViewModeSelector mode={viewMode} onChange={setViewMode} compact={isMobile} />
            </div>
          ) : null}

          {/* Spacer */}
          <div className="flex-1 min-w-0" />

          {/* Right: Context + Model + Account */}
          <div className={`flex items-center gap-1 sm:gap-1.5 shrink-0 ${isMobile ? 'pointer-events-auto rounded-2xl bg-background/70 backdrop-blur-lg shadow-lg border px-1 py-0.5 h-10' : ''}`} style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            {/* Desktop status items — hidden on mobile */}
            <div className="hidden md:flex items-center gap-1 sm:gap-1.5">
            {screenShare.isActive && (
              <span className="ui-pill shrink-0">
                <Cast className="h-3 w-3 text-green-500 animate-pulse" />
                <span className="hidden sm:inline">Sharing</span>
              </span>
            )}
            {wakeWord.isSupported && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={voiceOverlayOpen ? () => { voiceAssistant.disconnect(); setVoiceOverlayOpen(false) } : toggleWakeWord}
                    className={`ui-pill shrink-0 cursor-pointer transition-colors ${
                      voiceOverlayOpen
                        ? 'text-green-400 animate-pulse'
                        : wakeWordEnabled
                          ? wakeWord.isListening
                            ? 'text-green-400'
                            : 'text-blue-400'
                          : 'text-muted-foreground opacity-50'
                    }`}
                  >
                    {voiceOverlayOpen ? (
                      <Mic className="h-3 w-3 animate-pulse" />
                    ) : wakeWordEnabled ? (
                      <Mic className={`h-3 w-3 ${wakeWord.isListening ? 'animate-pulse' : ''}`} />
                    ) : (
                      <MicOff className="h-3 w-3" />
                    )}
                    <span className="hidden sm:inline text-xs">
                      {voiceOverlayOpen ? 'Voice active' : wakeWord.isListening ? 'Listening...' : wakeWordEnabled ? 'Hey Jait' : 'Wake word'}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {voiceOverlayOpen
                    ? 'Voice assistant active — click to disconnect'
                    : wakeWordEnabled
                      ? wakeWord.isListening
                        ? 'Listening for your command...'
                        : 'Say "Hey Jait" to start voice assistant — click to disable'
                      : 'Click to enable always-on "Hey Jait" wake word'}
                </TooltipContent>
              </Tooltip>
            )}
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
                  setShowProject(false)
                  setShowProjectEditor(false)
                }}
                onStopThread={(threadId) => automation.handleStop(threadId)}
              />
            )}
            <ContextIndicator usage={contextUsage} />
            {(() => {
              const effectiveModel = cliModel ?? model
              const displayProvider = chatProvider === 'codex' ? 'openai'
                : chatProvider === 'claude-code' ? 'anthropic'
                : provider ?? 'ollama'
              const displayModel = chatProvider === 'codex' ? (cliModel ? formatModelDisplayLabel(cliModel) : 'Codex')
                : chatProvider === 'claude-code' ? (cliModel ? formatModelDisplayLabel(cliModel) : 'Claude Code')
                : effectiveModel ? getModelDisplayName(effectiveModel) : null
              const tooltipText = chatProvider === 'codex' ? `OpenAI Codex CLI${cliModel ? ` · ${cliModel}` : ''}`
                : chatProvider === 'claude-code' ? `Anthropic Claude Code CLI${cliModel ? ` · ${cliModel}` : ''}`
                : effectiveModel ?? ''
              return displayModel ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="ui-pill cursor-default sm:mr-2">
                      <ModelIcon provider={displayProvider} model={chatProvider === 'codex' ? 'codex' : chatProvider === 'claude-code' ? 'claude-3' : effectiveModel ?? undefined} size={16} />
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
                        if (!updateApplying && !updateAwaitingRestart) {
                          await handleApplyUpdate()
                        }
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
                    disabled={appPlatform === 'web' && (updateApplying || updateAwaitingRestart)}
                    className="h-8 shrink-0 border-amber-500/30 bg-amber-500/10 px-2 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300"
                  >
                    {appPlatform === 'web' && (updateApplying || updateAwaitingRestart)
                      ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                      : <ArrowUpCircle className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">
                      {appPlatform === 'web' && (updateApplying || updateAwaitingRestart)
                        ? 'Updating...'
                        : `v${updateInfo.latestVersion}`}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {appPlatform === 'web' && (updateApplying || updateAwaitingRestart)
                    ? 'Updating and refreshing...'
                    : `Update available — v${updateInfo.latestVersion}`}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Mobile overflow menu + avatar group */}
            {isMobile ? (
              <div className="flex items-center gap-0.5 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0 rounded-lg">
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
                    <DropdownMenuItem onSelect={() => setCurrentView('todo')}>
                      <ListChecks className="h-4 w-4 mr-2" />
                      Todo
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setCurrentView('memory')}>
                      <Brain className="h-4 w-4 mr-2" />
                      Memory
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
                {isAuthenticated ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-sm font-medium">{userInitial}</AvatarFallback>
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
              </div>
            ) : (
            <>
            {/* Desktop: Mobile overflow menu */}
            <div className="md:hidden shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0">
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
                  <DropdownMenuItem onSelect={() => setCurrentView('todo')}>
                    <ListChecks className="h-4 w-4 mr-2" />
                    Todo
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCurrentView('memory')}>
                    <Brain className="h-4 w-4 mr-2" />
                    Memory
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
                      <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
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
            </>
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
            {currentView === 'chat' && (isMobile || viewMode === 'manager') && (
              <div
                className={`border-b bg-muted/30 px-2 sm:px-5 shrink-0 ${isMobile && !compactManagerToolbar ? 'hidden' : 'flex'} ${
                  compactManagerToolbar
                    ? 'min-h-[35px] items-center gap-1.5 pt-14 py-2'
                    : 'h-11 md:h-[35px] items-center gap-1 overflow-x-auto overflow-y-visible scrollbar-none'
                }`}
              >
            {viewMode === 'developer' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showSidebar ? 'secondary' : 'ghost'}
                    size="sm"
                    className={isMobile ? 'h-8 w-8 shrink-0 rounded-md p-0' : 'h-7 shrink-0 rounded-md px-2 text-xs'}
                    onClick={() => setShowSidebar(s => !s)}
                    aria-label="Toggle projects sidebar"
                  >
                    {showSidebar
                      ? <PanelLeftClose className={`${isMobile ? 'h-3.5 w-3.5 rotate-90' : 'h-3 w-3 mr-1'}`} />
                      : <PanelLeftOpen className={`${isMobile ? 'h-3.5 w-3.5 rotate-90' : 'h-3 w-3 mr-1'}`} />
                    }
                    {!isMobile && 'Projects'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle projects sidebar</TooltipContent>
              </Tooltip>
            )}

            {/* Terminal control – always available in developer mode */}
            {viewMode === 'developer' && !isMobile && (
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
            {viewMode === 'developer' && isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isMobileProjectTargetActive(mobileProjectControlState, 'terminal') ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-9 w-9 shrink-0 rounded-md p-0"
                    aria-label="Terminal"
                    onClick={() => { void handleMobileProjectTargetAction('terminal') }}
                  >
                    <TerminalIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Terminal</TooltipContent>
              </Tooltip>
            )}

            {/* Manager thread back button — rendered before editor controls */}
            {viewMode === 'manager' && automation.selectedThread && !isMobile && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2 shrink-0"
                onClick={() => {
                  automation.setSelectedThreadId(null)
                  setInputValue('')
                }}
              >
                <ArrowLeft className="h-3 w-3 mr-1" />
                Back
              </Button>
            )}

            {/* Chat project / editor controls */}
            {activeProjectId && (viewMode === 'developer' || (viewMode === 'manager' && automation.selectedThread)) && !(isMobile && viewMode === 'manager') && (
              <>

                <div className={`flex items-center shrink-0 ${isMobile ? 'gap-1' : ''}`}>
                  {isMobile ? (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isMobileProjectTargetActive(mobileProjectControlState, 'files') ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-9 w-9 rounded-md p-0"
                            aria-label="Files"
                            onClick={() => { void handleMobileProjectTargetAction('files') }}
                          >
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Files</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isMobileProjectTargetActive(mobileProjectControlState, 'git') ? 'secondary' : 'ghost'}
                            size="sm"
                            className="relative h-9 w-9 rounded-md p-0"
                            aria-label="Changes"
                            onClick={() => { void handleMobileProjectTargetAction('git') }}
                          >
                            <GitBranch className="h-4 w-4" />
                            {changedFiles.length > 0 && (
                              <span className="absolute -right-1 -top-1 z-10 min-w-[14px] rounded-full bg-primary px-1 text-2xs font-bold leading-[14px] text-primary-foreground">
                                {changedFiles.length > 99 ? '99+' : changedFiles.length}
                              </span>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Changes</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isMobileProjectTargetActive(mobileProjectControlState, 'editor') ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-9 w-9 rounded-md p-0"
                            aria-label="Editor"
                            onClick={() => { void handleMobileProjectTargetAction('editor') }}
                          >
                            <Code className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Editor</TooltipContent>
                      </Tooltip>
                    </>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={showProject ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 rounded-md px-2 text-xs"
                          onClick={() => { void handleToggleEditor() }}
                        >
                          <Code className="h-3 w-3 mr-1" />
                          Editor
                          {showProject && <X className="h-3 w-3 ml-1" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{showProject ? 'Hide editor' : 'Show editor'}</TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {viewMode === 'developer' && showProject && activeProject && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={previewOpen ? 'secondary' : 'ghost'}
                        size="sm"
                        className={isMobile ? 'h-9 w-9 shrink-0 rounded-md p-0' : 'h-7 shrink-0 rounded-md px-2 text-xs'}
                        aria-label={previewOpen ? 'Close preview' : 'Open preview'}
                        onClick={() => {
                          if (previewOpen) {
                            closeDevPreviewPanel()
                          } else {
                            const nextTarget = projectPreviewState.target
                              ?? devPreviewTarget?.trim()
                              ?? savedDevPreview?.target?.trim()
                              ?? null
                            if (routePreviewToProject(nextTarget, activeProject?.projectRoot ?? null)) {
                              return
                            }
                            openDevPreviewPanel()
                          }
                        }}
                      >
                        <Globe className={`h-3 w-3${isMobile ? '' : ' mr-1'}`} />
                        {!isMobile && 'Preview'}
                        {!isMobile && previewOpen && <X className="h-3 wer-3 ml-1" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{previewOpen ? 'Close preview' : 'Open dev preview'}</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}

            {viewMode === 'developer' && showProject && activeProject && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showArchitecture ? 'secondary' : 'ghost'}
                    size="sm"
                    className={isMobile ? 'h-9 w-9 shrink-0 rounded-md p-0' : 'h-7 shrink-0 rounded-md px-2 text-xs'}
                    aria-label={showArchitecture ? 'Close architecture' : 'Open architecture'}
                    onClick={() => {
                      if (showArchitecture) {
                        projectRef.current?.closeArchitectureTab()
                        setArchitectureRequest(null)
                        setShowArchitecture(false)
                      } else {
                        setShowArchitecture(true)
                        openArchitectureInProject()
                      }
                    }}
                  >
                    <Boxes className={`h-3 w-3${isMobile ? '' : ' mr-1'}`} />
                    {!isMobile && 'Architecture'}
                    {!isMobile && showArchitecture && <X className="h-3 w-3 ml-1" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Software architecture diagram</TooltipContent>
              </Tooltip>
            )}

            {viewMode === 'developer' && showProject && activeProject && (
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

            {/* Manager mode: repos toggle (list view) + thread info */}
            {viewMode === 'manager' && (
              <>
                {automation.selectedThread ? null : (
                  <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showManagerRepos ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-6 text-xs px-2 shrink-0"
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
                            className="h-6 text-xs px-2 shrink-0"
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
                            className="h-6 text-xs px-2 shrink-0"
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
                {!(isMobile && automation.selectedThread) && <div className="flex-1" />}
                {automation.selectedThread ? (
                  <div className={isMobile ? 'flex min-w-0 flex-1 items-center gap-1.5' : 'flex min-w-0 items-center gap-2 shrink-0'}>
                    {isMobile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 p-0"
                        onClick={() => {
                          automation.setSelectedThreadId(null)
                          setInputValue('')
                        }}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <ManagerStatusDot status={automation.selectedThread.status} />
                      {isMobile ? (
                        <div className="min-w-0 flex-1">
                          {isTitlePending(automation.selectedThread.title) ? (
                            <TitleSkeleton className="text-xs h-3.5 w-28" />
                          ) : (
                            <span className="block truncate text-2xs leading-tight text-muted-foreground sm:text-xs">
                              {automation.selectedThread.title.replace(/^\[.*?\]\s*/, '')}
                            </span>
                          )}
                          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-2xs leading-tight text-muted-foreground">
                            {automation.selectedRepo && (
                              <span className="min-w-0 truncate">
                                {automation.selectedRepo.name} · {automation.selectedRepo.defaultBranch}
                              </span>
                            )}
                            <ThreadKindBadge kind={automation.selectedThread.kind} />
                            {automation.selectedThread.branch && (
                              <span className="shrink min-w-0 truncate font-mono">
                                {automation.selectedThread.branch}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="min-w-0 flex items-center gap-2">
                          {isTitlePending(automation.selectedThread.title) ? (
                            <TitleSkeleton className="text-xs h-3.5 w-28" />
                          ) : (
                            <span className="max-w-[200px] truncate text-2xs text-muted-foreground sm:text-xs">
                              {automation.selectedThread.title.replace(/^\[.*?\]\s*/, '')}
                            </span>
                          )}
                          <ThreadKindBadge kind={automation.selectedThread.kind} />
                          {automation.selectedRepo && (
                            <span className="max-w-[160px] truncate text-2xs text-muted-foreground">
                              {automation.selectedRepo.name} · {automation.selectedRepo.defaultBranch}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                      <ThreadSkillPicker
                        token={token}
                        threadId={automation.selectedThread.id}
                        selectedSkillIds={automation.selectedThread.skillIds}
                      />
                      {!isMobile && automation.selectedThread.branch && (
                        <Badge variant="outline" className="text-2xs px-1 py-0 font-mono">
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
                            changeFiles={automation.selectedThread.changeFiles}
                            changeInsertions={automation.selectedThread.changeInsertions}
                            changeDeletions={automation.selectedThread.changeDeletions}
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

        {currentView === 'todo' ? (
          <div className={`flex-1 overflow-y-auto ${isMobile ? 'pt-12' : ''}`}>
            <ErrorBoundary name="Todo" variant="section" className="min-h-full" resetKeys={[currentView, token]}>
              <TodoPage
                provider={chatProvider}
                model={cliModel}
                runtimeMode={chatProvider !== 'jait' ? chatProviderRuntimeMode : 'full-access'}
              />
            </ErrorBoundary>
          </div>
        ) : currentView === 'memory' ? (
          <div className={`flex-1 overflow-y-auto ${isMobile ? 'pt-12' : ''}`}>
            <ErrorBoundary name="Memory" variant="section" className="min-h-full" resetKeys={[currentView, token]}>
              <MemoryPage />
            </ErrorBoundary>
          </div>
        ) : currentView === 'jobs' ? (
          <div className={`flex-1 overflow-y-auto ${isMobile ? 'pt-12' : ''}`}>
            <ErrorBoundary name="Jobs" variant="section" className="min-h-full" resetKeys={[currentView]}>
              <JobsPage />
            </ErrorBoundary>
          </div>
        ) : currentView === 'network' ? (
          <div className={`flex-1 overflow-y-auto ${isMobile ? 'pt-12' : ''}`}>
            <ErrorBoundary name="Network" variant="section" className="min-h-full" resetKeys={[currentView, token, activeSessionId]}>
              <NetworkPanel token={token} sessionId={activeSessionId ?? 'default'} />
            </ErrorBoundary>
          </div>
        ) : currentView === 'settings' ? (
          <div className={`flex-1 overflow-y-auto ${isMobile ? 'pt-12' : ''}`}>
            <ErrorBoundary name="Settings" variant="section" className="min-h-full" resetKeys={[currentView, token]}>
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
                onClearArchivedProjects={handleClearArchivedProjects}
                onFetchArchivedProjects={fetchArchivedProjects}
                onRestoreProject={handleRestoreProject}
                activityEvents={activityEvents}
                updateInfo={updateInfo}
                updateChecking={updateChecking}
                onCheckUpdate={() => { void handleCheckUpdate() }}
                onApplyUpdate={() => { void handleApplyUpdate() }}
                updateApplying={updateApplying}
                platform={appPlatform}
              />
            </ErrorBoundary>
          </div>
        ) : (
          <div className={`flex flex-1 min-h-0 overflow-hidden ${isMobile ? 'flex-col relative' : ''}`}>
            <div className={isMobile ? 'contents' : `relative flex min-h-0 ${chatCollapsed ? 'flex-1 min-w-0' : 'shrink-0'}`}>
              {viewMode === 'developer' && showSidebar && isMobile && (
                <div className="fixed inset-0 z-20" onClick={() => setShowSidebar(false)} />
              )}
              {viewMode === 'developer' && !isMobile && (
                <aside className="flex w-12 shrink-0 flex-col items-center gap-2 border-r bg-background px-1 py-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showSidebar ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-9 w-9 rounded-md p-0"
                        onClick={() => setShowSidebar((s) => !s)}
                        aria-label="Toggle projects panel"
                      >
                        {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Projects</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={showTerminal ? 'secondary' : 'ghost'} size="sm" className="h-9 w-9 rounded-md p-0" onClick={() => { void handleToggleTerminal() }} aria-label="Terminal">
                        <TerminalIcon className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Terminal</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={showProject ? 'secondary' : 'ghost'} size="sm" className="h-9 w-9 rounded-md p-0" onClick={() => { void handleToggleEditor() }} aria-label="Editor">
                        <Code className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Editor</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={previewOpen ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-9 w-9 rounded-md p-0"
                        aria-label="Preview"
                        disabled={authLoading || projectsLoading}
                        onClick={() => { void handleSidebarPreviewToggle() }}
                      >
                        <Globe className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Preview</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showArchitecture ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-9 w-9 rounded-md p-0"
                        disabled={authLoading || projectsLoading}
                        aria-label="Architecture"
                        onClick={() => { void handleSidebarArchitectureToggle() }}
                      >
                        <Boxes className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Architecture</TooltipContent>
                  </Tooltip>
                  <div className="flex-1" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showDebugPanel ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-9 w-9 rounded-md p-0"
                        disabled={!showProject || !activeProject}
                        aria-label="Debug"
                        onClick={() => setShowDebugPanel((d) => !d)}
                      >
                        <Bug className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Debug</TooltipContent>
                  </Tooltip>
                </aside>
              )}

              {viewMode === 'developer' && shouldRenderSessionSidebar(showSidebar) && (
                <aside
                  ref={sidebarRef}
                  tabIndex={-1}
                  onBlur={handleSidebarBlur}
                  className={`overflow-hidden outline-none ${isMobile ? 'fixed right-[3.25rem] top-1/2 z-50 h-[min(28rem,80vh)] w-[min(20rem,calc(100vw-5rem))] -translate-y-1/2 rounded-xl border bg-background shadow-2xl' : 'w-64 border-r shrink-0'}`}
                >
                  <ErrorBoundary name="Project sidebar" variant="section" className="h-full" resetKeys={[activeProjectId, activeSessionId, projects.length, personalSessions.length]}>
                    <SessionSelector
                      projects={projects}
                      personalSessions={personalSessions}
                      activeProjectId={activeProjectId}
                      activeSessionId={activeSessionId}
                      loading={projectsLoading}
                      hasMoreProjects={hasMoreProjects}
                      showFewerProjects={projects.length > projectListLimit}
                      onSelectProject={handleSwitchProject}
                      onSelectPersonalSession={(sessionId) => { if (isMobile) setShowSidebar(false); switchSession(null, sessionId) }}
                      onNewPersonalSession={() => { if (isMobile) setShowSidebar(false); void createSession(null) }}
                      onCreateProject={handleCreateProject}
                      onRemoveProject={(projectId) => { void handleRemoveProject(projectId) }}
                      onChangeDirectory={handleChangeDirectory}
                      onAssignRepository={(projectId) => { void handleAssignProjectRepository(projectId) }}
                      onShowMore={showMoreProjects}
                      onShowFewer={showFewerProjects}
                      sessionInfo={sessionInfo}
                      nodes={fsNodes}
                      repositories={automation.repositories}
                    />
                  </ErrorBoundary>
                </aside>
              )}

              {((viewMode === 'developer' && currentView === 'chat' && !isMobile && (showDesktopProject || showTerminal))
                || (viewMode === 'manager' && automation.selectedThread && showDesktopProject)) && (
                <div
                  className={`relative flex min-h-0 flex-col ${!showDesktopProject && showTerminal ? 'flex-1 min-w-0' : chatCollapsed ? 'flex-1 min-w-0' : 'shrink-0'}`}
                  style={!showDesktopProject && showTerminal ? { width: terminalColumnWidth, maxWidth: '70vw' } : undefined}
                >
                {!showDesktopProject && showTerminal && (
                  <div
                    onMouseDown={handleTerminalColumnDragStart}
                    className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-primary/30 transition-colors z-10"
                  />
                )}
                {(viewMode === 'developer' || (viewMode === 'manager' && automation.selectedThread)) && showDesktopProject && (
                  <div className="flex min-h-0 flex-1">
                    <ErrorBoundary
                      name="Editor project"
                      variant="section"
                      className="flex-1 min-h-0"
                      resetKeys={[activeProject?.projectRoot, showProjectTree, showProjectEditor, mobileTreeTab]}
                    >
                      <ProjectPanel
                        ref={projectRef}
                        autoOpenRemotePath={activeProject?.projectRoot ?? null}
                        surfaceId={activeProject?.surfaceId ?? null}
                        files={projectFiles}
                        activeFileId={activeProjectFileId}
                        onActiveFileChange={setActiveProjectFileId}
                        onFileDrop={(files) => { void handleFileDrop(files) }}
                        onReferenceFile={handleReferenceFile}
                        onReferenceSelection={handleReferenceFileSelection}
                        onReferencePreviewElement={handleReferencePreviewElement}
                        onAvailableFilesChange={handleAvailableFilesForMentionChange}
                        showTree={showProjectTree}
                        showEditor={showProjectEditor}
                        onToggleTree={toggleProjectTree}
                        onToggleEditor={toggleProjectEditor}
                        changedPaths={changedPaths}
                        fsWatcherVersion={fsWatcherVersion}
                        fsWatcherPayload={fsWatcherPayload}
                        sourceControlRefreshSignal={sourceControlRefreshSignal}
                        savedTabsState={projectTabsState}
                        stateReady={projectStateReady}
                        previewRequest={projectPreviewRequest}
                        onTabsStateChange={handleProjectTabsStateChange}
                        onPreviewOpenChange={handleProjectPreviewOpenChange}
                        previewSessionId={activeSessionId}
                        previewToken={token}
                        previewProjectRoot={previewProjectRoot}
                        previewInitialTarget={devPreviewTarget}
                        architectureDiagram={architectureDiagram}
                        architectureGenerating={architectureGenerating}
                        architectureRequest={architectureRequest}
                        onArchitectureOpenChange={setShowArchitecture}
                        onArchitectureRenderResult={handleArchitectureRenderResult}
                        onGenerateArchitecture={() => {
                          setArchitectureGenerating(true)
                          handleSuggestion('Analyze the project architecture and generate a mermaid diagram using the architecture.generate tool. Include all major modules, their relationships, data flow, and external dependencies.')
                        }}
                        onApplyDiff={handleApplyProjectDiff}
                        provider={chatProvider}
                        cliModel={cliModel}
                        onMaxCollapsedChange={setChatCollapsed}
                        restoreRef={projectRestoreRef}
                      />
                    </ErrorBoundary>
                  </div>
                )}
                {viewMode === 'developer' && showTerminal && !isMobile && currentView === 'chat' && (
                  <div className={`flex min-h-0 flex-col bg-background ${terminalFullscreen ? 'absolute inset-0 z-20 border-r' : `relative border-r border-t ${showDesktopProject ? 'shrink-0' : 'flex-1'}`}`} style={terminalFullscreen || !showDesktopProject ? undefined : { height: terminalHeight }}>
                    {!terminalFullscreen && (
                      <div
                        onMouseDown={handleTerminalDragStart}
                        className="absolute inset-x-0 top-0 h-1.5 cursor-row-resize hover:bg-primary/30 transition-colors z-20"
                      />
                    )}
                    <div className="relative shrink-0">
                      <TerminalTabs
                        terminals={projectTerminals}
                        activeTerminalId={activeTerminalId}
                        onSelect={setActiveTerminalId}
                        onCreate={(shell) => createTerminal(activeSessionId ?? 'default', activeProjectRoot ?? undefined, shell)}
                        onKill={handleKillTerminal}
                        onDetach={handleDetachTerminal}
                        availableShells={terminalShells}
                      />
                      <div className="absolute right-0 top-0 bottom-px flex items-center gap-1 pr-2 pl-3 bg-background z-[9]">
                        {showDesktopProject && (
                        <button
                          onClick={() => {
                            if (terminalFullscreen) {
                              setTerminalFullscreen(false)
                              setTerminalHeight(terminalHeightBeforeFullscreenRef.current)
                            } else {
                              terminalHeightBeforeFullscreenRef.current = terminalHeight
                              setTerminalFullscreen(true)
                            }
                          }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={terminalFullscreen ? 'Exit fullscreen' : 'Fullscreen terminal'}
                        >
                          {terminalFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </button>
                        )}
                        <button
                          onClick={() => { if (activeTerminalId) handleDetachTerminal(activeTerminalId) }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Open terminal in new window"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                        <button
                          onClick={closeTerminalPanel}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Close terminal"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {activeTerminalId ? (
                      <ErrorBoundary name="Terminal" variant="section" className="flex-1 min-h-0" resetKeys={[activeTerminalId, activeProjectRoot]}>
                        <TerminalView
                          ref={terminalViewRef}
                          terminalId={activeTerminalId}
                          className="flex-1 min-h-0"
                          token={token}
                          projectRoot={activeProjectRoot ?? undefined}
                          onReferenceSelection={handleReferenceTerminalSelection}
                        />
                      </ErrorBoundary>
                    ) : (
                      <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
                        <button
                          onClick={() => createTerminal(activeSessionId ?? 'default', activeProjectRoot ?? undefined)}
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
              <section className="flex flex-1 min-h-0 flex-col overflow-hidden border-b bg-background pt-16">
                <div className="relative shrink-0 border-b">
                  <TerminalTabs
                    terminals={projectTerminals}
                    activeTerminalId={activeTerminalId}
                    onSelect={setActiveTerminalId}
                    onCreate={(shell) => createTerminal(activeSessionId ?? 'default', activeProjectRoot ?? undefined, shell)}
                    onKill={handleKillTerminal}
                    availableShells={terminalShells}
                  />
                  <button
                    onClick={closeTerminalPanel}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Close terminal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {activeTerminalId ? (
                  <ErrorBoundary name="Terminal" variant="section" className="flex-1 min-h-0" resetKeys={[activeTerminalId, activeProjectRoot]}>
                    <TerminalView
                      ref={terminalViewRef}
                      terminalId={activeTerminalId}
                      className="flex-1 min-h-0"
                      token={token}
                      projectRoot={activeProjectRoot ?? undefined}
                      onReferenceSelection={handleReferenceTerminalSelection}
                    />
                  </ErrorBoundary>
                ) : (
                  <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
                    <button
                      onClick={() => createTerminal(activeSessionId ?? 'default', activeProjectRoot ?? undefined)}
                      className="hover:text-foreground transition-colors"
                    >
                      + New Terminal
                    </button>
                  </div>
                )}
              </section>
            )}
            {(viewMode === 'developer' || (viewMode === 'manager' && automation.selectedThread)) && showMobileProjectFullscreen && (
              <section className={`flex-1 min-h-0 overflow-hidden border-b bg-background ${viewMode === 'manager' ? '' : 'pt-16'}`}>
                <ErrorBoundary
                  name="Editor project"
                  variant="section"
                  className="h-full min-h-0"
                  resetKeys={[activeProject?.projectRoot, showProjectTree, showProjectEditor, mobileTreeTab]}
                >
                  <ProjectPanel
                    ref={projectRef}
                    autoOpenRemotePath={activeProject?.projectRoot ?? null}
                    surfaceId={activeProject?.surfaceId ?? null}
                    files={projectFiles}
                    activeFileId={activeProjectFileId}
                    onActiveFileChange={setActiveProjectFileId}
                    onFileDrop={(files) => { void handleFileDrop(files) }}
                    onReferenceFile={handleReferenceFile}
                    onReferenceSelection={handleReferenceFileSelection}
                    onReferencePreviewElement={handleReferencePreviewElement}
                    onAvailableFilesChange={handleAvailableFilesForMentionChange}
                    showTree={showProjectTree}
                    showEditor={showProjectEditor}
                    onToggleTree={toggleProjectTree}
                    onToggleEditor={toggleProjectEditor}
                    treeTab={mobileTreeTab}
                    onTreeTabChange={setMobileTreeTab}
                    changedPaths={changedPaths}
                    fsWatcherVersion={fsWatcherVersion}
                    fsWatcherPayload={fsWatcherPayload}
                    sourceControlRefreshSignal={sourceControlRefreshSignal}
                    isMobile
                    savedTabsState={projectTabsState}
                    stateReady={projectStateReady}
                    previewRequest={projectPreviewRequest}
                    onTabsStateChange={handleProjectTabsStateChange}
                    onPreviewOpenChange={handleProjectPreviewOpenChange}
                    previewSessionId={activeSessionId}
                    previewToken={token}
                    previewProjectRoot={previewProjectRoot}
                    previewInitialTarget={devPreviewTarget}
                    architectureDiagram={architectureDiagram}
                    architectureGenerating={architectureGenerating}
                    architectureRequest={architectureRequest}
                    onArchitectureOpenChange={setShowArchitecture}
                    onArchitectureRenderResult={handleArchitectureRenderResult}
                    onGenerateArchitecture={() => {
                      setArchitectureGenerating(true)
                      handleSuggestion('Analyze the project architecture and generate a mermaid diagram using the architecture.generate tool. Include all major modules, their relationships, data flow, and external dependencies.')
                    }}
                    onApplyDiff={handleApplyProjectDiff}
                    provider={chatProvider}
                    cliModel={cliModel}
                  />
                </ErrorBoundary>
              </section>
            )}

            {!showMobileProjectFullscreen && !showMobileTerminalFullscreen && (viewMode === 'manager' ? (
              /* ── Manager main content ────────────────────────────── */
              <div className={`flex-1 min-w-0 flex flex-col min-h-0 ${isMobile && !automation.selectedThread ? 'pt-12' : ''}`}>
                {automation.selectedThread ? (
                  <div className={`flex flex-1 min-h-0 ${isMobile ? 'flex-col' : ''}`}>
                    <div className="flex min-w-0 flex-1 flex-col min-h-0">
                      <ErrorBoundary name="Thread activity" variant="section" className="min-h-0 flex-1 border-b" resetKeys={[automation.selectedThread?.id, automationMessages.length]}>
                        <Conversation
                          key={automation.selectedThread?.id ?? 'manager-empty'}
                          className="min-h-0 flex-1 border-b"
                          loading={automation.loadingActivities}
                          loadingLabel="Loading activity"
                          messageContents={automationMessages.map((msg) => msg.content)}
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
                              contextFlow={msg.contextFlow}
                              toolCalls={msg.toolCalls}
                              segments={msg.segments}
                              isStreaming={automation.selectedThread?.status === 'running' && idx === automationMessages.length - 1}
                              compact
                              preferLlmUi={false}
                              provider={automation.selectedThread?.providerId as ProviderId | undefined}
                              threadControlThreads={managerThreads as unknown as Record<string, unknown>[]}
                              renderInlineSecretPrompt={renderInlineSecretPrompt}
                              onOpenPath={handleOpenMessagePath}
                              onOpenDiff={handleChangedFileClick}
                              onOpenMemorySource={handleOpenMemorySource}
                            />
                          ))}
                        </Conversation>
                      </ErrorBoundary>
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
                              onSteer={automation.selectedThread.status === 'running' ? steerManagerQueueItem : undefined}
                              onSendToParallelThread={sendManagerQueueItemToParallelThread}
                              className="mb-2"
                            />
                          )}
                          {automation.selectedThreadTodos.length > 0 && (
                            <TodoList items={automation.selectedThreadTodos} className="mb-2" />
                          )}
                          <ErrorBoundary name="Thread composer" variant="section" resetKeys={[automation.selectedThread?.id, inputVersion]}>
                            <PromptInput
                              ref={promptInputRef}
                              draftStateKey={`manager:${automation.selectedThread?.id ?? 'new-thread'}`}
                              value={inputValueRef.current}
                              syncKey={inputVersion}
                              onChange={handleInputChange}
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
                              responseStyle={chatResponseStyle}
                              onResponseStyleChange={handleChatResponseStyleChange}
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
                              projectOpen={showProject}
                            />
                          </ErrorBoundary>
                          <div className="flex items-center gap-2 px-1 mt-1.5">
                            {selectedThreadRepoRuntime && (
                              <ManagerRepoRuntimeMeta runtime={selectedThreadRepoRuntime} />
                            )}
                            {automation.selectedThread && automation.selectedThread.status !== 'running' && !automation.selectedThread.providerSessionId && (
                              <span className="text-xs text-muted-foreground truncate">
                                Thread finished — start a new one
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
                    <div className={`flex-1 flex flex-col min-w-0 overflow-y-auto ${isMobile ? 'pt-8' : ''}`}>
                      {/* Title + composer */}
                      <div className="relative z-10 flex flex-col items-center px-3 pb-8 pt-8 sm:px-4 sm:pb-2 sm:pt-4">
                        <div className="w-full max-w-3xl">
                          <h1 className="mb-3 text-center text-xl font-semibold tracking-tight sm:mb-4 sm:text-2xl">What do you want to build?</h1>
                          {automation.error && (
                            <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 mb-3">
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 break-words">{automation.error}</span>
                            </div>
                          )}
                          <ErrorBoundary name="Thread composer" variant="section" resetKeys={[automation.selectedRepo?.id, inputVersion]}>
                            <PromptInput
                              ref={promptInputRef}
                              draftStateKey={`manager:${automation.selectedRepo?.id ?? 'repo-draft'}`}
                              value={inputValueRef.current}
                              syncKey={inputVersion}
                              onChange={handleInputChange}
                              onSubmit={handleSubmit}
                              disabled={threadComposerDisabled}
                              controlsDisabled={automation.creating || selectedRepoOffline}
                              placeholder={threadPlaceholder}
                              onVoiceInput={handleVoiceInput}
                              voiceRecording={voiceRecording}
                              voiceLevels={voiceLevels}
                              voiceTranscribing={voiceTranscribing}
                              onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                              responseStyle={chatResponseStyle}
                              onResponseStyleChange={handleChatResponseStyleChange}
                              provider={chatProvider}
                              onProviderChange={handleChatProviderChange}
                              providerRuntimeMode={chatProviderRuntimeMode}
                              onProviderRuntimeModeChange={handleChatProviderRuntimeModeChange}
                              cliModel={cliModel}
                              onCliModelChange={handleCliModelChange}
                              repoRuntime={selectedRepoRuntime}
                              onMoveToGateway={handleMoveRepoToGateway}
                            />
                          </ErrorBoundary>
                          <div className={`${isMobile ? 'overflow-hidden' : 'overflow-x-auto'} px-1 pt-3`}>
                            <div className={`${isMobile ? 'flex min-w-0 items-center gap-2' : 'flex min-w-max items-center gap-2 whitespace-nowrap'}`}>
                              <ManagerRepoPicker
                                repositories={automation.repositories}
                                selectedRepo={automation.selectedRepo}
                                disabled={automation.creating}
                                compact={isMobile}
                                className={isMobile ? 'flex-1' : ''}
                                getRuntimeInfo={automation.getRuntimeInfoForRepository}
                                onSelect={automation.setSelectedRepoId}
                                onAddRepository={() => automation.setFolderPickerOpen(true)}
                              />
                              {selectedRepoRuntime && (
                                <ManagerRepoRuntimeMeta runtime={selectedRepoRuntime} />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Thread list header + threads */}
                      <div className="flex-1 overflow-y-auto">
                        <div className="mx-auto w-full max-w-3xl">

                          <div className="sticky top-0 z-10 flex h-[35px] items-center justify-between border-b bg-background px-2.5 sm:px-3">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Threads</span>
                              <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-2xs">
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
                                const prState = getVisibleThreadPrState(
                                  thread,
                                  thread.id in automation.threadPrStates ? automation.threadPrStates[thread.id] : undefined,
                                )
                                return (
                                  <ManagerThreadListItem
                                    key={thread.id}
                                    thread={thread}
                                    repo={threadRepo}
                                    repoName={repoName}
                                    prState={prState}
                                    ghAvailable={automation.ghAvailable}
                                    onOpen={() => { automation.setSelectedThreadId(thread.id); setShowProject(false); setShowProjectEditor(false) }}
                                    onStop={() => { void automation.handleStop(thread.id) }}
                                    onDelete={() => automation.handleDelete(thread.id)}
                                  />
                                )
                              })}
                              {automation.hasMoreThreads && (
                                <button
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 sm:py-2"
                                  disabled={automation.loading}
                                  onClick={automation.showMoreThreads}
                                >
                                  {automation.loading ? <SpinnerIcon className="h-3 w-3 animate-spin" /> : null}
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
              <div
                ref={setChatPanelElement}
                className={`relative flex-1 min-w-0 flex flex-col items-center justify-center overflow-hidden ${chatCollapsed ? '' : 'px-4'} ${isMobile ? 'pt-12' : ''}`}
                style={developerChatPanelStyle}
              >
                <div className="w-full max-w-3xl space-y-8">
                  <div className="text-center">
                    <h1 className="text-3xl font-semibold tracking-tight">Jait</h1>
                    <p className="text-base text-muted-foreground mt-1">Just Another Intelligent Tool</p>
                  </div>
                  {!projectsLoading && projects.length === 0 ? (
                    <div className="text-center space-y-3">
                      <p className="text-sm text-muted-foreground">Add a project folder to start chatting with your code.</p>
                      <Button variant="default" size="lg" onClick={() => { setProjectPickerMode('project'); setFolderPickerOpen(true) }}>
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Add Project
                      </Button>
                    </div>
                  ) : (
                    <Suggestions suggestions={showProject && activeProject ? projectSuggestions : suggestions} onSelect={handleSuggestion} />
                  )}
                  {developerChatUiState.showTodoList && (
                    <TodoList items={todoList} onClear={() => setTodoList([])} />
                  )}
                  <ErrorBoundary name="Chat composer" variant="section" resetKeys={[activeSessionId, inputVersion, sendTarget]}>
                    <PromptInput
                      ref={promptInputRef}
                      draftStateKey={`developer:${activeSessionId ?? 'new-chat'}`}
                      value={inputValueRef.current}
                      syncKey={inputVersion}
                      segments={inputSegments}
                      onChange={handleInputChange}
                      onSubmit={handleSubmit}
                      onStop={handleCancelRequest}
                      onQueue={handleQueue}
                      isLoading={isLoading}
                      submitLoading={developerChatSubmitLoading}
                      placeholder={developerPlaceholder}
                      onVoiceInput={handleVoiceInput}
                      voiceRecording={voiceRecording}
                      voiceLevels={voiceLevels}
                      voiceTranscribing={voiceTranscribing}
                      onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                      mode={chatMode}
                      onModeChange={setChatMode}
                      responseStyle={chatResponseStyle}
                      onResponseStyleChange={handleChatResponseStyleChange}
                      sendTarget={sendTarget}
                      onSendTargetChange={setSendTarget}
                      showSendTargetSelector={false}
                      provider={chatProvider}
                      onProviderChange={handleChatProviderChange}
                      providerRuntimeMode={chatProviderRuntimeMode}
                      onProviderRuntimeModeChange={handleChatProviderRuntimeModeChange}
                      cliModel={cliModel}
                      onCliModelChange={handleCliModelChange}
                      repoRuntime={sendTarget === 'thread' ? threadTargetRepoRuntime : null}
                      onMoveToGateway={sendTarget === 'thread' ? handleMoveRepoToGateway : undefined}
                      availableFiles={availableFilesForMention}
                      onSearchFiles={handleSearchFiles}
                      projectOpen={showProject}
                      projectName={activeProjectDisplayName}
                      projectPath={activeProjectRoot}
                      sessionInfo={sessionInfo}
                      projectNodeId={activeProject?.nodeId}
                    />
                  </ErrorBoundary>
                  {developerComposerControlRow}
                </div>
              </div>
            ) : (
              <div
                ref={setChatPanelElement}
                className="relative flex flex-col min-h-0 min-w-0 overflow-hidden"
                style={developerChatPanelStyle}
              >

                {!chatCollapsed && (<>
                <ErrorBoundary name="Chat transcript" variant="section" className="min-h-0 flex-1 border-b" resetKeys={[activeSessionId, messages.length, messageQueue.length, showDesktopProject]}>
                  <Conversation
                    key={activeSessionId ?? 'developer-empty'}
                    className="min-h-0 flex-1 border-b"
                    compact={showDesktopProject}
                    loading={isLoadingHistory}
                    loadingLabel="Loading chat"
                    messageContents={messageContents}
                    hasMore={hasMoreMessages}
                    onLoadMore={loadOlderMessages}
                  >
                    {messages.map((msg, idx) => (
                      <Message
                        key={msg.id}
                        messageId={msg.id}
                        messageIndex={idx}
                        messageFromEnd={messages.length - 1 - idx}
                        role={msg.role}
                        content={msg.content}
                        contextFlow={msg.contextFlow}
                        displayContent={msg.displayContent}
                        referencedFiles={msg.referencedFiles}
                        displaySegments={msg.displaySegments}
                        attachments={msg.attachments}
                        thinking={msg.thinking}
                        thinkingDuration={msg.thinkingDuration}
                        toolCalls={msg.toolCalls}
                        segments={msg.segments}
                        isStreaming={isLoading && msg === messages[messages.length - 1]}
                        compact={showProject || showScreenShare || previewOpen}
                        preferLlmUi
                        provider={chatProvider}
                        threadControlThreads={managerThreads as unknown as Record<string, unknown>[]}
                        onOpenTerminal={handleOpenTerminalFromToolCall}
                        renderInlineSecretPrompt={renderInlineSecretPrompt}
                        onEditMessage={handleEditPreviousMessage}
                        editComposer={editComposerBag}
                        onOpenPath={handleOpenMessagePath}
                        onOpenDiff={handleChangedFileClick}
                        onOpenMemorySource={handleOpenMemorySource}
                        onMemoryFeedback={handleMemoryFeedback}
                      />
                    ))}
                    {messageQueue.length > 0 && (
                      <MessageQueue
                        items={messageQueue}
                        onRemove={dequeueMessage}
                        onEdit={updateQueueItem}
                        onReorder={reorderQueueItem}
                        onSteer={isLoading && activeSessionId ? steerQueuedChatMessage : undefined}
                      />
                    )}
                  </Conversation>
                </ErrorBoundary>

                <div className={`shrink-0 ${isMobile ? 'px-2 py-2' : `py-3 ${showDesktopProject ? 'px-3' : 'px-4'}`}`}>
                  <div className="mx-auto w-full max-w-3xl space-y-1.5">
                    <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                      {developerChatUiState.showTodoList && (
                        <TodoList items={todoList} onClear={() => setTodoList([])} />
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
                          <span className="text-xs text-muted-foreground">Agent stopped — continue to resume</span>
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
                          files={changedFilesForComposer}
                          onAccept={acceptFile}
                          onReject={rejectFile}
                          onAcceptAll={acceptAllFiles}
                          onRejectAll={rejectAllFiles}
                          onFileClick={handleChangedFileClick}
                        />
                      )}
                    </div>
                    <ErrorBoundary name="Chat composer" variant="section" resetKeys={[activeSessionId, inputVersion, sendTarget]}>
                      <PromptInput
                        ref={promptInputRef}
                        draftStateKey={`developer:${activeSessionId ?? 'new-chat'}`}
                        value={inputValueRef.current}
                        syncKey={inputVersion}
                        segments={inputSegments}
                        onChange={handleInputChange}
                        onSubmit={handleSubmit}
                        onStop={handleCancelRequest}
                        onQueue={handleQueue}
                        isLoading={isLoading}
                        submitLoading={developerChatSubmitLoading}
                        disabled={limitReached}
                        placeholder={developerPlaceholder}
                        onVoiceInput={handleVoiceInput}
                        voiceRecording={voiceRecording}
                        voiceLevels={voiceLevels}
                        voiceTranscribing={voiceTranscribing}
                        onVoiceStop={() => { void stopRecordingAndTranscribe() }}
                        mode={chatMode}
                        onModeChange={setChatMode}
                        responseStyle={chatResponseStyle}
                        onResponseStyleChange={handleChatResponseStyleChange}
                        sendTarget={sendTarget}
                        onSendTargetChange={setSendTarget}
                        showSendTargetSelector={false}
                        provider={chatProvider}
                        onProviderChange={handleChatProviderChange}
                        providerRuntimeMode={chatProviderRuntimeMode}
                        onProviderRuntimeModeChange={handleChatProviderRuntimeModeChange}
                        cliModel={cliModel}
                        onCliModelChange={handleCliModelChange}
                        repoRuntime={sendTarget === 'thread' ? threadTargetRepoRuntime : null}
                        onMoveToGateway={sendTarget === 'thread' ? handleMoveRepoToGateway : undefined}
                        availableFiles={availableFilesForMention}
                        onSearchFiles={handleSearchFiles}
                        projectOpen={showProject}
                        projectName={activeProjectDisplayName}
                        projectPath={activeProjectRoot}
                        sessionInfo={sessionInfo}
                        projectNodeId={activeProject?.nodeId}
                      />
                    </ErrorBoundary>
                    {developerComposerControlRow}
                  </div>
                </div>
                </>)}
              </div>
            ))}
          </div>
        )}

            {/* Terminal panel rendered as sidebar-adjacent column above */}

            {viewMode === 'developer' && showDebugPanel && (
              <div className="fixed top-14 right-0 bottom-0 w-[420px] border-l z-50 shadow-xl">
                <ErrorBoundary name="Debug panel" variant="section" className="h-full" resetKeys={[showDebugPanel, activeSessionId]}>
                  <SSEDebugPanel onClose={() => setShowDebugPanel(false)} />
                </ErrorBoundary>
              </div>
            )}

            {isMobile && (viewMode === 'developer' || (viewMode === 'manager' && automation.selectedThread)) && currentView === 'chat' && (
              <>
                {/* Invisible backdrop to close toolbar on tap-outside */}
                {showMobileToolbar && (
                  <div
                    className="fixed inset-0 z-[39]"
                    onClick={() => setShowMobileToolbar(false)}
                    aria-hidden="true"
                  />
                )}
                <div
                  className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1"
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                >
                  {showMobileToolbar && (
                    <div className="transition-all duration-200 translate-x-0 opacity-100">
                      {mobileFooterToolbarControls}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="h-14 w-7 rounded-l-lg rounded-r-none border-y border-l border-r-0 bg-background/90 shadow-lg backdrop-blur-lg"
                    onClick={() => setShowMobileToolbar((show) => !show)}
                    aria-expanded={showMobileToolbar}
                    aria-label={showMobileToolbar ? 'Hide mobile toolbar' : 'Show mobile toolbar'}
                    title={showMobileToolbar ? 'Hide mobile toolbar' : 'Show mobile toolbar'}
                  >
                    {showMobileToolbar ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </>
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
                          <div className="group/pw relative">
                            <Input
                              id="login-password"
                              type={showLoginPassword ? 'text' : 'password'}
                              value={loginPassword}
                              onChange={(event) => setLoginPassword(event.target.value)}
                              autoComplete="current-password"
                              required
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent opacity-0 group-focus-within/pw:opacity-100 transition-opacity"
                              onClick={() => setShowLoginPassword(!showLoginPassword)}
                              tabIndex={-1}
                            >
                              {showLoginPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                          </div>
                        </div>
                        <Button type="submit" className="w-full" disabled={authSubmitting}>
                          {authSubmitting ? 'Signing in…' : 'Login'}
                        </Button>
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
                          <div className="group/pw relative">
                            <Input
                              id="register-password"
                              type={showRegisterPassword ? 'text' : 'password'}
                              value={registerPassword}
                              onChange={(event) => setRegisterPassword(event.target.value)}
                              autoComplete="new-password"
                              required
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent opacity-0 group-focus-within/pw:opacity-100 transition-opacity"
                              onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                              tabIndex={-1}
                            >
                              {showRegisterPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="register-password-confirm">Confirm password</Label>
                          <div className="group/pw relative">
                            <Input
                              id="register-password-confirm"
                              type={showRegisterConfirmPassword ? 'text' : 'password'}
                              value={registerPasswordConfirm}
                              onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                              autoComplete="new-password"
                              required
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent opacity-0 group-focus-within/pw:opacity-100 transition-opacity"
                              onClick={() => setShowRegisterConfirmPassword(!showRegisterConfirmPassword)}
                              tabIndex={-1}
                            >
                              {showRegisterConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                          </div>
                        </div>
                        <Button type="submit" className="w-full" disabled={authSubmitting}>
                          {authSubmitting ? 'Creating account…' : serverHasUsers === false ? 'Get Started' : 'Create account'}
                        </Button>
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
                        <div className="group/pw relative">
                          <Input
                            id="login-password"
                            type={showLoginPassword ? 'text' : 'password'}
                            value={loginPassword}
                            onChange={(event) => setLoginPassword(event.target.value)}
                            autoComplete="current-password"
                            required
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent opacity-0 group-focus-within/pw:opacity-100 transition-opacity"
                            onClick={() => setShowLoginPassword(!showLoginPassword)}
                            tabIndex={-1}
                          >
                            {showLoginPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={authSubmitting}>
                        {authSubmitting ? 'Signing in…' : 'Login'}
                      </Button>
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
                        <div className="group/pw relative">
                          <Input
                            id="register-password"
                            type={showRegisterPassword ? 'text' : 'password'}
                            value={registerPassword}
                            onChange={(event) => setRegisterPassword(event.target.value)}
                            autoComplete="new-password"
                            required
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent opacity-0 group-focus-within/pw:opacity-100 transition-opacity"
                            onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                            tabIndex={-1}
                          >
                            {showRegisterPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="register-password-confirm">Confirm password</Label>
                        <div className="group/pw relative">
                          <Input
                            id="register-password-confirm"
                            type={showRegisterConfirmPassword ? 'text' : 'password'}
                            value={registerPasswordConfirm}
                            onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                            autoComplete="new-password"
                            required
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent opacity-0 group-focus-within/pw:opacity-100 transition-opacity"
                            onClick={() => setShowRegisterConfirmPassword(!showRegisterConfirmPassword)}
                            tabIndex={-1}
                          >
                            {showRegisterConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={authSubmitting}>
                        {authSubmitting ? 'Creating account…' : serverHasUsers === false ? 'Get Started' : 'Create account'}
                      </Button>
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
          onOpenChange={(open) => { setFolderPickerOpen(open); if (!open) setChangeDirectoryProjectId(null) }}
          initialPath={settings.project_picker_path}
          initialNodeId={settings.project_picker_node_id}
          onSelect={(path, nodeId) => {
            void handleProjectFolderSelected(path, nodeId).catch((err) => {
              console.error('Failed to select project:', err)
              toast.error(`Failed to select project: ${err instanceof Error ? err.message : 'Unknown error'}`)
            })
          }}
        />

        {/* Folder picker for automation repos */}
        <FolderPickerDialog
          open={automation.folderPickerOpen}
          onOpenChange={automation.setFolderPickerOpen}
          onSelect={(path, nodeId) => { void automation.handleFolderSelected(path, nodeId) }}
        />

        {secretInput.dialog}
        {userQuestionInput.dialog}

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
                const baseBranch = repo.defaultBranch
                let worktreePath: string | undefined
                try {
                  const wt = await gitApi.createWorktree(repo.localPath, baseBranch, branchName)
                  worktreePath = wt.path
                } catch {
                  try { await gitApi.createBranch(repo.localPath, branchName, baseBranch) } catch { /* ignore */ }
                }
                const thread = await agentsApi.createThread({
                  title: `[${repo.name}] ${task.title}`,
                  providerId: chatProvider,
                  runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
                  kind: 'delivery',
                  workingDirectory: worktreePath ?? repo.localPath,
                  branch: branchName,
                  prBaseBranch: baseBranch,
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
            <ErrorBoundary name="Screen share" variant="section" className="flex-1 min-h-0" resetKeys={[showScreenShare]}>
              <ScreenSharePanel screenShare={screenShare} />
            </ErrorBoundary>
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

      </div>

      {/* Voice overlay removed — voice controls are now inline in the header */}
    </TooltipProvider>
  )
}

export default App
