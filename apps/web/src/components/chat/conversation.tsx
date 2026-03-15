import { Children, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ConversationProps {
  children: React.ReactNode
  className?: string
  compact?: boolean
  loading?: boolean
}

const STICKY_BOTTOM_THRESHOLD_PX = 24
type VirtualScrollBehavior = 'auto' | 'smooth'

export function Conversation({ children, className, compact, loading }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const childItems = useMemo(() => Children.toArray(children), [children])
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [stickToBottom, setStickToBottom] = useState(true)
  const prevChildCount = useRef(0)
  const prevLoadingRef = useRef(loading)
  const prevScrollTopRef = useRef(0)

  const virtualizer = useVirtualizer({
    count: childItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => compact ? 180 : 240,
    overscan: 6,
    paddingStart: 24,
    paddingEnd: 24,
  })
  const totalSize = virtualizer.getTotalSize()

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
    if (childItems.length === 0) return
    virtualizer.scrollToIndex(childItems.length - 1, { align: 'end', behavior })
  }, [childItems.length, virtualizer])

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
  }, [childItems.length, totalSize, stickToBottom, loading, scrollToBottom])

  return (
    <div className={cn('relative flex-1 overflow-hidden', className)}>
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={updateBottomState}
          className="h-full overflow-y-auto"
        >
          <div
            style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const child = childItems[virtualRow.index]
              return (
                <div
                  key={typeof child === 'object' && child !== null && 'key' in child ? String(child.key) : virtualRow.index}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className={cn('mx-auto', 'max-w-3xl px-4')}>
                    {child}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && !isAtBottom && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-4 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full shadow-md"
          onClick={() => {
            setStickToBottom(true)
            scrollToBottom()
          }}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
