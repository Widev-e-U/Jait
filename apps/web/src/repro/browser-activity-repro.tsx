import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AgentToolCallWrapper, type ToolCallInfo } from '@/components/chat/tool-call-card'
import '@/index.css'

const startedAt = Date.now() - 5000
const calls: ToolCallInfo[] = [
  { callId: 'navigate', tool: 'browser.navigate', args: { url: 'https://example.com/docs' }, status: 'success', startedAt, completedAt: startedAt + 1000,
    result: { ok: true, message: 'Navigated to documentation', data: { title: 'Jait documentation', url: 'https://example.com/docs', textPreview: 'Learn how to use Jait browser tools.', interactiveElements: [{ role: 'link', name: 'Getting started' }, { role: 'button', name: 'Search docs', active: true }] } } },
  { callId: 'click', tool: 'browser.click', args: { selector: 'text=Getting started' }, status: 'running', startedAt: Date.now() },
  { callId: 'screenshot', tool: 'browser.screenshot', args: {}, status: 'success', startedAt, completedAt: startedAt + 1000,
    result: { ok: true, message: 'Screenshot captured', data: { result: { path: 'https://browser-fixture.test/page.png' } } } },
  { callId: 'secret', tool: 'browser.snapshot', args: {}, status: 'success', startedAt, completedAt: startedAt + 1000,
    result: { ok: true, message: 'Capture suppressed', data: { title: 'Private page', secretSafe: true, snapshot: 'SECRET_FIXTURE', textPreview: 'SECRET_FIXTURE', interactiveElements: [{ name: 'SECRET_FIXTURE' }] } } },
  { callId: 'error', tool: 'browser.click', args: { selector: '#missing' }, status: 'error', startedAt, completedAt: startedAt + 1000,
    result: { ok: false, message: 'Element was not found' } },
]

function BrowserActivityPreview() {
  const [finished, setFinished] = useState(false)
  const displayedCalls = calls.map((call): ToolCallInfo => call.callId === 'click' && finished ? {
    ...call, status: 'success', completedAt: Date.now(), result: { ok: true, message: 'Clicked Getting started', data: { title: 'Getting started', url: 'https://example.com/docs/start' } },
  } : call)
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <h1 className="mb-4 text-xl font-semibold">Browser activity preview</h1>
      <button type="button" className="mb-4 rounded border px-3 py-2 text-sm" onClick={() => setFinished(true)}>Finish browser action</button>
      <AgentToolCallWrapper provider="jait" calls={displayedCalls} isStreaming={!finished} />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserActivityPreview /></StrictMode>)
