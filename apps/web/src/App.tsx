import { useState, useEffect, useCallback, useRef } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { Sun, Moon, LogOut, MessageSquare, Calendar, PanelLeftOpen, PanelLeftClose, Terminal as TerminalIcon, Bug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Conversation, Message, PromptInput, SessionSelector, Suggestions } from '@/components/chat'
import { TerminalView, TerminalTabs, useTerminals } from '@/components/terminal'
import { ConsentQueue } from '@/components/consent'
import { JobsPage } from '@/components/jobs'
import { SSEDebugPanel } from '@/components/debug/sse-debug-panel'
import { useAuth } from '@/hooks/useAuth'
import { useChat } from '@/hooks/useChat'
import { useSessions } from '@/hooks/useSessions'
import { useModelInfo } from '@/hooks/useModelInfo'
import { ModelIcon, getModelDisplayName } from '@/components/icons/model-icons'

type AppView = 'chat' | 'jobs'
const API_URL = import.meta.env.VITE_API_URL || ''

function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return { dark, toggle: () => setDark(d => !d) }
}

const suggestions = [
  'What can you help me with?',
  'Explain quantum computing',
  'Write a Python script',
  'What time is it?',
]

function App() {
  const [inputValue, setInputValue] = useState('')
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [currentView, setCurrentView] = useState<AppView>('chat')
  const [showSidebar, setShowSidebar] = useState(() => localStorage.getItem('showSessionsSidebar') === 'true')
  const [showTerminal, setShowTerminal] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(() => localStorage.getItem('showDebugPanel') === 'true')
  const [terminalHeight, setTerminalHeight] = useState(280)
  const [approveAllInSession, setApproveAllInSession] = useState(false)
  const isDragging = useRef(false)
  const { dark, toggle: toggleTheme } = useTheme()

  useEffect(() => {
    localStorage.setItem('showSessionsSidebar', showSidebar ? 'true' : 'false')
  }, [showSidebar])

  useEffect(() => {
    localStorage.setItem('showDebugPanel', showDebugPanel ? 'true' : 'false')
  }, [showDebugPanel])

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

  const { user, token, isAuthenticated, loginWithGoogle, logout, bindSession } = useAuth()
  const { sessions, activeSessionId, createSession, switchSession, archiveSession } = useSessions()
  const { messages, isLoading, remainingPrompts, error, sendMessage, restartFromMessage, cancelRequest, clearMessages } = useChat(activeSessionId)
  const { terminals, activeTerminalId, setActiveTerminalId, createTerminal, killTerminal, refresh } = useTerminals()
  const { provider, model } = useModelInfo()

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

  const limitReached = error === 'limit_reached'

  const handleSubmit = async () => {
    if (!inputValue.trim() || isLoading) return
    let sid = activeSessionId
    if (!sid) {
      const session = await createSession()
      sid = session?.id ?? null
    }
    if (!sid) return
    sendMessage(inputValue.trim(), { token, sessionId: sid, onLoginRequired: () => setShowLoginDialog(true) })
    setInputValue('')
  }

  const handleSuggestion = async (suggestion: string) => {
    let sid = activeSessionId
    if (!sid) {
      const session = await createSession()
      sid = session?.id ?? null
    }
    if (!sid) return
    sendMessage(suggestion, { token, sessionId: sid, onLoginRequired: () => setShowLoginDialog(true) })
  }

  const handleEditPreviousMessage = useCallback(async (
    messageId: string,
    newContent: string,
    messageIndex?: number,
    messageFromEnd?: number,
  ) => {
    if (!activeSessionId) return
    await restartFromMessage(messageId, newContent, messageIndex, messageFromEnd, {
      token,
      sessionId: activeSessionId,
      onLoginRequired: () => setShowLoginDialog(true),
    })
  }, [activeSessionId, restartFromMessage, token])

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (credentialResponse.credential) {
      try {
        await loginWithGoogle(credentialResponse.credential)
        setShowLoginDialog(false)
      } catch (err) {
        console.error('Login failed:', err)
      }
    }
  }

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
    setShowTerminal(true)
    await ensureActiveTerminal(terminalId)
  }, [ensureActiveTerminal])

  const handleToggleTerminal = useCallback(async () => {
    if (showTerminal) {
      setShowTerminal(false)
      return
    }
    setCurrentView('chat')
    setShowTerminal(true)
    await ensureActiveTerminal()
  }, [showTerminal, ensureActiveTerminal])

  const handleKillTerminal = useCallback(async (id: string) => {
    const isLastTerminal = terminals.length === 1 && terminals[0]?.id === id
    await killTerminal(id)
    if (isLastTerminal) {
      setShowTerminal(false)
    }
  }, [terminals, killTerminal])

  const hasMessages = messages.length > 0

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

  return (
    <TooltipProvider>
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between h-14 px-5 border-b shrink-0">
          <div className="flex items-center gap-6">
            <span className="text-base font-medium tracking-tight">Jait</span>
            {/* Sidebar toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSidebar(s => !s)}>
                  {showSidebar ? (
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  ) : (
                    <PanelLeftOpen className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Sessions</TooltipContent>
            </Tooltip>
            {/* Navigation */}
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
                variant={currentView === 'jobs' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setCurrentView('jobs')}
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                Jobs
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showTerminal ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => { void handleToggleTerminal() }}
                  >
                    <TerminalIcon className="h-3.5 w-3.5 mr-1.5" />
                    Terminal
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle terminal panel</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showDebugPanel ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setShowDebugPanel(d => !d)}
                  >
                    <Bug className="h-3.5 w-3.5 mr-1.5" />
                    Debug
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">SSE debug stream</TooltipContent>
              </Tooltip>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
                  {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Toggle theme</TooltipContent>
            </Tooltip>
            {isAuthenticated ? (
              <div className="flex items-center gap-1.5">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={user?.picture || undefined} />
                  <AvatarFallback className="text-[10px]">{user?.name?.[0] || '?'}</AvatarFallback>
                </Avatar>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Sign out</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowLoginDialog(true)}>
                Sign in
              </Button>
            )}
          </div>
        </header>

        {/* Jobs View */}
        {currentView === 'jobs' ? (
          <div className="flex-1 overflow-y-auto">
            <JobsPage />
          </div>
        ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Session Sidebar */}
          {showSidebar && (
            <aside className="w-56 border-r shrink-0">
              <SessionSelector
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelect={switchSession}
                onCreate={() => createSession()}
                onArchive={archiveSession}
              />
            </aside>
          )}

          {/* Chat area */}
          {!hasMessages ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-3xl space-y-8">
              <div className="text-center">
                <h1 className="text-3xl font-semibold tracking-tight">Jait</h1>
                <p className="text-base text-muted-foreground mt-1">Just Another Intelligent Tool</p>
              </div>
              <Suggestions suggestions={suggestions} onSelect={handleSuggestion} />
              <PromptInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                isLoading={isLoading}
              />
              {!isAuthenticated ? (
                <p className="text-center text-xs text-muted-foreground">
                  {remainingPrompts} free prompts.{' '}
                  <button onClick={() => setShowLoginDialog(true)} className="underline underline-offset-2 hover:text-foreground">
                    Sign in
                  </button>{' '}for more.
                </p>
              ) : remainingPrompts !== null ? (
                <p className="text-center text-xs text-muted-foreground">
                  {remainingPrompts} prompts remaining today
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <Conversation className="min-h-0 flex-1 border-b">
              {messages.map((msg, idx) => (
                <Message
                  key={msg.id}
                  messageId={msg.id}
                  messageIndex={idx}
                  messageFromEnd={messages.length - 1 - idx}
                  role={msg.role}
                  content={msg.content}
                  thinking={msg.thinking}
                  thinkingDuration={msg.thinkingDuration}
                  toolCalls={msg.toolCalls}
                  isStreaming={isLoading && msg === messages[messages.length - 1]}
                  onOpenTerminal={handleOpenTerminalFromToolCall}
                  onEditMessage={handleEditPreviousMessage}
                />
              ))}
            </Conversation>

            <div className="shrink-0 px-4 py-3">
              <div className="max-w-3xl mx-auto space-y-1.5">
                {/* Consent queue — shows pending approval requests */}
                <ConsentQueue
                  compact
                  sessionId={activeSessionId}
                  onApproveAllEnabled={() => setApproveAllInSession(true)}
                />
                {limitReached && (
                  <p className="text-center text-sm text-destructive">
                    Daily limit reached. Come back tomorrow.
                  </p>
                )}
                <PromptInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  onStop={cancelRequest}
                  isLoading={isLoading}
                  disabled={limitReached}
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
                    <span className="text-[11px] text-muted-foreground shrink-0">{remainingPrompts} remaining{isAuthenticated ? ' today' : ''}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
        }
        </div>
        )}

        {/* Terminal Panel */}
        {showTerminal && currentView === 'chat' && (
          <div className="shrink-0 border-t overflow-hidden" style={{ height: terminalHeight }}>
            {/* Drag handle */}
            <div
              onMouseDown={handleDragStart}
              className="h-1 cursor-row-resize hover:bg-primary/30 transition-colors"
            />
            <TerminalTabs
              terminals={terminals}
              activeTerminalId={activeTerminalId}
              onSelect={setActiveTerminalId}
              onCreate={() => createTerminal(activeSessionId ?? 'default')}
              onKill={handleKillTerminal}
            />
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

        {/* SSE Debug Panel — right sidebar */}
        {showDebugPanel && (
          <div className="fixed top-14 right-0 bottom-0 w-[420px] border-l z-50 shadow-xl">
            <SSEDebugPanel onClose={() => setShowDebugPanel(false)} />
          </div>
        )}

        {/* Login */}
        <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Sign in</DialogTitle>
              <DialogDescription>
                {error === 'login_required'
                  ? 'Free prompt limit reached. Sign in for unlimited access.'
                  : 'Sign in for unlimited access.'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center pt-2">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => console.error('Login failed')}
                theme={dark ? 'filled_black' : 'outline'}
                size="large"
                text="signin_with"
                shape="rectangular"
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

export default App
