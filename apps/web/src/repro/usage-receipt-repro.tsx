import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { UsageReceipt } from '@/components/chat/usage-receipt'
import { aggregateSessionMetrics, type SessionMetricsMessage } from '@/lib/chat-session-metrics'
import type { UsageSummary } from '@jait/shared'
import '@/index.css'

/**
 * Spending-transparency repro: the real UsageReceipt plus the real session
 * aggregation, fed by provider-reported, estimated, and cache-unavailable
 * fixture totals. Playwright asserts the displayed accounting.
 */

const reported: UsageSummary = {
  durationMs: 120_000,
  promptTokens: 96_628_749,
  cachedPromptTokens: 72_075_637,
  completionTokens: 40_676_562,
  totalTokens: 137_305_311,
  tokenUsageEstimated: false,
  requestCount: 34,
}

const estimated: UsageSummary = {
  durationMs: 1_000,
  promptTokens: 1_200,
  completionTokens: 80,
  totalTokens: 1_280,
  tokenUsageEstimated: true,
}

const noCache: UsageSummary = {
  durationMs: 900,
  promptTokens: 500,
  completionTokens: 60,
  totalTokens: 560,
  tokenUsageEstimated: false,
}

const messages: SessionMetricsMessage[] = [
  { role: 'assistant', content: 'reported turn', contextFlow: { rounds: [], usageSummary: reported } },
  {
    role: 'assistant',
    content: 'estimated turn',
    contextFlow: {
      rounds: [{
        round: 1,
        createdAt: '2026-02-22T10:00:00.000Z',
        model: 'fixture-model',
        messages: [],
        metrics: { ...estimated, tokensPerSecond: 20 },
      }],
    },
  },
]

function UsageReceiptRepro() {
  const session = aggregateSessionMetrics(messages)
  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1>Usage Receipt Repro</h1>
      <section data-testid="receipt-reported"><UsageReceipt usage={reported} /></section>
      <section data-testid="receipt-estimated"><UsageReceipt usage={estimated} /></section>
      <section data-testid="receipt-no-cache"><UsageReceipt usage={noCache} /></section>
      <section data-testid="session-metrics">
        <div>prompt tokens: {session.promptTokens}</div>
        <div>completion tokens: {session.completionTokens}</div>
        <div>total duration ms: {session.totalDurationMs}</div>
        <div>assistant turns: {session.assistantTurns}</div>
        <div>text written: {session.textWritten}</div>
        <div>estimated: {String(session.tokenUsageEstimated)}</div>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UsageReceiptRepro />
  </StrictMode>,
)
