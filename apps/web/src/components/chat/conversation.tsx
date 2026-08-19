import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import { Conversation as AIConversation, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { ConversationMinimap, MINIMAP_RAIL_WIDTH_PX } from './conversation-minimap'
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
    role?: 'user' | 'agent'
    error?: unknown
  }>
  /** Whether there are older messages available to load. */
  hasMore?: boolean
  /** Callback to load older messages (scroll-up lazy loading). */
  onLoadMore?: () => void
  /**
   * When this changes to a new, non-null message id, force the conversation to
   * reveal that message — even if the user has scrolled up away from the
   * bottom. Used to follow a freshly-sent user message so it's always in view
   * the moment it lands.
   */
  scrollToMessageId?: string | null
  /**
   * Show a VSCode/Rider-style content-preview minimap on the right edge
   * (desktop only). Each text line of the conversation is drawn as one thin
   * line — blue for user turns, muted for agent turns — so the rail reads like
   * a shrunken preview of the transcript. Clicking or dragging it scrolls.
   */
  showMinimap?: boolean
}

const STICKY_BOTTOM_THRESHOLD_PX = 24
/**
 * How long a scroll-to-bottom keeps chasing the end of the list.
 *
 * Virtual rows are measured only once they render, so the rows a scroll to the
 * end reveals routinely turn out taller than their estimates: the container
 * grows mid-scroll and the real bottom moves further down, leaving the view
 * short of it. Long enough to outlast a smooth scroll plus a few measurement
 * passes.
 */
const BOTTOM_SETTLE_MS = 900
/** Target drift below this isn't worth re-issuing a scroll for. */
const BOTTOM_SETTLE_EPSILON_PX = 1
/**
 * Consecutive frames the view has to already be flush with the end before the
 * settle stops chasing. One frame isn't enough: a measurement pass lands a
 * frame after the render that triggered it, so a single flush frame is
 * routinely followed by the container growing again.
 */
const BOTTOM_SETTLE_STABLE_FRAMES = 3
/** Ignore the message the viewport is already parked on when jumping upward. */
const PREVIOUS_MESSAGE_EPSILON_PX = 8
/** Breathing room between the floating scroll controls and the minimap rail. */
const FLOATING_CONTROL_GAP_PX = 12
const DEFAULT_ITEM_HEIGHT = 120
const BOTTOM_SYNC_INTERVAL_MS = 500
/**
 * Drift the bottom-sync poll will close. Deliberately tight: the sizer only
 * reports the virtualizer's *total size*, so a last row whose measurement lags
 * a frame overflows it without ever resizing it. That leftover — usually only a
 * handful of pixels — is invisible to the ResizeObserver, and a coarse
 * threshold here is what let it survive as a permanent gap under the last
 * message. Re-pinning when already flush is a no-op, so a tight value is free.
 */
const BOTTOM_SYNC_DELTA_PX = 1
const TOUCH_DETACH_THRESHOLD_PX = 4
const ESTIMATE_TEXT_LIMIT = 12_000
/** Stable identity so an absent `messageContents` doesn't rebuild the minimap. */
const EMPTY_MESSAGE_CONTENTS: string[] = []
export const INITIAL_CONVERSATION_SCROLL_OFFSET = Number.MAX_SAFE_INTEGER

export function positionConversationAtBottom(
  element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop'>,
): void {
  element.scrollTop = element.scrollHeight
}

export function computeNewTurnTailPadding({
  viewportHeight,
  messageStart,
  totalSize,
}: {
  viewportHeight: number
  messageStart: number
  totalSize: number
}): number {
  if (viewportHeight <= 0 || messageStart < 0 || totalSize < messageStart) return 0
  return Math.max(viewportHeight - (totalSize - messageStart), 0)
}

/**
 * Index of the message to jump to when moving one message up the transcript:
 * the last one that starts above the current viewport top. A message whose top
 * is only just above the fold counts as the one already in view, so repeated
 * jumps walk the transcript instead of toggling between two positions.
 *
 * `isEligible` narrows which messages count as a stop — the chat only jumps
 * between the user's own prompts, since those are the turn boundaries anyone
 * actually navigates by.
 */
