import { useState, useEffect } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { Sun, Moon, LogOut, MessageSquare, Calendar, PanelLeft, Terminal as TerminalIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Conversation, Message, PromptInput, SessionSelector, Suggestions } from '@/components/chat'
import { TerminalView, TerminalTabs, useTerminals } from '@/components/terminal'
import { JobsPage } from '@/components/jobs'
import { useAuth } from '@/hooks/useAuth'
import { useChat } from '@/hooks/useChat'
import { useSessions } from '@/hooks/useSessions'

type AppView = 'chat' | 'jobs'

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
  const [showSidebar, setShowSidebar] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const { dark, toggle: toggleTheme } = useTheme()

  const { user, token, isAuthenticated, loginWithGoogle, logout, bindSession } = useAuth()
  const { messages, isLoading, sessionId, remainingPrompts, error, sendMessage, cancelRequest, clearMessages } = useChat()
  const { sessions, activeSessionId, createSession, switchSession, archiveSession } = useSessions()
  const { terminals, activeTerminalId, setActiveTerminalId, createTerminal, killTerminal } = useTerminals()

  useEffect(() => {
    if (isAuthenticated && sessionId) bindSession(sessionId)
  }, [isAuthenticated, sessionId, bindSession])

  useEffect(() => {
    if (error === 'login_required') setShowLoginDialog(true)
  }, [error])

  const limitReached = error === 'limit_reached'

  const handleSubmit = () => {
    if (!inputValue.trim() || isLoading) return
    sendMessage(inputValue.trim(), { token, onLoginRequired: () => setShowLoginDialog(true) })
    setInputValue('')
  }

  const handleSuggestion = (suggestion: string) => {
    sendMessage(suggestion, { token, onLoginRequired: () => setShowLoginDialog(true) })
  }

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

  const hasMessages = messages.length > 0

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
                  <PanelLeft className="h-3.5 w-3.5" />
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
                    onClick={() => setShowTerminal(s => !s)}
                  >
                    <TerminalIcon className="h-3.5 w-3.5 mr-1.5" />
                    Terminal
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle terminal panel</TooltipContent>
              </Tooltip>
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
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
        <div className="flex flex-1 min-h-0">
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
          <>
            <Conversation className="min-h-0 flex-1 border-b">
              {messages.map((msg) => (
                <Message
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  thinking={msg.thinking}
                  thinkingDuration={msg.thinkingDuration}
                  toolCalls={msg.toolCalls}
                  isStreaming={isLoading && msg === messages[messages.length - 1]}
                />
              ))}
            </Conversation>

            <div className="shrink-0 px-4 py-3">
              <div className="max-w-3xl mx-auto space-y-1.5">
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
                <div className="flex justify-between px-1">
                  <button onClick={clearMessages} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    Clear
                  </button>
                  {remainingPrompts !== null && (
                    <span className="text-[11px] text-muted-foreground">{remainingPrompts} remaining{isAuthenticated ? ' today' : ''}</span>
                  )}
                </div>
              </div>
            </div>
          </>
        )
        }
        </div>
        )}

        {/* Terminal Panel */}
        {showTerminal && currentView === 'chat' && (
          <div className="shrink-0 border-t" style={{ height: 280 }}>
            <TerminalTabs
              terminals={terminals}
              activeTerminalId={activeTerminalId}
              onSelect={setActiveTerminalId}
              onCreate={() => createTerminal(activeSessionId ?? 'default')}
              onKill={killTerminal}
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
