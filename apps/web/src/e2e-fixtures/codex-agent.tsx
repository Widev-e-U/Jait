import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ToolCallCard, type ToolCallInfo } from '@/components/chat/tool-call-card'
import { UsageReceipt } from '@/components/chat/usage-receipt'
import '../index.css'

function Fixture() {
  const [finished, setFinished] = useState(false)
  const args = { type: 'collabAgentToolCall', prompt: 'Inspect the project' }
  const call: ToolCallInfo = finished
    ? { callId: 'spawn', tool: 'agent.spawn', args, status: 'success', startedAt: 1, completedAt: 2, result: { ok: true, message: '', data: { type: 'collabAgentToolCall', receiverThreadIds: ['child-1'], agentsStates: { 'child-1': { status: 'running', message: 'Inspecting files' } } } } }
    : { callId: 'spawn', tool: 'agent.spawn', args, status: 'running', startedAt: 1 }
  return <main className="mx-auto max-w-2xl p-6"><button onClick={() => setFinished(true)}>Finish spawn operation</button><ToolCallCard call={call} /><UsageReceipt usage={{ durationMs: 1, promptTokens: 100, cachedPromptTokens: 60, cacheWriteTokens: 20, completionTokens: 5, cost: { amount: 0.01, currency: 'USD', basis: 'configured-rates' } }} /></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
