import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, type FocusEvent, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { AuthOverlays } from '@/components/auth/auth-overlays'
import { useHotkeyActions } from '@/components/hotkeys'
import { ErrorBoundary } from '@/components/error-boundary'
import { TooltipProvider } from '@/components/ui/tooltip'

import { SessionSelector } from '@/components/chat'
import type { ReferencedFile, PromptInputHandle, ChangedFile, TodoItem, ToolCallInfo } from '@/components/chat'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import type { ChatAttachment } from '@/hooks/useChat'
import type { QueuedMessage as QueuedChatMessage } from '@/components/chat/message-queue'
import { DebugPanel } from '@/components/debug/debug-panel'
import { AppHeader } from '@/components/app-shell/app-header'
import { AppPageOutlet } from '@/components/app-shell/app-page-outlet'
import { ChatToolbar } from '@/components/app-shell/chat-toolbar'
import { AutomationModals } from '@/components/automation/automation-modals'
import { DeveloperComposerControlRow } from '@/components/app-shell/developer-composer-control-row'
import { DeveloperSidebars } from '@/components/app-shell/developer-sidebars'
import { DeveloperChatWorkspace } from '@/components/app-shell/developer-chat-workspace'
import { DeveloperWorkspacePanes } from '@/components/app-shell/developer-workspace-panes'
import { ManagerWorkspace } from '@/components/app-shell/manager-workspace'

import { useScreenShare } from '@/hooks/useScreenShare'
import { useTerminals, useAvailableShells, terminalBelongsToProject, resolveProjectActiveTerminalId } from '@/components/terminal'
import type { TerminalViewHandle } from '@/components/terminal'
import type { ProjectFile, ProjectPanelHandle, ProjectTabsState } from '@/components/project'
import { DetachedTabView } from '@/components/project/detached-tab-view'
import { shouldRefreshSourceControlForStateKey } from '@/components/project/project-fs-changes'
import { DetachedTerminalView } from '@/components/terminal/detached-terminal-view'
import { AppFolderPickers } from '@/components/project/app-folder-pickers'
import { GatewayUnavailable } from '@/components/gateway-unavailable'
import { createActivityEvent, type ActivityEvent } from '@jait/ui-shared'
import { useAuth, type ThemeMode, type SttProvider, type ChatProvider, type ReasoningEffort } from '@/hooks/useAuth'
import { useAuthForm } from '@/hooks/useAuthForm'
import { useGatewayConnection } from '@/hooks/useGatewayConnection'
import { useUpdateChecker } from '@/hooks/useUpdateChecker'
import { useFloatingScreenShare } from '@/hooks/useFloatingScreenShare'
import { useTerminalLayout } from '@/hooks/useTerminalLayout'
import { useChatPanelMeasure } from '@/hooks/useChatPanelMeasure'
import { useDesktopWindow } from '@/hooks/useDesktopWindow'
import { useInputDraft } from '@/hooks/useInputDraft'
import { useLaunchQueueAttachments } from '@/hooks/useLaunchQueueAttachments'
import { useManagerAutomationState } from '@/hooks/useManagerAutomationState'
import { usePanelControllers } from '@/hooks/usePanelControllers'
import { useProjectFileActions } from '@/hooks/useProjectFileActions'
import { useSessionStateSync } from '@/hooks/useSessionStateSync'
import { useTerminalInteractionHandlers } from '@/hooks/useTerminalInteractionHandlers'
import { FloatingScreenShareWindow } from '@/components/screen-share/floating-screen-share-window'
import { MobileBottomNav } from '@/components/mobile/mobile-bottom-nav'
import { MobileNavDrawer } from '@/components/mobile/mobile-nav-drawer'
import { shouldForceMessageLifecycleRefresh, useChat, type ChatMode } from '@/hooks/useChat'
import { useSkills } from '@/hooks/useSkills'
import { useProjects } from '@/hooks/useProjects'
import { useUICommands } from '@/hooks/useUICommands'
import { useSessionState } from '@/hooks/useSessionState'
import { useProjectState } from '@/hooks/useProjectState'
import { NodePermissionsGate } from '@/components/onboarding/NodePermissionsGate'
import { primeStateCache, primeStateValue } from '@/lib/state-batch'
import { useAutomation } from '@/hooks/useAutomation'
import { normalizeChangedFiles } from '@/lib/changed-files'
import { emitPreviewSession } from '@/lib/preview-events'
import type { ViewMode } from '@/components/chat/view-mode-selector'
import type { SendTarget } from '@/components/chat/send-target-selector'
import type { ProjectEditorOpenData, ProjectOpenData, TerminalFocusData, FsChangesPayload, ArchitectureUpdateData, DevPreviewPanelState, ProjectUIState, ResponseStyle } from '@jait/shared'
import { ProjectContextDialog, type ProjectContextDraft } from '@/components/project/project-context-dialog'
import { getProjectRepositoryId } from '@/lib/project-repositories'
import { resolveProjectContextView, type ProjectContextTarget } from '@/components/project/project-context-target'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useConfiguredTheme } from '@/hooks/use-configured-theme'
import { useWakeWord } from '@/hooks/useWakeWord'
import { useVoiceRecording } from '@/hooks/useVoiceRecording'
import { useVoiceSession } from '@/hooks/useVoiceSession'
import { useGatewayReachable } from '@/hooks/useGatewayReachable'
import { useViewRouting } from '@/hooks/useViewRouting'
import { parseAppView, type AppView } from '@/lib/app-view'
import { getActiveVsCodeTheme, setActiveVsCodeTheme } from '@/lib/vscode-theme-store'
import {
  normalizePersistedSelectedRepo,
  resolvePersistedSelectedRepoId,
  type PersistedSelectedRepo,
} from '@/lib/automation-selection-storage'
import { getApiUrl, getStoredGatewayUrl, isGatewayConfigured } from '@/lib/gateway-url'
import type { AutomationRepository } from '@/lib/automation-repositories'
import { getLatestProjectSessionId } from '@/lib/project-sessions'
import { shouldAutoTitleSession } from '@/lib/session-title'
import { agentsApi, type AgentThread, type ProviderId, type RuntimeMode, type ThreadStatus } from '@/lib/agents-api'
import { updateModeProviderSelection, type ModeProviderSelection } from '@/lib/mode-provider-selection'
import { gitApi, type GitStatusResult } from '@/lib/git-api'
import { triggerSystemNotification } from '@/lib/system-notifications'
import { enrichChangedFilesWithDiffCounts } from '@/lib/project-path'
import {
  mergeAttachmentsIntoSegments,
} from '@/lib/message-segment-builders'
import { VIEW_MODE_STORAGE_KEY, readStoredViewMode } from '@/lib/view-mode-storage'
import { areAvailableFilesEqual, type AvailableFileForMention } from '@/lib/mention-files'
import { activeProjectDuringSwitch, areActiveProjectsEqual, type ActiveProjectState } from '@/lib/active-project'
import {
  areProjectUiValuesEqual,
  getPersistablePreviewTarget,
  getProjectUiRestoreKey,
  mergeProjectLayout,
} from '@/lib/project-ui-state'
import { projectSuggestions, suggestions } from '@/lib/chat-suggestions'
import { loadLegacyCliModelsByProvider } from '@/lib/legacy-cli-models'
import {
  readProjectManagerProviderSelection,
  readProjectModelSelections,
  readProjectProviderSelection,
  readProjectReasoningEffortSelection,
  saveProjectManagerProviderSelection,
  saveProjectModelSelection,
  saveProjectProviderSelection,
  saveProjectReasoningEffortSelection,
  writeProjectModelSelections,
} from '@/lib/project-model-cache'
import { isResponseStyle } from '@/lib/response-style'
import { getSessionSelectionSyncKey, normalizeSessionReasoningEffort, type SessionReasoningEffort } from '@/lib/session-chat-selection'
import { getNonEmptyMessage } from '@/lib/values'
import { getDeveloperChatSubmitLoading, getDeveloperChatUiState } from '@/lib/developer-chat-state'
import {
  buildMemoryFeedbackReminder,
  getMemoryFeedbackSuccessMessage,
  type MemoryFeedbackKind,
} from '@/lib/memory-feedback'
import { secretRequestMatchesTool } from '@/lib/secret-input'
import { mergeHydratedTodoState, normalizeTodoStateValue } from '@/lib/todo-state'
import {
  collapseMobileProject,
  getReopenedMobileProjectLayout,
  normalizeHydratedProjectLayout,
  showMobileProjectPane,
} from '@/lib/mobile-project-layout'
import {
  getMobileProjectActiveTarget,
  resolveProjectPanelOpenAfterChatSelection,
} from '@/lib/mobile-project-controls'
import { shouldProcessQueuedMessage, shouldPromptBeforeProcessingQueuedMessage } from '@/lib/chat-queue-decision'
import {
  formatLineRange,
  type UserMessageSegment,
  userMessageTextFromSegments,
  userReferencedFilesFromSegments,
  userReferencedTerminalsFromSegments,
  userReferencedProjectsFromSegments,
} from '@/lib/user-message-segments'
import {
  BackgroundSecretPrompt,
  InlineSecretMounted,
  useSecretInputPrompt,
  useUserQuestionPrompt,
} from '@/components/prompts/input-prompts'

const API_URL = getApiUrl()
const UPLOADED_ATTACHMENT_CONTEXT_LIMIT = 20_000

