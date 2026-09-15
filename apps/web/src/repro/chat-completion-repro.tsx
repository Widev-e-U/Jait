import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from '@/hooks/useChat'

const encoder = new TextEncoder()
let snapshots = 0
let subscriptions = 0
let controller: ReadableStreamDefaultController<Uint8Array>
let serverContent = 'Answer'
let serverStreaming = true
let releaseSnapshot: (() => void) | undefined
const emit = (data: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
const originalFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes('/api/sessions/completion-repro/messages')) {
    snapshots++
    const data = { messages: [
      { id: 'user-1', role: 'user', content: 'Question' },
      { id: 'assistant-1', role: 'assistant', content: serverContent },
    ], total: 2, streaming: serverStreaming, seq: 0 }
    if (new URLSearchParams(location.search).has('delay') && snapshots > 1) {
      await new Promise<void>(resolve => { releaseSnapshot = resolve })
    }
    return Response.json(data)
  }
  if (url.includes('/api/sessions/completion-repro/events')) {
    subscriptions++
    return new Response(new ReadableStream<Uint8Array>({ start(value) {
      controller = value
      emit({ type: 'heartbeat' })
      init?.signal?.addEventListener('abort', () => value.error(new DOMException('Aborted', 'AbortError')), { once: true })
    } }), { headers: { 'content-type': 'text/event-stream' } })
  }
  return originalFetch(input, init)
}) as typeof fetch

function Repro() {
  const [activity, setActivity] = useState('2026-09-15T00:00:00Z')
  const chat = useChat('completion-repro', null, undefined, null, activity)
  return <>
    <div data-testid="loading">{String(chat.isLoadingHistory)}</div>
    <div data-testid="streaming">{String(chat.isLoading)}</div>
    <div data-testid="transcript">{chat.messages.map(message => <p key={message.id} data-testid={message.id}>{message.content}</p>)}</div>
    <button onClick={() => {
      serverStreaming = false
      if (new URLSearchParams(location.search).has('changed')) serverContent = 'Saved correction'
      emit({ type: 'done' })
      chat.refreshMessages({ lifecycle: 'complete' })
      setActivity('2026-09-15T00:01:00Z')
    }}>Complete</button>
    <button onClick={() => chat.refreshMessages({ lifecycle: 'complete' })}>Validate</button>
    <button onClick={() => {
      emit({ type: 'request', content: 'Next question' })
      emit({ type: 'token', content: 'New turn' })
    }}>Next turn</button>
    <button onClick={() => releaseSnapshot?.()}>Release snapshot</button>
    <button onClick={() => { document.querySelector('[data-testid="counts"]')!.textContent = JSON.stringify({ snapshots, subscriptions }) }}>Counts</button>
    <pre data-testid="counts" />
  </>
}
createRoot(document.getElementById('root')!).render(<Repro />)
