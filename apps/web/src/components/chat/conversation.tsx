import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Conversation as AIConversation, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { cn } from '@/lib/utils'

interface ConversationProps {
  children: React.ReactNode
  className?: string
  compact?: boolean
  loading?: boolean
}

const STICKY_BOTTOM_THRESHOLD_PX = 24
type VirtualScrollBehavior = 'auto' | 'smooth'

export function Conversation({ children, className, loading }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const childItems = useMemo(() => Children.toArray(children), [children])
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [stickToBottom, setStickToBottom] = useState(true)
  const prevChildCount = useRef(0)
  const prevLoadingRef = useRef(loading)
  const prevScrollTopRef = useRef(0)
  const stickToBottomRef = useRef(true)
  const userScrollingRef = useRef(false)
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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

  const scrollToBottom = useCallback((behavior: VirtualScrollBehavior = 'smooth') => {
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

  // Continuous rAF loop: while stickToBottom is active, poll every frame
  // so tool-card expansions/collapses (which may not trigger a
  // ResizeObserver on the content wrapper) still keep us pinned.
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

  useLayoutEffect(() => {
    const contentEl = contentRef.current
    if (!contentEl || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current) {
        updateBottomState()
        return
      }
      scrollToBottom('auto')
    })

    observer.observe(contentEl)
    return () => observer.disconnect()
  }, [scrollToBottom, updateBottomState])

  return (
    <AIConversation className={cn('relative flex-1 overflow-hidden', className)}>
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background px-4 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Loading conversation</span>
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={updateBottomState}
          className="h-full overflow-y-auto"
        >
          <div ref={contentRef} className="mx-auto max-w-3xl px-4 py-6 sm:px-5">
            {childItems.map((child, index) => (
              <div
                key={typeof child === 'object' && child !== null && 'key' in child ? String(child.key) : index}
                data-index={index}
              >
                {child}
              </div>
            ))}
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
