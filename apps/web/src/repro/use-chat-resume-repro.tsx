import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from '@/hooks/useChat'
import '@/index.css'

const encoder = new TextEncoder()
const search = new URLSearchParams(window.location.search)
const failFirstSnapshot = search.has('stall-first')
const failFirstTwoStreams = search.has('fail-first-two')
const stallAfterSnapshot = search.has('stall-after-snapshot')
const initialDirect = search.has('stall-initial-direct')
const counters = { streams: 0, snapshots: 0, direct: 0, times: [] as number[] }
Object.assign(window, { __resumeStreamFetchTimes: counters.times })
if (failFirstTwoStreams) Math.random = () => 0
const originalFetch = window.fetch.bind(window)

// The client takes a JSON snapshot then listens to the durable /events wire.
// The POST response body is intentionally independent of that subscription.
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  if (url.includes('/api/sessions/') && url.includes('/messages')) {
    counters.snapshots += 1
    if (failFirstSnapshot && counters.snapshots === 1) return Promise.resolve(new Response('unavailable', { status: 503 }))
    return Promise.resolve(Response.json({
      streaming: !initialDirect, seq: 0, total: 2, hasMore: false,
      messages: [
        { id: 'user-1', role: 'user', content: 'run a command' },
        { id: 'assistant-1', role: 'assistant', content: initialDirect ? 'latest content recovered without reload' : 'partial' },
      ],
    }))
  }
  if (url.includes('/api/sessions/') && url.endsWith('/events')) {
    counters.streams += 1
    counters.times.push(performance.now())
    Object.assign(window, { __resumeStreamFetchCount: counters.streams })
    if (failFirstTwoStreams && counters.streams <= 2) return Promise.reject(new TypeError('Failed to fetch'))
    let heartbeat: ReturnType<typeof setInterval> | undefined
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': keepalive\n\n'))
        if (!stallAfterSnapshot || counters.streams > 1) heartbeat = setInterval(() => controller.enqueue(encoder.encode(': keepalive\n\n')), 1000)
        init?.signal?.addEventListener('abort', () => {
          clearInterval(heartbeat)
          try { controller.error(new DOMException('Aborted', 'AbortError')) } catch { /* already closed */ }
        }, { once: true })
      },
      cancel() { clearInterval(heartbeat) },
    })
    return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
  }
  if (initialDirect && url.includes('/api/chat')) {
    counters.direct += 1
    // A legacy response that never finishes must not own the UI stream.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode('data: {"type":"token","content":"ignored legacy token"}\n\n')) },
    })
    return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
  }
  return originalFetch(input, init)
}) as typeof window.fetch

function UseChatResumeRepro() {
  const [sessionId, setSessionId] = useState<string | null>(initialDirect ? null : 'resume-repro-session')
  const chat = useChat(sessionId)
  const [, update] = useState(0)
  const sent = useRef(false)
  useEffect(() => {
    if (!initialDirect || sent.current) return
    sent.current = true
    const sessionIdPromise = Promise.resolve('initial-direct-session')
    void sessionIdPromise.then(setSessionId)
    void chat.sendMessage('run a command', { sessionIdPromise })
  }, [chat.sendMessage])
  useEffect(() => {
    const timer = setInterval(() => update(value => value + 1), 25)
    return () => clearInterval(timer)
  }, [])
  return <main className="mx-auto max-w-xl p-6">
    <h1 className="mb-4 text-xl font-semibold">useChat Resume Repro</h1>
    <dl className="space-y-2 text-sm">
      <dd data-testid="stream-fetch-count">{counters.streams}</dd>
      <dd data-testid="snapshot-fetch-count">{counters.snapshots}</dd>
      <dd data-testid="direct-fetch-count">{counters.direct}</dd>
      <dd data-testid="loading">{String(chat.isLoading)}</dd>
      <dd data-testid="history-loading">{String(chat.isLoadingHistory)}</dd>
      <dd data-testid="message-count">{chat.messages.length}</dd>
      <dd data-testid="assistant-content">{chat.messages.find(message => message.role === 'assistant')?.content ?? ''}</dd>
    </dl>
  </main>
}

const container = document.getElementById('root')
if (!container) throw new Error('Missing root element')
createRoot(container).render(<StrictMode><UseChatResumeRepro /></StrictMode>)
