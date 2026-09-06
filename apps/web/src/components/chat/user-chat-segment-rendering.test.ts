import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Chat reference chips must render on every surface that renders user message
 * segments. These paths can't be DOM-rendered in the vitest `node` environment
 * (prompt-input.tsx and message.tsx are heavily interactive), so these tests
 * follow the established `message-render.test.ts` convention of asserting on
 * the branch source.
 */
const readSource = (file: string) =>
  readFileSync(new URL(file, import.meta.url), 'utf8')

describe('chat reference chip rendering', () => {
  it('builds a chip for pasted/dropped chat references in the composer without text nodes', () => {
    const source = readSource('./prompt-input.tsx')
    const appendSegmentNode = source.match(
      /function appendSegmentNode\(([\s\S]*?)\n\}/,
    )?.[1] ?? ''

    // Regression: `chat` segments fell through to the no-op tail and never
    // rendered after a paste or sidebar drag, so the message's chat ref
    // silently disappeared from the composer.
    expect(appendSegmentNode).toContain("segment.type === 'file'")
    expect(appendSegmentNode).toContain("segment.type === 'chat'")
    expect(appendSegmentNode).toContain('createChipNode(segment, onRemove)')
  })

  it('renders chat references as chips in sent user message bubbles', () => {
    const source = readSource('./message.tsx')
    const chatBranch = source.match(
      /segment\.type === 'chat' \? \(\s*<TooltipHint([\s\S]*?)\) : null,/,
    )?.[1] ?? ''

    // Regression: the sent bubble branch ended at `skill`, so dragging a chat
    // into the input and sending produced a bubble with no chip at all.
    expect(chatBranch).toContain('content={`Chat: ${segment.sessionId}`}')
    expect(chatBranch).toContain('<MessageSquare')
    expect(chatBranch).toContain('{segment.name}')
  })
})