import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from '@/hooks/useChat'
import { Message } from '@/components/chat/message'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import '@/index.css'

const originalFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  if (url.includes('/api/sessions/latency-repro-session/messages')) {
    return Promise.resolve(Response.json({
      streaming: true, seq: 0, total: 2, hasMore: false,
      messages: [
        { id: 'user-1', role: 'user', content: 'run a command' },
        { id: 'assistant-1', role: 'assistant', content: 'partial', segments: [{ type: 'text', content: 'partial' }] },
      ],
    }))
  }
  if (url.includes('/api/sessions/latency-repro-session/events')) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        Reflect.set(window, '__resumeStreamControllers', [controller])
        init?.signal?.addEventListener('abort', () => controller.close(), { once: true })
      },
    })
    return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
  }
  if (url.includes('/api/')) return Promise.resolve(Response.json({}))
  return originalFetch(input, init)
}) as typeof window.fetch

function UseChatResumeRepro() {
  const chat = useChat('latency-repro-session')
  const assistant = chat.messages.find((message) => message.role === 'assistant')
  const assistantContent = assistant?.content ?? ''

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-xl font-semibold">useChat Resume Repro</h1>
      <dl className="space-y-2 text-sm">
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
        <div>
          <dt>assistant content</dt>
          <dd data-testid="assistant-content">{assistantContent}</dd>
        </div>
      </dl>
      <div data-testid="rendered-assistant">
        {assistant && <Message
          role="assistant"
          content={assistant.content}
          thinking={assistant.thinking}
          segments={assistant.segments}
          toolCalls={assistant.toolCalls}
          isStreaming={chat.isLoading}
        />}
      </div>
      <pre data-testid="assistant-state">{JSON.stringify(assistant)}</pre>
    </main>
  )
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Missing root element')
}

createRoot(container).render(
  <StrictMode>
    <ConfirmDialogProvider><UseChatResumeRepro /></ConfirmDialogProvider>
  </StrictMode>,
)
