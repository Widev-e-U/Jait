import type { SessionWait, SessionWaitKind } from '@jait/shared'
import { sessionWaitLabel } from '@jait/shared'
import type { HTMLAttributes } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SessionRow, isSessionUnread } from './session-row'

function renderRow(props: Partial<Parameters<typeof SessionRow>[0]> = {}) {
  return renderToStaticMarkup(
    <SessionRow
      session={{ id: 'chat-1', name: 'Deploy fix', lastActiveAt: '2026-08-01T00:00:00.000Z' }}
      isActive={false}
      {...props}
    />,
  )
}

describe('isSessionUnread', () => {
  it('keeps a new empty chat read', () => {
    expect(isSessionUnread({ createdAt: '2026-08-01T00:00:00.000Z', lastActiveAt: '2026-08-01T00:00:00.000Z', viewedAt: null })).toBe(false)
  })

  it('flags sessions never viewed', () => {
    expect(isSessionUnread({ lastActiveAt: '2026-08-01T00:00:00.000Z', viewedAt: null })).toBe(true)
  })

  it('flags sessions active after the last view', () => {
    expect(
      isSessionUnread({
        lastActiveAt: '2026-08-02T00:00:00.000Z',
        viewedAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('ignores sessions viewed after the last activity', () => {
    expect(
      isSessionUnread({
        lastActiveAt: '2026-08-01T00:00:00.000Z',
        viewedAt: '2026-08-03T00:00:00.000Z',
      }),
    ).toBe(false)
  })
})

describe('SessionRow', () => {
  it('shows approval waiting ahead of the streaming spinner or old error', () => {
    const html = renderRow({ isStreaming: true, isWaitingForApproval: true,
      session: { id: 'chat', metadata: JSON.stringify({ chat: { lastError: 'Old error' } }) },
    })
    expect(html).toContain('aria-label="Waiting for approval"')
    expect(html).toContain('lucide-shield-question')
    expect(html).not.toContain('animate-spin')
    expect(html).not.toContain('lucide-message-square-x')
    expect(renderRow({ isStreaming: true, isWaitingForApproval: false })).toContain('animate-spin')
  })

  it('shows the question mark ahead of streaming, approval and errors', () => {
    const html = renderRow({
      isAwaitingAnswer: true,
      isStreaming: true,
      isWaitingForApproval: true,
      session: { id: 'chat', metadata: JSON.stringify({ chat: { lastError: 'Old error' } }) },
    })
    expect(html).toContain('data-testid="session-row-question"')
    expect(html).toContain('aria-label="Waiting for your answer"')
    expect(html).not.toContain('lucide-shield-question')
    expect(html).not.toContain('animate-spin')
    expect(html).not.toContain('lucide-message-square-x')
  })

  it('drops the question mark once the answer arrives', () => {
    expect(renderRow()).not.toContain('data-testid="session-row-question"')
    expect(renderRow({ isAwaitingAnswer: false })).not.toContain('data-testid="session-row-question"')
  })

  it('renders the session name and a non-empty relative time', () => {
    const html = renderRow()
    expect(html).toContain('Deploy fix')
    expect(html).toMatch(/text-2xs text-muted-foreground">[^<]+<\/span>/)
  })

  it('falls back to the provided label for unnamed sessions', () => {
    expect(
      renderRow({
        session: { id: 'chat-2', name: null, lastActiveAt: null },
        fallbackLabel: 'Personal chat',
      }).includes('Personal chat'),
    ).toBe(true)
  })

  it('defaults to the untitled fallback', () => {
    expect(renderRow({ session: { id: 'chat-2', name: null } }).includes('Untitled session')).toBe(true)
  })

  it('shows a destructive chat-with-x icon when the last reply failed', () => {
    const metadata = JSON.stringify({ chat: { lastError: 'Provider request failed with status 429' } })

    const html = renderRow({
      session: { id: 'chat-3', name: 'Deploy fix', lastActiveAt: '2026-08-01T00:00:00.000Z', metadata },
    })

    expect(html).toContain('lucide-message-square-x')
    expect(html).toContain('text-destructive')
  })

  it('keeps the plain chat icon when the last reply succeeded', () => {
    const metadata = JSON.stringify({ chat: { provider: 'codex', model: 'gpt-5.4' } })

    const html = renderRow({
      session: { id: 'chat-4', name: 'Deploy fix', lastActiveAt: '2026-08-01T00:00:00.000Z', metadata },
    })

    expect(html).not.toContain('lucide-message-square-x')
    expect(html).toContain('lucide-message-square')
  })

  it('keeps an unread active row bold until its content is acknowledged', () => {
    const html = renderRow({
      isActive: true,
      session: { id: 'chat-1', name: 'Deploy fix', viewedAt: null, lastActiveAt: '2026-08-01T00:00:00.000Z' },
    })
    expect(html).toContain('bg-secondary/70')
    expect(html).toContain('truncate text-xs font-bold text-foreground')
  })

  it('shows bold text for inactive unviewed rows', () => {
    const html = renderRow({
      session: { id: 'chat-1', name: 'Deploy fix', viewedAt: null, lastActiveAt: '2026-08-01T00:00:00.000Z' },
    })
    expect(html).toContain('truncate text-xs font-bold text-foreground')
  })

  it('uses the same provider glyph at the same size for read and unread chats', () => {
    for (const provider of ['codex', 'gemini']) {
      const session = {
        id: 'chat-1', name: 'Deploy fix',
        lastActiveAt: '2026-08-01T00:00:00.000Z',
        metadata: JSON.stringify({ chat: { provider, model: 'test-model' } }),
      }
      const unread = renderRow({ session })
      const read = renderRow({ session: { ...session, viewedAt: session.lastActiveAt } })
      const providerGlyph = (markup: string) =>
        markup.match(/<span aria-hidden="true" class="pointer-events-none inline-flex">(<svg[\s\S]*?<\/svg>)/)?.[1]

      expect(providerGlyph(unread)).toBeDefined()
      expect(providerGlyph(unread)).toBe(providerGlyph(read))
      expect(unread).toContain('font-bold text-foreground')
      expect(read).toContain('font-normal')
      expect(read).toContain('opacity-55')
    }
  })

  it('shows a spinner instead of the chat icon while streaming', () => {
    expect(renderRow({ isStreaming: true }).includes('animate-spin')).toBe(true)
    expect(renderRow({ isStreaming: true }).includes('MessageSquare')).toBe(false)
  })

  it('spreads drag and long-press props onto the row', () => {
    const html = renderRow({
      dragProps: { draggable: true, onDragStart: () => {}, onDragEnd: () => {} },
      longPressProps: { 'data-longpress': 'true' } as HTMLAttributes<HTMLDivElement>,
    })
    expect(html).toContain('draggable="true"')
    expect(html).toContain('data-longpress="true"')
  })
})

describe('SessionRow wait reasons', () => {
  const wait = (kind: SessionWaitKind, overrides: Partial<SessionWait> = {}): SessionWait => ({
    key: `${kind}:1`,
    kind,
    sessionId: 'chat-1',
    label: sessionWaitLabel(kind),
    blocking: true,
    ...overrides,
  })

  it('shows one icon per wait reason instead of a single Q&A badge', () => {
    for (const kind of ['question', 'consent', 'secret', 'browser', 'terminal'] as const) {
      const html = renderRow({ wait: wait(kind) })
      expect(html).toContain(`data-testid="session-row-wait-${kind}"`)
      expect(html).toContain(`aria-label="${sessionWaitLabel(kind)}"`)
      // Exactly one status icon, never the plain chat icon as well.
      expect(html.match(/session-row-wait-/g)).toHaveLength(1)
    }
  })

  it('takes precedence over approval, streaming and legacy question flags', () => {
    const html = renderRow({
      wait: wait('browser'),
      isAwaitingAnswer: true,
      isWaitingForApproval: true,
      isStreaming: true,
    })
    expect(html).toContain('data-testid="session-row-wait-browser"')
    expect(html).toContain('aria-label="Paused — you have browser control"')
    expect(html).not.toContain('data-testid="session-row-question"')
    expect(html).not.toContain('lucide-shield-question')
    expect(html).not.toContain('animate-spin')
  })

  it('appends detail to the tooltip when the wait has some', () => {
    expect(renderRow({ wait: wait('terminal', { detail: 'bun run dev' }) }))
      .toContain('aria-label="Waiting for terminal input — bun run dev"')
  })

  it('ignores a background wait so a working chat keeps its normal icon', () => {
    // A running background command is the agent's own reminder, not a wait on
    // the user, so it must not badge the row — neither blocked nor pulsing.
    for (const blocking of [true, false]) {
      const idle = renderRow({ wait: wait('background', { blocking }) })
      expect(idle).not.toContain('session-row-wait-')
      expect(idle).not.toContain('animate-pulse')
      expect(idle).toContain('lucide-message-square')
    }
    const streaming = renderRow({ wait: wait('background'), isStreaming: true })
    expect(streaming).not.toContain('session-row-wait-')
    expect(streaming).toContain('animate-spin')
  })

  it('keeps blocking waits steady and amber', () => {
    const html = renderRow({ wait: wait('terminal') })
    expect(html).toContain('text-amber-500')
    expect(html).not.toContain('animate-pulse')
  })

  it('falls back to the legacy Q&A badge when no wait is passed', () => {
    expect(renderRow({ isAwaitingAnswer: true, wait: undefined }))
      .toContain('data-testid="session-row-question"')
  })
})
describe('goal loop sidebar status', () => {
  const metadata = (status: 'running' | 'waiting' | 'paused' | 'completed') => JSON.stringify({ loop: {
    id: 'goal', goal: 'Fix the issue', criteria: ['Regression passes'], status, iteration: 2,
    revision: 4, checkedIteration: 1, summary: '', nextMessage: '', evidence: [], updatedAt: '2026-10-22T00:00:00Z',
  } })
  it('keeps the infinity spinner between turns and gives questions precedence', () => {
    const session = { id: 'goal-chat', metadata: metadata('running') }
    expect(renderRow({ session })).toContain('data-testid="session-row-loop"')
    expect(renderRow({ session })).toContain('animate-spin')
    expect(renderRow({ session, isAwaitingAnswer: true })).not.toContain('data-testid="session-row-loop"')
    expect(renderRow({ session, isWaitingForApproval: true })).not.toContain('data-testid="session-row-loop"')
  })
  it('stops spinning when paused or completed and shows waiting questions', () => {
    expect(renderRow({ session: { id: 'goal', metadata: metadata('paused') } })).not.toContain('data-testid="session-row-loop"')
    expect(renderRow({ session: { id: 'goal', metadata: metadata('completed') } })).not.toContain('data-testid="session-row-loop"')
    expect(renderRow({ session: { id: 'goal', metadata: metadata('waiting') } })).toContain('Loop waiting for your answer')
  })
})
