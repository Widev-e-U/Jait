import { useState, useEffect, useRef } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useToolCardToggleAnchor } from '@/components/chat/tool-card-anchor'
import { cn } from '@/lib/utils'
import { AssistantMarkdown, type OnOpenPath } from '@/components/chat/assistant-markdown'

interface ReasoningProps {
  content: string
  isStreaming: boolean
  duration?: number
  onOpenPath?: OnOpenPath
}

export function Reasoning({ content, isStreaming, duration, onOpenPath }: ReasoningProps) {
  const [open, setOpen] = useState(() => isStreaming && Boolean(content))
  const wasStreaming = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)

  useEffect(() => {
    if (isStreaming && content && !wasStreaming.current) {
      setOpen(true)
      wasStreaming.current = true
    }
    if (!isStreaming && wasStreaming.current) {
      setOpen(false)
      wasStreaming.current = false
    }
  }, [isStreaming, content])

  useEffect(() => {
    if (!isStreaming || !scrollRef.current) return
    if (scrollRafRef.current !== null) return

    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })

    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [content, isStreaming])

  // While the model streams, the block opens itself and is revealed with a
  // layout-neutral fade. Expanding it by hand (even mid-stream) plays a height
  // animation, so anchor the expand like a tool card: pin the block's edge
  // frame by frame instead of letting the transcript follow the bottom and
  // shove the block's header off screen (or let content spill below the
  // composer at the end of the transcript).
  const { cardRef, anchorToggle } = useToolCardToggleAnchor<HTMLDivElement>()
  const handleOpenChange = (next: boolean) => {
    // Anchor every manual toggle (streaming or not) so an expand mid-stream can
    // never shove the header off screen or spill content past the composer.
    if (next) anchorToggle()
    setOpen(next)
  }

  if (!content) return null

  const label = isStreaming
    ? 'Thinking...'
    : duration
      ? `Thought for ${duration}s`
      : 'Thought process'

  return (
    <Collapsible ref={cardRef} open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger className={cn(
        'flex items-center gap-1.5 text-sm transition-colors py-1 rounded-md px-2 -ml-2',
        isStreaming
          ? 'text-amber-500 dark:text-amber-400'
          : 'text-muted-foreground hover:text-foreground',
      )}>
        <Brain className={cn('h-4 w-4', isStreaming && 'animate-pulse')} />
        <span>{label}</span>
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn('reasoning-collapsible', isStreaming && 'reasoning-collapsible-streaming')}
      >
        <div
          ref={scrollRef}
          className={cn(
            'mt-1 px-3 py-2.5 rounded-md border text-sm max-h-60 overflow-y-auto leading-relaxed',
            isStreaming
              ? 'border-amber-500/25 bg-amber-500/[0.04] text-muted-foreground'
              : 'border-border/60 bg-muted/30 text-muted-foreground',
          )}
        >
          <AssistantMarkdown content={content} isStreaming={isStreaming} onOpenPath={onOpenPath} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
