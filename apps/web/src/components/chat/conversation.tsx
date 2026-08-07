import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import { Conversation as AIConversation, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { cn } from '@/lib/utils'
import { estimateMessageHeight, estimateMessageHeightFromMessage } from '@/lib/pretext-height'

interface ConversationProps {
  children: React.ReactNode
  className?: string
  compact?: boolean
  loading?: boolean
  loadingLabel?: string
  /** Raw text per child item for pretext-based virtual item height estimation. */
  messageContents?: string[]
  /**
   * Optional per-item message structure (index-aligned with children) used for
   * structure-aware height estimation. When provided for an index, the estimate
   * accounts for collapsed thinking blocks and tool-call cards as well as the
   * rendered markdown text, which is far closer to the real height than text
   * alone — otherwise thinking-only / tool-heavy assistant turns are estimated
   * at a flat default, leaving big gaps when scrolling through history.
   */
  messageEstimateInputs?: Array<{
    content?: unknown
    thinking?: unknown
    toolCalls?: unknown
    segments?: unknown
  }>
  /** Whether there are older messages available to load. */
  hasMore?: boolean
  /** Callback to load older messages (scroll-up lazy loading). */
  onLoadMore?: () => void
}

const STICKY_BOTTOM_THRESHOLD_PX = 24
const DEFAULT_ITEM_HEIGHT = 120
const BOTTOM_SYNC_INTERVAL_MS = 500
const BOTTOM_SYNC_DELTA_PX = 8
const TOUCH_DETACH_THRESHOLD_PX = 4
const ESTIMATE_TEXT_LIMIT = 12_000
export const INITIAL_CONVERSATION_SCROLL_OFFSET = Number.MAX_SAFE_INTEGER

export function positionConversationAtBottom(
  element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop'>,
): void {
  element.scrollTop = element.scrollHeight
}

/** Sub-pixel jitter isn't worth a scroll write — it would itself look like flicker. */
const ANCHOR_EPSILON_PX = 0.5

export interface ConversationItemBox {
  key: string
  /** Offset of the item's top edge from the scroll container's top edge. */
  top: number
  height: number
}

export interface ConversationScrollAnchor {
  key: string
  offset: number
}

/**
 * Pick the item to pin the viewport to: the first one still on screen.
 *
 * Its offset is usually negative — the user is normally partway through an item
 * rather than exactly at its top edge — and preserving that exact offset is
 * what stops the view drifting when the list reflows.
 */
export function pickScrollAnchor(items: ConversationItemBox[]): ConversationScrollAnchor | null {
  for (const item of items) {
    if (!item.key) continue
    if (item.top + item.height > 0) return { key: item.key, offset: item.top }
  }
  return null
}

/** How far to move scrollTop to put the anchored item back where it was. */
export function scrollAnchorDelta(currentTop: number, anchoredOffset: number): number {
  const delta = currentTop - anchoredOffset
  return Math.abs(delta) < ANCHOR_EPSILON_PX ? 0 : delta
}

/** Scroll distance from the top that arms the lazy-load of older messages. */
export const LOAD_MORE_SCROLL_THRESHOLD_PX = 200

/** How long to wait for a requested batch before assuming it will never land. */
const LOAD_MORE_REARM_TIMEOUT_MS = 8_000

/** A one-pixel slack so sub-pixel layout rounding doesn't read as scrollable. */
const SCROLLABLE_EPSILON_PX = 1

/**
 * Whether the next page of older messages should be requested for the current
 * scroll geometry.
 *
 * Near the top is the obvious case. The non-obvious one is a window that cannot
 * scroll at all: a chat opens on a very small message window
 * (INITIAL_CHAT_HISTORY_MESSAGE_LIMIT), which routinely does not overflow the
 * viewport. There is then no scrollable overflow, so the container never emits
 * a scroll event, and a trigger wired only to scroll events can never fire —
 * the user spins the wheel and no earlier messages ever arrive. Treat
 * "unscrollable with more available" as a request to backfill.
 */
export function shouldLoadOlderMessages(
  element: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
): boolean {
  const scrollable = element.scrollHeight > element.clientHeight + SCROLLABLE_EPSILON_PX
  if (!scrollable) return true
  return element.scrollTop < LOAD_MORE_SCROLL_THRESHOLD_PX
}

const MOBILE_SCROLL_CONTAINMENT_STYLE: CSSProperties = {
  WebkitOverflowScrolling: 'touch',
  overscrollBehaviorY: 'contain',
  touchAction: 'pan-y',
}

/**
 * Placeholder turns, oldest first — the column is bottom-anchored, so the last
 * entry sits just above the composer and the top of the list is clipped, the
 * same way a real conversation scrolled to the end looks.
 *
 * Line counts are deliberately lopsided: a user prompt is usually a line or
 * two, an assistant reply several. Alternating equal-sized blocks reads as a
 * generic loading list rather than a chat, and then visibly reflows when the
 * real messages arrive. There are enough turns here to overflow a tall
 * viewport, which is what makes the skeleton fill the full height.
 *
 * The column is bottom-anchored, so the last two turns (the two user prompts)
 * sit just above the composer and everything above them is assistant output —
 * the skeleton reads as a mostly-agent conversation with a couple of recent
 * user messages, which is the shape the user asked for.
 */
export const CONVERSATION_SKELETON_TURNS: ReadonlyArray<{ role: 'user' | 'assistant'; lines: number }> = [
  { role: 'assistant', lines: 5 },
  { role: 'assistant', lines: 6 },
  { role: 'assistant', lines: 4 },
  { role: 'assistant', lines: 5 },
  { role: 'assistant', lines: 3 },
  { role: 'assistant', lines: 6 },
  { role: 'assistant', lines: 4 },
  { role: 'assistant', lines: 5 },
  { role: 'user', lines: 1 },
  { role: 'user', lines: 2 },
]

/** Ragged line widths so a block reads as prose; the last line runs short. */
const ASSISTANT_LINE_WIDTHS = ['w-full', 'w-11/12', 'w-4/5', 'w-full', 'w-3/4']
const USER_LINE_WIDTHS = ['w-5/6', 'w-1/2']

function skeletonLineWidth(role: 'user' | 'assistant', index: number, total: number): string {
  if (role === 'user') return USER_LINE_WIDTHS[index % USER_LINE_WIDTHS.length]!
  if (index === total - 1) return 'w-2/5'
  return ASSISTANT_LINE_WIDTHS[index % ASSISTANT_LINE_WIDTHS.length]!
}

function ConversationPositioningSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      data-testid="conversation-positioning-skeleton"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-background"
    >
      <span className="sr-only">{label}</span>
      <div className="mx-auto flex h-full max-w-4xl flex-col justify-end gap-6 px-4 pb-8 pt-12 sm:px-5">
        {CONVERSATION_SKELETON_TURNS.map((turn, turnIndex) => {
          // Stagger the pulse, but cycle it so the top of a long list isn't
          // still waiting to start animating.
          const delay = `${(turnIndex % 4) * 120}ms`
          const lines = Array.from({ length: turn.lines }, (_, i) =>
            skeletonLineWidth(turn.role, i, turn.lines))

          if (turn.role === 'user') {
            // Right-aligned primary-tinted bubble matching MessageContent.
            return (
              <div
                key={turnIndex}
                className="flex shrink-0 animate-pulse justify-end"
                style={{ animationDelay: delay }}
              >
                <div className="w-3/5 max-w-md space-y-2.5 rounded-lg border border-primary/20 bg-primary/[0.08] p-4">
                  {lines.map((width, i) => (
                    <div key={i} className={cn('ml-auto h-3 rounded-md bg-primary/15', width)} />
                  ))}
                </div>
              </div>
            )
          }

          // Assistant turn — transparent, text-only lines like the real layout,
          // no avatar, and wider/taller than the user bubbles so the agent
          // output dominates the skeleton.
          return (
            <div
              key={turnIndex}
              className="flex shrink-0 animate-pulse"
              style={{ animationDelay: delay }}
            >
              <div className="w-full max-w-2xl space-y-3">
                {lines.map((width, i) => (
                  <div key={i} className={cn('h-4 rounded-md bg-muted-foreground/10', width)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {/* Fade both edges: the top turn is clipped mid-block, the bottom meets
          the composer. */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}

export function Conversation({ children, className, loading, loadingLabel = 'Loading conversation', messageContents, messageEstimateInputs, hasMore, onLoadMore }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sizerRef = useRef<HTMLDivElement | null>(null)
  const childItems = useMemo(() => Children.toArray(children), [children])
  const hasContent = childItems.length > 0
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [initialScrollReady, setInitialScrollReady] = useState(false)
  const prevChildCount = useRef(0)
  const prevLoadingRef = useRef(loading)
  const prevScrollTopRef = useRef(0)
  const stickToBottomRef = useRef(true)
  // Once the user scrolls up away from the bottom, stay detached (don't follow
  // new streamed content) until they scroll back down to the bottom edge.
  const detachedRef = useRef(false)
  const userScrollingRef = useRef(false)
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const touchStartYRef = useRef<number | null>(null)
  const initialRevealFrameRef = useRef<number | null>(null)
  // Set briefly after a click inside the conversation (e.g. expanding a tool
  // call or reasoning block) so the resize this causes doesn't get treated
  // as new streamed content and yank the view down to the bottom.
  const suppressAutoScrollRef = useRef(false)
  const suppressAutoScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ── Scroll anchoring ──
  // The list is virtualized, so any height change — older messages prepended,
  // or a streaming sub-agent card growing an item that sits above the viewport
  // — reflows every offset below it and drags the view with it. Nothing pins
  // the content the user is actually looking at, which is what makes the
  // position jump on lazy-load and flicker during nested streaming.
  //
  // We remember the first item intersecting the viewport plus its exact offset
  // from the container top, then put it back there after the reflow.
  const anchorKeyRef = useRef<string | null>(null)
  const anchorOffsetRef = useRef(0)
  const restoringAnchorRef = useRef(false)
  // Set when a lazy-load was triggered, so the next render that grows the list
  // knows to restore rather than letting the browser keep raw scrollTop.
  const pendingPrependAnchorRef = useRef(false)

  const captureScrollAnchor = useCallback(() => {
    const el = scrollRef.current
    if (!el || restoringAnchorRef.current) return
    const containerTop = el.getBoundingClientRect().top
    const anchor = pickScrollAnchor(
      Array.from(el.querySelectorAll<HTMLElement>('[data-conv-key]')).map((node) => {
        const rect = node.getBoundingClientRect()
        return { key: node.dataset.convKey ?? '', top: rect.top - containerTop, height: rect.height }
      }),
    )
    if (!anchor) return
    anchorKeyRef.current = anchor.key
    anchorOffsetRef.current = anchor.offset
  }, [])

  const restoreScrollAnchor = useCallback(() => {
    const el = scrollRef.current
    const key = anchorKeyRef.current
    if (!el || !key) return
    const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(key)
      : key.replace(/["\\]/g, '\\$&')
    const node = el.querySelector<HTMLElement>(`[data-conv-key="${escaped}"]`)
    if (!node) return
    const top = node.getBoundingClientRect().top - el.getBoundingClientRect().top
    const delta = scrollAnchorDelta(top, anchorOffsetRef.current)
    if (delta === 0) return
    // Guard so the scroll we cause here isn't captured as a new anchor.
    restoringAnchorRef.current = true
    el.scrollTop += delta
    requestAnimationFrame(() => {
      restoringAnchorRef.current = false
    })
  }, [])

  // Track inner container width for pretext layout calculations.
  const innerRef = useRef<HTMLDivElement | null>(null)
  const containerWidthRef = useRef(600)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    containerWidthRef.current = el.clientWidth
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidthRef.current = entry.contentRect.width
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading])

  // Keep messageContents in a ref so estimateSize stays stable.
  const messageContentsRef = useRef(messageContents)
  messageContentsRef.current = messageContents

  // Keep structure-aware estimate inputs in a ref so estimateSize stays stable.
  const messageEstimateInputsRef = useRef(messageEstimateInputs)
  messageEstimateInputsRef.current = messageEstimateInputs

  const virtualizer = useVirtualizer({
    count: childItems.length,
    getScrollElement: () => scrollRef.current,
    initialOffset: INITIAL_CONVERSATION_SCROLL_OFFSET,
    estimateSize: (index) => {
      const inputs = messageEstimateInputsRef.current
      const input = inputs?.[index]
      if (input && typeof input === 'object') {
        return estimateMessageHeightFromMessage(input, containerWidthRef.current)
      }
      const text = messageContentsRef.current?.[index]
      if (!text) return DEFAULT_ITEM_HEIGHT
      const estimateText = text.length > ESTIMATE_TEXT_LIMIT ? text.slice(0, ESTIMATE_TEXT_LIMIT) : text
      return estimateMessageHeight(estimateText, containerWidthRef.current)
    },
    overscan: 5,
    getItemKey: (index) => {
      const child = childItems[index]
      if (typeof child === 'object' && child !== null && 'key' in child) {
        return String(child.key)
      }
      return index
    },
  })

  // Track user-initiated scroll gestures (wheel/touch) so we don't
  // confuse layout-induced scrollTop changes (tool cards collapsing)
  // with the user intentionally scrolling up.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const markUserScroll = () => {
      userScrollingRef.current = true
      clearTimeout(userScrollTimerRef.current)
      userScrollTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false
      }, 300)
    }

    const handleWheel = (e: WheelEvent) => {
      markUserScroll()
      if (e.deltaY < 0 && stickToBottomRef.current) {
        setStickToBottom(false)
        stickToBottomRef.current = false
        detachedRef.current = true
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      markUserScroll()
      touchStartYRef.current = e.touches[0]?.clientY ?? null
    }

    // CSS overscroll containment is not enough on all mobile browsers.
    // Prevent boundary drags from escaping the chat scroller and
    // triggering page bounce / pull-to-refresh.
    const handleTouchMove = (e: TouchEvent) => {
      markUserScroll()
      if (e.touches.length !== 1) return
      const startY = touchStartYRef.current
      const currentY = e.touches[0]?.clientY
      if (startY == null || currentY == null) return

      const maxScrollTop = el.scrollHeight - el.clientHeight
      if (maxScrollTop <= 0) {
        e.preventDefault()
        return
      }

      const deltaY = currentY - startY
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop >= maxScrollTop - 1

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        e.preventDefault()
      }

      // Finger moving down drags earlier content into view (scrollTop
      // decreases) — mirror the wheel handler's immediate detach so this
      // doesn't rely on the scroll-event heuristic below, which only fires
      // (and only recognizes "user scrolling") while touchmove events are
      // still landing. Native momentum scrolling after the finger lifts
      // keeps moving scrollTop for a while with no further touchmove events,
      // so without this the streaming auto-scroll re-engages mid-flick and
      // fights the momentum, producing a flicker instead of staying put.
      if (deltaY > TOUCH_DETACH_THRESHOLD_PX && stickToBottomRef.current) {
        setStickToBottom(false)
        stickToBottomRef.current = false
        detachedRef.current = true
      }
    }

    const clearTouchState = () => {
      touchStartYRef.current = null
    }

    const handleClick = () => {
      suppressAutoScrollRef.current = true
      clearTimeout(suppressAutoScrollTimerRef.current)
      suppressAutoScrollTimerRef.current = setTimeout(() => {
        suppressAutoScrollRef.current = false
      }, 400)
    }

    el.addEventListener('wheel', handleWheel, { passive: true })
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', clearTouchState, { passive: true })
    el.addEventListener('touchcancel', clearTouchState, { passive: true })
    el.addEventListener('click', handleClick, { capture: true, passive: true })
    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', clearTouchState)
      el.removeEventListener('touchcancel', clearTouchState)
      el.removeEventListener('click', handleClick, { capture: true })
      clearTimeout(userScrollTimerRef.current)
      clearTimeout(suppressAutoScrollTimerRef.current)
    }
  }, [loading]) // re-attach when scroll element mounts (loading → !loading)

  // Lazy-load older messages when user scrolls near the top
  const loadMoreTriggeredRef = useRef(false)
  const rearmTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const requestOlderMessages = useCallback(() => {
    const el = scrollRef.current
    if (!el || !hasMore || !onLoadMore) return
    if (loadMoreTriggeredRef.current) return
    if (!shouldLoadOlderMessages(el)) return
    loadMoreTriggeredRef.current = true
    // A request that brings nothing back (failed fetch, stale cursor) would
    // otherwise leave the trigger armed-but-never-cleared, and the user would
    // get no earlier messages for the rest of the session. The prepend effect
    // below clears this on the happy path, well before it fires.
    clearTimeout(rearmTimerRef.current)
    rearmTimerRef.current = setTimeout(() => {
      pendingPrependAnchorRef.current = false
      loadMoreTriggeredRef.current = false
    }, LOAD_MORE_REARM_TIMEOUT_MS)
    // Anchor before requesting. onLoadMore is async (it fetches), so the
    // old single-rAF height diff always measured an unchanged list and
    // corrected by zero. The batch then landed with scrollTop untouched,
    // which — with content prepended above — leaves the user near the top
    // of a now much longer list, re-arming this trigger and cascading
    // straight to the beginning of the conversation.
    captureScrollAnchor()
    pendingPrependAnchorRef.current = true
    onLoadMore()
  }, [captureScrollAnchor, hasMore, onLoadMore])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !hasMore || !onLoadMore) return
    const handleScroll = () => requestOlderMessages()
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [hasMore, onLoadMore, requestOlderMessages, childItems.length])

  // Also evaluate whenever the rendered window changes. A scroll listener alone
  // is dead weight while the loaded window is too short to overflow the
  // viewport: no overflow means no scroll events, so nothing would ever request
  // the earlier pages. Re-checking here backfills until the list is scrollable.
  useEffect(() => {
    if (loading || !hasContent || !initialScrollReady) return
    requestOlderMessages()
  }, [requestOlderMessages, childItems.length, hasContent, initialScrollReady, loading])

  useEffect(() => () => clearTimeout(rearmTimerRef.current), [])

  // Restore once the prepended batch is actually in the DOM.
  useLayoutEffect(() => {
    if (!pendingPrependAnchorRef.current) return
    if (childItems.length === prevChildCount.current) return
    pendingPrependAnchorRef.current = false
    clearTimeout(rearmTimerRef.current)
    restoreScrollAnchor()
    // Re-arm only after the view has been put back, so being near the top
    // during the load can't queue another page.
    loadMoreTriggeredRef.current = false
  }, [childItems.length, restoreScrollAnchor])

  useEffect(() => {
    // Re-arm when the server reports a different pagination state.
    loadMoreTriggeredRef.current = false
  }, [hasMore])

  const updateBottomState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nextIsAtBottom = distanceFromBottom < STICKY_BOTTOM_THRESHOLD_PX
    const atVeryBottom = distanceFromBottom < 4
    const scrollingUp = el.scrollTop < prevScrollTopRef.current
    prevScrollTopRef.current = el.scrollTop

    setIsAtBottom(nextIsAtBottom)

    // Keep the anchor current while detached, so a height change from streamed
    // content can put the view back exactly where the user left it. Not needed
    // while stuck to the bottom — that path just follows the end of the list.
    if (!stickToBottomRef.current) captureScrollAnchor()

    // If the user is actively scrolling up, detach so streamed content doesn't
    // yank the view down to the bottom.
    if (scrollingUp && userScrollingRef.current) {
      detachedRef.current = true
      if (stickToBottomRef.current) {
        stickToBottomRef.current = false
        setStickToBottom(false)
        captureScrollAnchor()
      }
      return
    }

    // Detached: stay put. Re-attach only when the user scrolls back down to the
    // very bottom edge (not merely near it), so new content arriving while the
    // user is scrolled up never re-enables stick-to-bottom.
    if (detachedRef.current) {
      if (atVeryBottom && !scrollingUp) {
        detachedRef.current = false
        stickToBottomRef.current = true
        setStickToBottom(true)
      } else if (stickToBottomRef.current) {
        stickToBottomRef.current = false
        setStickToBottom(false)
      }
      return
    }

    // Not detached: keep following the bottom.
    if (!stickToBottomRef.current) {
      stickToBottomRef.current = true
      setStickToBottom(true)
    }
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  useLayoutEffect(() => {
    updateBottomState()
  }, [updateBottomState, childItems.length, loading])

  useLayoutEffect(() => {
    const count = childItems.length
    const wasEmpty = prevChildCount.current === 0
    const finishedLoading = prevLoadingRef.current && !loading

    prevChildCount.current = count
    prevLoadingRef.current = loading

    if (!loading && count > 0 && (wasEmpty || finishedLoading)) {
      detachedRef.current = false
      setStickToBottom(true)
      stickToBottomRef.current = true
      const el = scrollRef.current
      if (!el) return

      positionConversationAtBottom(el)
      setIsAtBottom(true)

      if (initialRevealFrameRef.current !== null) {
        cancelAnimationFrame(initialRevealFrameRef.current)
      }
      initialRevealFrameRef.current = requestAnimationFrame(() => {
        initialRevealFrameRef.current = null
        const currentEl = scrollRef.current
        if (!currentEl) return
        positionConversationAtBottom(currentEl)
        setIsAtBottom(true)
        setInitialScrollReady(true)
      })
    }
  }, [childItems.length, loading])

  useEffect(() => {
    return () => {
      if (initialRevealFrameRef.current !== null) {
        cancelAnimationFrame(initialRevealFrameRef.current)
      }
    }
  }, [])

  // Lightweight safety net: ResizeObserver handles normal height changes.
  // This slower poll catches browser/layout misses without doing scroll math
  // several times per second during long streams.
  useEffect(() => {
    if (!stickToBottom || loading) return
    const el = scrollRef.current
    if (!el) return
    const id = setInterval(() => {
      if (!stickToBottomRef.current || suppressAutoScrollRef.current) return
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      if (dist > BOTTOM_SYNC_DELTA_PX) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
    }, BOTTOM_SYNC_INTERVAL_MS)
    return () => clearInterval(id)
  }, [stickToBottom, loading])

  // Observe the virtual sizer for immediate stick-to-bottom response
  // when virtualizer recalculates total height.
  useLayoutEffect(() => {
    const sizerEl = sizerRef.current
    if (!sizerEl || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current || suppressAutoScrollRef.current) {
        // Detached: the total size just changed under us. A streaming nested
        // sub-agent card grows an item continuously, and every growth above
        // the viewport shifts everything below it — that reflow, several times
        // a second, is the flicker. Pin the anchor back before reporting state.
        restoreScrollAnchor()
        updateBottomState()
        return
      }
      scrollToBottom('auto')
    })

    observer.observe(sizerEl)
    return () => observer.disconnect()
  }, [restoreScrollAnchor, scrollToBottom, updateBottomState])

  return (
    <AIConversation className={cn('relative flex-1 overflow-hidden', className)}>
      {loading && !hasContent ? (
        <ConversationPositioningSkeleton label={loadingLabel} />
      ) : (
        <div
          ref={scrollRef}
          onScroll={updateBottomState}
          className="h-full overflow-y-auto"
          style={{
            ...MOBILE_SCROLL_CONTAINMENT_STYLE,
            visibility: !hasContent || initialScrollReady ? 'visible' : 'hidden',
          }}
        >
          {loading && (
            <div className="sticky top-3 z-10 flex justify-center">
              <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary/50" />
                <span>{loadingLabel}</span>
              </div>
            </div>
          )}
          <div ref={innerRef} className="mx-auto max-w-4xl px-4 pt-12 pb-6 sm:py-6 sm:px-5">
            {hasMore && (
              <div className="flex justify-center py-3">
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="flex items-center gap-2 rounded-full border border-border/70 bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted/50"
                >
                  <Loader2 className="h-3 w-3 text-primary animate-spin" style={{ animationPlayState: loadMoreTriggeredRef.current ? 'running' : 'paused' }} />
                  <span>Load earlier messages</span>
                </button>
              </div>
            )}
            <div
              ref={sizerRef}
              style={{
                height: virtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  // Stable identity for scroll anchoring — index shifts when
                  // older messages are prepended, the key does not.
                  data-conv-key={String(virtualItem.key)}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {childItems[virtualItem.index]}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasContent && !initialScrollReady && (
        <ConversationPositioningSkeleton label={loading ? loadingLabel : 'Preparing conversation'} />
      )}

      {initialScrollReady && !loading && !isAtBottom && (
        <ConversationScrollButton
          className="bottom-5"
          onClick={() => {
            detachedRef.current = false
            setStickToBottom(true)
            stickToBottomRef.current = true
            scrollToBottom()
          }}
        />
      )}
    </AIConversation>
  )
}