function decodeAttachmentText(attachment: ChatAttachment): string | null {
  try {
    const binary = window.atob(attachment.data)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function buildUploadedAttachmentPromptBlock(attachments: ChatAttachment[] | undefined): string | null {
  const sections = (attachments ?? []).flatMap((attachment) => {
    if (attachment.mimeType.startsWith('image/')) return []
    const decoded = decodeAttachmentText(attachment)
    if (decoded == null) return []
    const truncated = decoded.length > UPLOADED_ATTACHMENT_CONTEXT_LIMIT
    return [`[File: ${attachment.name} (${attachment.mimeType})]\n${decoded.slice(0, UPLOADED_ATTACHMENT_CONTEXT_LIMIT)}${truncated ? '\n[truncated]' : ''}`]
  })
  return sections.length > 0 ? `Uploaded file attachments:\n\n${sections.join('\n\n')}` : null
}

function appendUploadedAttachmentPromptBlock(content: string, attachments: ChatAttachment[] | undefined): string {
  const block = buildUploadedAttachmentPromptBlock(attachments)
  if (!block) return content
  return content.trim() ? `${content}\n\n${block}` : block
}

function getUploadedAttachmentDisplayLabel(attachments: ChatAttachment[] | undefined): string {
  const names = (attachments ?? []).map((attachment) => attachment.name).filter(Boolean)
  if (names.length === 0) return ''
  if (names.length === 1) return `Uploaded ${names[0]}`
  return `Uploaded ${names.length} files`
}

type CliProviderId = ProviderId

type ManagerQueuedMessage = QueuedChatMessage & {
  fullContent: string
  referencedFiles?: ReferencedFile[]
  displaySegments?: UserMessageSegment[]
  attachments?: string[]
  providerId: ProviderId
  runtimeMode?: RuntimeMode
  model?: string | null
  reasoningEffort?: string | null
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

function App() {
  const {
    inputValueRef,
    inputVersion,
    inputSegments,
    setInputSegments,
    setInputValue,
    handleInputChange,
  } = useInputDraft() as ReturnType<typeof useInputDraft> & {
    inputSegments: UserMessageSegment[] | undefined
    setInputSegments: React.Dispatch<React.SetStateAction<UserMessageSegment[] | undefined>>
  }
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [currentView, setCurrentView] = useState<AppView>(() => {
    const path = window.location.pathname.replace(/^\/+/, '').split('/')[0]
    return parseAppView(path) ?? 'chat'
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
  const projectSwitchRequestRef = useRef(0)
  const [showDebugPanel, setShowDebugPanel] = useState(() => localStorage.getItem('showDebugPanel') === 'true')
  const [showArchitecture, setShowArchitecture] = useState(false)
  const [architectureDiagram, setArchitectureDiagram] = useState<string | null>(null)
  const [architectureFilePath, setArchitectureFilePath] = useState<string | null>(null)
  const [architectureGenerating, setArchitectureGenerating] = useState(false)
  const [architectureRequest, setArchitectureRequest] = useState<{ key: number } | null>(null)
  const architectureRenderRequestIdRef = useRef<string | null>(null)
  const loadedArchitectureProjectRef = useRef<string | null>(null)
  const [terminalFullscreen, setTerminalFullscreen] = useState(false)
  const {
    terminalHeight,
    setTerminalHeight,
    terminalHeightBeforeFullscreenRef,
    terminalColumnWidth,
    handleTerminalDragStart,
    handleTerminalColumnDragStart,
  } = useTerminalLayout()
  const { chatMeasuredWidth, setChatPanelElement } = useChatPanelMeasure()
  const [approveAllInSession, setApproveAllInSession] = useState(false)
  const [chatMode, setChatMode] = useState<ChatMode>('agent')
  const [chatResponseStyle, setChatResponseStyle] = useState<ResponseStyle>('normal')
  const [sendTarget, setSendTarget] = useState<SendTarget>('agent')
  const [providerSelection, setProviderSelection] = useState<ModeProviderSelection>({
    developer: 'jait',
    manager: 'jait',
  })
  const chatProvider = providerSelection.developer
  const managerProvider = providerSelection.manager
  const setChatProvider = useCallback((provider: ProviderId) => {
    setProviderSelection((current) => updateModeProviderSelection(current, 'developer', provider))
  }, [])
  const setManagerProvider = useCallback((provider: ProviderId) => {
    setProviderSelection((current) => updateModeProviderSelection(current, 'manager', provider))
  }, [])
  const [chatProviderRuntimeMode, setChatProviderRuntimeMode] = useState<RuntimeMode>('full-access')
  const [chatReasoningEffort, setChatReasoningEffort] = useState<SessionReasoningEffort | null>(null)
  const [managerProviderRuntimeMode, setManagerProviderRuntimeMode] = useState<RuntimeMode>('full-access')
  const [managerReasoningEffort, setManagerReasoningEffort] = useState<SessionReasoningEffort | null>(null)
  const [cliModelsByProvider, setCliModelsByProvider] = useState<Partial<Record<CliProviderId, string | null>>>(
    () => loadLegacyCliModelsByProvider('jait')
  )
  const cliModel = cliModelsByProvider[chatProvider] ?? null
  const managerCliModel = cliModelsByProvider[managerProvider] ?? null
  const [viewMode, setViewMode] = useState<ViewMode>(() => readStoredViewMode())
  const threadProvider = viewMode === 'manager' ? managerProvider : chatProvider
  const threadProviderRuntimeMode = viewMode === 'manager' ? managerProviderRuntimeMode : chatProviderRuntimeMode
  const threadCliModel = viewMode === 'manager' ? managerCliModel : cliModel
  const threadReasoningEffort = viewMode === 'manager' ? managerReasoningEffort : chatReasoningEffort
  const prevViewModeRef = useRef<ViewMode>(viewMode)
  const [serverHasUsers, setServerHasUsers] = useState<boolean | null>(null)
  const isElectron = !!(window as any).jaitDesktop
  // @capacitor/core attaches `window.Capacitor` as a module-load side effect even in
  // plain browsers (it's statically bundled via the device-calendar feature), so a
  // truthy check on the global misclassifies every web session as the native app.
  // isNativePlatform() checks the actual native bridge instead.
  const isCapacitor = Capacitor.isNativePlatform()
  const isStandaloneApp = isElectron || isCapacitor
  const appPlatform: 'web' | 'electron' | 'capacitor' = isElectron ? 'electron' : isCapacitor ? 'capacitor' : 'web'
  const gateway = useGatewayConnection({ isStandaloneApp })
  const {
    gatewayStep,
    setGatewayStep,
    gatewayUrlInput,
    setGatewayUrlInput,
    gatewayChecking,
    gatewayError,
    setGatewayError,
    checkGatewayHealth,
  } = gateway
  const { resolvedTheme: appliedThemeMode } = useConfiguredTheme(themeMode)
  const detachedProjectTabId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('detachedProjectTab')
    : null

  const detachedTerminalId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('detachedTerminal')
    : null

  // ── Gateway reachability ───────────────────────────────────────
  const { gatewayReachable, retry: retryGatewayReachable } = useGatewayReachable()

  const automationRefreshRef = useRef<() => Promise<void>>(async () => {})
  const automationRefreshSelectedThreadRef = useRef<() => Promise<void>>(async () => {})
  const { desktopPlatform, isMaximized } = useDesktopWindow()
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
  const projectRef = useRef<ProjectPanelHandle>(null)
  const promptInputRef = useRef<PromptInputHandle>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    showProjectRef.current = showProject
  }, [showProject])

  // ── Sync currentView ↔ URL path (+ jait:// deep links) ─────────
  useViewRouting(currentView, setCurrentView)

  useLaunchQueueAttachments(promptInputRef)
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

  const {
    floatingSSPos,
    floatingSSSize,
    onFloatingDragStart,
    onFloatingResizeStart,
  } = useFloatingScreenShare({ showScreenShare })

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

  const authForm = useAuthForm({
    login,
    register,
    onSuccess: () => { setShowLoginDialog(false); setCurrentView('chat') },
  })

  // ── Self-update flow (check / apply / gateway-restart detection) ──
  const {
    updateInfo,
    updateChecking,
    updateApplying,
    updateAwaitingRestart,
    releases,
    releasesLoading,
    handleCheckUpdate,
    handleCheckChangelog,
    handleApplyUpdate,
    handleConnectionRestart,
  } = useUpdateChecker({ token, isElectron, appPlatform, apiUrl: API_URL })

  const handleUiConnectionStateChange = useCallback(({ connected, reconnected }: { connected: boolean; reconnected: boolean }) => {
    setWsConnected(connected)
    if (connected) {
      // Re-fetch providers so FsNode registration is picked up (fixes "Offline" on desktop)
      void automationRefreshRef.current()
      // Re-hydrate the open thread — activities are fetched once per selection and
      // cached, so a dropped WS (backgrounded tab) would otherwise leave the open
      // thread stuck on a stale snapshot until reload.
      void automationRefreshSelectedThreadRef.current()
      // Re-fetch fs nodes — the desktop registers itself as a node async
      // after the WS opens, so the initial mount fetch may have missed it.
      refreshFsNodesRef.current()
    }
    handleConnectionRestart({ connected, reconnected })
  }, [handleConnectionRestart])

  const onLoginRequired = useCallback(() => setShowLoginDialog(true), [])

  // Fetch filesystem nodes for project node tags.
  // Re-run on connect and on fs.node-* events so the desktop's own node
  // registration (which happens async after WS opens) is reflected —
  // otherwise projects created on this machine show "Node offline" forever.
  const refreshFsNodesRef = useRef<() => void>(() => {})
  const refreshFsNodes = useCallback(() => {
    if (!token) return
    void fetch(`${API_URL}/api/filesystem/nodes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.nodes) setFsNodes(data.nodes) })
      .catch(() => {})
  }, [token])
  refreshFsNodesRef.current = refreshFsNodes
  useEffect(() => { refreshFsNodes() }, [refreshFsNodes])

  // Re-fetch the project list whenever nodes come/go so the sidebar's
  // online/offline tags (derived from each project's nodeId vs. registered
  // nodes) stay in sync — including after the gateway self-heals a stale
  // throwaway nodeId onto the now-registered desktop node. The ref is assigned
  // after useProjects() is destructured below.
  const fetchProjectsRef = useRef<() => void>(() => {})

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
    moveProject,
    fetchProjectSubtree,
    assignProjectRepository,
    switchProject,
    switchSession,
    setProjectEditorModeActive,
    archiveSession,
    moveSession,
    fetchArchivedSessions,
    removeProject,
    clearArchivedProjects,
    fetchArchivedProjects,
    restoreProject,
    generateSessionTitle,
    updateSessionChatSelection,
    fetchProjects,
    loadProject,
    loadSession,
    searchChats,
    searchProjects,
    searchResults,
    searchLoading,
    hasMoreProjects,
    showMoreProjects,
    showFewerProjects,
    projectListLimit,
    handleProjectEvent,
  } = useProjects(
    token,
    onLoginRequired,
  )
  fetchProjectsRef.current = fetchProjects
  const handleProjectEventRef = useRef(handleProjectEvent)
  handleProjectEventRef.current = handleProjectEvent

  // Which sessions (across all projects, not just the one currently open) are
  // actively generating a response — lets the sidebar show a loading spinner
  // for chats running in the background, including on other devices.
  const [streamingSessionIds, setStreamingSessionIds] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    setStreamingSessionIds(new Set())
  }, [token])
  const handleSessionStreamingSnapshot = useCallback((sessionIds: string[]) => {
    setStreamingSessionIds(new Set(sessionIds))
  }, [])
  const handleSessionStreamingChange = useCallback((sessionId: string, streaming: boolean) => {
    setStreamingSessionIds((prev) => {
      const isStreaming = prev.has(sessionId)
      if (isStreaming === streaming) return prev
      const next = new Set(prev)
      if (streaming) next.add(sessionId)
      else next.delete(sessionId)
      return next
    })
  }, [])

  const secretInput = useSecretInputPrompt({ token, sessionId: activeSessionId })
  const userQuestionInput = useUserQuestionPrompt({ token, sessionId: activeSessionId })
  const renderInlineSecretPrompt = useCallback((call: ToolCallInfo): ReactNode => {
    if (!secretInput.renderInline || !secretInput.form || !secretInput.activeRequest) return null
    if (call.status !== 'running' && call.status !== 'pending') return null
    if (!secretRequestMatchesTool(secretInput.activeRequest, call.tool, call.args)) return null
    return (
      <InlineSecretMounted requestId={secretInput.activeRequest.id} onMount={secretInput.markInlineMounted}>
        {secretInput.form}
      </InlineSecretMounted>
    )
  }, [secretInput.activeRequest, secretInput.form, secretInput.renderInline, secretInput.markInlineMounted])

  const activeProjectRecord = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  )
  const tokenRef = useRef(token)
  tokenRef.current = token
  const { skills: availableSkills } = useSkills(token)
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
  const handleArchiveSession = useCallback(async (sessionId: string) => {
    const session = personalSessions.find((candidate) => candidate.id === sessionId)
      ?? projects.flatMap((project) => project.sessions).find((candidate) => candidate.id === sessionId)
    const label = session?.name?.trim() || 'this chat'
    const confirmed = await confirmDialog({
      title: 'Archive chat',
      description: `Are you sure you want to archive "${label}"?`,
      confirmLabel: 'Archive',
      variant: 'destructive',
    })
    if (confirmed) await archiveSession(sessionId)
  }, [archiveSession, confirmDialog, personalSessions, projects])

  const handleRemoveProject = useCallback(async (projectId: string) => {
    const project = projects.find(w => w.id === projectId)
    const label = project?.title || project?.rootPath || 'this project'
    const isFolder = project?.kind === 'folder'

    // Archiving a folder takes its whole subtree with it, so say how much is
    // about to disappear instead of letting the user find out afterwards.
    const subtree = await fetchProjectSubtree(projectId)
    const scope = subtree && (subtree.descendantCount > 0 || subtree.sessionCount > 0)
      ? ` This also archives ${subtree.descendantCount} nested folder(s) and ${subtree.sessionCount} chat(s).`
      : ''

    const confirmed = await confirmDialog({
      title: isFolder ? 'Archive folder' : 'Archive project',
      description: `Are you sure you want to archive "${label}"?${scope} You can clear archived projects later from Settings.`,
      confirmLabel: 'Archive',
      variant: 'destructive',
    })
    if (!confirmed) return
    const removed = await removeProject(projectId)
    if (removed) {
      toast.success(isFolder ? 'Folder archived.' : 'Project archived.')
      return
    }
    toast.error('Failed to archive project.')
  }, [confirmDialog, fetchProjectSubtree, removeProject, projects])

  // ── Chat folders ────────────────────────────────────────────────────
  const [contextDialogTarget, setContextDialogTarget] = useState<ProjectContextTarget | null>(null)

  const handleCreateFolder = useCallback((parentId: string | null) => {
    setContextDialogTarget({ mode: 'create', parentId })
  }, [])

  const handleMoveProject = useCallback(async (projectId: string, parentId: string | null) => {
    const result = await moveProject(projectId, parentId)
    if (result.ok) return
    const reason = result.error === 'CYCLE'
      ? 'A folder cannot be moved into itself.'
      : result.error === 'TOO_DEEP'
        ? 'That would nest folders too deeply.'
        : 'Failed to move folder.'
    toast.error(reason)
  }, [moveProject])


  const { project: contextDialogProject, ancestors: contextDialogAncestors } = useMemo(
    () => resolveProjectContextView(projects, contextDialogTarget),
    [contextDialogTarget, projects],
  )
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
    fileChangeCount,
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
    recordSteeredMessage,
    updateQueueItem,
    reorderQueueItem,
    toggleHoldQueueItem,
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
    respondToApproval,
  } = useChat(
    activeSessionId,
    token,
    onLoginRequired,
    activeProject?.surfaceId ?? null,
    activeSessionRecord?.lastActiveAt ?? null,
  )
  const messageContents = useMemo(() => messages.map((msg) => msg.content), [messages])
  const [managerMessageQueues, setManagerMessageQueues] = useState<Record<string, ManagerQueuedMessage[]>>({})
  const [remoteMessageCompleteCount, setRemoteMessageCompleteCount] = useState(0)
  const [sourceControlRefreshSignal, setSourceControlRefreshSignal] = useState(0)
  const [allowQueuedMessageAfterInterruptedExit, setAllowQueuedMessageAfterInterruptedExit] = useState(false)
  // Whether the gateway WebSocket is currently connected. The server-side
  // `drainQueuedChatMessages` is the authoritative chat-queue consumer; when
  // connected, the client must NOT also auto-drain or the two race and every
  // queued message multiplies (client re-queues with a fresh server id).
  const [wsConnected, setWsConnected] = useState(false)
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

  // ── Screen share (always active so Electron auto-registers) ───────
  const screenShare = useScreenShare({ token })

  // ── Automation / Manager mode state ───────────────────────────────
  const automation = useAutomation()
  automationRefreshRef.current = automation.refresh
  automationRefreshSelectedThreadRef.current = automation.refreshSelectedThread
  const {
    automationMessages,
    managerThreads,
    selectedRepoRuntime,
    selectedThreadRepo,
    selectedThreadRepoRuntime,
    threadTargetRepo,
    threadTargetRepoRuntime,
    activeManagerThreads,
    compactManagerToolbar,
    selectedManagerQueue,
    selectedRepoOffline,
    threadComposerDisabled,
    threadPlaceholder,
    developerPlaceholder,
  } = useManagerAutomationState({
    activeProjectId,
    activeProjectRecord,
    automation,
    isMobile,
    managerMessageQueues,
    sendTarget,
    viewMode,
  })

  /**
   * Attach a repository to a project. Without a repo id the gateway detects one
   * from .git inside the project's folder; with one it attaches that repository
   * even when the row has no folder of its own — that is how a folder created
   * empty gets a repository after the fact.
   */
  const handleAssignProjectRepository = useCallback(async (projectId: string, repoId?: string | null) => {
    const result = await assignProjectRepository(projectId, repoId)
    if (!result) {
      toast.error(repoId
        ? 'Failed to attach the repository.'
        : 'No repository could be assigned. Make sure the project folder contains .git.')
      return null
    }
    await automation.refresh()
    automation.setSelectedRepoId(result.repo.id)
    toast.success(result.skipped ? `Repository already assigned: ${result.repo.name}` : `Assigned repository: ${result.repo.name}`)
    return result
  }, [assignProjectRepository, automation.refresh, automation.setSelectedRepoId])

  const handleSaveProjectContext = useCallback(async (draft: ProjectContextDraft): Promise<boolean> => {
    const target = contextDialogTarget
    if (!target) return false
    const { repoId, ...fields } = draft

    /**
     * Attaches the repository the user picked. The gateway honours an explicit
     * repo id even for a row with no directory, which is what lets a folder
     * created empty be given a repository afterwards. Re-attaching the one that
     * is already there is skipped so a plain rename stays a single request.
     */
    const applyRepository = async (projectId: string, currentRepoId: string | null) => {
      if (!repoId || repoId === currentRepoId) return
      await handleAssignProjectRepository(projectId, repoId)
    }

    // The gateway refuses a directory another project already owns. Its wording
    // names the offender, so it is shown as-is rather than replaced by a generic
    // failure — and returning false keeps the dialog open with the draft intact.
    let reported = false
    const onError = (message: string) => { reported = true; toast.error(message) }

    if (target.mode === 'create') {
      // One call carries the whole draft, so a failure leaves no half-made row
      // behind and the dialog keeps what was typed.
      const created = await createProject(
        // "Create" means create. Silently adopting the existing project for that
        // directory is what made this look like the button did nothing.
        { parentId: target.parentId, exclusiveRoot: true, ...fields },
        { onError },
      )
      if (!created) {
        if (!reported) toast.error('Failed to create.')
        return false
      }
      // A row with a directory is a project you can immediately chat in; one
      // without is a category, and giving it an empty chat would be noise.
      if (created.rootPath && created.sessions.length === 0) await createSession(created.id)
      await applyRepository(created.id, getProjectRepositoryId(created))
      void automation.refresh()
      toast.success(created.rootPath ? 'Project created.' : 'Folder created.')
      return true
    }

    const updated = await updateProject(target.projectId, fields, { onError })
    if (!updated) {
      if (!reported) toast.error('Failed to save settings.')
      return false
    }
    await applyRepository(target.projectId, getProjectRepositoryId(updated))
    void automation.refresh()
    toast.success('Saved.')
    return true
  }, [
    automation.refresh,
    contextDialogTarget,
    createProject,
    createSession,
    handleAssignProjectRepository,
    updateProject,
  ])

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

  const handleMessageStarted = useCallback(() => {
    refreshMessages({ force: shouldForceMessageLifecycleRefresh('started') })
  }, [refreshMessages])

  const handleMessageComplete = useCallback(() => {
    refreshMessages({ force: shouldForceMessageLifecycleRefresh('complete') })
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
  const promptBeforeProcessingQueuedMessage = shouldPromptBeforeProcessingQueuedMessage({
    hasInterruptedExit: hitMaxRounds,
    isLoading,
    isLoadingHistory,
    queuedCount: messageQueue.length,
    allowQueuedMessageAfterInterruptedExit,
  })
  const sourceControlCompletionCountRef = useRef(completionCount)
  const sourceControlFileChangeCountRef = useRef(fileChangeCount)
  const sourceControlRemoteCompletionCountRef = useRef(remoteMessageCompleteCount)

  useEffect(() => {
    if (fileChangeCount === sourceControlFileChangeCountRef.current) return
    sourceControlFileChangeCountRef.current = fileChangeCount
    setSourceControlRefreshSignal((previous) => previous + 1)
  }, [fileChangeCount])

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
      setAllowQueuedMessageAfterInterruptedExit(false)
    }
  }, [isLoading])

  useEffect(() => {
    setAllowQueuedMessageAfterInterruptedExit(false)
  }, [activeSessionId])

  useEffect(() => {
    if (messageQueue.length === 0 || !hitMaxRounds) {
      setAllowQueuedMessageAfterInterruptedExit(false)
    }
  }, [hitMaxRounds, messageQueue.length])

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
  const {
    voiceOverlayOpen,
    setVoiceOverlayOpen,
    voiceAssistant,
    startVoiceSession,
    announceThreadResult,
  } = useVoiceSession({ token })

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

        void announceThreadResult(completedThread)
      }
    }

    for (const threadId of Object.keys(previousThreadStatusesRef.current)) {
      if (activeThreadIds.has(threadId)) continue
      delete threadQueueSeenRef.current[threadId]
      delete pendingThreadCompletionRef.current[threadId]
    }

    previousThreadStatusesRef.current = nextStatuses
  }, [announceThreadResult, automation.threads, managerMessageQueues])

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

  const setSavedTerminal = useCallback((v: { open: boolean; activeTerminalId?: string | null } | null, options?: { immediate?: boolean }) => {
    updateProjectUI('terminal', v, options)
  }, [updateProjectUI])

  const setSavedDevPreview = useCallback((v: DevPreviewPanelState | null) => {
    updateProjectUI('preview', v)
  }, [updateProjectUI])

  const loadingProjectLayout = loadingProjectUI && !!activeProjectId && !!token
  const setSavedProjectLayout = useCallback((v: ProjectUIState['layout'], options?: { immediate?: boolean }) => {
    updateProjectUI('layout', v, { immediate: options?.immediate ?? true })
  }, [updateProjectUI])

  // Persist panel/tree widths per-project. Called only on drag end (never per
  // drag frame), so it cannot spam network requests or re-renders. Merges with
  // the current tree/editor visibility so a size-only update never drops them.
  const handleProjectLayoutSizeChange = useCallback((panelSize: number, treeSize: number) => {
    const next = mergeProjectLayout(projectUIRef.current?.layout ?? null, { panelSize, treeSize })
    setSavedProjectLayout(next)
  }, [setSavedProjectLayout])

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
  const [, setSavedChatProvider, loadingChatProvider] = useSessionState<ProviderId>(
    activeSessionId, 'chat.provider', token,
  )
  const [, setSavedChatReasoningEffort, loadingChatReasoningEffort] = useSessionState<SessionReasoningEffort>(
    activeSessionId, 'chat.reasoningEffort', token,
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

  // Editor mode (project panel, architecture, dev preview) is project-only.
  // When navigating to a plain chat (activeProjectId -> null), hide it
  // immediately instead of leaving the previous project's panel visibility
  // stuck on — these flags otherwise only ever get reset by project-scoped
  // restore effects, which never run once there's no active project.
  // useLayoutEffect (not useEffect) so the reset lands before paint — a
  // passive effect here let the stale project layout flash/jiggle into view
  // for one frame before collapsing.
  //
  // Same applies when switching directly from one project to a different
  // one: the restore effects that apply the new project's saved layout only
  // run once its project.ui fetch resolves, so without this the previous
  // project's stale panel/tree/editor state paints for a frame (or longer,
  // on a slow fetch) before being overwritten with the new project's data.
  const prevActiveProjectIdRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    const prevProjectId = prevActiveProjectIdRef.current
    prevActiveProjectIdRef.current = activeProjectId
    const switchingProjects = !!prevProjectId && prevProjectId !== activeProjectId
    if (activeProjectId && !switchingProjects) return
    showProjectRef.current = false
    setShowProject(false)
    setShowArchitecture(false)
    setDevPreviewTarget(null)
    setProjectPreviewState({ open: false, target: null, displayState: 'hidden', displayTarget: null })
    setProjectFiles([])
    setActiveProjectFileId(null)
    // Reset tree/editor visibility to the defaults so the previous project's
    // layout does not leak into the next one while its project.ui fetch is
    // still in flight. The panel is hidden by setShowProject(false) above, so
    // this reset is not visible; the new project's saved layout is applied by
    // applyProjectUI once its fetch resolves (and a project with no saved
    // layout keeps these defaults: tree + editor both visible).
    setShowProjectTree(true)
    setShowProjectEditor(true)
  }, [activeProjectId])

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
                    body: JSON.stringify({ path: restoredPath, sessionId: activeSessionId, nodeId: requestedNodeId, openPanel: wp.open }),
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
        if (dp.open && nextTarget) {
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
                body: JSON.stringify({ path: restoredPath, sessionId: activeSessionId, nodeId: requestedNodeId, openPanel: wp.open }),
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
        if (dp.open && nextTarget) {
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
      body: JSON.stringify({ path: projectRoot, sessionId: activeSessionId, nodeId: requestedNodeId, openPanel: true }),
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
    if (activeSessionId && token) {
      primeStateValue('sessions', activeSessionId, token, key, value ?? null)
    }
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
        // Intentionally ignored. The mobile nav drawer is transient chrome,
        // not session state — applying a persisted/cross-client value here
        // reopens the drawer right after the user closes it (whenever the
        // session being switched to had last been left with it open), and
        // reopens it out of nowhere on reload. Only explicit user actions
        // (hamburger button, dismiss/select handlers) should toggle it.
        break
      case 'chat.mode':
        if (value === 'swarm') {
          setChatMode('agent')
        } else if (value === 'ask' || value === 'agent' || value === 'plan') {
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
      case 'chat.provider':
        if (typeof value === 'string' && value.trim()) {
          setChatProvider(value as ProviderId)
        }
        break
      case 'chat.reasoningEffort': {
        const reasoningEffort = normalizeSessionReasoningEffort(value)
        if (reasoningEffort !== undefined) setChatReasoningEffort(reasoningEffort)
        break
      }
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
        if (shouldRefreshSourceControlForStateKey(key)) {
          setSourceControlRefreshSignal((previous) => previous + 1)
        }
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
        suppressNextUiSync('queued_messages')
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
  }, [activeSessionId, token, setTodoList, addChangedFile, setChangedFiles, setMessageQueueState, routePreviewToProject, closeProjectPreview, isMobile, suppressNextUiSync, activeProject?.nodeId, activeProject?.surfaceId, activeProject?.projectRoot])

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
    if (activeSessionId && token) {
      const { _project, ...sessionState } = state
      primeStateCache('sessions', activeSessionId, token, sessionState)
    }
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
    if (cm === 'swarm') {
      setChatMode('agent')
    } else if (cm === 'ask' || cm === 'agent' || cm === 'plan') {
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

    const cp = state['chat.provider']
    const restoredChatProvider = typeof cp === 'string' && cp.trim()
      ? cp as ProviderId
      : chatProvider
    if (restoredChatProvider !== chatProvider) {
      setChatProvider(restoredChatProvider)
    }

    const sessionReasoningEffort = Object.prototype.hasOwnProperty.call(state, 'chat.reasoningEffort')
      ? normalizeSessionReasoningEffort(state['chat.reasoningEffort'])
      : undefined
    const fallbackReasoningEffort = readProjectReasoningEffortSelection(
      activeProjectId,
      restoredChatProvider,
    ) ?? (restoredChatProvider === 'jait' ? settings?.reasoning_effort ?? null : null)
    setChatReasoningEffort(
      sessionReasoningEffort !== undefined ? sessionReasoningEffort : fallbackReasoningEffort,
    )

    const ccm = state['chat.cliModels']
    const sessionModels = ccm && typeof ccm === 'object' && !Array.isArray(ccm)
      ? ccm as Partial<Record<CliProviderId, string | null>>
      : null
    const cachedProjectModels = readProjectModelSelections(activeProjectId)
    if (sessionModels && Object.keys(sessionModels).length > 0) {
      // This chat's own saved model selections are authoritative for THIS
      // chat. Open it and the provider/model you last used here is restored —
      // not whatever another chat or a manual pick elsewhere stamped into the
      // shared project cache. Merge the project cache in only for providers
      // this chat never pinned, so "remember my last model per provider"
      // still works for fresh chats, without clobbering this one's selection.
      const merged: Partial<Record<CliProviderId, string | null>> = {
        ...cachedProjectModels,
        ...sessionModels,
      }
      setCliModelsByProvider(merged)
      writeProjectModelSelections(activeProjectId, merged)
    } else if (cachedProjectModels) {
      setCliModelsByProvider(cachedProjectModels as Partial<Record<CliProviderId, string | null>>)
    } else if (sessionModels) {
      setCliModelsByProvider(sessionModels)
      writeProjectModelSelections(activeProjectId, sessionModels)
    } else {
      const migrated = loadLegacyCliModelsByProvider(chatProvider)
      setCliModelsByProvider(migrated)
      writeProjectModelSelections(activeProjectId, migrated)
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

    // 'footer.menu' (the mobile nav drawer) is intentionally not restored
    // here — see the matching case in handleStateSync for why applying a
    // persisted/cross-session value reopens the drawer right after the user
    // closes it and pops it open on reload.

    // ── Project-scoped state (bundled inside _project envelope) ──
    // The project state hook is authoritative for project.ui. The
    // full-state packet can arrive after REST hydration and may contain an
    // older panel/layout snapshot, which would close the editor after reload.
    const wsEnvelope = state._project as { id: string; state: Record<string, unknown> } | null | undefined
    if (wsEnvelope?.id && wsEnvelope.state && token) {
      primeStateCache('projects', wsEnvelope.id, token, wsEnvelope.state)
    }
  }, [activeSessionId, token, activeProjectId, setTodoList, setChangedFiles, setMessageQueueState, chatProvider, settings?.reasoning_effort, suppressNextUiSync])

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
    onMessageStarted: handleMessageStarted,
    onMessageComplete: handleMessageComplete,
    onSessionStreamingChange: handleSessionStreamingChange,
    onSessionStreamingSnapshot: handleSessionStreamingSnapshot,
    onThreadEvent: useCallback((type: string, payload: Record<string, unknown>) => {
      if (type.startsWith('project.') || type.startsWith('chat.')) {
        handleProjectEventRef.current(type, payload)
        return
      }
      automation.handleThreadEvent(type, payload)
      // Keep the project sidebar's node tags in sync when nodes come/go online.
      if (type === 'fs.node-registered' || type === 'fs.node-disconnected' || type === 'node.disconnected' || type === 'node.updated' || type === 'node.registry') {
        refreshFsNodesRef.current()
        fetchProjectsRef.current()
      }
    }, [automation]),
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
      'project.editor.open': useCallback((data: ProjectEditorOpenData) => {
        const requestedRoot = data.projectRoot?.trim() || null
        const activeRoot = activeProjectRef.current?.projectRoot?.trim()
          || activeProjectRecordRef.current?.rootPath?.trim()
          || null
        if (requestedRoot && activeRoot && requestedRoot !== activeRoot) return

        setCurrentView('chat')
        setViewMode('developer')
        showProjectRef.current = true
        setShowProject(true)
        if (isMobile) {
          const layout = showMobileProjectPane('editor')
          setShowProjectTree(layout.tree)
          setShowProjectEditor(layout.editor)
        } else {
          setShowProjectTree(true)
          setShowProjectEditor(true)
        }
      }, [isMobile]),
      'terminal.focus': useCallback((data: TerminalFocusData) => {
        setCurrentView('chat')
        setShowTerminal(true)
        setSavedTerminal({ open: true, activeTerminalId: data.terminalId ?? null })
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

  useEffect(() => {
    if (!activeProjectId || !projectStateReady || loadingProjectUI) return
    setProjectEditorModeActive(activeProjectId, showProject)
  }, [activeProjectId, loadingProjectUI, projectStateReady, setProjectEditorModeActive, showProject])

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
    // Merge with the persisted panelSize/treeSize so a visibility toggle never
    // drops the per-project widths.
    setSavedProjectLayout(mergeProjectLayout(projectUIRef.current?.layout ?? null, layout), { immediate: true })
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
    // Merge with the persisted panelSize/treeSize so this visibility-only save
    // never clobbers the per-project widths with undefined.
    setSavedProjectLayout(mergeProjectLayout(projectUIRef.current?.layout ?? null, layout))
    if (activeSessionId) {
      if (consumeSuppressedUiSync('project.layout')) return
      sendUIState('project.layout', layout, activeSessionId)
    }
  }, [showProjectTree, showProjectEditor, setSavedProjectLayout, activeProjectId, loadingProjectLayout, token, activeSessionId, consumeSuppressedUiSync, sendUIState, projectStateReady])

  useSessionStateSync({
    activeSessionId,
    chatMode,
    chatResponseStyle,
    chatProviderRuntimeMode,
    consumeSuppressedUiSync,
    loadingChatMode,
    loadingChatResponseStyle,
    loadingChatView,
    loadingProviderRuntimeMode,
    managerMessageQueues,
    messageQueue,
    sendUIState,
    setOnChangedFilesSync,
    setSavedChangedFiles,
    setSavedChatMode,
    setSavedChatResponseStyle,
    setSavedChatView,
    setSavedProviderRuntimeMode,
    setSavedQueuedMessages,
    setSavedQueuedThreadMessages,
    setSavedTodoList,
    showMobileToolbar,
    todoList,
    token,
    viewMode,
    wsFullStateReceivedRef,
  })

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
    const savedReasoningEffort = readProjectReasoningEffortSelection(activeProjectId, provider)
    setChatReasoningEffort(
      savedReasoningEffort !== undefined
        ? savedReasoningEffort
        : provider === 'jait' ? settings?.reasoning_effort ?? null : null,
    )
    saveProjectProviderSelection(activeProjectId, provider)
    if (token) {
      void updateSettings({ chat_provider: provider as ChatProvider })
    }
  }, [activeProjectId, setChatProvider, settings?.reasoning_effort, token, updateSettings])

  const handleManagerProviderChange = useCallback((provider: ProviderId) => {
    setManagerProvider(provider)
    // Mirror the chat side: each provider remembers its own effort, so
    // switching providers restores that provider's pick instead of carrying a
    // value the new provider may not even accept.
    setManagerReasoningEffort(readProjectReasoningEffortSelection(activeProjectId, provider) ?? null)
    saveProjectManagerProviderSelection(activeProjectId, provider)
  }, [activeProjectId, setManagerProvider])

  const handleManagerReasoningEffortChange = useCallback((reasoningEffort: SessionReasoningEffort | null) => {
    setManagerReasoningEffort(reasoningEffort)
    saveProjectReasoningEffortSelection(activeProjectId, managerProvider, reasoningEffort)
  }, [activeProjectId, managerProvider])

  const handleChatResponseStyleChange = useCallback((style: ResponseStyle) => {
    setChatResponseStyle(style)
  }, [])

  const handleChatProviderRuntimeModeChange = useCallback((runtimeMode: RuntimeMode) => {
    setChatProviderRuntimeMode(runtimeMode)
  }, [])

  const handleChatReasoningEffortChange = useCallback((reasoningEffort: SessionReasoningEffort | null) => {
    setChatReasoningEffort(reasoningEffort)
    saveProjectReasoningEffortSelection(activeProjectId, chatProvider, reasoningEffort)
  }, [activeProjectId, chatProvider])

  const handleManagerProviderRuntimeModeChange = useCallback((runtimeMode: RuntimeMode) => {
    setManagerProviderRuntimeMode(runtimeMode)
  }, [])

  const handleCliModelChange = useCallback((model: string | null) => {
    setCliModelsByProvider((current) => ({
      ...current,
      [chatProvider]: model,
    }))
    saveProjectModelSelection(activeProjectId, chatProvider, model)
  }, [activeProjectId, chatProvider])

  const handleManagerCliModelChange = useCallback((model: string | null) => {
    setCliModelsByProvider((current) => ({
      ...current,
      [managerProvider]: model,
    }))
  }, [managerProvider])

  const prevCliModelsPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeSessionId && token && (!wsFullStateReceivedRef.current || loadingCliModels)) return
    // Persist a model selection for every provider the user has picked one
    // for — not just a hardcoded subset. A fixed allow-list here silently
    // drops the selection (and it "resets to default" every reload) for any
    // provider added after this list was last updated (e.g. pi, pi-gemini,
    // cursor, deepagents never made it onto the original jait/codex/claude-code list).
    const nextModels: Partial<Record<CliProviderId, string | null>> = {}
    for (const [providerId, value] of Object.entries(cliModelsByProvider)) {
      if (typeof value === 'string' && value.trim()) {
        nextModels[providerId as CliProviderId] = value
      }
    }

    const payload = Object.keys(nextModels).length > 0 ? nextModels : null
    const serialized = getSessionSelectionSyncKey(activeSessionId, payload)
    if (serialized === prevCliModelsPayloadRef.current) return
    prevCliModelsPayloadRef.current = serialized
    writeProjectModelSelections(activeProjectId, payload ?? {})
    setSavedCliModels(payload)
    if (consumeSuppressedUiSync('chat.cliModels')) return
    sendUIState('chat.cliModels', payload, activeSessionId)

    localStorage.removeItem('cliModelsByProvider')
    localStorage.removeItem('cliModel')
  }, [activeProjectId, cliModelsByProvider, activeSessionId, loadingCliModels, sendUIState, setSavedCliModels, token, consumeSuppressedUiSync])

  // ── Pin the chosen provider to this chat ──────────────────────────
  // Mirrors the chat.cliModels persistence above: each session remembers its
  // own last-picked provider, so switching between chats never leaks the
  // provider selected in a different chat.
  const prevChatProviderPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeSessionId && token && (!wsFullStateReceivedRef.current || loadingChatProvider)) return
    const serialized = getSessionSelectionSyncKey(activeSessionId, chatProvider)
    if (serialized === prevChatProviderPayloadRef.current) return
    prevChatProviderPayloadRef.current = serialized
    setSavedChatProvider(chatProvider)
    if (consumeSuppressedUiSync('chat.provider')) return
    sendUIState('chat.provider', chatProvider, activeSessionId)
  }, [chatProvider, activeSessionId, loadingChatProvider, sendUIState, setSavedChatProvider, token, consumeSuppressedUiSync])

  const prevChatReasoningEffortPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeSessionId && token && (!wsFullStateReceivedRef.current || loadingChatReasoningEffort)) return
    const serialized = getSessionSelectionSyncKey(activeSessionId, chatReasoningEffort)
    if (serialized === prevChatReasoningEffortPayloadRef.current) return
    prevChatReasoningEffortPayloadRef.current = serialized
    setSavedChatReasoningEffort(chatReasoningEffort)
    if (!consumeSuppressedUiSync('chat.reasoningEffort')) {
      sendUIState('chat.reasoningEffort', chatReasoningEffort, activeSessionId)
    }
  }, [activeSessionId, chatReasoningEffort, consumeSuppressedUiSync, loadingChatReasoningEffort, sendUIState, setSavedChatReasoningEffort, token])

  useEffect(() => {
    if (
      chatProvider !== 'jait'
      || !activeSessionId
      || !token
      || authLoading
      || !wsFullStateReceivedRef.current
      || loadingChatReasoningEffort
    ) return
    const nativeReasoningEffort: ReasoningEffort | null =
      chatReasoningEffort === 'minimal'
      || chatReasoningEffort === 'low'
      || chatReasoningEffort === 'medium'
      || chatReasoningEffort === 'high'
        ? chatReasoningEffort
        : null
    if (settings?.reasoning_effort === nativeReasoningEffort) return
    void updateSettings({ reasoning_effort: nativeReasoningEffort })
  }, [activeSessionId, authLoading, chatProvider, chatReasoningEffort, loadingChatReasoningEffort, settings?.reasoning_effort, token, updateSettings])

  // ── Denormalize the chat's provider/model/mode onto the session row ──
  // The session-state sync above only restores the *currently open* chat's
  // provider. The chat/project list needs to show a provider icon for every
  // chat, including ones that aren't open — so also stash a summary on the
  // session's `metadata.chat`, fetched for free with the session list.
  const prevChatSelectionPayloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeSessionId || !token) return
    if (!wsFullStateReceivedRef.current || loadingChatProvider || loadingCliModels || loadingChatReasoningEffort) return
    const model = cliModelsByProvider[chatProvider] ?? null
    const payload = JSON.stringify({ sessionId: activeSessionId, provider: chatProvider, model, reasoningEffort: chatReasoningEffort })
    if (payload === prevChatSelectionPayloadRef.current) return
    prevChatSelectionPayloadRef.current = payload
    void updateSessionChatSelection(activeSessionId, {
      provider: chatProvider,
      model,
      reasoningEffort: chatReasoningEffort,
    })
  }, [activeSessionId, token, loadingChatProvider, loadingCliModels, loadingChatReasoningEffort, chatProvider, cliModelsByProvider, chatReasoningEffort, updateSessionChatSelection])

  // ── Restore the Jait provider's selected model across new chats ──
  // The model picked in the provider/model selector is persisted to the user
  // `selected_model` setting (provider-model-selector.tsx handleModelSelect).
  // Per-session model selections live in the `chat.cliModels` session state,
  // which is empty for a brand-new chat — so without this restore the model
  // dropdown reset to "Default" every time the user started a new chat. When
  // the active session has finished loading its cliModels and has no jait
  // model saved, fall back to the user-wide `selected_model` setting so the
  // last picked model stays selected.
  useEffect(() => {
    if (!activeSessionId || !token || authLoading) return
    if (loadingCliModels) return
    const currentJaitModel = cliModelsByProvider['jait']
    if (typeof currentJaitModel === 'string' && currentJaitModel.trim()) return
    const savedModel = settings?.selected_model
    if (typeof savedModel !== 'string' || !savedModel.trim()) return
    if (currentJaitModel === savedModel) return
    setCliModelsByProvider((prev) =>
      prev['jait'] === savedModel ? prev : { ...prev, jait: savedModel }
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, token, authLoading, loadingCliModels, settings?.selected_model])


  useEffect(() => {
    prevViewModeRef.current = viewMode
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    if (viewMode === 'manager' && showDebugPanel) {
      setShowDebugPanel(false)
    }
  }, [viewMode, showDebugPanel])

  const {
    closeDevPreviewPanel,
    closeProjectPanel,
    closeScreenSharePanel,
    closeTerminalPanel,
    handleProjectPreviewOpenChange,
    openDevPreviewPanel,
    openScreenSharePanel,
    openTerminalPanel,
    previewOpen,
    showMobileProjectEditorTab,
    showMobileProjectTreeTab,
    toggleProjectEditor,
    toggleProjectTree,
  } = usePanelControllers({
    activeProject,
    activeSessionId,
    closeProjectPanelRef,
    closeProjectPreview,
    consumeSuppressedUiSync,
    devPreviewTarget,
    isMobile,
    prevProjectPanelPayloadRef,
    projectPreviewState,
    routePreviewToProject,
    savedDevPreview,
    sendUIState,
    setCurrentView,
    setDevPreviewTarget,
    setMobileTreeTab,
    setProjectPreviewRequest,
    setProjectPreviewState,
    setSavedDevPreview,
    setSavedProject,
    setSavedScreenShare,
    setSavedTerminal,
    setShowProject,
    setShowScreenShare,
    setShowTerminal,
    setTerminalFullscreen,
    showProjectEditor,
    showProjectRef,
    showProjectTree,
    applyProjectLayout,
  })

  const handleMobileChatClick = useCallback(() => {
    if (showTerminal) {
      closeTerminalPanel()
    }
    if (showProject) {
      closeProjectPanel()
    }
    setCurrentView('chat')
    setShowSidebar(false)
    setShowMobileToolbar(false)
  }, [closeTerminalPanel, closeProjectPanel, showTerminal, showProject])

  // Helper: create a filesystem surface on the gateway so ALL clients
  // can browse the directory remotely (enables cross-device sync).
  const openRemoteProjectOnGateway = useCallback(async (
    dirPath: string,
    nodeId?: string,
    sessionIdOverride?: string | null,
    openPanel?: boolean,
  ) => {
    const sessionId = sessionIdOverride ?? activeSessionId
    const res = await fetch(`${API_URL}/api/project/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath, sessionId, nodeId: nodeId || 'gateway', openPanel }),
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

  // Wrap switchProject so clicking a project opens its remote directory and
  // restores that project's saved editor-mode state without leaking another
  // project's panel visibility.
  const handleSwitchProject = useCallback(async (
    projectId: string,
    sessionId?: string,
    focusChatOnMobile = false,
  ) => {
    const project = projects.find((entry) => entry.id === projectId) ?? await loadProject(projectId)
    if (!project) return

    if (isMobile) {
      setShowSidebar(false)
    }

    // Determine which session to activate (mirrors switchProject logic) —
    // an explicit sessionId (e.g. picked from the sidebar's recent-sessions
    // list) wins over the project's most-recently-active session.
    const nextSessionId = sessionId ?? getLatestProjectSessionId(project)
    const requestId = ++projectSwitchRequestRef.current
    const cachedProjectModels = readProjectModelSelections(projectId)
    const cachedProjectProvider = readProjectProviderSelection(projectId)
    // These eager sets give the switch immediate feedback (no flash of the
    // default) and seed fresh chats, but they MUST NOT be written back to the
    // server yet. Persisting the project-cache value here — before the newly
    // active chat's authoritative full-state push arrives — overwrites that
    // chat's own saved provider/model (e.g. Claude Code "opus") with whatever
    // the shared project cache holds at this instant, so the chat "resets to
    // default" the next time it's reopened. Suppress the WS sync for just this
    // transition: the full-state push restores the chat's real selection, and
    // the project cache is still applied locally as the fallback for fresh
    // chats that never pinned their own provider/model.
    suppressNextUiSync('chat.cliModels')
    suppressNextUiSync('chat.provider')
    setCliModelsByProvider(cachedProjectModels ?? (
      settings?.selected_model ? { jait: settings.selected_model } : {}
    ))
    const resolvedProvider = (cachedProjectProvider ?? settings?.chat_provider ?? 'jait') as ProviderId
    setChatProvider(resolvedProvider)
    // Pin the resolved provider to this project the first time it's visited,
    // so a later provider change made on a *different* project (which also
    // updates the shared global `settings.chat_provider` default) can't leak
    // back into this one just because it never had its own explicit pick.
    if (!cachedProjectProvider) saveProjectProviderSelection(projectId, resolvedProvider)

    // The manager provider is scoped to the project (like the chat provider)
    // and is not a global setting, so restore it from the per-project cache.
    // Suppress the WS sync for the transition: the full-state push restores the
    // active thread's real selection, and the cache is the fallback for fresh
    // threads that never pinned their own provider.
    const cachedProjectManagerProvider = readProjectManagerProviderSelection(projectId)
    const resolvedManagerProvider = (cachedProjectManagerProvider ?? resolvedProvider ?? 'jait') as ProviderId
    suppressNextUiSync('manager.provider')
    setManagerProvider(resolvedManagerProvider)
    if (!cachedProjectManagerProvider) saveProjectManagerProviderSelection(projectId, resolvedManagerProvider)

    setActiveProjectIfChanged(activeProjectDuringSwitch(activeProjectRef.current, project))
    setProjectFiles([])
    setActiveProjectFileId(null)
    handleAvailableFilesForMentionChange([])
    if (nextSessionId) {
      switchSession(projectId, nextSessionId)
    } else {
      switchProject(projectId)
    }

    // Open the project directory on the gateway and directly hydrate from the
    // response rather than relying on the WS `project.open` event, which is
    // session-scoped and may arrive before the WS re-subscribes to the new session.
    if (project.rootPath) {
      try {
        const openPanel = resolveProjectPanelOpenAfterChatSelection({
          isMobile,
          focusChat: focusChatOnMobile,
          requestedOpen: project.editorModeActive === true,
        })
        const res = await fetch(`${API_URL}/api/project/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: project.rootPath,
            sessionId: nextSessionId,
            nodeId: project.nodeId || 'gateway',
            openPanel,
          }),
        })
        if (requestId !== projectSwitchRequestRef.current) return
        if (!res.ok) {
          setActiveProjectIfChanged(null)
          toast.error('Failed to open project files.')
          return
        }
        const data = await res.json() as ProjectOpenData
        if (requestId !== projectSwitchRequestRef.current) return
        const resolvedNodeId = data.nodeId || project.nodeId || undefined
        setActiveProjectIfChanged({ surfaceId: data.surfaceId, projectRoot: data.projectRoot, nodeId: resolvedNodeId })
        const panelOpen = resolveProjectPanelOpenAfterChatSelection({
          isMobile,
          focusChat: focusChatOnMobile,
          requestedOpen: data.panelOpen !== false,
        })
        showProjectRef.current = panelOpen
        setShowProject(panelOpen)
      } catch (e) {
        if (requestId !== projectSwitchRequestRef.current) return
        setActiveProjectIfChanged(null)
        console.error('Failed to open project:', e)
        toast.error('Failed to open project files.')
      }
    }
  }, [projects, loadProject, switchProject, switchSession, isMobile, handleAvailableFilesForMentionChange, settings?.chat_provider, settings?.selected_model, suppressNextUiSync])

  const handleSelectPersonalSession = useCallback(async (sessionId: string) => {
    const knownSession = personalSessions.find((session) => session.id === sessionId)
    const session = knownSession ?? await loadSession(sessionId)
    if (!session || session.projectId) return
    if (isMobile) handleMobileChatClick()
    switchSession(null, sessionId)
  }, [handleMobileChatClick, isMobile, loadSession, personalSessions, switchSession])

  const handleSelectProjectSession = useCallback((projectId: string, sessionId: string) => {
    if (isMobile) handleMobileChatClick()
    if (projectId === activeProjectId) {
      if (sessionId === activeSessionId) return
      // If the project's editor surface isn't open yet (e.g. right after a
      // page load where only the project id was restored), open it so the
      // editor / preview / architecture controls are available. Otherwise
      // selecting a chat of an already-active project looks like a plain
      // chat with no project controls.
      if (!activeProjectRef.current) {
        void handleSwitchProject(projectId, sessionId, true)
        return
      }
      switchSession(projectId, sessionId)
      return
    }
    void handleSwitchProject(projectId, sessionId, true)
  }, [activeProjectId, activeSessionId, handleMobileChatClick, isMobile, switchSession, handleSwitchProject])

  // The "+" opens the same dialog the folder button used to, rather than the raw
  // file explorer. One form creates both: leave the directory empty for a
  // grouping folder, pick one for a project.
  const handleCreateProject = useCallback(() => {
    handleCreateFolder(null)
  }, [handleCreateFolder])

  const handleOpenSecretChat = useCallback(async (sessionId: string) => {
    setCurrentView('chat')
    setViewMode('developer')
    setChatCollapsed(false)
    setShowMobileToolbar(false)
    if (isMobile) {
      setShowSidebar(false)
      setShowProject(false)
      setShowTerminal(false)
    }

    const project = projects.find((entry) => entry.sessions.some((session) => session.id === sessionId))
    if (project) {
      handleSelectProjectSession(project.id, sessionId)
      return
    }
    if (personalSessions.some((session) => session.id === sessionId)) {
      switchSession(null, sessionId)
      return
    }

    const session = await loadSession(sessionId)
    if (!session) {
      toast.error('The chat requesting this password is no longer available.')
      return
    }
    if (session.projectId) {
      await handleSwitchProject(session.projectId, session.id)
    } else {
      switchSession(null, session.id)
    }
  }, [
    handleSelectProjectSession,
    handleSwitchProject,
    isMobile,
    loadSession,
    personalSessions,
    projects,
    switchSession,
  ])

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
    await openRemoteProjectOnGateway(path, nodeId, session.id, nextOpen)
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
    await openRemoteProjectOnGateway(path, nodeId ?? undefined, sessionIdOverride, true)
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
          const state = { open: true, remotePath: currentActiveProject!.projectRoot, surfaceId: currentActiveProject!.surfaceId, nodeId: currentActiveProject!.nodeId }
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
    if (!activeProject?.projectRoot || !activeSessionId || activeProject.opening) return
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
            openPanel: showProjectRef.current,
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

  // Absolute paths of files the agent has modified (undecided only), used to refresh an already-open project editor
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
    const cachedProjectProvider = readProjectProviderSelection(activeProjectId)
    const provider = cachedProjectProvider ?? settings.chat_provider
    if (provider && provider !== chatProvider) {
      setChatProvider(provider as ProviderId)
    }
    // Same pin as handleSwitchProject: lock in whatever provider a project
    // ends up on (even via the global-default fallback) so later provider
    // changes made elsewhere can't retroactively change this project too.
    if (provider && !cachedProjectProvider) saveProjectProviderSelection(activeProjectId, provider)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, settings.chat_provider, authLoading])

  // Sync manager provider from the per-project cache so it survives reloads
  // and project switches (the manager provider is not a global server setting).
  // The reasoning effort rides along: it is stored per provider, so it has to
  // be restored for whichever provider this project ends up on.
  useEffect(() => {
    if (authLoading) return
    const cachedProjectManagerProvider = readProjectManagerProviderSelection(activeProjectId)
    const restoredProvider = cachedProjectManagerProvider as ProviderId | null ?? managerProvider
    if (cachedProjectManagerProvider && cachedProjectManagerProvider !== managerProvider) {
      setManagerProvider(restoredProvider)
    }
    setManagerReasoningEffort(readProjectReasoningEffortSelection(activeProjectId, restoredProvider) ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, authLoading])

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
            if (!data.hasUsers) authForm.setAuthTab('register')
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
    gitApi.status(activeProjectRoot, undefined, activeProject?.nodeId)
      .then((status) => {
        if (!cancelled) setComposerGitStatus(status)
      })
      .catch(() => {
        if (!cancelled) setComposerGitStatus(null)
      })

    return () => {
      cancelled = true
    }
  }, [activeProject?.nodeId, activeProjectRoot, changedFiles.length, changedFilesKey, sourceControlRefreshSignal])
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
    return terminals.filter((terminal) => terminalBelongsToProject(
      terminal,
      activeProjectRoot,
      activeProject?.nodeId ?? 'gateway',
    ))
  }, [terminals, activeProjectRoot, activeProject?.nodeId])

  const activeProjectTerminalId = useMemo(
    () => resolveProjectActiveTerminalId(activeTerminalId, projectTerminals),
    [activeTerminalId, projectTerminals],
  )

  useEffect(() => {
    if (!activeProjectId || loadingProjectUI) return
    const savedTerminalId = projectUI?.terminal?.activeTerminalId ?? null
    if (savedTerminalId && projectTerminals.some((terminal) => terminal.id === savedTerminalId)) {
      if (activeTerminalId !== savedTerminalId) setActiveTerminalId(savedTerminalId)
      return
    }
    if (activeTerminalId && !projectTerminals.some((terminal) => terminal.id === activeTerminalId)) {
      setActiveTerminalId(null)
    }
  }, [activeProjectId, activeTerminalId, loadingProjectUI, projectTerminals, projectUI?.terminal?.activeTerminalId, setActiveTerminalId])

  useEffect(() => {
    if (!activeProjectId || loadingProjectUI || !projectStateReady) return
    if (projectUI?.terminal?.open !== true) return
    if ((projectUI.terminal.activeTerminalId ?? null) === activeProjectTerminalId) return
    setSavedTerminal({ open: true, activeTerminalId: activeProjectTerminalId })
  }, [activeProjectId, activeProjectTerminalId, loadingProjectUI, projectStateReady, projectUI?.terminal, setSavedTerminal])

  const {
    handleDetachTerminal,
    handleKillTerminal,
    handleMobileProjectTargetAction,
    handleOpenTerminalFromToolCall,
    handleReferenceFile,
    handleReferenceFileSelection,
    handleReferencePreviewElement,
    handleReferenceTerminalSelection,
    handleToggleTerminal,
  } = useTerminalInteractionHandlers({
    activeProjectRoot,
    activeProjectNodeId: activeProject?.nodeId ?? 'gateway',
    activeSessionId,
    activeTerminalId: activeProjectTerminalId,
    appliedThemeMode,
    closeProjectPanel,
    closeTerminalPanel,
    createTerminal,
    handleToggleEditor,
    killTerminal,
    openTerminalPanel,
    projectTerminals,
    promptInputRef,
    refresh,
    setActiveTerminalId,
    setCurrentView,
    setShowSidebar,
    showMobileProjectEditorTab,
    showMobileProjectTreeTab,
    showProject,
    showSidebar,
    showTerminal,
    token,
  })

  const {
    handleApplyProjectDiff,
    handleChangedFileClick,
    handleFileDrop,
    handleOpenMessagePath,
    handleSearchFiles,
  } = useProjectFileActions({
    acceptFile,
    activeProject,
    activeProjectRecord,
    activeSessionId,
    openRemoteProjectOnGateway,
    projectFiles,
    projectRef,
    setActiveProjectFileId,
    setProjectFiles,
    setShowProject,
    showProject,
    showProjectEditorPanel,
    showProjectRef,
    token,
  })

  // Open the project editor with the source-control (Git) tab focused. Triggered
  // from the git-diff indicator in the chat region's top-left corner.
  const handleOpenSourceControl = useCallback(() => {
    setCurrentView('chat')
    if (isMobile) {
      void handleMobileProjectTargetAction('git')
      return
    }
    const project = activeProjectRef.current
    if (project) {
      showProjectRef.current = true
      setShowProject(true)
      applyProjectLayout({ tree: true, editor: true }, { immediateSync: true })
      const state = {
        open: true,
        remotePath: project.projectRoot,
        surfaceId: project.surfaceId,
        nodeId: project.nodeId,
      }
      setSavedProject(state)
      setMobileTreeTab('git')
      return
    }
    const record = activeProjectRecordRef.current
    if (record?.rootPath) {
      void reopenPersistedProject(record.rootPath, record.nodeId ?? 'gateway', activeSessionIdRef.current, { mobileTarget: 'editor' })
        .then(() => setMobileTreeTab('git'))
        .catch(() => {})
    }
  }, [
    activeProjectRef,
    activeProjectRecordRef,
    activeSessionIdRef,
    applyProjectLayout,
    handleMobileProjectTargetAction,
    isMobile,
    reopenPersistedProject,
    setCurrentView,
    setMobileTreeTab,
    setSavedProject,
    setShowProject,
    showProjectRef,
  ])

  const preparePromptSubmission = useCallback(async (
    rawValue: string,
    chipFiles?: ReferencedFile[],
    displaySegments?: UserMessageSegment[]
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
    if (!prepared && (!fileAttachments || fileAttachments.length === 0)) return
    const promptText = prepared?.promptWithReferences ?? inputValueRef.current.trim()
    const displayContent = prepared?.displayContent || getUploadedAttachmentDisplayLabel(fileAttachments) || promptText
    const nextDisplaySegments = mergeAttachmentsIntoSegments(prepared?.displaySegments, fileAttachments)
    const outboundMode: ChatMode = sendTarget === 'swarm' ? 'swarm' : chatMode
    enqueueMessage({
      content: promptText,
      displayContent,
      mode: outboundMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      responseStyle: chatResponseStyle,
      model: cliModel ?? undefined,
      reasoningEffort: chatReasoningEffort,
      referencedFiles: prepared?.referencedFiles,
      displaySegments: nextDisplaySegments,
      attachments: fileAttachments,
    })
    setInputValue('')
    setInputSegments(undefined)
  }, [chatMode, chatProvider, chatProviderRuntimeMode, chatReasoningEffort, chatResponseStyle, cliModel, enqueueMessage, preparePromptSubmission, sendTarget, setInputValue])

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
    const displayContent = prepared?.displayContent || promptText
    const nextDisplaySegments = mergeAttachmentsIntoSegments(prepared?.displaySegments, fileAttachments)
    const outboundMode: ChatMode = sendTarget === 'swarm' ? 'swarm' : chatMode

    const sid = activeSessionId
    const sessionIdPromise = sid
      ? undefined
      : createSession(undefined).then((session) => session?.id ?? null)
    if (shouldAutoTitleSession(activeSessionRecord?.name)) {
      const titleModel = chatProvider === 'jait' ? cliModel ?? undefined : undefined
      if (sid) {
        void generateSessionTitle(sid, displayContent, titleModel)
      } else {
        void sessionIdPromise?.then((createdSessionId) => {
          if (createdSessionId) void generateSessionTitle(createdSessionId, displayContent, titleModel)
        })
      }
    }

    if (isLoading || messageQueue.length > 0) {
      enqueueMessage({
        content: promptText,
        displayContent: prepared?.displayContent || promptText,
        mode: outboundMode,
        provider: chatProvider,
        runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
        responseStyle: chatResponseStyle,
        model: cliModel ?? undefined,
        reasoningEffort: chatReasoningEffort,
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
      sessionIdPromise,
      mode: outboundMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      responseStyle: chatResponseStyle,
      model: cliModel ?? undefined,
      reasoningEffort: chatReasoningEffort,
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
    const promptWithUploads = appendUploadedAttachmentPromptBlock(prepared?.promptWithReferences ?? '', fileAttachments)
    if ((!prepared && !promptWithUploads) || threadComposerDisabled) return
    const displayContent = prepared?.displayContent || getUploadedAttachmentDisplayLabel(fileAttachments) || promptWithUploads
    const nextDisplaySegments = mergeAttachmentsIntoSegments(prepared?.displaySegments, fileAttachments)
    const selectedThreadQueueLength = automation.selectedThread
      ? managerMessageQueues[automation.selectedThread.id]?.length ?? 0
      : 0
    if (automation.selectedThread && (automation.selectedThread.status === 'running' || selectedThreadQueueLength > 0)) {
      enqueueManagerMessage(automation.selectedThread.id, {
        id: `mq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        content: displayContent,
        displayContent,
        fullContent: promptWithUploads,
        referencedFiles: prepared?.referencedFiles,
        displaySegments: nextDisplaySegments,
        attachments: prepared?.attachments,
        providerId: threadProvider,
        runtimeMode: threadProvider !== 'jait' ? threadProviderRuntimeMode : undefined,
        model: threadCliModel ?? undefined,
        reasoningEffort: threadReasoningEffort,
        queuedAt: Date.now(),
      })
      setInputValue('')
      setInputSegments(undefined)
      return
    }
    setInputValue('')
    setInputSegments(undefined)
    await automation.handleSend(
      promptWithUploads,
      {
        providerId: threadProvider,
        runtimeMode: threadProvider !== 'jait' ? threadProviderRuntimeMode : undefined,
        model: threadCliModel ?? undefined,
        reasoningEffort: threadReasoningEffort,
      },
      {
        displayContent,
        referencedFiles: prepared?.referencedFiles,
        displaySegments: nextDisplaySegments,
        attachments: prepared?.attachments,
      },
      threadTargetRepo?.id ?? undefined,
    )
  }

  const chatQueueProcessingRef = useRef(false)

  useEffect(() => {
    if (viewMode === 'manager' || sendTarget === 'thread') return
    if (!token || !activeSessionId) return
    if (!shouldProcessQueuedMessage({
      hasInterruptedExit: hitMaxRounds,
      isLoading,
      isLoadingHistory,
      queuedCount: messageQueue.length,
      allowQueuedMessageAfterInterruptedExit,
      isProcessing: chatQueueProcessingRef.current,
      nextItemHeld: messageQueue[0]?.held ?? false,
      // While the gateway WS is connected the server-side
      // `drainQueuedChatMessages` is the authoritative queue consumer
      // (it runs on every turn's `done` and on every `queued_messages`
      // state-sync). Letting the client auto-drain too made the two race:
      // the losing client re-queued the message with a fresh server id and
      // it got sent twice — the "queued messages multiply" bug. The client
      // only takes over when the user explicitly approved after an
      // interrupted exit, or when there is no server connection to drain.
      deferToServerDrain: wsConnected,
    })) return

    const [nextItem] = messageQueue
    if (!nextItem) return
    // A held message blocks the queue: don't auto-send it (or anything after
    // it) until the user explicitly unlocks it. The server-side drain applies
    // the same rule; this guards the no-server-connection fallback path.
    if (nextItem.held) return

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
        reasoningEffort: nextItem.reasoningEffort,
        onLoginRequired: () => setShowLoginDialog(true),
      // Mark this as a queue-originated send so the `sendMessage` `queued`
      // handler does NOT mirror the server-assigned entry back into the local
      // queue. The server is authoritative and will broadcast the canonical
      // `queued_messages` state via WS; re-adding locally with a new server id
      // was the other half of the multiplication race.
      queued: true,
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
        reasoningEffort: nextItem.reasoningEffort,
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
    allowQueuedMessageAfterInterruptedExit,
    hitMaxRounds,
    isLoading,
    isLoadingHistory,
    messageQueue,
    sendMessage,
    sendTarget,
    token,
    viewMode,
    wsConnected,
  ])

  const handleContinueChat = useCallback((options: { token: string | null; sessionId: string | null }) => {
    setAllowQueuedMessageAfterInterruptedExit(false)
    continueChat({
      ...options,
      mode: sendTarget === 'swarm' ? 'swarm' : chatMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      model: cliModel ?? undefined,
      reasoningEffort: chatReasoningEffort,
    })
  }, [chatMode, chatProvider, chatProviderRuntimeMode, chatReasoningEffort, cliModel, continueChat, sendTarget])

  const handleSendQueuedAfterInterruptedExit = useCallback(() => {
    setAllowQueuedMessageAfterInterruptedExit(true)
  }, [])

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
        body: JSON.stringify({ message: item.content, displayContent: item.displayContent }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as Record<string, unknown>
        const details = typeof err.details === 'string' ? err.details : null
        const error = typeof err.error === 'string' ? err.error : null
        throw new Error(details || error || `Failed to steer: ${response.statusText}`)
      }
      dequeueMessage(id)
      recordSteeredMessage(item.content, item.displayContent)
      toast.success('Steered with queued message')
    })().catch((err) => {
      toast.error(getNonEmptyMessage(err instanceof Error ? err.message : null, 'Failed to steer with queued message'))
    })
  }, [activeSessionId, dequeueMessage, isLoading, messageQueue, recordSteeredMessage, token])

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
    const promptWithUploads = appendUploadedAttachmentPromptBlock(prepared?.promptWithReferences ?? '', fileAttachments)
    if (!prepared && !promptWithUploads) return
    const displayContent = prepared?.displayContent || getUploadedAttachmentDisplayLabel(fileAttachments) || promptWithUploads
    const nextDisplaySegments = mergeAttachmentsIntoSegments(prepared?.displaySegments, fileAttachments)
    enqueueManagerMessage(thread.id, {
      id: `mq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: displayContent,
      displayContent,
      fullContent: promptWithUploads,
      referencedFiles: prepared?.referencedFiles,
      displaySegments: nextDisplaySegments,
      attachments: prepared?.attachments,
      providerId: managerProvider,
      runtimeMode: managerProvider !== 'jait' ? managerProviderRuntimeMode : undefined,
      model: managerCliModel ?? undefined,
      reasoningEffort: managerReasoningEffort,
      queuedAt: Date.now(),
    })
    setInputValue('')
    setInputSegments(undefined)
  }, [automation.selectedThread, enqueueManagerMessage, managerCliModel, managerProvider, managerProviderRuntimeMode, managerReasoningEffort, preparePromptSubmission, setInputValue])

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
        {
          providerId: nextItem.providerId,
          runtimeMode: nextItem.runtimeMode,
          model: nextItem.model,
          reasoningEffort: nextItem.reasoningEffort,
        },
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
        { token, sessionId: sid, mode: outboundMode, provider: chatProvider, runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined, model: cliModel ?? undefined, reasoningEffort: chatReasoningEffort, onLoginRequired: () => setShowLoginDialog(true) },
      )
      return
    }
    sendMessage(suggestion, { token, sessionId: sid, mode: outboundMode, provider: chatProvider, runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined, model: cliModel ?? undefined, reasoningEffort: chatReasoningEffort, onLoginRequired: () => setShowLoginDialog(true) })
  }

  const handleEditPreviousMessage = useCallback(async (
    messageId: string,
    newContent: string,
    messageIndex?: number,
    messageFromEnd?: number,
    metadata?: {
      referencedFiles?: { path: string; name: string }[]
      displaySegments?: UserMessageSegment[]
      originalContent?: string
    },
  ) => {
    if (!activeSessionId || !token) return false
    const prepared = await preparePromptSubmission(newContent, metadata?.referencedFiles, metadata?.displaySegments)
    if (!prepared) return false
    const outboundMode: ChatMode = sendTarget === 'swarm' ? 'swarm' : chatMode
    return restartFromMessage(messageId, prepared.promptWithReferences, messageIndex, messageFromEnd, {
      token,
      sessionId: activeSessionId,
      mode: outboundMode,
      provider: chatProvider,
      runtimeMode: chatProvider !== 'jait' ? chatProviderRuntimeMode : undefined,
      model: cliModel ?? undefined,
      reasoningEffort: chatReasoningEffort,
      displayContent: prepared.displayContent,
      referencedFiles: prepared.referencedFiles,
      displaySegments: prepared.displaySegments,
      expectedContent: metadata?.originalContent,
      onLoginRequired: () => setShowLoginDialog(true),
    })
  }, [activeSessionId, restartFromMessage, token, chatMode, chatProvider, chatProviderRuntimeMode, chatReasoningEffort, cliModel, preparePromptSubmission, sendTarget])

  const authFormProps = {
    gatewayStep,
    setGatewayStep,
    apiUrl: API_URL,
    isStandaloneApp,
    serverHasUsers,
    gatewayUrlInput,
    setGatewayUrlInput,
    gatewayError,
    setGatewayError,
    gatewayChecking,
    checkGatewayHealth,
    authTab: authForm.authTab,
    setAuthTab: authForm.setAuthTab,
    authSubmitting: authForm.authSubmitting,
    authError: authForm.authError,
    handleLogin: authForm.handleLogin,
    handleRegister: authForm.handleRegister,
    loginUsername: authForm.loginUsername,
    setLoginUsername: authForm.setLoginUsername,
    loginPassword: authForm.loginPassword,
    setLoginPassword: authForm.setLoginPassword,
    showLoginPassword: authForm.showLoginPassword,
    setShowLoginPassword: authForm.setShowLoginPassword,
    registerUsername: authForm.registerUsername,
    setRegisterUsername: authForm.setRegisterUsername,
    registerPassword: authForm.registerPassword,
    setRegisterPassword: authForm.setRegisterPassword,
    registerPasswordConfirm: authForm.registerPasswordConfirm,
    setRegisterPasswordConfirm: authForm.setRegisterPasswordConfirm,
    showRegisterPassword: authForm.showRegisterPassword,
    setShowRegisterPassword: authForm.setShowRegisterPassword,
    showRegisterConfirmPassword: authForm.showRegisterConfirmPassword,
    setShowRegisterConfirmPassword: authForm.setShowRegisterConfirmPassword,
  }

  const handleLogout = () => {
    logout()
    clearMessages()
    setCurrentView('chat')
    setShowLoginDialog(true)
  }

  const buildChatSessionUrl = useCallback((sessionId: string, projectId: string | null) => {
    const url = new URL(`${window.location.origin}${window.location.pathname}`)
    url.searchParams.set('sessionId', sessionId)
    if (projectId) url.searchParams.set('projectId', projectId)
    return url.toString()
  }, [])

  const openNewChatSurface = useCallback(async (target: 'tab' | 'window') => {
    const previousProjectId = activeProjectId
    const previousSessionId = activeSessionId
    const session = await createSession()
    if (!session) return

    const url = buildChatSessionUrl(session.id, session.projectId ?? null)
    const title = session.name && session.name !== 'New Chat' ? session.name : 'New chat'

    let opened = false
    if (target === 'window') {
      try {
        if (window.jaitDesktop?.openProjectWindow) {
          const result = await window.jaitDesktop.openProjectWindow({ url, title })
          opened = Boolean(result?.ok)
        }
      } catch {
        opened = false
      }
      if (!opened) {
        const popup = window.open(url, `jait-chat-${session.id}`, 'popup=yes,width=960,height=860,resizable=yes,scrollbars=yes')
        opened = Boolean(popup)
        popup?.focus?.()
      }
    } else {
      const popup = window.open(url, '_blank', 'noopener,noreferrer')
      opened = Boolean(popup)
    }

    if (previousSessionId) {
      switchSession(previousProjectId, previousSessionId)
    }
    if (!opened) toast.error(target === 'window' ? 'Failed to open chat window' : 'Failed to open chat tab')
  }, [activeProjectId, activeSessionId, buildChatSessionUrl, createSession, switchSession])

  const handleStartNewChat = useCallback(() => {
    clearMessages()
    void createSession()
  }, [clearMessages, createSession])

  const handleStartNewChatInTab = useCallback(() => {
    void openNewChatSurface('tab')
  }, [openNewChatSurface])

  const handleStartNewChatInWindow = useCallback(() => {
    void openNewChatSurface('window')
  }, [openNewChatSurface])

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

  // ── Push-to-talk voice recording ───────────────────────────────
  const {
    voiceRecording,
    voiceTranscribing,
    voiceLevels,
    handleVoiceInput,
    stopRecordingAndTranscribe,
  } = useVoiceRecording({
    token,
    activeSessionId,
    sttProvider: settings.stt_provider,
    setInputValue,
    onAuthRequired: () => setShowLoginDialog(true),
  })

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

  const voiceControlProps = {
    voiceOverlayOpen,
    setVoiceOverlayOpen,
    wakeWord,
    wakeWordEnabled,
    toggleWakeWord,
    voiceAssistant,
    isElectron,
    activeProjectTitle: activeProjectRecord?.title ?? null,
  }

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

  const userInitial = user?.username?.[0]?.toUpperCase() ?? '?'

  // ── Memoised edit-composer bag (prevents every Message from re-rendering) ──
  const handleVoiceStop = useCallback(() => { void stopRecordingAndTranscribe() }, [stopRecordingAndTranscribe])
  const handleFolderPickerOpen = useCallback(() => { automation.setFolderPickerOpen(true) }, [automation.setFolderPickerOpen])

  // ── Central keyboard shortcuts (defaults + user bindings live in lib/hotkeys) ──
  useHotkeyActions({
    'app.settings': () => setCurrentView('settings'),
    'app.toggleTheme': () => { void handleThemeModeChange(appliedThemeMode === 'dark' ? 'light' : 'dark') },
    'app.toggleDebugPanel': () => setShowDebugPanel((shown) => !shown),
    'view.chat': () => setCurrentView('chat'),
    'view.pulls': () => setCurrentView('pulls'),
    'view.todo': () => setCurrentView('todo'),
    'view.email': () => setCurrentView('email'),
    'view.calendar': () => setCurrentView('calendar'),
    'view.memory': () => setCurrentView('memory'),
    'view.jobs': () => setCurrentView('jobs'),
    'view.network': () => setCurrentView('network'),
    'chat.new': () => { setCurrentView('chat'); handleStartNewChat() },
    'chat.newTab': handleStartNewChatInTab,
    'chat.focusComposer': () => { setCurrentView('chat'); promptInputRef.current?.focus() },
    'chat.stop': isLoading ? handleCancelRequest : null,
    'chat.toggleSidebar': () => setShowSidebar((shown) => !shown),
    'workspace.toggleTerminal': () => { void handleToggleTerminal() },
    'workspace.toggleEditor': () => { void handleToggleEditor() },
    'workspace.togglePreview': () => { void handleSidebarPreviewToggle() },
    'workspace.toggleArchitecture': () => { void handleSidebarArchitectureToggle() },
    'workspace.toggleScreenShare': () => {
      if (showScreenShare) closeScreenSharePanel()
      else openScreenSharePanel()
    },
    'voice.toggleRecording': () => {
      if (voiceRecording) handleVoiceStop()
      else void handleVoiceInput()
    },
  })
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
  const inlinePrompts = (secretInput.inlinePrompt || userQuestionInput.inlinePrompt) ? (
    <div className="space-y-1.5">
      {secretInput.inlinePrompt}
      {userQuestionInput.inlinePrompt}
    </div>
  ) : null

  const developerComposerControlRow = viewMode === 'developer' ? (
    <DeveloperComposerControlRow
      activeProjectId={activeProjectId}
      activeProjectSessions={activeProjectSessions}
      activeProjectTitle={activeProjectRecord?.title ?? 'Personal chat'}
      activeSessionId={activeSessionId}
      approveAllInSession={approveAllInSession}
      compact={compactDeveloperComposer}
      disableSendTargetSelector={developerChatUiState.disableSendTargetSelector}
      remainingPrompts={remainingPrompts}
      repositories={automation.repositories}
      selectedThreadRepo={threadTargetRepo}
      sendTarget={sendTarget}
      threadRepoPickerDisabled={automation.creating}
      getRuntimeInfo={automation.getRuntimeInfoForRepository}
      onAddRepository={handleFolderPickerOpen}
      onClearApproveAll={handleClearApproveAll}
      onCreateSession={() => { void createSession() }}
      onSendTargetChange={setSendTarget}
      onSessionSwitcherOpenChange={handleSessionSwitcherOpen}
      onStartNewChat={handleStartNewChat}
      onStartNewChatInTab={handleStartNewChatInTab}
      onStartNewChatInWindow={handleStartNewChatInWindow}
      onSelectRepo={automation.setSelectedRepoId}
      onSelectSession={switchSession}
    />
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
    reasoningEffort: chatReasoningEffort,
    onReasoningEffortChange: handleChatReasoningEffortChange,
    availableFiles: availableFilesForMention,
    onSearchFiles: handleSearchFiles,
    projectOpen: showProject,
    sessionInfo,
    projectNodeId: activeProject?.nodeId,
    projectId: activeProjectId,
  }), [
    handleVoiceInput, voiceRecording, voiceLevels, voiceTranscribing, handleVoiceStop,
    chatMode, setChatMode, chatProvider, handleChatProviderChange,
    chatResponseStyle, handleChatResponseStyleChange,
    chatProviderRuntimeMode, handleChatProviderRuntimeModeChange, cliModel, handleCliModelChange,
    chatReasoningEffort, handleChatReasoningEffortChange,
    availableFilesForMention, handleSearchFiles, showProject, sessionInfo, activeProject?.nodeId, activeProjectId,
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
    return <GatewayUnavailable onRetry={retryGatewayReachable} />
  }

  return (
    <TooltipProvider>
      <div className="fixed inset-0 flex flex-col overflow-hidden safe-top safe-bottom safe-left safe-right">
        <NodePermissionsGate token={token} />
        {!requiresAuthGate && (
          <>
            <AppHeader
              activeManagerThreads={activeManagerThreads}
              appPlatform={appPlatform}
              automation={automation}
              chatProvider={viewMode === 'manager' ? managerProvider : chatProvider}
              cliModel={viewMode === 'manager' ? managerCliModel : cliModel}
              closeScreenSharePanel={closeScreenSharePanel}
              currentView={currentView}
              desktopPlatform={desktopPlatform}
              handleApplyUpdate={handleApplyUpdate}
              handleLogout={handleLogout}
              handleThemeModeChange={handleThemeModeChange}
              isAuthLoading={authLoading}
              isAuthenticated={isAuthenticated}
              isElectron={isElectron}
              isMaximized={isMaximized}
              isMobile={isMobile}
              onCliModelChange={viewMode === 'manager' ? handleManagerCliModelChange : handleCliModelChange}
              onOpenMobileNav={() => setShowMobileToolbar(true)}
              openScreenSharePanel={openScreenSharePanel}
              remainingPrompts={remainingPrompts}
              screenShare={screenShare}
              setCurrentView={setCurrentView}
              setSendTarget={setSendTarget}
              setShowLoginDialog={setShowLoginDialog}
              setShowProject={setShowProject}
              setShowProjectEditor={setShowProjectEditor}
              setViewMode={setViewMode}
              setVoiceOverlayOpen={setVoiceOverlayOpen}
              showScreenShare={showScreenShare}
              themeMode={themeMode}
              updateApplying={updateApplying}
              updateAwaitingRestart={updateAwaitingRestart}
              updateInfo={updateInfo}
              releases={releases}
              user={user}
              userInitial={userInitial}
              viewMode={viewMode}
              voiceAssistant={voiceAssistant}
              voiceControlProps={voiceControlProps}
              voiceOverlayOpen={voiceOverlayOpen}
              activeProjectTitle={activeProjectRecord?.title ?? null}
            />



            <ChatToolbar
              activeProject={activeProject}
              activeProjectId={activeProjectId}
              automation={automation}
              changedFilesCount={changedFiles.length}
              compactManagerToolbar={compactManagerToolbar}
              currentView={currentView}
              isMobile={isMobile}
              mobileProjectControlState={mobileProjectControlState}
              previewOpen={previewOpen}
              showArchitecture={showArchitecture}
              showDebugPanel={showDebugPanel}
              showManagerRepos={showManagerRepos}
              showProject={showProject}
              showSidebar={showSidebar}
              showTerminal={showTerminal}
              token={token}
              viewMode={viewMode}
              onBackFromManagerThread={() => {
                automation.setSelectedThreadId(null)
                setInputValue('')
              }}
              onMobileProjectTargetAction={(target) => { void handleMobileProjectTargetAction(target) }}
              onOpenPlan={setPlanRepo}
              onOpenStrategy={setStrategyRepo}
              onToggleArchitecture={() => {
                if (showArchitecture) {
                  projectRef.current?.closeArchitectureTab()
                  setArchitectureRequest(null)
                  setShowArchitecture(false)
                } else {
                  setShowArchitecture(true)
                  openArchitectureInProject()
                }
              }}
              onToggleDebugPanel={() => setShowDebugPanel((d) => !d)}
              onToggleEditor={() => { void handleToggleEditor() }}
              onToggleManagerRepos={() => setShowManagerRepos((s) => !s)}
              onTogglePreview={() => {
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
              onToggleSidebar={() => setShowSidebar((s) => !s)}
              onToggleTerminal={() => { void handleToggleTerminal() }}
            />

        {currentView !== 'chat' ? (
          <AppPageOutlet
            activeSessionId={activeSessionId}
            activityEvents={activityEvents}
            apiKeys={settings.api_keys}
            appPlatform={appPlatform}
            chatProvider={chatProvider}
            chatProviderRuntimeMode={chatProviderRuntimeMode}
            cliModel={cliModel}
            currentView={currentView}
            isMobile={isMobile}
            repositories={automation.repositories}
            jaitBackend={settings.jait_backend ?? 'openai'}
            sttProvider={settings.stt_provider}
            token={token}
            updateApplying={updateApplying}
            updateChecking={updateChecking}
            updateInfo={updateInfo}
            releases={releases}
            releasesLoading={releasesLoading}
            username={user?.username ?? ''}
            onApplyUpdate={() => { void handleApplyUpdate() }}
            onCheckUpdate={() => { void handleCheckUpdate() }}
            onCheckChangelog={() => { void handleCheckChangelog() }}
            onClearArchive={handleClearArchive}
            onClearArchivedProjects={handleClearArchivedProjects}
            onFetchArchivedProjects={fetchArchivedProjects}
            onJaitBackendChange={async (next) => { await updateSettings({ jait_backend: next }) }}
            onRestoreProject={handleRestoreProject}
            onSaveApiKeys={handleSaveApiKeys}
            onSttProviderChange={async (next: SttProvider) => { await updateSettings({ stt_provider: next }) }}
            onVoiceInput={handleVoiceInput}
            onVoiceStop={handleVoiceStop}
            voiceLevels={voiceLevels}
            voiceRecording={voiceRecording}
            voiceTranscribing={voiceTranscribing}
          />
        ) : (
          <div className={`flex flex-1 min-h-0 overflow-hidden ${isMobile ? 'flex-col relative' : ''}`}>
            <div className={isMobile ? 'contents' : `relative flex min-h-0 ${chatCollapsed ? 'flex-1 min-w-0' : 'shrink-0'}`}>
              {viewMode === 'developer' && (
                <DeveloperSidebars
                  activeProject={activeProject}
                  activeProjectId={activeProjectId}
                  activeSessionId={activeSessionId}
                  authLoading={authLoading}
                  fsNodes={fsNodes}
                  hasMoreProjects={hasMoreProjects}
                  isMobile={isMobile}
                  personalSessions={personalSessions}
                  previewOpen={previewOpen}
                  projectListLimit={projectListLimit}
                  projects={projects}
                  projectsLoading={projectsLoading}
                  repositories={automation.repositories}
                  searchLoading={searchLoading}
                  searchResults={searchResults}
                  sessionInfo={sessionInfo}
                  showArchitecture={showArchitecture}
                  showProject={showProject}
                  showSidebar={showSidebar}
                  showTerminal={showTerminal}
                  streamingSessionIds={streamingSessionIds}
                  sidebarRef={sidebarRef}
                  onAssignRepository={(projectId) => { void handleAssignProjectRepository(projectId) }}
                  onArchiveSession={(sessionId) => { void handleArchiveSession(sessionId) }}
                  onMoveSession={(sessionId, projectId) => { void moveSession(sessionId, projectId) }}
                  onSearchProjects={searchProjects}
                  onBlur={handleSidebarBlur}
                  onChangeDirectory={handleChangeDirectory}
                  onCreateProject={handleCreateProject}
                  onCreateFolder={handleCreateFolder}
                  onEditProject={(projectId) => { setContextDialogTarget({ mode: 'edit', projectId }) }}
                  onMoveProject={(projectId, parentId) => { void handleMoveProject(projectId, parentId) }}
                  onCreatePersonalSession={() => { if (isMobile) setShowSidebar(false); void createSession(null) }}
                  onRemoveProject={(projectId) => { void handleRemoveProject(projectId) }}
                  onSearch={searchChats}
                  onSelectPersonalSession={(sessionId) => { void handleSelectPersonalSession(sessionId) }}
                  onSelectProject={handleSwitchProject}
                  onSelectProjectSession={handleSelectProjectSession}
                  onShowFewer={showFewerProjects}
                  onShowMore={showMoreProjects}
                  onToggleArchitecture={() => { void handleSidebarArchitectureToggle() }}
                  onToggleEditor={() => { void handleToggleEditor() }}
                  onTogglePreview={() => { void handleSidebarPreviewToggle() }}
                  onToggleSidebar={() => setShowSidebar((s) => !s)}
                  onToggleTerminal={() => { void handleToggleTerminal() }}
                  onOpenSettings={() => setCurrentView('settings')}
                />
              )}

              <DeveloperWorkspacePanes
                activeProject={activeProject}
                activeProjectFileId={activeProjectFileId}
                activeProjectRoot={activeProjectRoot}
                activeSessionId={activeSessionId}
                activeTerminalId={activeProjectTerminalId}
                architectureDiagram={architectureDiagram}
                architectureGenerating={architectureGenerating}
                architectureRequest={architectureRequest}
                automationSelectedThread={automation.selectedThread}
                changedPaths={changedPaths}
                chatCollapsed={chatCollapsed}
                chatProvider={chatProvider}
                cliModel={cliModel}
                currentView={currentView}
                devPreviewTarget={devPreviewTarget}
                fsWatcherPayload={fsWatcherPayload}
                fsWatcherVersion={fsWatcherVersion}
                isMobile={isMobile}
                mobileTreeTab={mobileTreeTab}
                previewProjectRoot={previewProjectRoot}
                projectFiles={projectFiles}
                projectPreviewRequest={projectPreviewRequest}
                projectRef={projectRef}
                projectRestoreRef={projectRestoreRef}
                projectStateReady={projectStateReady}
                projectTabsState={projectTabsState}
                projectTerminals={projectTerminals}
                showDesktopProject={showDesktopProject}
                showMobileProjectFullscreen={showMobileProjectFullscreen}
                showMobileTerminalFullscreen={showMobileTerminalFullscreen}
                showProjectEditor={showProjectEditor}
                showProjectTree={showProjectTree}
                showTerminal={showTerminal}
                sourceControlRefreshSignal={sourceControlRefreshSignal}
                terminalColumnWidth={terminalColumnWidth}
                terminalFullscreen={terminalFullscreen}
                terminalHeight={terminalHeight}
                terminalHeightBeforeFullscreenRef={terminalHeightBeforeFullscreenRef}
                terminalShells={terminalShells}
                terminalViewRef={terminalViewRef}
                token={token}
                viewMode={viewMode}
                onActiveProjectFileChange={setActiveProjectFileId}
                onApplyDiff={handleApplyProjectDiff}
                onArchitectureOpenChange={setShowArchitecture}
                onArchitectureRenderResult={handleArchitectureRenderResult}
                onAvailableFilesChange={handleAvailableFilesForMentionChange}
                onCloseTerminal={closeTerminalPanel}
                onCreateTerminal={(shell) => {
                  const nodeId = activeProject?.nodeId ?? 'gateway'
                  void createTerminal(
                    activeSessionId ?? 'default',
                    activeProjectRoot ?? undefined,
                    shell,
                    nodeId,
                  ).catch((err) => {
                    const reason = err instanceof Error ? err.message : 'Failed to create terminal'
                    const isRemote = nodeId && nodeId !== 'gateway'
                    toast.error(isRemote ? 'Terminal unavailable on this node' : 'Failed to open terminal', {
                      description: isRemote
                        ? `${reason}. Make sure the node is connected and the project path exists on it.`
                        : reason,
                      duration: 8000,
                    })
                  })
                }}
                onDetachTerminal={handleDetachTerminal}
                onFileDrop={(files) => { void handleFileDrop(files) }}
                onGenerateArchitecture={() => {
                  setArchitectureGenerating(true)
                  handleSuggestion('Analyze the project architecture and generate a mermaid diagram using the architecture.generate tool. Include all major modules, their relationships, data flow, and external dependencies.')
                }}
                onKillTerminal={handleKillTerminal}
                onPreviewOpenChange={handleProjectPreviewOpenChange}
                onReferenceFile={handleReferenceFile}
                onReferenceFileSelection={handleReferenceFileSelection}
                onReferencePreviewElement={handleReferencePreviewElement}
                onReferenceTerminalSelection={handleReferenceTerminalSelection}
                onSetChatCollapsed={setChatCollapsed}
                onSetMobileTreeTab={setMobileTreeTab}
                onSetTerminalFullscreen={setTerminalFullscreen}
                onSetTerminalHeight={setTerminalHeight}
                onTabsStateChange={handleProjectTabsStateChange}
                onTerminalColumnDragStart={handleTerminalColumnDragStart}
                onTerminalDragStart={handleTerminalDragStart}
                onTerminalSelect={setActiveTerminalId}
                onToggleProjectEditor={toggleProjectEditor}
                onToggleProjectTree={toggleProjectTree}
                savedPanelSize={projectUI?.layout?.panelSize ?? null}
                savedTreeSize={projectUI?.layout?.treeSize ?? null}
                onLayoutSizeChange={handleProjectLayoutSizeChange}
              />
            </div>

            {!showMobileProjectFullscreen && !showMobileTerminalFullscreen && (viewMode === 'manager' ? (
              <ManagerWorkspace
                automation={automation}
                automationMessages={automationMessages}
                availableFiles={availableFilesForMention}
                availableSkills={availableSkills}
                chatProvider={managerProvider}
                chatProviderRuntimeMode={managerProviderRuntimeMode}
                chatReasoningEffort={managerReasoningEffort}
                chatResponseStyle={chatResponseStyle}
                cliModel={managerCliModel}
                inputValueRef={inputValueRef}
                inputVersion={inputVersion}
                isMobile={isMobile}
                managerThreads={managerThreads}
                promptInputRef={promptInputRef}
                selectedManagerQueue={selectedManagerQueue}
                selectedRepoOffline={selectedRepoOffline}
                selectedRepoRuntime={selectedRepoRuntime}
                selectedThreadRepoRuntime={selectedThreadRepoRuntime}
                showManagerRepos={showManagerRepos}
                showProject={showProject}
                threadComposerDisabled={threadComposerDisabled}
                threadPlaceholder={threadPlaceholder}
                voiceLevels={voiceLevels}
                voiceRecording={voiceRecording}
                voiceTranscribing={voiceTranscribing}
                onAddRepository={() => automation.setFolderPickerOpen(true)}
                onChangedFileClick={handleChangedFileClick}
                onCliModelChange={handleManagerCliModelChange}
                onDeleteThread={automation.handleDelete}
                onDequeueManagerMessage={dequeueManagerMessage}
                onHandleInputChange={handleInputChange}
                onManagerQueue={handleManagerQueue}
                onMemorySourceOpen={handleOpenMemorySource}
                onMoveRepoToGateway={handleMoveRepoToGateway}
                onOpenManagerPlan={setPlanRepo}
                onOpenManagerStrategy={setStrategyRepo}
                onOpenMessagePath={handleOpenMessagePath}
                onProviderChange={handleManagerProviderChange}
                onProviderRuntimeModeChange={handleManagerProviderRuntimeModeChange}
                onReasoningEffortChange={handleManagerReasoningEffortChange}
                onRefreshThreads={() => { void automation.refresh() }}
                onRemoveRepository={(repoId) => { void automation.removeRepository(repoId) }}
                onReorderManagerQueueItem={reorderManagerQueueItem}
                onResponseStyleChange={handleChatResponseStyleChange}
                onSearchFiles={handleSearchFiles}
                onSelectRepository={automation.setSelectedRepoId}
                onSelectThread={automation.setSelectedThreadId}
                onSendManagerQueueItemToParallelThread={sendManagerQueueItemToParallelThread}
                onSetProjectEditorVisible={setShowProjectEditor}
                onSetProjectVisible={setShowProject}
                onSteerManagerQueueItem={steerManagerQueueItem}
                onStopRecording={() => { void stopRecordingAndTranscribe() }}
                onStopThread={(threadId) => { void automation.handleStop(threadId) }}
                onSubmit={handleSubmit}
                onUpdateManagerQueueItem={updateManagerQueueItem}
                onVoiceInput={handleVoiceInput}
                renderInlineSecretPrompt={renderInlineSecretPrompt}
                inlinePrompts={inlinePrompts}
              />
            ) : <DeveloperChatWorkspace
                activeProject={activeProject}
                activeProjectId={activeProjectId}
                activeProjectDisplayName={activeProjectDisplayName}
                activeProjectRoot={activeProjectRoot}
                activeSessionId={activeSessionId}
                availableFilesForMention={availableFilesForMention}
                availableSkills={availableSkills}
                changedFiles={changedFiles}
                changedFilesForComposer={changedFilesForComposer}
                chatCollapsed={chatCollapsed}
                chatMode={chatMode}
                chatProvider={chatProvider}
                chatProviderRuntimeMode={chatProviderRuntimeMode}
                chatResponseStyle={chatResponseStyle}
                cliModel={cliModel}
                reasoningEffort={chatReasoningEffort}
                contextUsage={contextUsage}
                developerChatPanelStyle={developerChatPanelStyle}
                developerChatSubmitLoading={developerChatSubmitLoading}
                developerChatUiState={developerChatUiState}
                developerComposerControlRow={developerComposerControlRow}
                developerPlaceholder={developerPlaceholder}
                editComposerBag={editComposerBag}
                error={error}
                hasMessages={hasMessages}
                hasMoreMessages={hasMoreMessages}
                hitMaxRounds={hitMaxRounds}
                inputSegments={inputSegments}
                inputValueRef={inputValueRef}
                inputVersion={inputVersion}
                inlinePrompts={inlinePrompts}
                isLoading={isLoading}
                isLoadingHistory={isLoadingHistory}
                isMobile={isMobile}
                loadOlderMessages={loadOlderMessages}
                limitReached={limitReached}
                managerThreads={managerThreads}
                messageContents={messageContents}
                messageQueue={messageQueue}
                messages={messages}
                promptBeforeProcessingQueuedMessage={promptBeforeProcessingQueuedMessage}
                pendingPlan={pendingPlan}
                previewOpen={previewOpen}
                projectNodeId={activeProject?.nodeId}
                projectSuggestions={projectSuggestions}
                projects={projects}
                projectsLoading={projectsLoading}
                promptInputRef={promptInputRef}
                sendTarget={sendTarget}
                sessionInfo={sessionInfo}
                setChatPanelElement={setChatPanelElement}
                showDesktopProject={showDesktopProject}
                showProject={showProject}
                showScreenShare={showScreenShare}
                suggestions={suggestions}
                threadTargetRepoRuntime={threadTargetRepoRuntime}
                token={token}
                todoList={todoList}
                voiceLevels={voiceLevels}
                voiceRecording={voiceRecording}
                voiceTranscribing={voiceTranscribing}
                onAcceptAllFiles={acceptAllFiles}
                onAcceptFile={acceptFile}
                onCancelRequest={handleCancelRequest}
                onChangedFileClick={handleChangedFileClick}
                onChatModeChange={setChatMode}
                onClearTodoList={() => setTodoList([])}
                onCliModelChange={handleCliModelChange}
                onReasoningEffortChange={handleChatReasoningEffortChange}
                onContinueChat={handleContinueChat}
                onDequeueMessage={dequeueMessage}
                onEditPreviousMessage={handleEditPreviousMessage}
                onExecutePlan={executePlan}
                onHandleInputChange={handleInputChange}
                onHandleMemoryFeedback={handleMemoryFeedback}
                onHandleSuggestion={handleSuggestion}
                onMemorySourceOpen={handleOpenMemorySource}
                onMoveRepoToGateway={handleMoveRepoToGateway}
                onOpenAddProject={() => { setProjectPickerMode('project'); setFolderPickerOpen(true) }}
                onOpenMessagePath={handleOpenMessagePath}
                onOpenSourceControl={handleOpenSourceControl}
                onOpenTerminalFromToolCall={handleOpenTerminalFromToolCall}
                onApprovalResponse={respondToApproval}
                onProviderChange={handleChatProviderChange}
                onProviderRuntimeModeChange={handleChatProviderRuntimeModeChange}
                onQueue={handleQueue}
                onRejectAllFiles={rejectAllFiles}
                onRejectFile={rejectFile}
                onRejectPlan={rejectPlan}
                onReorderQueueItem={reorderQueueItem}
                onResponseStyleChange={handleChatResponseStyleChange}
                onSearchFiles={handleSearchFiles}
                onSendTargetChange={setSendTarget}
                onSendQueuedAfterInterruptedExit={handleSendQueuedAfterInterruptedExit}
                onSetApproveAllInSession={setApproveAllInSession}
                onSteerQueuedMessage={isLoading && activeSessionId ? steerQueuedChatMessage : undefined}
                onStopRecording={() => { void stopRecordingAndTranscribe() }}
                onSubmit={handleSubmit}
                onToggleHoldQueueItem={toggleHoldQueueItem}
                onUpdateQueueItem={updateQueueItem}
                onVoiceInput={handleVoiceInput}
                renderInlineSecretPrompt={renderInlineSecretPrompt}
              />
            )}
          </div>
        )}

        {isMobile && currentView === 'chat' && (
          <MobileBottomNav
            activeProjectId={activeProjectId}
            changedFilesCount={changedFiles.length}
            mobileProjectControlState={mobileProjectControlState}
            showProject={showProject}
            showSidebar={showSidebar}
            showTerminal={showTerminal}
            onChatClick={handleMobileChatClick}
            onProjectTargetAction={(target) => { void handleMobileProjectTargetAction(target) }}
          />
        )}

            {/* Terminal panel rendered as sidebar-adjacent column above */}

            {viewMode === 'developer' && showDebugPanel && (
              <div className="fixed top-14 right-0 bottom-0 w-[420px] border-l z-50 shadow-xl">
                <ErrorBoundary name="Debug panel" variant="section" className="h-full" resetKeys={[showDebugPanel, activeSessionId]}>
                  <DebugPanel onClose={() => setShowDebugPanel(false)} />
                </ErrorBoundary>
              </div>
            )}

            {isMobile && (
              <MobileNavDrawer
                open={showMobileToolbar}
                onClose={() => setShowMobileToolbar(false)}
                currentView={currentView}
                onNavigate={(view) => {
                  if (view === 'chat') {
                    handleMobileChatClick()
                  }
                  setCurrentView(view)
                }}
                sessionSelector={
                  <ErrorBoundary name="Project sidebar" variant="section" className="h-full" resetKeys={[activeProjectId, activeSessionId, projects.length, personalSessions.length]}>
                    <SessionSelector
                      projects={projects}
                      personalSessions={personalSessions}
                      activeProjectId={activeProjectId}
                      activeSessionId={activeSessionId}
                      isMobile
                      loading={projectsLoading}
                      hasMoreProjects={hasMoreProjects}
                      showFewerProjects={projects.length > projectListLimit}
                      searchLoading={searchLoading}
                      searchResults={searchResults}
                      onSearch={searchChats}
                      onSelectProject={(projectId) => { setCurrentView('chat'); setShowMobileToolbar(false); void handleSwitchProject(projectId) }}
                      onSelectProjectSession={(projectId, sessionId) => { setCurrentView('chat'); setShowMobileToolbar(false); handleSelectProjectSession(projectId, sessionId) }}
                      onSelectPersonalSession={(sessionId) => { setCurrentView('chat'); setShowMobileToolbar(false); void handleSelectPersonalSession(sessionId) }}
                      onArchiveSession={(sessionId) => { void handleArchiveSession(sessionId) }}
                      onMoveSession={(sessionId, projectId) => { void moveSession(sessionId, projectId) }}
                      onSearchProjects={searchProjects}
                      onNewPersonalSession={() => { setCurrentView('chat'); setShowMobileToolbar(false); void createSession(null) }}
                      onCreateProject={handleCreateProject}
                      onCreateFolder={(parentId) => { setShowMobileToolbar(false); handleCreateFolder(parentId) }}
                      onEditProject={(projectId) => { setShowMobileToolbar(false); setContextDialogTarget({ mode: 'edit', projectId }) }}
                      onMoveProject={(projectId, parentId) => { void handleMoveProject(projectId, parentId) }}
                      onRemoveProject={(projectId) => { void handleRemoveProject(projectId) }}
                      onChangeDirectory={handleChangeDirectory}
                      onAssignRepository={(projectId) => { void handleAssignProjectRepository(projectId) }}
                      onShowMore={showMoreProjects}
                      onShowFewer={showFewerProjects}
                      onDismiss={() => { setCurrentView('chat'); setShowMobileToolbar(false) }}
                      sessionInfo={sessionInfo}
                      nodes={fsNodes}
                      repositories={automation.repositories}
                      streamingSessionIds={streamingSessionIds}
                    />
                  </ErrorBoundary>
                }
                onOpenSettings={() => setCurrentView('settings')}
              />
            )}
          </>
        )}

        <ProjectContextDialog
          open={contextDialogTarget !== null}
          onOpenChange={(open) => { if (!open) setContextDialogTarget(null) }}
          project={contextDialogProject}
          mode={contextDialogTarget?.mode ?? 'edit'}
          ancestors={contextDialogAncestors}
          repositories={automation.repositories}
          onSave={handleSaveProjectContext}
        />

        <AuthOverlays
          requiresAuthGate={requiresAuthGate}
          isElectron={isElectron}
          showLoginDialog={showLoginDialog}
          onShowLoginDialogChange={setShowLoginDialog}
          authFormProps={authFormProps}
        />

        <AppFolderPickers
          projectOpen={folderPickerOpen}
          onProjectOpenChange={(open) => { setFolderPickerOpen(open); if (!open) setChangeDirectoryProjectId(null) }}
          projectInitialPath={settings.project_picker_path}
          projectInitialNodeId={settings.project_picker_node_id}
          onProjectSelect={(path, nodeId) => {
            void handleProjectFolderSelected(path, nodeId).catch((err) => {
              console.error('Failed to select project:', err)
              toast.error(`Failed to select project: ${err instanceof Error ? err.message : 'Unknown error'}`)
            })
          }}
          automationOpen={automation.folderPickerOpen}
          onAutomationOpenChange={automation.setFolderPickerOpen}
          onAutomationSelect={(path, nodeId) => { void automation.handleFolderSelected(path, nodeId) }}
        />

        <AutomationModals
          strategyRepo={strategyRepo}
          onStrategyRepoChange={setStrategyRepo}
          planRepo={planRepo}
          onPlanRepoChange={setPlanRepo}
          provider={managerProvider}
          runtimeMode={managerProviderRuntimeMode}
          model={managerCliModel}
        />

        {secretInput.backgroundRequest && (
          <BackgroundSecretPrompt
            request={secretInput.backgroundRequest}
            submitting={secretInput.submitting}
            onSubmit={secretInput.submitSecretRequest}
            onCancel={secretInput.cancelSecretRequest}
            onOpenChat={(sessionId) => { void handleOpenSecretChat(sessionId) }}
          />
        )}

        {/* Floating screen share window */}
        {showScreenShare && (
          <FloatingScreenShareWindow
            screenShare={screenShare}
            floatingSSPos={floatingSSPos}
            floatingSSSize={floatingSSSize}
            onFloatingDragStart={onFloatingDragStart}
            onFloatingResizeStart={onFloatingResizeStart}
            onClose={closeScreenSharePanel}
          />
        )}

      </div>

      {/* Voice overlay removed — voice controls are now inline in the header */}
    </TooltipProvider>
  )
}

export default App