export function findPreviousMessageIndex(
  items: Array<{ index: number; start: number }>,
  scrollOffset: number,
  isEligible?: (index: number) => boolean,
): number | null {
  const stops = isEligible ? items.filter((item) => isEligible(item.index)) : items
  let previous: number | null = null
  for (const item of stops) {
    if (item.start < scrollOffset - PREVIOUS_MESSAGE_EPSILON_PX) {
      if (previous == null || item.index > previous) previous = item.index
    }
  }
  // Scrolled past the top of the first candidate but with nothing above it —
  // the leading padding. Treat the first candidate as the target, unless it
  // starts below the fold: jumping "up" must never scroll the view down.
  if (previous == null && scrollOffset > 0 && stops.length > 0) {
    const first = stops.reduce((earliest, item) => (item.index < earliest.index ? item : earliest), stops[0])
    return first.start <= scrollOffset ? first.index : null
  }
  return previous
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

/**
 * Undo React's `Children.toArray` key mangling.
 *
 * `toArray` rewrites every key to encode the child's position in the tree: a
 * message keyed `m-1`, passed inside the nested `{messageElements}` array,
 * comes back as `.0:$m-1`, and any `=`/`:` in the original key is escaped as
 * `=0`/`=2`. Matching a raw message id against the mangled key therefore never
 * succeeds — which is what silently disabled the new-turn top anchoring.
 */
export function unwrapConversationChildKey(key: string): string {
  if (!key.startsWith('.')) return key
  const marker = key.indexOf('$')
  if (marker < 0) return key
  return key.slice(marker + 1).replace(/=[02]/g, (escaped) => (escaped === '=0' ? '=' : ':'))
}

/** Index of the rendered child that carries `messageId`, or -1 if it isn't rendered. */
export function findConversationItemIndex(items: readonly unknown[], messageId: string | null): number {
  if (messageId == null) return -1
  return items.findIndex((child) => {
    if (typeof child !== 'object' || child === null || !('key' in child)) return false
    const key = (child as { key: unknown }).key
    return key != null && unwrapConversationChildKey(String(key)) === messageId
  })
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
 * Placeholder turns, oldest first. The first and last entries are user
 * messages, so the skeleton has the same visible boundaries as the loaded
 * conversation while the intervening exchange fills the full viewport.
 *
 * Line counts are deliberately lopsided: a user prompt is usually a line or
 * two, an assistant reply several. Alternating equal-sized blocks reads as a
 * generic loading list rather than a chat, and then visibly reflows when the
 * real messages arrive.
 */
export const CONVERSATION_SKELETON_TURNS: ReadonlyArray<{ role: 'user' | 'assistant'; lines: number }> = [
  { role: 'user', lines: 1 },
  { role: 'assistant', lines: 5 },
  { role: 'user', lines: 2 },
  { role: 'assistant', lines: 6 },
  { role: 'user', lines: 1 },
  { role: 'assistant', lines: 4 },
  { role: 'user', lines: 2 },
  { role: 'assistant', lines: 5 },
  { role: 'user', lines: 1 },
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
      <div className="mx-auto flex h-full max-w-4xl flex-col justify-between gap-6 px-4 pb-8 pt-12 sm:px-5">
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
      {/* Fade both edges where the skeleton meets the surrounding chat chrome. */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}

export function Conversation({ children, className, loading, loadingLabel = 'Loading conversation', messageContents, messageEstimateInputs, hasMore, onLoadMore, scrollToMessageId, showMinimap = false }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // The scroll container may not exist yet on first mount (history still
  // loading renders the skeleton branch), and a plain ref object is not
  // reactive — the minimap used to mount, see `null`, and never set up its
  // size/scroll observers until a remount (e.g. a mobile→desktop resize)
  // happened. Mirror the ref into state so dependents re-observe the moment
  // the element appears.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const attachScrollElement = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el
    setScrollElement(el)
  }, [])
  const sizerRef = useRef<HTMLDivElement | null>(null)
  // Distance from the top of the scroll container to the top of the virtual
  // sizer (top padding + the "load earlier messages" button). The minimap's
  // document spans live in sizer coordinates, so this is what converts a
  // resolved document offset back into a real `scrollTop`.
  const [sizerOffset, setSizerOffset] = useState(0)
  const childItems = useMemo(() => Children.toArray(children), [children])
  const hasContent = childItems.length > 0
  // Per-child role for the minimap, index-aligned with childItems. Anything
  // without an explicit 'user' role (e.g. the streaming queue) reads as agent.
  const minimapRoles = useMemo<Array<'user' | 'agent'>>(
    () =>
      (messageEstimateInputs ?? []).map((m) =>
        m && typeof m === 'object' && 'role' in m && (m as { role?: unknown }).role === 'user'
          ? 'user'
          : 'agent',
      ),
    [messageEstimateInputs],
  )
  // Mirrored so the scroll callbacks that consult roles stay identity-stable.
  const minimapRolesRef = useRef(minimapRoles)
  minimapRolesRef.current = minimapRoles
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [canJumpUp, setCanJumpUp] = useState(false)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [initialScrollReady, setInitialScrollReady] = useState(false)
  const [conversationViewportHeight, setConversationViewportHeight] = useState(0)
  const [topAnchoredMessageId, setTopAnchoredMessageId] = useState<string | null>(null)
  const prevChildCount = useRef(0)
  const prevLoadingRef = useRef(loading)
  const prevScrollTopRef = useRef(0)
  const stickToBottomRef = useRef(true)
  // Once the user scrolls up away from the bottom, stay detached (don't follow
  // new streamed content) until they scroll back down to the bottom edge.
  const detachedRef = useRef(false)
  // Last scrollToMessageId handled, so we only force-scroll on a genuinely new
  // target (not on every re-render while the value stays constant).
  const prevScrollTargetRef = useRef(
    childItems.length === 1 && messageEstimateInputs?.[0]?.role === 'user'
      ? null
      : scrollToMessageId ?? null,
  )
  const pendingTopAlignIdRef = useRef<string | null>(null)
  const heldNewTurnSpaceRef = useRef(false)
  const userScrollingRef = useRef(false)
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const touchStartYRef = useRef<number | null>(null)
  const initialRevealFrameRef = useRef<number | null>(null)
  // Pending re-anchor after a minimap scrub (see detachFromBottom).
  const scrubAnchorFrameRef = useRef<number | null>(null)
  // In-flight "chase the end of the list" frame (see scrollToBottom).
  const bottomSettleFrameRef = useRef<number | null>(null)
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
  // Virtualized total height right before a prepend, so the restore step can
  // compensate scrollTop by exactly how much content was added above the
  // fold — see the comment on the restore effect for why this replaced the
  // DOM-lookup approach.
  const prevTotalSizeRef = useRef(0)

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
    if (!anchor) {
      // Nothing on screen to anchor to — right after a jump (a minimap scrub)
      // the rendered window still belongs to the old position. Drop the anchor
      // instead of keeping the stale one, which would otherwise pull the view
      // back to where the user just scrolled away from on the next reflow.
      anchorKeyRef.current = null
      return
    }
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
  // Reactive mirror of the container width so the minimap can wrap preview lines
  // at the same column width the real prose wraps at.
  const [containerWidth, setContainerWidth] = useState(600)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    containerWidthRef.current = el.clientWidth
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidthRef.current = entry.contentRect.width
        setContainerWidth(entry.contentRect.width)
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

  // Shared height estimate for the virtualizer and the minimap's flat line
  // model, so lines of messages that have not rendered yet (history far above
  // the viewport) are placed on the rail at the same scale the virtualizer
  // expects them to occupy.
  const estimateItemSize = useCallback(
    (index: number) => {
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
    [],
  )

  const virtualizer = useVirtualizer({
    count: childItems.length,
    getScrollElement: () => scrollRef.current,
    initialOffset: INITIAL_CONVERSATION_SCROLL_OFFSET,
    estimateSize: estimateItemSize,
    overscan: 5,
    getItemKey: (index) => {
      const child = childItems[index]
      if (typeof child === 'object' && child !== null && 'key' in child) {
        return String(child.key)
      }
      return index
    },
  })

  // Always-fresh handle for reading virtualizer state from callbacks/effects
  // without needing the (identity-unstable) virtualizer in their deps.
  const virtualizerRef = useRef(virtualizer)
  virtualizerRef.current = virtualizer

  // Index of the user prompt the jump-up button would land on, or null when
  // there is none above the fold. Measurements cover the whole transcript, not
  // just the rendered window, so a prompt far above the viewport is still a
  // valid target.
  const findPreviousUserMessage = useCallback(() => {
    const el = scrollRef.current
    if (!el) return null
    const roles = minimapRolesRef.current
    const measurements = virtualizerRef.current.measurementsCache
    const items = measurements.length > 0 ? measurements : virtualizerRef.current.getVirtualItems()
    return findPreviousMessageIndex(
      items,
      virtualizerRef.current.scrollOffset ?? el.scrollTop,
      (index) => roles[index] === 'user',
    )
  }, [])

  useLayoutEffect(() => {
    if (!scrollElement) return
    const updateViewportHeight = () => setConversationViewportHeight(scrollElement.clientHeight)
    updateViewportHeight()
    const observer = new ResizeObserver(updateViewportHeight)
    observer.observe(scrollElement)
    return () => observer.disconnect()
  }, [scrollElement])

  // Read the total first: `measurementsCache` is only rebuilt as a side effect
  // of measuring, so touching it before `getTotalSize()` on the render that
  // added a message hands back a cache that predates that message.
  const totalSize = virtualizer.getTotalSize()
  const topAnchoredMessageIndex = findConversationItemIndex(childItems, topAnchoredMessageId)
  const topAnchoredMeasurement = topAnchoredMessageIndex < 0
    ? undefined
    : virtualizer.measurementsCache[topAnchoredMessageIndex]
  const newTurnTailPadding = topAnchoredMeasurement
    ? computeNewTurnTailPadding({
        viewportHeight: conversationViewportHeight,
        messageStart: topAnchoredMeasurement.start,
        totalSize,
      })
    : 0

  useLayoutEffect(() => {
    if (newTurnTailPadding > 0) heldNewTurnSpaceRef.current = true
  }, [newTurnTailPadding])

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
    prevTotalSizeRef.current = virtualizerRef.current.getTotalSize()
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
  //
  // This deliberately does not use restoreScrollAnchor()'s DOM-key lookup.
  // Right after a prepend, the virtualizer's render window is still computed
  // from the pre-prepend scrollTop, which now maps to indices near the start
  // of the (longer) list — i.e. the just-loaded oldest batch, not wherever
  // the anchored item ended up. A key lookup for the anchor then finds
  // nothing, compensation silently no-ops, and the user is left staring at
  // the top of the new batch (which reads as "jumped to the start of the
  // chat"). Total-size delta doesn't depend on any item being rendered, so
  // it always applies.
  useLayoutEffect(() => {
    if (!pendingPrependAnchorRef.current) return
    if (childItems.length === prevChildCount.current) return
    pendingPrependAnchorRef.current = false
    clearTimeout(rearmTimerRef.current)
    const el = scrollRef.current
    if (el) {
      const delta = virtualizerRef.current.getTotalSize() - prevTotalSizeRef.current
      if (delta !== 0) {
        restoringAnchorRef.current = true
        el.scrollTop += delta
        requestAnimationFrame(() => {
          restoringAnchorRef.current = false
        })
      }
    }
    // Re-arm only after the view has been put back, so being near the top
    // during the load can't queue another page.
    loadMoreTriggeredRef.current = false
  }, [childItems.length])

  useEffect(() => {
    // Re-arm when the server reports a different pagination state.
    loadMoreTriggeredRef.current = false
  }, [hasMore])

  const updateBottomState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    // A held new-turn reserve leaves deliberate slack below the prompt. That's
    // the feature, not the user having scrolled away, so keep reporting "at the
    // bottom" until they scroll off it themselves — otherwise the scroll-to-
    // bottom button pops up the instant a message is sent.
    const nextIsAtBottom = distanceFromBottom < STICKY_BOTTOM_THRESHOLD_PX
      || (heldNewTurnSpaceRef.current && !detachedRef.current)
    // Re-attaching used to demand a near-exact hit on the bottom edge, which a
    // virtualized list can make unreachable: every wheel tick that lands at the
    // end renders more rows, they measure taller than estimated, and the bottom
    // moves down by more than the tolerance. The user scrolls down forever and
    // never gets stuck to the bottom again. Same tolerance as the button's, so
    // "the button is hidden" and "following the stream" can't disagree.
    const atVeryBottom = distanceFromBottom < STICKY_BOTTOM_THRESHOLD_PX
    const scrollingUp = el.scrollTop < prevScrollTopRef.current
    prevScrollTopRef.current = el.scrollTop

    setIsAtBottom(nextIsAtBottom)
    setCanJumpUp(el.scrollTop > PREVIOUS_MESSAGE_EPSILON_PX && findPreviousUserMessage() != null)

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
  }, [findPreviousUserMessage])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth', settle = false) => {
    const el = scrollRef.current
    if (!el) return
    if (bottomSettleFrameRef.current !== null) {
      cancelAnimationFrame(bottomSettleFrameRef.current)
      bottomSettleFrameRef.current = null
    }
    el.scrollTo({ top: el.scrollHeight, behavior })
    if (!settle) return

    // Rows measure only as they render, so the ones this scroll reveals push
    // the real bottom further down while the scroll is still running — which is
    // why a single scrollTo lands short of the end.
    //
    // Watching the container *grow* isn't enough to catch that: the last row
    // can settle a few pixels taller than the virtualizer's total size without
    // the sizer changing height at all, so the scroll height never "grows" and
    // the chase gives up on a view that is still short of the end. Track the
    // remaining distance to the bottom instead, and only stop once it has stayed
    // closed for a few consecutive frames.
    const deadline = Date.now() + BOTTOM_SETTLE_MS
    let lastTarget = el.scrollHeight
    let stableFrames = 0
    const step = () => {
      bottomSettleFrameRef.current = null
      const current = scrollRef.current
      // Bail out the moment the user takes over — chasing the bottom against
      // someone scrolling up is exactly the yank detaching exists to prevent.
      if (!current || !stickToBottomRef.current || detachedRef.current) return
      const target = current.scrollHeight
      const remaining = target - current.scrollTop - current.clientHeight
      if (remaining > BOTTOM_SETTLE_EPSILON_PX) {
        stableFrames = 0
        // Only re-issue when the destination actually moved; re-targeting the
        // same offset every frame would restart the smooth animation instead of
        // letting it finish.
        if (Math.abs(target - lastTarget) > BOTTOM_SETTLE_EPSILON_PX) {
          lastTarget = target
          current.scrollTo({ top: target, behavior })
        }
      } else {
        stableFrames += 1
      }
      if (stableFrames < BOTTOM_SETTLE_STABLE_FRAMES && Date.now() < deadline) {
        bottomSettleFrameRef.current = requestAnimationFrame(step)
        return
      }
      // Out of time with the view still short of the end: a smooth animation
      // can't converge on a target that keeps moving, so land it outright.
      if (current.scrollHeight - current.scrollTop - current.clientHeight > BOTTOM_SETTLE_EPSILON_PX) {
        current.scrollTop = current.scrollHeight
      }
      updateBottomState()
    }
    bottomSettleFrameRef.current = requestAnimationFrame(step)
  }, [updateBottomState])

  // The minimap moves the container by writing `scrollTop` directly, which no
  // wheel/touch handler ever sees — so `updateBottomState` used to read the
  // resulting scroll event as "not detached" and re-arm stick-to-bottom, and
  // the next height sync (streaming, the ResizeObserver, or the bottom-sync
  // poll) immediately yanked the view back to the end of the transcript.
  // Treat a scrub as exactly the same intent as scrolling by hand: detach, and
  // anchor on whatever the scrub landed on. Called *after* the scroll position
  // is written, so the anchor is captured at the new position.
  const detachFromBottom = useCallback(() => {
    detachedRef.current = true
    if (bottomSettleFrameRef.current !== null) {
      cancelAnimationFrame(bottomSettleFrameRef.current)
      bottomSettleFrameRef.current = null
    }
    if (stickToBottomRef.current) {
      stickToBottomRef.current = false
      setStickToBottom(false)
    }
    captureScrollAnchor()
    // A scrub can jump far enough that the virtualizer has not rendered the
    // destination yet, so the capture above finds nothing to anchor to. Try
    // again once the new window has been laid out.
    if (scrubAnchorFrameRef.current !== null) cancelAnimationFrame(scrubAnchorFrameRef.current)
    scrubAnchorFrameRef.current = requestAnimationFrame(() => {
      scrubAnchorFrameRef.current = null
      captureScrollAnchor()
    })
  }, [captureScrollAnchor])

  const jumpToPreviousMessage = useCallback(() => {
    const target = findPreviousUserMessage()
    if (target == null) return
    virtualizerRef.current.scrollToIndex(target, { align: 'start', behavior: 'smooth' })
    // A programmatic jump is the same intent as scrolling by hand: stop
    // following the stream, and anchor wherever it lands.
    detachFromBottom()
  }, [detachFromBottom, findPreviousUserMessage])

  // When a new user message lands, reserve one viewport below its top edge.
  // This lets the prompt jump to the top immediately, then the reserve shrinks
  // one-for-one as the reply grows. Once real content reaches the bottom edge,
  // the normal stick-to-bottom behavior takes over.
  useLayoutEffect(() => {
    const target = scrollToMessageId ?? null
    if (target == null || target === prevScrollTargetRef.current) return
    prevScrollTargetRef.current = target

    const el = scrollRef.current
    if (!el) return

    detachedRef.current = false
    stickToBottomRef.current = true
    setStickToBottom(true)
    setIsAtBottom(true)
    heldNewTurnSpaceRef.current = false
    pendingTopAlignIdRef.current = target
    setTopAnchoredMessageId(target)
  }, [scrollToMessageId])

  useLayoutEffect(() => {
    const target = topAnchoredMessageId
    if (target == null || pendingTopAlignIdRef.current !== target) return
    if (topAnchoredMessageIndex < 0 || !topAnchoredMeasurement) return
    // The reserved tail padding is what makes the top of the list reachable at
    // all: without it the last message's top is below the maximum scroll
    // offset, and `scrollToIndex` silently clamps back to the end of the
    // transcript. Wait for the render that actually holds the space.
    if (newTurnTailPadding <= 0) return
    pendingTopAlignIdRef.current = null
    virtualizerRef.current.scrollToIndex(topAnchoredMessageIndex, { align: 'start', behavior: 'smooth' })
  }, [topAnchoredMessageId, topAnchoredMessageIndex, topAnchoredMeasurement, newTurnTailPadding])

  useLayoutEffect(() => {
    if (topAnchoredMessageId == null || newTurnTailPadding > 0 || !heldNewTurnSpaceRef.current) return
    heldNewTurnSpaceRef.current = false
    pendingTopAlignIdRef.current = null
    setTopAnchoredMessageId(null)
    // The reply now fills the viewport on its own, so hand back to the normal
    // follow-the-stream behavior — unless the user scrolled away mid-turn, in
    // which case yanking them to the bottom is exactly what detaching forbids.
    if (stickToBottomRef.current) scrollToBottom('auto')
  }, [newTurnTailPadding, scrollToBottom, topAnchoredMessageId])

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
        // A first message that opened the chat has already been anchored to the
        // top by the time this frame runs (the align effect flushes before
        // paint). Dropping back to the bottom here would undo it — and on a
        // one-message chat "the bottom" is a screen of reserved empty space.
        const holdingNewTurnSpace = heldNewTurnSpaceRef.current || pendingTopAlignIdRef.current != null
        if (!holdingNewTurnSpace) {
          positionConversationAtBottom(currentEl)
          setIsAtBottom(true)
        }
        setInitialScrollReady(true)
      })
    }
  }, [childItems.length, loading])

  useEffect(() => {
    return () => {
      if (initialRevealFrameRef.current !== null) {
        cancelAnimationFrame(initialRevealFrameRef.current)
      }
      if (scrubAnchorFrameRef.current !== null) {
        cancelAnimationFrame(scrubAnchorFrameRef.current)
      }
      if (bottomSettleFrameRef.current !== null) {
        cancelAnimationFrame(bottomSettleFrameRef.current)
      }
    }
  }, [])

  // Lightweight safety net: ResizeObserver handles normal height changes.
  // This slower poll catches browser/layout misses without doing scroll math
  // several times per second during long streams.
  useEffect(() => {
    if (!stickToBottom || loading) return
    // While a new turn holds reserved space below it, "not at the bottom" is
    // the intended state — the reserve is exactly the gap this poll would
    // otherwise close, dragging the fresh prompt back off the top of the view.
    if (newTurnTailPadding > 0) return
    const el = scrollRef.current
    if (!el) return
    const id = setInterval(() => {
      if (!stickToBottomRef.current || suppressAutoScrollRef.current) return
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      if (dist > BOTTOM_SYNC_DELTA_PX) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
    }, BOTTOM_SYNC_INTERVAL_MS)
    return () => clearInterval(id)
  }, [stickToBottom, loading, newTurnTailPadding])

  // Observe the virtual sizer for immediate stick-to-bottom response
  // when virtualizer recalculates total height.
  useLayoutEffect(() => {
    const sizerEl = sizerRef.current
    if (!sizerEl || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (newTurnTailPadding > 0) return
      if (!stickToBottomRef.current || suppressAutoScrollRef.current) {
        // Detached: the total size just changed under us. A streaming nested
        // sub-agent card grows an item continuously, and every growth above
        // the viewport shifts everything below it — that reflow, several times
        // a second, is the flicker. Pin the anchor back before reporting state.
        restoreScrollAnchor()
        updateBottomState()
        return
      }
      // Settle here too. A plain follow lands on the height this resize
      // reported, but the row that caused it is measured a frame later — and
      // this call cancels any settle already chasing that, so without one of
      // its own the follow silently gives up a few pixels short.
      scrollToBottom('auto', true)
    })

    observer.observe(sizerEl)
    return () => observer.disconnect()
  }, [newTurnTailPadding, restoreScrollAnchor, scrollToBottom, updateBottomState])

  // Track how far the virtual sizer sits below the top of the scroll *content*.
  // The minimap's document spans are in sizer coordinates, so this offset is
  // what turns a resolved document position into a real `scrollTop`.
  //
  // `getBoundingClientRect` is in viewport coordinates, so the raw difference
  // between the two rects is the sizer's position on screen — which is hugely
  // negative whenever the transcript is scrolled down (and the conversation
  // opens scrolled to the bottom). Adding `scrollTop` converts it back into a
  // position inside the scrollable content, which is the only frame the spans
  // are expressed in. Without this the minimap resolved every scrub through a
  // multi-thousand-pixel offset and clamped to the top or bottom of the chat.
  //
  // The offset only changes when something above the sizer appears or
  // disappears — the "load earlier messages" button and the loading banner —
  // so it is recomputed on mount and whenever either toggles.
  useLayoutEffect(() => {
    const sizerEl = sizerRef.current
    const scrollEl = scrollRef.current
    if (!sizerEl || !scrollEl) return
    setSizerOffset(
      sizerEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop,
    )
  }, [hasMore, loading, hasContent, initialScrollReady])

  // Park the floating controls just left of the minimap rail rather than on top
  // of it — a click meant for a button would otherwise scrub the transcript.
  const floatingControlInset = (showMinimap ? MINIMAP_RAIL_WIDTH_PX : 0) + FLOATING_CONTROL_GAP_PX

  return (
    <AIConversation className={cn('relative flex flex-1 overflow-hidden', className)}>
      {loading && !hasContent ? (
        <ConversationPositioningSkeleton label={loadingLabel} />
      ) : (
        <div
          ref={attachScrollElement}
          onScroll={updateBottomState}
          className="h-full min-w-0 flex-1 overflow-y-auto scrollbar-none"
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
                height: totalSize + newTurnTailPadding,
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

      {initialScrollReady && !loading && canJumpUp && (
        <ConversationScrollButton
          direction="up"
          userTone
          aria-label="Jump to previous user message"
          title="Jump to previous user message"
          className="left-auto top-4 bottom-auto translate-x-0"
          style={{ right: floatingControlInset }}
          onClick={jumpToPreviousMessage}
        />
      )}

      {initialScrollReady && !loading && !isAtBottom && (
        <ConversationScrollButton
          aria-label="Scroll to latest message"
          title="Scroll to latest message"
          className="left-auto bottom-5 translate-x-0"
          style={{ right: floatingControlInset }}
          onClick={() => {
            detachedRef.current = false
            setStickToBottom(true)
            stickToBottomRef.current = true
            scrollToBottom('smooth', true)
          }}
        />
      )}

      {showMinimap && (
        <ConversationMinimap
          virtualizer={virtualizer}
          scrollElement={scrollElement}
          sizerOffset={sizerOffset}
          roles={minimapRoles}
          texts={messageContents ?? EMPTY_MESSAGE_CONTENTS}
          messageInputs={messageEstimateInputs ?? []}
          textWidth={containerWidth}
          onScrub={detachFromBottom}
        />
      )}
    </AIConversation>
  )
}

