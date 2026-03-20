import { Children, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

  const updateBottomState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nextIsAtBottom = distanceFromBottom < STICKY_BOTTOM_THRESHOLD_PX
    const scrollingUp = el.scrollTop < prevScrollTopRef.current
    prevScrollTopRef.current = el.scrollTop

    setIsAtBottom(nextIsAtBottom)
    setStickToBottom((prev) => {
      if (nextIsAtBottom) return true
      if (scrollingUp && distanceFromBottom > 8) return false
      return prev
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
      scrollToBottom('auto')
    }
  }, [childItems.length, loading, scrollToBottom])

  useLayoutEffect(() => {
    if (loading || childItems.length === 0 || !stickToBottom) return
    const frameId = window.requestAnimationFrame(() => {
      scrollToBottom('auto')
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [childItems.length, stickToBottom, loading, scrollToBottom])

  useLayoutEffect(() => {
    const contentEl = contentRef.current
    if (!contentEl || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (!stickToBottom) {
        updateBottomState()
        return
      }
      scrollToBottom('auto')
    })

    observer.observe(contentEl)
    return () => observer.disconnect()
  }, [scrollToBottom, stickToBottom, updateBottomState])

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
          <div ref={contentRef} className="mx-auto max-w-4xl px-4 py-6 sm:px-5">
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
            scrollToBottom()
          }}
        />
      )}
    </AIConversation>
  )
}
