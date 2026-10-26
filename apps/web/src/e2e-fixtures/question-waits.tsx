import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantBody } from '@/components/chat/assistant-body'
import { ToolCallGroup, type ToolCallInfo } from '@/components/chat/tool-call-card'
import '../index.css'

const pending = { status: 'pending', requestId: 'publish-fix' }
const result = (data: unknown) => ({ ok: true, message: 'Transport completed', data: { result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, data }) }] } } })
const initial: ToolCallInfo = { callId: 'ask', tool: 'user.ask', args: { title: 'Publish prepared fix', questions: [{ id: 'publish', header: 'Publish', question: 'Push the prepared fix?' }] }, status: 'success', startedAt: Date.now() - 360_000, completedAt: Date.now() - 300_000, result: result(pending) }
function Fixture() {
  const [waits, setWaits] = useState(0)
  const [answered, setAnswered] = useState(false)
  const calls: ToolCallInfo[] = [initial, ...Array.from({ length: waits }, (_, i) => ({ ...initial, callId: `wait-${i}`, args: { requestId: 'publish-fix' }, result: result(pending) }))]
  if (answered) calls.push({ ...initial, callId: 'answered', args: { requestId: 'publish-fix' }, completedAt: Date.now(), result: result({ answers: { publish: { selected: ['Yes, push the fix'], skipped: false } } }) })
  return <main className="mx-auto max-w-2xl space-y-4 p-4">
    <button onClick={() => setWaits(6)}>Resume six waits</button>
    <button onClick={() => setAnswered(true)}>Answer question</button>
    <section aria-label="Streamed question"><AssistantBody segments={calls.map(call => ({ type: 'toolGroup', callIds: [call.callId] }))} toolCalls={calls} /></section>
    <section aria-label="Replayed question"><ToolCallGroup calls={calls} /></section>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
