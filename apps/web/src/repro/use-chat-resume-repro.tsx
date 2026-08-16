import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from '@/hooks/useChat'
import '@/index.css'

const encoder = new TextEncoder()

type ReproWindow = Window & {
  __resumeStreamFetchCount?: number
  __resumeStreamFetchTimes?: number[]
  __resumeStreamControllers?: ReadableStreamDefaultController<Uint8Array>[]
}

const reproWindow = window as ReproWindow
reproWindow.__resumeStreamFetchCount = 0
reproWindow.__resumeStreamFetchTimes = []
reproWindow.__resumeStreamControllers = []

const originalFetch = window.fetch.bind(window)
const searchParams = new URLSearchParams(window.location.search)
const stallFirstStream = searchParams.has('stall-first')
const stallAfterSnapshot = searchParams.has('stall-after-snapshot')
const failFirstTwoStreams = searchParams.has('fail-first-two')
if (failFirstTwoStreams) Math.random = () => 0

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url

  if (url.includes('/api/sessions/resume-repro-session/stream')) {
    reproWindow.__resumeStreamFetchCount = (reproWindow.__resumeStreamFetchCount ?? 0) + 1
    reproWindow.__resumeStreamFetchTimes?.push(performance.now())

    if (failFirstTwoStreams && reproWindow.__resumeStreamFetchCount <= 2) {
      return Promise.reject(new TypeError('Failed to fetch'))
    }

    if (stallFirstStream && reproWindow.__resumeStreamFetchCount === 1) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }, { once: true })
      })
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        reproWindow.__resumeStreamControllers?.push(controller)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'snapshot',
          streaming: true,
          seq: 0,
          total: 2,
          hasMore: false,
          limit: 10,
          messages: [
            { id: 'user-1', role: 'user', content: 'run a command' },
            { id: 'assistant-1', role: 'assistant', content: 'partial' },
          ],
        })}\n\n`))

        if (stallAfterSnapshot && reproWindow.__resumeStreamFetchCount === 1) return
      },
      cancel() {},
    })

    init?.signal?.addEventListener('abort', () => {
      const controller = reproWindow.__resumeStreamControllers?.at(-1)
      try {
        controller?.error(new DOMException('The operation was aborted.', 'AbortError'))
      } catch {
        // The stream may already have reached a terminal event.
      }
    }, { once: true })

    return Promise.resolve(new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
  }

  return originalFetch(input, init)
}) as typeof window.fetch

function UseChatResumeRepro() {
  const chat = useChat('resume-repro-session')
  const [fetchCount, setFetchCount] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setFetchCount(reproWindow.__resumeStreamFetchCount ?? 0)
    }, 25)
    return () => window.clearInterval(id)
  }, [])

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-xl font-semibold">useChat Resume Repro</h1>
      <dl className="space-y-2 text-sm">
        <div>
          <dt>stream fetches</dt>
          <dd data-testid="stream-fetch-count">{fetchCount}</dd>
        </div>
        <div>
          <dt>loading</dt>
          <dd data-testid="loading">{String(chat.isLoading)}</dd>
        </div>
        <div>
          <dt>history loading</dt>
          <dd data-testid="history-loading">{String(chat.isLoadingHistory)}</dd>
        </div>
        <div>
          <dt>messages</dt>
          <dd data-testid="message-count">{chat.messages.length}</dd>
        </div>
      </dl>
    </main>
  )
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Missing root element')
}

createRoot(container).render(
  <StrictMode>
    <UseChatResumeRepro />
  </StrictMode>,
)
