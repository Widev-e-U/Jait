import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Message } from '@/components/chat/message'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import type { MessageSegment } from '@/hooks/useChat'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'
import '@/index.css'

const TOKEN_COUNT = 200
const TOKEN_INTERVAL_MS = 1

type RenderMode = 'immediate' | 'raf'

function getMode(): RenderMode {
  return new URLSearchParams(window.location.search).get('mode') === 'immediate'
    ? 'immediate'
    : 'raf'
}

function UseChatBurstRepro() {
  const mode = getMode()
  const [thinking, setThinking] = useState('')
  const [metrics, setMetrics] = useState<{ renderCount: number; thinkingCommitCount: number } | null>(null)
  const [done, setDone] = useState(false)
  const renderCountRef = useRef(0)
  const thinkingCommitCountRef = useRef(0)
  const pendingThinkingRef = useRef('')
  const frameRef = useRef<number | null>(null)

  renderCountRef.current += 1

  useEffect(() => {
    if (thinking.length > 0) thinkingCommitCountRef.current += 1
  }, [thinking])

  useEffect(() => {
    let index = 0
    const flushRaf = () => {
      frameRef.current = null
      setThinking(pendingThinkingRef.current)
    }

    const interval = window.setInterval(() => {
      index += 1
      const next = `${pendingThinkingRef.current}w${index} `
      pendingThinkingRef.current = next

      if (mode === 'immediate') {
        setThinking(next)
      } else if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(flushRaf)
      }

      if (index >= TOKEN_COUNT) {
        window.clearInterval(interval)
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current)
          frameRef.current = null
          setThinking(pendingThinkingRef.current)
        }
        window.setTimeout(() => {
          setMetrics({
            renderCount: renderCountRef.current,
            thinkingCommitCount: thinkingCommitCountRef.current,
          })
          setDone(true)
        }, 50)
      }
    }, TOKEN_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
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
  ], [thinking])

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">useChat Burst Repro</h1>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <dt>mode</dt>
        <dd data-testid="mode">{mode}</dd>
        <dt>commits</dt>
        <dd data-testid="commit-count">{metrics?.thinkingCommitCount ?? thinkingCommitCountRef.current}</dd>
        <dt>renders</dt>
        <dd data-testid="render-count">{metrics?.renderCount ?? renderCountRef.current}</dd>
        <dt>thinking length</dt>
        <dd data-testid="thinking-length">{thinking.length}</dd>
        <dt>done</dt>
        <dd data-testid="done">{String(done)}</dd>
      </dl>
      <Message
        role="assistant"
        content=""
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
