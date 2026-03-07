import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Calendar,
  Bug,
  Bot,
  Cast,
  FolderTree,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  Terminal as TerminalIcon,
  Wifi,
  X,
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
import { ConsentQueue } from '@/components/consent'
import { SSEDebugPanel } from '@/components/debug/sse-debug-panel'
import { JobsPage } from '@/components/jobs'
import { AutomationPage } from '@/components/automation'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { NetworkPanel } from '@/components/network'
import { ScreenSharePanel } from '@/components/screen-share'
import { useScreenShare } from '@/hooks/useScreenShare'
import { TerminalTabs, TerminalView, useTerminals } from '@/components/terminal'
import { WorkspacePanel, workspaceLanguageForPath, DiffView, type WorkspaceFile, type WorkspacePanelHandle } from '@/components/workspace'
import { createActivityEvent, type ActivityEvent } from '@jait/ui-shared'
import { ModelIcon, getModelDisplayName } from '@/components/icons/model-icons'
import { useAuth, type ThemeMode } from '@/hooks/useAuth'
import { useChat, type ChatMode } from '@/hooks/useChat'
import { useModelInfo } from '@/hooks/useModelInfo'
import { useSessions } from '@/hooks/useSessions'
import { useUICommands } from '@/hooks/useUICommands'
import { useSessionState } from '@/hooks/useSessionState'
import type { WorkspaceOpenData, TerminalFocusData } from '@jait/shared'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/useIsMobile'

const API_URL = import.meta.env.VITE_API_URL || ''

type AppView = 'chat' | 'automation' | 'jobs' | 'network' | 'settings'

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

