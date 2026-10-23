import { useState } from 'react'
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
  const [started, setStarted] = useState(!fixture?.initiallyUnused)
  const [extraActions, setExtraActions] = useState(0)
  const [otherChat, setOtherChat] = useState(false)
  const [userSends, setUserSends] = useState(0)
  const sessionId = fixture?.sessionId ?? 'chat-fixture'
  const firstCall = fixture?.call ?? call
  const messages = started ? [
    { id: 'first', content: '', toolCalls: [firstCall] },
    ...Array.from({ length: fixture?.messageCount ?? 30 }, (_, index) => ({ id: `text-${index}`, content: `Chat message ${index}`, toolCalls: [] })),
    ...Array.from({ length: userSends }, (_, index) => ({ id: `user-${index}`, role: 'user' as const, content: `User message ${index}`, toolCalls: [] })),
    ...Array.from({ length: extraActions }, (_, index) => ({ id: `action-${index}`, content: '', toolCalls: [{ ...firstCall, callId: `click-${index}`, tool: 'browser.click', args: { selector: '#next' } }] })),
  ] : [{ id: 'intro', content: 'Open a page in the browser to begin.', toolCalls: [] }]
  return <TooltipProvider><main className="mx-auto flex h-screen max-w-3xl flex-col p-4">
    <h1 className="mb-4 text-xl">Browser in chat</h1>
    <div className="flex gap-3 pb-2">
      <button onClick={() => { setStarted(true); setExtraActions(value => value + 1) }}>{started ? 'Another browser action' : 'Open browser'}</button>
      <button onClick={() => setUserSends(value => value + 1)}>Send user message</button>
      <button onClick={() => setOtherChat(value => !value)}>Switch chat</button>
    </div>
    <Conversation sessionId={otherChat ? 'other-chat' : sessionId} messageEstimateInputs={otherChat ? [] : messages} messageContents={messages.map(message => message.content)}>
      {messages.map(message => <div key={message.id} className="min-h-24 py-4">
        {message.content || <SubAgentAuthProvider sessionId={sessionId}><AgentToolCallWrapper provider="jait" calls={message.toolCalls} isStreaming={false} /></SubAgentAuthProvider>}
      </div>)}
    </Conversation>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<BrowserChatFixture />)
