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