function App() {
  const [inputValue, setInputValue] = useState('')
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<AppView>('chat')
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [showSidebar, setShowSidebar] = useState(() => localStorage.getItem('showSessionsSidebar') === 'true')
  const [showTerminal, setShowTerminal] = useState(false)
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [showScreenShare, setShowScreenShare] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(() => localStorage.getItem('showDebugPanel') === 'true')
  const [terminalHeight, setTerminalHeight] = useState(280)
  const [screenShareChatWidth, setScreenShareChatWidth] = useState<number | null>(null)
  const screenShareDragging = useRef(false)
  const [approveAllInSession, setApproveAllInSession] = useState(false)
  const [chatMode, setChatMode] = useState<ChatMode>(() => (localStorage.getItem('chatMode') as ChatMode) || 'agent')
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('')
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const [activeWorkspaceFileId, setActiveWorkspaceFileId] = useState<string | null>(null)
  const [availableFilesForMention, setAvailableFilesForMention] = useState<{ path: string; name: string }[]>([])
  const [activeDiff, setActiveDiff] = useState<{
    filePath: string
    originalContent: string
    modifiedContent: string
    language: string
  } | null>(null)
  const isDragging = useRef(false)
  const workspaceRef = useRef<WorkspacePanelHandle>(null)
  const promptInputRef = useRef<PromptInputHandle>(null)
  const isMobile = useIsMobile()
  const showDesktopWorkspace = !isMobile && showWorkspace
  const showDesktopScreenShare = !isMobile && showScreenShare

  const onScreenShareDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    screenShareDragging.current = true
    const startX = e.clientX
    const startWidth = screenShareChatWidth
    const onMove = (ev: MouseEvent) => {
      if (!screenShareDragging.current) return
      // Dragging the handle LEFT makes chat wider, RIGHT makes it narrower
      const delta = startX - ev.clientX
      setScreenShareChatWidth(Math.min(800, Math.max(240, (startWidth ?? 320) + delta)))
    }
    const onUp = () => {
      screenShareDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [screenShareChatWidth])

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

  const onLoginRequired = useCallback(() => setShowLoginDialog(true), [])

  const { sessions, activeSessionId, createSession, switchSession, archiveSession, fetchSessions } = useSessions(
    token,
    onLoginRequired,
  )
  const {
    messages,
    isLoading,
    remainingPrompts,
    error,
    hitMaxRounds,
    pendingPlan,
    todoList,
    changedFiles,
    messageQueue,
    sendMessage,
    restartFromMessage,
    cancelRequest,
    clearMessages,
    continueChat,
    executePlan,
    rejectPlan,
    enqueueMessage,
    dequeueMessage,
    acceptFile,
    rejectFile,
    acceptAllFiles,
    rejectAllFiles,
    setTodoList,
    addChangedFile,
    setChangedFiles,
    setOnChangedFilesSync,
  } = useChat(activeSessionId, token, onLoginRequired)
  const { terminals, activeTerminalId, setActiveTerminalId, createTerminal, killTerminal, refresh } = useTerminals()
  const { provider, model } = useModelInfo()

  // ── Screen share (always active so Electron auto-registers) ───────
  const screenShare = useScreenShare({ token })

  // ── UI command channel (server ↔ frontend via WebSocket) ──────────
  const [activeWorkspace, setActiveWorkspace] = useState<{ surfaceId: string; workspaceRoot: string } | null>(null)

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
    listeners: {
      'workspace.open': useCallback((data: WorkspaceOpenData) => {
        setActiveWorkspace({ surfaceId: data.surfaceId, workspaceRoot: data.workspaceRoot })
        setSavedWorkspace({ open: true, remotePath: data.workspaceRoot, surfaceId: data.surfaceId })
      }, [setSavedWorkspace]),
      'workspace.close': useCallback(() => {
        setActiveWorkspace(null)
        setShowWorkspace(false)
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

  const handleOpenWorkspace = useCallback(async () => {
    if (showWorkspace) {
      // Already open — close it
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

    // Helper: create a filesystem surface on the gateway so ALL clients
    // can browse the directory remotely (enables cross-device sync).
    const openRemoteWorkspaceOnGateway = async (dirPath: string) => {
      const res = await fetch(`${API_URL}/api/workspace/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath, sessionId: activeSessionId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error((err as { message?: string }).message ?? 'Failed to open workspace')
      }
      // The gateway broadcasts `workspace.open` via WS and persists state.
      // All clients (including this one) will receive it and hydrate automatically.
    }

    // ── Electron: use native OS dialog → absolute path → POST to gateway ──
    if (window.jaitDesktop?.pickDirectory) {
      try {
        const result = await window.jaitDesktop.pickDirectory()
        if (!result) return // user cancelled
        await openRemoteWorkspaceOnGateway(result.path)
      } catch (err) {
        console.error('Failed to open workspace via Electron picker:', err)
      }
      return
    }

    // ── Browser: try showDirectoryPicker for local-only fallback,
    //    but also POST to gateway so other clients can browse remotely.
    const w = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
    if (!w.showDirectoryPicker) {
      // No directory picker available — prompt for a server-side path
      const dirPath = window.prompt('Enter the absolute directory path on the server:')
      if (!dirPath) return
      try {
        await openRemoteWorkspaceOnGateway(dirPath)
      } catch (err) {
        window.alert(`Failed to open workspace: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
      return
    }

    try {
      const dirHandle = await w.showDirectoryPicker()
      // Browser picker mode is local-only because no absolute server path is available.
      setShowWorkspace(true)
      setSavedWorkspace({ open: true, remotePath: '' })
      sendUIState('workspace.panel', { open: true }, activeSessionId)
      setTimeout(() => {
        workspaceRef.current?.openDirectory(dirHandle)
      }, 50)
    } catch {
      // User cancelled the picker — do nothing
    }
  }, [showWorkspace, activeWorkspace, closeWorkspacePanel, setSavedWorkspace, sendUIState, activeSessionId])

  // Auto-open workspace panel when a filesystem surface starts
  useEffect(() => {
    if (!activeWorkspace) return
    if (!showWorkspace) setShowWorkspace(true)
  }, [activeWorkspace]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open workspace panel when the agent modifies files
  useEffect(() => {
    if (changedFiles.length === 0) return
    if (!showWorkspace) setShowWorkspace(true)
  }, [changedFiles.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setThemeMode(settings.theme)
  }, [settings.theme])

  useEffect(() => {
    applyTheme(themeMode)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemThemeChanged = () => {
      if (themeMode === 'system') applyTheme('system')
    }
    media.addEventListener('change', onSystemThemeChanged)
    return () => media.removeEventListener('change', onSystemThemeChanged)
  }, [themeMode])

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setShowLoginDialog(true)
    }
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    if (isAuthenticated && activeSessionId) bindSession(activeSessionId)
  }, [isAuthenticated, activeSessionId, bindSession])

  useEffect(() => {
    if (error === 'login_required') setShowLoginDialog(true)
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

  const handleSubmit = async (chipFiles?: ReferencedFile[]) => {
    if (!inputValue.trim() && (!chipFiles || chipFiles.length === 0)) return
    if (!token) {
      setShowLoginDialog(true)
      return
    }

    // Steering: if the model is currently generating, queue the message
    if (isLoading) {
      enqueueMessage(inputValue.trim())
      setInputValue('')
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
      onLoginRequired: () => setShowLoginDialog(true),
      ...(refs ? { displayContent, referencedFiles: refs } : {}),
    })
    setInputValue('')
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
    sendMessage(suggestion, { token, sessionId: sid, mode: chatMode, onLoginRequired: () => setShowLoginDialog(true) })
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
      onLoginRequired: () => setShowLoginDialog(true),
    })
  }, [activeSessionId, restartFromMessage, token])

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

  const handleVoiceInput = useCallback(async () => {
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

    const spoken = window.prompt('Speak now (simulated transcript):')?.trim()
    if (!spoken) return

    try {
      const res = await fetch(`${API_URL}/api/voice/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, transcript: spoken }),
      })
      const data = (await res.json()) as { text?: string }
      if (data.text) {
        sendMessage(data.text, { token, sessionId: sid, onLoginRequired: () => setShowLoginDialog(true) })
      }
    } catch {
      // noop
    }
  }, [token, activeSessionId, createSession, sendMessage])

  const limitReached = error === 'limit_reached'
  const hasMessages = messages.length > 0
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
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between h-14 px-5 border-b shrink-0">
          <div className="flex items-center gap-6">
            <span className="text-base font-medium tracking-tight">Jait</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSidebar(s => !s)}>
                  {showSidebar ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Sessions</TooltipContent>
            </Tooltip>
            <nav className="flex items-center gap-1">
              <Button
                variant={currentView === 'chat' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setCurrentView('chat')}
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Chat
              </Button>
              <Button
                variant={currentView === 'automation' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setCurrentView('automation')}
              >
                <Bot className="h-3.5 w-3.5 mr-1.5" />
                Automation
              </Button>
              <Button
                variant={currentView === 'jobs' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setCurrentView('jobs')}
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                Jobs
              </Button>
              <Button
                variant={currentView === 'network' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setCurrentView('network')}
              >
                <Wifi className="h-3.5 w-3.5 mr-1.5" />
                Network
              </Button>

            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            {model && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 mr-2 px-2 py-1 rounded-md bg-muted/50 cursor-default">
                    <ModelIcon provider={provider ?? 'ollama'} model={model} size={16} />
                    <span className="text-xs text-muted-foreground">{getModelDisplayName(model)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">{model}</TooltipContent>
              </Tooltip>
            )}
            {remainingPrompts !== null && remainingPrompts <= 5 && (
              <span className="text-xs text-muted-foreground mr-2">{remainingPrompts} remaining</span>
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
          </div>
        </header>

        {/* Chat-specific toolbar */}
        {currentView === 'chat' && (
          <div className="flex items-center gap-1 px-5 h-9 border-b shrink-0 bg-muted/30">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showTerminal ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => { void handleToggleTerminal() }}
                >
                  <TerminalIcon className="h-3 w-3 mr-1" />
                  Terminal
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Toggle terminal panel</TooltipContent>
            </Tooltip>
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
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open workspace</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showDebugPanel ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => setShowDebugPanel(d => !d)}
                >
                  <Bug className="h-3 w-3 mr-1" />
                  Debug
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">SSE debug stream</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showScreenShare ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => showScreenShare ? closeScreenSharePanel() : openScreenSharePanel()}
                >
                  <Cast className="h-3 w-3 mr-1" />
                  Share
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Screen sharing</TooltipContent>
            </Tooltip>
          </div>
        )}

        {currentView === 'automation' ? (
          <div className="flex-1 overflow-y-auto">
            <AutomationPage />
          </div>
        ) : currentView === 'jobs' ? (
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
              onClearArchive={handleClearArchive}
              activityEvents={activityEvents}
            />
          </div>
        ) : (
          <div className={`flex flex-1 min-h-0 overflow-hidden ${isMobile ? 'flex-col' : ''}`}>
            {showSidebar && (
              <aside className={isMobile ? 'h-52 border-b shrink-0' : 'w-56 border-r shrink-0'}>
                <SessionSelector
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  onSelect={switchSession}
                  onCreate={() => createSession()}
                  onArchive={archiveSession}
                />
              </aside>
            )}

            {showDesktopWorkspace && !activeDiff && (
              <WorkspacePanel
                ref={workspaceRef}
                autoOpenRemotePath={activeWorkspace?.workspaceRoot ?? null}
                files={workspaceFiles}
                activeFileId={activeWorkspaceFileId}
                onActiveFileChange={setActiveWorkspaceFileId}
                onFileDrop={(files) => { void handleFileDrop(files) }}
                onReferenceFile={(file) => promptInputRef.current?.insertChip({ path: file.path, name: file.name })}
                onAvailableFilesChange={setAvailableFilesForMention}
              />
            )}

            {showDesktopWorkspace && activeDiff && (
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

            {showDesktopScreenShare && (
              <aside className="flex-[3] min-w-0 border-r bg-background overflow-hidden flex flex-col">
                <div className="flex items-center justify-between h-9 px-3 border-b bg-muted/30 shrink-0">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <Cast className="h-3 w-3" /> Screen Share
                  </span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={closeScreenSharePanel}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <ScreenSharePanel screenShare={screenShare} />
              </aside>
            )}

            {showDesktopScreenShare && (
              <div
                className="w-1 shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
                onMouseDown={onScreenShareDragStart}
              />
            )}

            {!hasMessages ? (
              <div className={`${showDesktopScreenShare ? (screenShareChatWidth == null ? 'flex-[2]' : '') : 'flex-1'} min-w-0 flex flex-col items-center justify-center px-4 transition-all duration-300 ease-out`}
                style={showDesktopScreenShare && screenShareChatWidth != null ? { width: screenShareChatWidth, flexShrink: 0 } : undefined}>
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
                    isLoading={isLoading}
                    onVoiceInput={handleVoiceInput}
                    mode={chatMode}
                    onModeChange={setChatMode}
                    availableFiles={availableFilesForMention}
                    onSearchFiles={handleSearchFiles}
                    workspaceOpen={showWorkspace}
                  />
                </div>
              </div>
            ) : (
              <div className={`flex flex-col ${showDesktopScreenShare ? (screenShareChatWidth == null ? 'flex-[2]' : '') : 'flex-1'} min-w-0 min-h-0 transition-all duration-300 ease-out`}
                style={showDesktopScreenShare && screenShareChatWidth != null ? { width: screenShareChatWidth, flexShrink: 0 } : undefined}>
                <Conversation className="min-h-0 flex-1 border-b" compact={showDesktopWorkspace || showDesktopScreenShare}>
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
                      isStreaming={isLoading && msg === messages[messages.length - 1]}
                      compact={showWorkspace || showScreenShare}
                      onOpenTerminal={handleOpenTerminalFromToolCall}
                      onEditMessage={handleEditPreviousMessage}
                    />
                  ))}
                </Conversation>

                <div className={`shrink-0 py-3 ${(showDesktopWorkspace || showDesktopScreenShare) ? 'px-3' : 'px-4'}`}>
                  <div className={`mx-auto space-y-1.5 ${(showDesktopWorkspace || showDesktopScreenShare) ? 'max-w-none' : 'max-w-3xl'}`}>
                    {todoList.length > 0 && (
                      <TodoList items={todoList} />
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
                      />
                    )}
                    <PromptInput
                      ref={promptInputRef}
                      value={inputValue}
                      onChange={setInputValue}
                      onSubmit={handleSubmit}
                      onStop={cancelRequest}
                      isLoading={isLoading}
                      disabled={limitReached}
                      onVoiceInput={handleVoiceInput}
                      mode={chatMode}
                      onModeChange={setChatMode}
                      availableFiles={availableFilesForMention}
                      onSearchFiles={handleSearchFiles}
                      workspaceOpen={showWorkspace}
                    />
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <button onClick={() => { clearMessages(); createSession() }} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0">
                          New chat
                        </button>
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

        {showTerminal && currentView === 'chat' && (
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

        {showDebugPanel && (
          <div className="fixed top-14 right-0 bottom-0 w-[420px] border-l z-50 shadow-xl">
            <SSEDebugPanel onClose={() => setShowDebugPanel(false)} />
          </div>
        )}

        <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Account</DialogTitle>
              <DialogDescription>
                Sign in with a username and password.
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
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

export default App
