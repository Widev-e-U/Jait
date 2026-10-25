import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ToolCallCard, type ToolCallInfo } from '@/components/chat/tool-call-card'
import '../index.css'

function Fixture() {
  const [finished, setFinished] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const result = { answers: { target: { selected: ['Homelab', 'Local'], freeText: 'Only the lab', skipped: false }, later: { selected: [], freeText: null, skipped: true } } }
  const qa: ToolCallInfo = { callId: 'qa', tool: 'functions.mcp__jait_core__user_ask',
    args: { questions: [{ id: 'target', header: 'Target', question: 'Where should it run?' }, { id: 'later', header: 'Later', question: 'Anything else?' }] },
    startedAt: 1, completedAt: finished || cancelled ? 2 : undefined, status: cancelled ? 'error' : finished ? 'success' : 'running',
    result: finished ? { ok: true, message: 'Answered', data: { content: [{ type: 'text', text: JSON.stringify({ ok: true, data: result }) }] } } : cancelled ? { ok: false, message: 'The user cancelled the question request.' } : undefined }
  return <main className="mx-auto max-w-2xl space-y-4 p-4">
    <button onClick={() => setFinished(true)}>Show answered result</button>
    <button onClick={() => { setFinished(false); setCancelled(true) }}>Cancel question</button>
    <ToolCallCard call={qa} />
    <ToolCallCard call={{ callId: 'unknown', tool: 'context.read', args: {}, startedAt: 1, completedAt: 2, status: 'success', result: { ok: true, message: 'Evidence recovered' } }} />
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
