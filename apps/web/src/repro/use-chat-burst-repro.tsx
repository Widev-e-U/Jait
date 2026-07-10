import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Message } from '@/components/chat/message'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { createStreamRenderScheduler } from '@/lib/stream-render-scheduler'
import type { MessageSegment } from '@/hooks/useChat'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'
import '@/index.css'

const TOKEN_COUNT = 90

type RenderMode = 'legacy' | 'raf'

function getMode(): RenderMode {
  return new URLSearchParams(window.location.search).get('mode') === 'legacy'
    ? 'legacy'
    : 'raf'
}

function UseChatBurstRepro() {
  const mode = getMode()
  const [thinking, setThinking] = useState('')
  const [content, setContent] = useState('')
  const [metrics, setMetrics] = useState<{
    renderCount: number
    thinkingCommitCount: number
    contentCommitCount: number
    elapsedMs: number
  } | null>(null)
  const [done, setDone] = useState(false)
  const renderCountRef = useRef(0)
  const thinkingCommitCountRef = useRef(0)
  const contentCommitCountRef = useRef(0)
  const pendingThinkingRef = useRef('')
  const pendingContentRef = useRef('')

  renderCountRef.current += 1

  useEffect(() => {
    if (thinking.length > 0) thinkingCommitCountRef.current += 1
  }, [thinking])

  useEffect(() => {
    if (content.length > 0) contentCommitCountRef.current += 1
  }, [content])

  useEffect(() => {
    let cancelled = false
    const scheduler = createStreamRenderScheduler({
      onFlush: () => {
        setThinking(pendingThinkingRef.current)
        setContent(pendingContentRef.current)
      },
    })

    const run = async () => {
      const startedAt = performance.now()
      for (let index = 1; index <= TOKEN_COUNT; index += 1) {
        if (cancelled) return
        const nextThinking = `${pendingThinkingRef.current}thought${index} `
        const nextContent = `${pendingContentRef.current}word${index} `
        pendingThinkingRef.current = nextThinking
        pendingContentRef.current = nextContent

        if (mode === 'legacy') {
          setThinking(nextThinking)
          setContent(nextContent)
          await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
        } else {
          scheduler.schedule()
        }
      }

      if (cancelled) return
      scheduler.flushNow()
      window.setTimeout(() => {
        if (cancelled) return
        setMetrics({
          renderCount: renderCountRef.current,
          thinkingCommitCount: thinkingCommitCountRef.current,
          contentCommitCount: contentCommitCountRef.current,
          elapsedMs: Math.round(performance.now() - startedAt),
        })
        setDone(true)
      }, 50)
    }

    const startTimer = window.setTimeout(() => void run(), 0)

    return () => {
      cancelled = true
      window.clearTimeout(startTimer)
      scheduler.cancel()
    }
  }, [mode])

  const toolCalls = useMemo<ToolCallInfo[]>(() => [{
    callId: 'proof-tool',
    tool: 'web.search',
    args: { query: 'proof render cost' },
    status: 'running',
    startedAt: Date.now(),
  }], [])

  const segments = useMemo<MessageSegment[]>(() => [
    { type: 'toolGroup', callIds: ['proof-tool'] },
    { type: 'thinking', content: thinking },
    { type: 'text', content },
  ], [content, thinking])

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">useChat Burst Repro</h1>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <dt>mode</dt>
        <dd data-testid="mode">{mode}</dd>
        <dt>thinking commits</dt>
        <dd data-testid="commit-count">{metrics?.thinkingCommitCount ?? thinkingCommitCountRef.current}</dd>
        <dt>plain-text commits</dt>
        <dd data-testid="content-commit-count">{metrics?.contentCommitCount ?? contentCommitCountRef.current}</dd>
        <dt>renders</dt>
        <dd data-testid="render-count">{metrics?.renderCount ?? renderCountRef.current}</dd>
        <dt>thinking length</dt>
        <dd data-testid="thinking-length">{thinking.length}</dd>
        <dt>plain-text length</dt>
        <dd data-testid="content-length">{content.length}</dd>
        <dt>elapsed ms</dt>
        <dd data-testid="elapsed-ms">{metrics?.elapsedMs ?? 0}</dd>
        <dt>done</dt>
        <dd data-testid="done">{String(done)}</dd>
      </dl>
      <Message
        role="assistant"
        content={content}
        thinking={thinking}
        toolCalls={toolCalls}
        segments={segments}
        isStreaming={!done}
      />
    </main>
  )
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Missing root element')
}

createRoot(container).render(
  <StrictMode>
    <ConfirmDialogProvider>
      <UseChatBurstRepro />
    </ConfirmDialogProvider>
  </StrictMode>,
)
