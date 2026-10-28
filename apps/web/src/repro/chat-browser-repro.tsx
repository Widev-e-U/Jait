import { useState } from 'react'
import { useUserQuestionPrompt } from '@/components/prompts/input-prompts'
import { Conversation } from '@/components/chat/conversation'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createRoot } from 'react-dom/client'
import { AgentToolCallWrapper, SubAgentAuthProvider, type ToolCallInfo } from '@/components/chat/tool-call-card'
import '@/index.css'
const call: ToolCallInfo = {
  callId: 'navigate', startedAt: Date.now(), tool: 'mcp__jait__browser_navigate', args: { url: 'https://example.com/login' }, status: 'success',
  result: { ok: true, message: 'Navigated', data: { browserId: 'browser-chat-fixture', title: 'Sign in', url: 'https://example.com/login', browserSession: { sessionId: 'chat-fixture', controller: 'agent', previewUrl: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify' } } },
}
const fixture = Reflect.get(window, '__chatBrowserFixture') as { sessionId: string; call: ToolCallInfo; initiallyUnused?: boolean; messageCount?: number } | undefined
function BrowserChatFixture() {
  const mobileHeader = new URLSearchParams(location.search).has('mobile-header')
  const workspace = new URLSearchParams(location.search).has('workspace')
  const [started, setStarted] = useState(!fixture?.initiallyUnused)
  const [extraActions, setExtraActions] = useState(0)
  const [otherChat, setOtherChat] = useState(false)
  const [userSends, setUserSends] = useState(0)
  const sessionId = fixture?.sessionId ?? 'chat-fixture'
  const firstCall = fixture?.call ?? call
  const handoff = useUserQuestionPrompt({ token: new URLSearchParams(location.search).has('handoff') ? 'fixture-token' : null, sessionId: otherChat ? 'other-chat' : sessionId })
  const messages = started ? [
    { id: 'first', content: '', toolCalls: [firstCall] },
    ...Array.from({ length: fixture?.messageCount ?? 30 }, (_, index) => ({ id: `text-${index}`, content: `Chat message ${index}`, toolCalls: [] })),
    ...Array.from({ length: userSends }, (_, index) => ({ id: `user-${index}`, role: 'user' as const, content: `User message ${index}`, toolCalls: [] })),
    ...Array.from({ length: extraActions }, (_, index) => ({ id: `action-${index}`, content: '', toolCalls: [{ ...firstCall, callId: `click-${index}`, tool: 'browser.click', args: { selector: '#next' } }] })),
  ] : [{ id: 'intro', content: 'Open a page in the browser to begin.', toolCalls: [] }]
  const chat = <main data-browser-chat-scope className="mx-auto flex h-screen w-full max-w-3xl flex-col p-4">
    {mobileHeader && <header data-app-header className="fixed inset-x-2 top-2 z-40 h-10 rounded-2xl border bg-background">Mobile app header</header>}
    {!mobileHeader && <h1 className="mb-4 text-xl">Browser in chat</h1>}
    <div className={mobileHeader ? 'hidden' : 'flex gap-3 pb-2'}>
      <button onClick={() => { setStarted(true); setExtraActions(value => value + 1) }}>{started ? 'Another browser action' : 'Open browser'}</button>
      <button onClick={() => setUserSends(value => value + 1)}>Send user message</button>
      <button onClick={() => setOtherChat(value => !value)}>Switch chat</button>
    </div>
    <Conversation sessionId={otherChat ? 'other-chat' : sessionId} messageEstimateInputs={otherChat ? [] : messages} messageContents={messages.map(message => message.content)}>
      {messages.map(message => <div key={message.id} className="min-h-24 py-4">
        {message.content || <SubAgentAuthProvider sessionId={sessionId}><AgentToolCallWrapper provider="jait" calls={message.toolCalls} isStreaming={false} /></SubAgentAuthProvider>}
      </div>)}
    </Conversation>
    <div data-chat-composer-dock>{handoff.inlinePrompt}<textarea aria-label="Chat draft" defaultValue="Keep my draft" /></div>
  </main>
  return <TooltipProvider>{workspace ? <div data-browser-workspace className="relative flex h-screen overflow-hidden">
    <aside data-browser-sidebar data-testid="fixture-sidebar" className="w-48 shrink-0 border-r bg-muted">Sidebar</aside>
    <section data-testid="fixture-project" className="w-72 shrink-0 border-r bg-muted/50">Project panel</section>
    {chat}
  </div> : chat}</TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<BrowserChatFixture />)
