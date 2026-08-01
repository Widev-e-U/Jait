import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import { Conversation as AIConversation, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { cn } from '@/lib/utils'
import { estimateMessageHeight } from '@/lib/pretext-height'

interface ConversationProps {
  children: React.ReactNode
  className?: string
  compact?: boolean
  loading?: boolean
  loadingLabel?: string
  /** Raw text per child item for pretext-based virtual item height estimation. */
  messageContents?: string[]
  /** Whether there are older messages available to load. */
  hasMore?: boolean
  /** Callback to load older messages (scroll-up lazy loading). */
  onLoadMore?: () => void
}

const STICKY_BOTTOM_THRESHOLD_PX = 24
const DEFAULT_ITEM_HEIGHT = 120
const BOTTOM_SYNC_INTERVAL_MS = 500
const BOTTOM_SYNC_DELTA_PX = 8
const ESTIMATE_TEXT_LIMIT = 12_000
export const INITIAL_CONVERSATION_SCROLL_OFFSET = Number.MAX_SAFE_INTEGER

export function positionConversationAtBottom(
  element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop'>,
): void {
  element.scrollTop = element.scrollHeight
}

const MOBILE_SCROLL_CONTAINMENT_STYLE: CSSProperties = {
  WebkitOverflowScrolling: 'touch',
  overscrollBehaviorY: 'contain',
  touchAction: 'pan-y',
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
      <div className="mx-auto flex h-full max-w-3xl flex-col justify-end gap-6 px-4 pb-8 pt-12 sm:px-5">
        <div className="flex animate-pulse items-start gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary/15" />
          <div className="w-full max-w-xl space-y-2 rounded-2xl rounded-tl-md border border-border/40 bg-muted/35 p-4">
            <div className="h-2.5 w-4/5 rounded-full bg-muted-foreground/15" />
            <div className="h-2.5 w-3/5 rounded-full bg-muted-foreground/10" />
            <div className="h-2.5 w-2/5 rounded-full bg-muted-foreground/10" />
          </div>
        </div>
        <div className="flex animate-pulse justify-end [animation-delay:120ms]">
          <div className="w-3/5 max-w-md space-y-2 rounded-2xl rounded-tr-md bg-primary/10 p-4">
            <div className="ml-auto h-2.5 w-5/6 rounded-full bg-primary/15" />
            <div className="ml-auto h-2.5 w-1/2 rounded-full bg-primary/10" />
          </div>
        </div>
        <div className="flex animate-pulse items-start gap-3 [animation-delay:240ms]">
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary/15" />
          <div className="w-4/5 max-w-lg space-y-2 rounded-2xl rounded-tl-md border border-border/40 bg-muted/35 p-4">
            <div className="h-2.5 w-full rounded-full bg-muted-foreground/15" />
            <div className="h-2.5 w-2/3 rounded-full bg-muted-foreground/10" />
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}

export function Conversation({ children, className, loading, loadingLabel = 'Loading conversation', messageContents, hasMore, onLoadMore }: ConversationProps) {
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
  const userScrollingRef = useRef(false)
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const touchStartYRef = useRef<number | null>(null)
  const initialRevealFrameRef = useRef<number | null>(null)
  // Set briefly after a click inside the conversation (e.g. expanding a tool
  // call or reasoning block) so the resize this causes doesn't get treated
  // as new streamed content and yank the view down to the bottom.
  const suppressAutoScrollRef = useRef(false)
  const suppressAutoScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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

  const virtualizer = useVirtualizer({
    count: childItems.length,
    getScrollElement: () => scrollRef.current,
    initialOffset: INITIAL_CONVERSATION_SCROLL_OFFSET,
    estimateSize: (index) => {
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
  useEffect(() => {
    // Reset trigger guard when hasMore changes (e.g. new batch loaded)
    loadMoreTriggeredRef.current = false
  }, [hasMore, childItems.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !hasMore || !onLoadMore) return

    const handleScroll = () => {
      if (loadMoreTriggeredRef.current) return
      if (el.scrollTop < 200) {
        loadMoreTriggeredRef.current = true
        const prevHeight = el.scrollHeight
        onLoadMore()
        // After older messages are prepended, maintain scroll position
        requestAnimationFrame(() => {
          const newHeight = el.scrollHeight
          el.scrollTop += newHeight - prevHeight
        })
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [hasMore, onLoadMore, childItems.length])

  const updateBottomState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nextIsAtBottom = distanceFromBottom < STICKY_BOTTOM_THRESHOLD_PX
    const scrollingUp = el.scrollTop < prevScrollTopRef.current
    prevScrollTopRef.current = el.scrollTop

    setIsAtBottom(nextIsAtBottom)
    setStickToBottom((prev) => {
      // If the user is actively scrolling up, never re-enable stick-to-bottom
      // even if we're still near the bottom edge.
      if (scrollingUp && userScrollingRef.current) {
        stickToBottomRef.current = false
        return false
      }
      const next = nextIsAtBottom ? true : prev
      stickToBottomRef.current = next
      return next
    })
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
        updateBottomState()
        return
      }
      scrollToBottom('auto')
    })

    observer.observe(sizerEl)
    return () => observer.disconnect()
  }, [scrollToBottom, updateBottomState])

  return (
    <AIConversation className={cn('relative flex-1 overflow-hidden', className)}>
      {loading && !hasContent ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background px-4 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>{loadingLabel}</span>
          </div>
        </div>
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
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                <span>{loadingLabel}</span>
              </div>
            </div>
          )}
          <div ref={innerRef} className="mx-auto max-w-3xl px-4 pt-12 pb-6 sm:py-6 sm:px-5">
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
            setStickToBottom(true)
            stickToBottomRef.current = true
            scrollToBottom()
          }}
        />
      )}
    </AIConversation>
  )
}
