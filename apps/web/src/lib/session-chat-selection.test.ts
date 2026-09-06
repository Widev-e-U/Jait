import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SessionChatIcon } from '@/components/chat/session-chat-icon'
import {
  formatSessionChatSelectionLabel,
  getSessionSelectionSyncKey,
  normalizeSessionReasoningEffort,
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
