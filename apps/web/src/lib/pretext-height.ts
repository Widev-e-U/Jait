import { prepare, layout } from '@chenglou/pretext'

type PreparedText = ReturnType<typeof prepare>

// Cache prepared texts by content string.
// prepare() is the expensive call (text segmentation + canvas measurement);
// layout() is pure arithmetic and always cheap to re-run.
const cache = new Map<string, PreparedText>()
const MAX_CACHE = 1500

// Match prose-base styling used in assistant messages.
const FONT = '16px Inter'
const LINE_HEIGHT = 28
const BASE_PADDING = 32

/**
 * Estimate a chat message's rendered height using pretext for text measurement
 * and light heuristics for non-text content (code blocks, etc.).
 * The virtualizer's measureElement corrects these after first render.
 */
export function estimateMessageHeight(text: string, maxWidth: number): number {
  if (!text) return 48

  let prepared = cache.get(text)
  if (!prepared) {
    if (cache.size >= MAX_CACHE) {
      const iter = cache.keys()
      for (let i = 0; i < MAX_CACHE / 2; i++) {
        const k = iter.next()
        if (k.done) break
        cache.delete(k.value)
      }
    }
    try {
      prepared = prepare(text, FONT)
    } catch {
      return 120
    }
    cache.set(text, prepared)
  }

  const { height } = layout(prepared, Math.max(maxWidth - 32, 100), LINE_HEIGHT)

  // Rough extra height for code blocks (header bar + padding + border)
  const fenceCount = text.match(/```/g)?.length ?? 0
  const codeBlockExtra = Math.floor(fenceCount / 2) * 52

  return height + BASE_PADDING + codeBlockExtra
}

// Height of a single collapsed reasoning/thinking block (the trigger row only;
// the body is closed until the user expands it). Mirrors `Reasoning` in
// components/chat/reasoning.tsx (text-sm trigger + py-1 + px-2 + rounded).
const THINKING_BLOCK_COLLAPSED_HEIGHT = 32
// Approximate collapsed height of a tool-call card (header row with icon,
// tool name, status, duration and chevron). measureElement corrects after
// first render, so this only needs to be close for off-screen history items.
const TOOL_GROUP_COLLAPSED_HEIGHT = 44

type EstimateMessageInput = {
  content?: unknown
  thinking?: unknown
  toolCalls?: unknown
  segments?: unknown
}

/**
 * Estimate a chat message's rendered height from its actual structure rather
 * than just `content`. Assistant messages render as an interleaved stack of
 * collapsed reasoning blocks, text blocks and tool-call cards, and thinking-
 * only messages (empty `content`, non-empty `thinking`/`segments`) can be
 * grossly over-estimated when only text is considered — which made the
 * virtualized chat leave large gaps between items when scrolling through
 * history. Counting the render-relevant parts keeps off-screen estimates close
 * to the real height (measureElement still corrects in-view items).
 */
export function estimateMessageHeightFromMessage(
  message: EstimateMessageInput | null | undefined,
  maxWidth: number,
): number {
  const text = typeof message?.content === 'string' ? message.content : ''
  const segments = Array.isArray(message?.segments) ? message.segments : undefined

  // Base: visible markdown text. estimateMessageHeight() already includes the
  // container padding, so only add padding below when no text is rendered.
  let height = text ? estimateMessageHeight(text, maxWidth) : 0

  // Collapsed reasoning blocks (one per interleaved thinking segment).
  let thinkingBlocks = 0
  if (segments) {
    for (const seg of segments) {
      if (seg && typeof seg === 'object' && (seg as { type?: unknown }).type === 'thinking') {
        const content = (seg as { content?: unknown }).content
        if (typeof content === 'string' && content.trim()) thinkingBlocks++
      }
    }
  } else if (typeof message?.thinking === 'string' && message.thinking.trim()) {
    thinkingBlocks = 1
  }
  height += thinkingBlocks * THINKING_BLOCK_COLLAPSED_HEIGHT

  // Tool-call groups.
  let toolGroups = 0
  if (segments) {
    for (const seg of segments) {
      if (seg && typeof seg === 'object' && (seg as { type?: unknown }).type === 'toolGroup') toolGroups++
    }
  } else if (Array.isArray(message?.toolCalls) && message.toolCalls.length > 0) {
    toolGroups = 1
  }
  height += toolGroups * TOOL_GROUP_COLLAPSED_HEIGHT

  // Container padding for messages that render no markdown text (e.g. a
  // thinking-only or tool-only assistant turn).
  if (!text) height += BASE_PADDING

  return Math.max(height, 48)
}

