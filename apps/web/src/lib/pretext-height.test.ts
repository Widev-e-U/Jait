import { describe, expect, it } from 'vitest'
import { estimateMessageHeightFromMessage } from './pretext-height'

// The virtualizer previously estimated any message with empty `content` at a
// flat DEFAULT_ITEM_HEIGHT (120px). Thinking-only assistant turns (empty
// content, non-empty thinking/segments) render as a single collapsed reasoning
// block (~64px), so the flat default left large phantom gaps between items
// when scrolling through history. These tests pin the structure-aware estimate.
const WIDTH = 900

describe('estimateMessageHeightFromMessage', () => {
  it('estimates a thinking-only message well below the old 120px default', () => {
    const height = estimateMessageHeightFromMessage(
      {
        content: '',
        thinking: 'Let me think about this problem step by step.',
        segments: [{ type: 'thinking', content: 'Let me think about this problem step by step.' }],
        toolCalls: [],
      },
      WIDTH,
    )
    // One collapsed reasoning trigger (~32px) + container padding (~32px).
    expect(height).toBeGreaterThan(0)
    expect(height).toBeLessThan(120)
  })

  it('counts multiple interleaved thinking blocks and tool-call groups', () => {
    const base = estimateMessageHeightFromMessage(
      {
        content: 'Here is a short answer.',
        segments: [{ type: 'text', content: 'Here is a short answer.' }],
      },
      WIDTH,
    )
    const withParts = estimateMessageHeightFromMessage(
      {
        content: 'Here is a short answer.',
        segments: [
          { type: 'thinking', content: 'First I thought about it.' },
          { type: 'text', content: 'Here is a short answer.' },
          { type: 'thinking', content: 'Then I double-checked.' },
          { type: 'toolGroup', callIds: ['call_1'] },
          { type: 'toolGroup', callIds: ['call_2', 'call_3'] },
        ],
        toolCalls: [{ callId: 'call_1' }, { callId: 'call_2' }],
      },
      WIDTH,
    )
    // Two extra collapsed thinking blocks + two tool-group cards on top of text.
    expect(withParts).toBeGreaterThan(base + 2 * 32 + 2 * 44 - 1)
  })

  it('accounts for a standalone thinking string when segments are absent', () => {
    const height = estimateMessageHeightFromMessage(
      { content: '', thinking: 'Thinking without segments.' },
      WIDTH,
    )
    expect(height).toBeGreaterThan(0)
    expect(height).toBeLessThan(120)
  })

  it('returns a minimal height for a truly empty message', () => {
    const height = estimateMessageHeightFromMessage({ content: '' }, WIDTH)
    expect(height).toBeGreaterThanOrEqual(48)
  })
})
