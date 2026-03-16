import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Message } from '@/components/chat/message'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'
import type { MessageSegment } from '@/hooks/useChat'

const prefixParagraphs = Array.from({ length: 180 }, (_, index) =>
  `- Prefix line ${index + 1}: this markdown block exists to stress rerenders before tool calls.`,
)

const prefixText = [
  '# Streaming Reproduction',
  '',
  'This content is intentionally large so rerendering it is expensive.',
  '',
  ...prefixParagraphs,
  '',
].join('\n')

function StreamingRepro() {
  const [suffix, setSuffix] = useState('')
  const [phase, setPhase] = useState<'boot' | 'tool-churn' | 'done'>('boot')
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([])

  useEffect(() => {
    const timers: number[] = []

    timers.push(window.setTimeout(() => {
      setPhase('tool-churn')
      setToolCalls([{
        callId: 'repro-tool-1',
        tool: 'web.search',
        args: { query: 'streaming regression reproduction' },
        status: 'running',
        streamingOutput: '',
        startedAt: Date.now(),
      }])
    }, 80))

    let suffixStep = 0
    const suffixInterval = window.setInterval(() => {
      suffixStep += 1
      setSuffix((prev) => `${prev} tail-token-${suffixStep}`)
      if (suffixStep >= 80) {
        window.clearInterval(suffixInterval)
        setToolCalls((prev) => prev.map((call) => ({
          ...call,
          status: 'success',
          completedAt: Date.now(),
          result: {
            ok: true,
            message: 'done',
            data: { query: 'streaming regression reproduction' },
          },
        })))
        setPhase('done')
      }
    }, 25)

    let outputStep = 0
    const toolOutputInterval = window.setInterval(() => {
      outputStep += 1
      setToolCalls((prev) => prev.map((call) => ({
        ...call,
        streamingOutput: `${call.streamingOutput ?? ''} chunk-${outputStep}`,
      })))
      if (outputStep >= 240) {
        window.clearInterval(toolOutputInterval)
      }
    }, 8)

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      window.clearInterval(suffixInterval)
      window.clearInterval(toolOutputInterval)
    }
  }, [])

  const content = useMemo(() => prefixText + suffix, [suffix])
  const segments = useMemo<MessageSegment[]>(() => {
    if (toolCalls.length === 0) return [{ type: 'text', content }]
    return [
      { type: 'text', content: prefixText },
      { type: 'toolGroup', callIds: toolCalls.map((call) => call.callId) },
      { type: 'text', content: suffix },
    ]
  }, [content, suffix, toolCalls])

  return (
    <main style={{ margin: '0 auto', maxWidth: 960, padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Streaming Reproduction</h1>
      <p data-testid="phase">{phase}</p>
      <p data-testid="suffix-length">{suffix.length}</p>
      <div style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: 16 }}>
        <Message
          role="assistant"
          content={content}
          toolCalls={toolCalls}
          segments={segments}
          isStreaming={phase !== 'done'}
          preferLlmUi
        />
      </div>
    </main>
  )
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Missing root element')
}

createRoot(container).render(
  <StrictMode>
    <StreamingRepro />
  </StrictMode>,
)
