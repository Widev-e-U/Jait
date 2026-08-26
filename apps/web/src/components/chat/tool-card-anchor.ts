import { useCallback, useEffect, useRef } from 'react'

/**
 * Keeping a toggled tool card where the user is looking.
 *
 * Expanding or collapsing a card changes the height of the transcript, and
 * every pixel of that change has to come out of somewhere: either the content
 * below the card moves, or the content above it does. Which one reads as
 * "nothing jumped" depends on where the card sits on screen:
 *
 *   - card in the upper half  -> pin its top edge, so the body grows downward
 *     and the content below is pushed down. The card itself never moves.
 *   - card in the lower half  -> pin its bottom edge, so the content above is
 *     pulled up and the newly revealed body fills the space it vacates,
 *     instead of unfolding off the bottom of the screen.
 *
 * The chat list is virtualized and animates the body open over ~160ms, so the
 * card's height keeps changing for several frames after the click. The
 * correction therefore runs as a short settle loop rather than a single
 * measurement, and re-pins the anchored edge on every frame until the height
 * stops moving.
 */

/**
 * Fired on the toggled card element (bubbling) the moment a toggle starts, so
 * the surrounding conversation can stop following the end of the stream and
 * leave the scroll position to the settle loop below.
 */
export const TOOL_CARD_TOGGLE_EVENT = 'jait:tool-card-toggle'

/** Breathing room kept between an anchored card and the viewport edges. */
export const TOOL_CARD_ANCHOR_MARGIN_PX = 12

/**
 * How long the toggled card owns the scroll position. Long enough to outlast
 * the open/close animation plus the virtualizer re-measuring the row it lives
 * in, short enough that a click never keeps the transcript pinned into the
 * next streamed update.
 */
export const TOOL_CARD_ANCHOR_SETTLE_MS = 500

/** Sub-pixel jitter isn't worth a scroll write — it would itself look like flicker. */
const ANCHOR_EPSILON_PX = 0.5

export function shouldContinueToolCardAnchorSettle({
  now,
  deadline,
}: {
  now: number
  deadline: number
}): boolean {
  return now < deadline
}

export interface ToolCardBox {
  /** The card's top edge, relative to the top edge of the scroll viewport. */
  top: number
  /** The card's bottom edge, relative to the top edge of the scroll viewport. */
  bottom: number
}

/** Which edge of the card stays put while it grows or shrinks. */
export type ToolCardAnchorEdge = 'top' | 'bottom'

/**
 * Pick the edge to pin.
 *
 * The card's top edge is its header — the row the user just clicked — so that
 * is what decides which half of the viewport the card counts as being in.
 *
 * A bottom edge that sits below the fold is not an edge the user can see, and
 * pinning it would drag the whole card off-screen (collapsing a card taller
 * than the viewport is the usual way to get there). Fall back to the top edge,
 * which at least keeps the header exactly where it was.
 */
export function pickToolCardAnchorEdge(box: ToolCardBox, viewportHeight: number): ToolCardAnchorEdge {
  if (viewportHeight <= 0) return 'top'
  if (box.top < viewportHeight / 2) return 'top'
  if (box.bottom > viewportHeight) return 'top'
  return 'bottom'
}

/**
 * How far to move `scrollTop` to put the anchored edge back where it was.
 */
export function toolCardAnchorScrollDelta({
  edge,
  before,
  after,
  margin = TOOL_CARD_ANCHOR_MARGIN_PX,
}: {
  edge: ToolCardAnchorEdge
  before: ToolCardBox
  after: ToolCardBox
  margin?: number
}): number {
  const raw = edge === 'top' ? after.top - before.top : after.bottom - before.bottom
  // Pinning the bottom of a card that grew taller than the space above it would
  // push its header off the top of the viewport, leaving the user in the middle
  // of a body with no idea which tool it belongs to. Never scroll further than
  // what keeps the header on screen — beyond that point the card is taller than
  // the viewport anyway, and top-anchoring is the only readable option.
  const delta = edge === 'bottom' && raw > 0
    ? Math.min(raw, Math.max(after.top - margin, 0))
    : raw
  return Math.abs(delta) < ANCHOR_EPSILON_PX ? 0 : delta
}

