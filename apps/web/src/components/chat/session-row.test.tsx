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

  it('marks the active row and hides its unread dot', () => {
    const html = renderRow({
      isActive: true,
      session: { id: 'chat-1', name: 'Deploy fix', viewedAt: null, lastActiveAt: '2026-08-01T00:00:00.000Z' },
    })
    expect(html).toContain('bg-secondary/70')
    expect(html).not.toContain('bg-blue-500')
  })

  it('shows the unread dot for inactive unviewed rows', () => {
    const html = renderRow({
      session: { id: 'chat-1', name: 'Deploy fix', viewedAt: null, lastActiveAt: '2026-08-01T00:00:00.000Z' },
    })
    expect(html).toContain('bg-blue-500')
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