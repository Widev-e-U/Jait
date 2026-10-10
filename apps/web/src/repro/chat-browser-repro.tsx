import { createRoot } from 'react-dom/client'
import { AgentToolCallWrapper, SubAgentAuthProvider, type ToolCallInfo } from '@/components/chat/tool-call-card'
import '@/index.css'
const call: ToolCallInfo = {
  callId: 'navigate', startedAt: Date.now(), tool: 'mcp__jait__browser_navigate', args: { url: 'https://example.com/login' }, status: 'success',
  result: { ok: true, message: 'Navigated', data: { browserId: 'browser-chat-fixture', title: 'Sign in', url: 'https://example.com/login', browserSession: { sessionId: 'chat-fixture', controller: 'agent', previewUrl: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify' } } },
}
const fixture = Reflect.get(window, '__chatBrowserFixture') as { sessionId: string; call: ToolCallInfo } | undefined
createRoot(document.getElementById('root')!).render(
  <main className="mx-auto max-w-3xl p-4"><h1 className="mb-4 text-xl">Browser in chat</h1>
    <SubAgentAuthProvider sessionId={fixture?.sessionId ?? "chat-fixture"}><AgentToolCallWrapper provider="jait" calls={[fixture?.call ?? call]} isStreaming={false} /></SubAgentAuthProvider>
  </main>,
)
