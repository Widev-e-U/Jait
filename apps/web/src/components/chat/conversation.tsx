import { Children, useEffect, useLayoutEffect, useRef } from 'react'
import { useStickToBottom } from 'use-stick-to-bottom'
import { ArrowDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ConversationProps {
  children: React.ReactNode
  className?: string
  compact?: boolean
  loading?: boolean
}

export function Conversation({ children, className, compact, loading }: ConversationProps) {
  const { scrollRef, contentRef, isAtBottom, isNearBottom, scrollToBottom } = useStickToBottom({
    initial: 'instant',
    resize: 'instant',
  })

  // Track previous child count to detect bulk history loads
  const prevChildCount = useRef(0)
  const prevLoadingRef = useRef(loading)

  // Jump to the bottom when a history load finishes or the list populates from empty.
  useLayoutEffect(() => {
    const count = Children.count(children)
    const wasEmpty = prevChildCount.current === 0
    const finishedLoading = prevLoadingRef.current && !loading

    prevChildCount.current = count
    prevLoadingRef.current = loading

    if (!loading && count > 0 && (wasEmpty || finishedLoading)) {
      void scrollToBottom('instant')
    }
  }, [children, loading, scrollToBottom])

  // Keep the viewport pinned during streaming updates if the user is already
  // following the conversation. This covers tool-call output growth that can
  // otherwise lag a frame behind.
  useEffect(() => {
    if (loading || (!isAtBottom && !isNearBottom)) return

    const frameId = window.requestAnimationFrame(() => {
      void scrollToBottom('instant')
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [children, loading, isAtBottom, isNearBottom, scrollToBottom])

  return (
    <div className={cn('relative flex-1 overflow-hidden', className)}>
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div ref={scrollRef} className="h-full overflow-y-auto">
          <div ref={contentRef} className={cn('mx-auto py-6', compact ? 'max-w-none px-4' : 'max-w-3xl px-4')}>
            {children}
          </div>
        </div>
      )}

      {!loading && !isAtBottom && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full shadow-md"
          onClick={() => scrollToBottom()}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
