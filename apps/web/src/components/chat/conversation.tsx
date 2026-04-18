import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
}

const STICKY_BOTTOM_THRESHOLD_PX = 24
const DEFAULT_ITEM_HEIGHT = 120

export function Conversation({ children, className, loading, loadingLabel = 'Loading conversation', messageContents }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sizerRef = useRef<HTMLDivElement | null>(null)
  const childItems = useMemo(() => Children.toArray(children), [children])
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [stickToBottom, setStickToBottom] = useState(true)
  const prevChildCount = useRef(0)
  const prevLoadingRef = useRef(loading)
  const prevScrollTopRef = useRef(0)
  const stickToBottomRef = useRef(true)
  const userScrollingRef = useRef(false)
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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
    estimateSize: (index) => {
      const text = messageContentsRef.current?.[index]
      if (!text) return DEFAULT_ITEM_HEIGHT
      return estimateMessageHeight(text, containerWidthRef.current)
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

    el.addEventListener('wheel', handleWheel, { passive: true })
    el.addEventListener('touchstart', markUserScroll, { passive: true })
    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('touchstart', markUserScroll)
      clearTimeout(userScrollTimerRef.current)
    }
  }, [loading]) // re-attach when scroll element mounts (loading → !loading)

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
      scrollToBottom('auto')
    }
  }, [childItems.length, loading, scrollToBottom])

  // Continuous poll: while stickToBottom is active, keep us pinned so
  // tool-card expansions/collapses and streaming updates stay anchored.
  useEffect(() => {
    if (!stickToBottom || loading) return
    const el = scrollRef.current
    if (!el) return
    const id = setInterval(() => {
      if (!stickToBottomRef.current) return
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      if (dist > 1) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
    }, 150)
    return () => clearInterval(id)
  }, [stickToBottom, loading])

  // Observe the virtual sizer for immediate stick-to-bottom response
  // when virtualizer recalculates total height.
  useLayoutEffect(() => {
    const sizerEl = sizerRef.current
    if (!sizerEl || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current) {
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
      {loading ? (
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
        >
          <div ref={innerRef} className="mx-auto max-w-3xl px-4 pt-12 pb-6 sm:py-6 sm:px-5">
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

      {!loading && !isAtBottom && (
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
