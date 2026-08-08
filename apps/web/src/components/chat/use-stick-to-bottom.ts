import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * Stick-to-bottom scrolling for a nested, height-capped chat surface
 * (sub-agent cards), matching how the main Conversation behaves: follow the end
 * of the stream while the user is at the bottom, detach the moment they scroll
 * up, and re-attach only when they come back to the very bottom edge.
 *
 * The main Conversation keeps its own copy of this because it also has to deal
 * with virtualization, scroll anchoring and lazy-loaded history; this hook is
 * the plain-DOM subset that a nested scroller needs.
 */

const STICKY_BOTTOM_THRESHOLD_PX = 24
const AT_VERY_BOTTOM_PX = 4
const TOUCH_DETACH_THRESHOLD_PX = 4
const USER_SCROLL_IDLE_MS = 300
const CLICK_SUPPRESS_MS = 400

/**
 * Scroll styling for the nested scroller. Deliberately *not* `overscroll-behavior:
 * contain` like the main conversation: once this card hits its top or bottom
 * edge the gesture should carry on scrolling the conversation behind it, instead
 * of trapping the user inside a 500px box they have to scroll around.
 * The parent conversation still contains the chain, so the page never bounces.
 */
export const NESTED_SCROLL_STYLE: CSSProperties = {
  WebkitOverflowScrolling: 'touch',
  touchAction: 'pan-y',
}

export interface StickToBottomState {
  /** Following the end of the stream. */
  stick: boolean
  /** The user scrolled away and hasn't returned to the bottom edge yet. */
  detached: boolean
}

export interface StickToBottomInput extends StickToBottomState {
  distanceFromBottom: number
  scrollingUp: boolean
  /** Whether a wheel/touch gesture is in flight — layout shifts are not gestures. */
  userScrolling: boolean
}

/**
 * Decide whether to keep following the bottom after a scroll position change.
 *
 * A scroll up made by the user detaches; a scroll caused by content reflow does
 * not. Once detached, only reaching the very bottom edge re-attaches, so
 * content streaming in while the user reads earlier output never yanks them
 * back down.
 */
export function nextStickToBottomState(input: StickToBottomInput): StickToBottomState {
  const { distanceFromBottom, scrollingUp, userScrolling, detached } = input
  if (scrollingUp && userScrolling) return { stick: false, detached: true }
  if (detached) {
    const atVeryBottom = distanceFromBottom < AT_VERY_BOTTOM_PX
    return atVeryBottom && !scrollingUp
      ? { stick: true, detached: false }
      : { stick: false, detached: true }
  }
  return { stick: true, detached: false }
}

/** Whether the viewport counts as "at the bottom" for the scroll-to-bottom button. */
export function isAtBottomDistance(distanceFromBottom: number): boolean {
  return distanceFromBottom < STICKY_BOTTOM_THRESHOLD_PX
}

export interface StickToBottomScroll {
  /** Attach to the scrollable element. */
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Attach to the element wrapping the scroller's content (growth detection). */
  contentRef: React.RefObject<HTMLDivElement | null>
  /** Whether the viewport currently sits at the bottom of the content. */
  isAtBottom: boolean
  /** Wire to the scroll element's onScroll. */
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void
  /** Scroll to the bottom and resume following new content. */
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

export function useStickToBottom(): StickToBottomScroll {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const stickToBottomRef = useRef(true)
  // Once the user scrolls up, stay put until they come back to the bottom edge.
  const detachedRef = useRef(false)
  const userScrollingRef = useRef(false)
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const touchStartYRef = useRef<number | null>(null)
  const prevScrollTopRef = useRef(0)
  // Set briefly after a click inside the card (expanding a tool call or a
  // thinking block) so the resize it causes isn't mistaken for streamed content.
  const suppressAutoScrollRef = useRef(false)
  const suppressAutoScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const updateBottomState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const scrollingUp = el.scrollTop < prevScrollTopRef.current
    prevScrollTopRef.current = el.scrollTop

    setIsAtBottom(isAtBottomDistance(distanceFromBottom))

    const next = nextStickToBottomState({
      distanceFromBottom,
      scrollingUp,
      userScrolling: userScrollingRef.current,
      detached: detachedRef.current,
      stick: stickToBottomRef.current,
    })
    stickToBottomRef.current = next.stick
    detachedRef.current = next.detached
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return
    detachedRef.current = false
    stickToBottomRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
    setIsAtBottom(true)
  }, [])

  // User-gesture tracking: layout-induced scrollTop changes (a tool card
  // collapsing) must not read as the user scrolling away from the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const markUserScroll = () => {
      userScrollingRef.current = true
      clearTimeout(userScrollTimerRef.current)
      userScrollTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false
      }, USER_SCROLL_IDLE_MS)
    }

    const handleWheel = (e: WheelEvent) => {
      markUserScroll()
      if (e.deltaY < 0 && stickToBottomRef.current) {
        stickToBottomRef.current = false
        detachedRef.current = true
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      markUserScroll()
      touchStartYRef.current = e.touches[0]?.clientY ?? null
    }

    const handleTouchMove = (e: TouchEvent) => {
      markUserScroll()
      if (e.touches.length !== 1) return
      const startY = touchStartYRef.current
      const currentY = e.touches[0]?.clientY
      if (startY == null || currentY == null) return
      if (el.scrollHeight <= el.clientHeight) return

      // A finger moving down drags earlier content into view. Momentum keeps
      // moving scrollTop after the finger lifts with no further touchmove
      // events, so detach on the gesture itself rather than waiting for the
      // scroll-event heuristic, which by then no longer sees a user gesture.
      const deltaY = currentY - startY
      if (deltaY > TOUCH_DETACH_THRESHOLD_PX && stickToBottomRef.current) {
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
      }, CLICK_SUPPRESS_MS)
    }

    el.addEventListener('wheel', handleWheel, { passive: true })
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: true })
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
  }, [])

  // Follow content growth while attached; otherwise just refresh the button.
  useLayoutEffect(() => {
    const contentEl = contentRef.current
    if (!contentEl || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current || suppressAutoScrollRef.current) {
        updateBottomState()
        return
      }
      const el = scrollRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
      setIsAtBottom(true)
    })
    observer.observe(contentEl)
    return () => observer.disconnect()
  }, [updateBottomState])

  return { scrollRef, contentRef, isAtBottom, onScroll: updateBottomState, scrollToBottom }
}