/**
 * Scroll delta that brings a card header back into view, or 0 when it is
 * already comfortably inside the viewport. The anchoring above keeps the
 * header put in every ordinary case; this is the safety net for the ones it
 * can't (a card collapsing out from under a clamped scroll position).
 */
export function toolCardVisibilityNudge(
  box: ToolCardBox,
  viewportHeight: number,
  margin = TOOL_CARD_ANCHOR_MARGIN_PX,
): number {
  if (viewportHeight <= 0) return 0
  if (box.top < margin) return box.top - margin
  if (box.top > viewportHeight - margin) return box.top - (viewportHeight - margin)
  return 0
}

/**
 * Walk up to the nearest scrollable ancestor. The chat list is virtualized
 * (TanStack Virtual) with `position: absolute; transform: translateY` items
 * inside an `overflow-y-auto` container, so the browser's own scroll anchoring
 * and `scrollIntoView`'s container detection are both off the table — we
 * resolve the real scrollable element ourselves.
 */
export function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node
    }
    node = node.parentElement
  }
  return null
}

function measureToolCardBox(card: HTMLElement, container: HTMLElement): ToolCardBox {
  const cardRect = card.getBoundingClientRect()
  const containerTop = container.getBoundingClientRect().top
  return { top: cardRect.top - containerTop, bottom: cardRect.bottom - containerTop }
}

/**
 * Wire a collapsible tool card to the anchoring described above.
 *
 * Put `cardRef` on the element that spans the whole card (header + body) and
 * call `anchorToggle()` from the open-change handler *before* flipping state,
 * so the pre-toggle geometry is measured while it is still on screen.
 */
export function useToolCardToggleAnchor<T extends HTMLElement = HTMLDivElement>() {
  const cardRef = useRef<T | null>(null)
  const frameRef = useRef<number | null>(null)
  const detachListenersRef = useRef<(() => void) | null>(null)

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    detachListenersRef.current?.()
    detachListenersRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  const anchorToggle = useCallback(() => {
    const card = cardRef.current
    if (!card || typeof requestAnimationFrame !== 'function') return
    const container = findScrollableAncestor(card)
    if (!container) return
    stop()

    const before = measureToolCardBox(card, container)
    const viewportHeight = container.clientHeight
    const edge = pickToolCardAnchorEdge(before, viewportHeight)
    const headerWasVisible = before.top >= 0 && before.top <= viewportHeight

    // The conversation follows the end of the stream and re-pins its own scroll
    // anchor on every height change; both would fight this loop over scrollTop.
    // Announce the toggle so it stands down for the settle window.
    card.dispatchEvent(new CustomEvent(TOOL_CARD_TOGGLE_EVENT, { bubbles: true }))

    // A gesture mid-animation means the user has taken over — correcting
    // against them is exactly the yank this is meant to prevent.
    const abort = () => stop()
    container.addEventListener('wheel', abort, { passive: true })
    container.addEventListener('touchstart', abort, { passive: true })
    detachListenersRef.current = () => {
      container.removeEventListener('wheel', abort)
      container.removeEventListener('touchstart', abort)
    }

    const deadline = Date.now() + TOOL_CARD_ANCHOR_SETTLE_MS

    const step = () => {
      frameRef.current = null
      const delta = toolCardAnchorScrollDelta({ edge, before, after: measureToolCardBox(card, container) })
      if (delta !== 0) container.scrollTop += delta

      if (shouldContinueToolCardAnchorSettle({ now: Date.now(), deadline })) {
        frameRef.current = requestAnimationFrame(step)
        return
      }

      if (headerWasVisible) {
        const nudge = toolCardVisibilityNudge(measureToolCardBox(card, container), container.clientHeight)
        if (nudge !== 0) container.scrollTo({ top: container.scrollTop + nudge, behavior: 'smooth' })
      }
      stop()
    }

    frameRef.current = requestAnimationFrame(step)
  }, [stop])

  return { cardRef, anchorToggle }
}
