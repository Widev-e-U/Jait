import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SessionChatIcon } from '@/components/chat/session-chat-icon'
import {
  formatSessionChatSelectionLabel,
  getSessionSelectionSyncKey,
  normalizeSessionReasoningEffort,
  parseSessionChatError,
  parseSessionChatSelection,
} from './session-chat-selection'

describe('session chat selection', () => {
  it('keeps persistence deduplication scoped to the active chat', () => {
    expect(getSessionSelectionSyncKey('chat-a', 'codex')).not.toBe(
      getSessionSelectionSyncKey('chat-b', 'codex'),
    )
  })

  it('normalizes persisted reasoning effort without losing explicit defaults', () => {
    expect(normalizeSessionReasoningEffort('high')).toBe('high')
    expect(normalizeSessionReasoningEffort('ultra')).toBe('ultra')
    expect(normalizeSessionReasoningEffort(null)).toBeNull()
    expect(normalizeSessionReasoningEffort('invalid effort')).toBeUndefined()
  })

  it('formats the complete Codex provider, model, and effort label', () => {
    const metadata = JSON.stringify({
      chat: { provider: 'codex', model: 'gpt-5.4', reasoningEffort: 'high' },
    })
    const selection = parseSessionChatSelection(metadata)

    expect(selection).not.toBeNull()
    expect(formatSessionChatSelectionLabel(selection!)).toBe('Codex · GPT 5.4 · High effort')

    const markup = renderToStaticMarkup(createElement(SessionChatIcon, { metadata }))
    expect(markup).not.toContain('title="Codex · GPT 5.4 · High effort"')
    expect(markup).toContain('aria-label="Codex · GPT 5.4 · High effort"')
  })
})

describe('session chat error', () => {
  it('reads a recorded failure with its timestamp', () => {
    const metadata = JSON.stringify({
      chat: {
        provider: 'codex',
        lastError: 'Provider request failed with status 429',
        lastErrorAt: '2026-08-01T10:00:00.000Z',
      },
    })

    expect(parseSessionChatError(metadata)).toEqual({
      message: 'Provider request failed with status 429',
      at: '2026-08-01T10:00:00.000Z',
    })
  })

  it('treats a cleared or missing marker as healthy', () => {
    expect(parseSessionChatError(JSON.stringify({ chat: { lastError: '' } }))).toBeNull()
    expect(parseSessionChatError(JSON.stringify({ chat: { lastError: '   ' } }))).toBeNull()
    expect(parseSessionChatError(JSON.stringify({ chat: { provider: 'codex' } }))).toBeNull()
    expect(parseSessionChatError('{}')).toBeNull()
    expect(parseSessionChatError(null)).toBeNull()
    expect(parseSessionChatError('not json')).toBeNull()
  })

  it('still reports a failure when the timestamp is absent', () => {
    const metadata = JSON.stringify({ chat: { lastError: 'Aborted by provider' } })

    expect(parseSessionChatError(metadata)).toEqual({
      message: 'Aborted by provider',
      at: null,
    })
  })
})
