import { useState, useEffect, useRef } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface ReasoningProps {
  content: string
  isStreaming: boolean
  duration?: number
}

export function Reasoning({ content, isStreaming, duration }: ReasoningProps) {
  const [open, setOpen] = useState(false)
  const wasStreaming = useRef(false)

  useEffect(() => {
    if (isStreaming && content) {
      setOpen(true)
      wasStreaming.current = true
    }
    if (!isStreaming && wasStreaming.current) {
      setOpen(false)
      wasStreaming.current = false
    }
  }, [isStreaming, content])

  if (!content) return null

  const label = isStreaming
    ? 'Thinking...'
    : duration
      ? `Thought for ${duration}s`
      : 'Thought process'

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1">
        <Brain className="h-4 w-4" />
        <span>{label}</span>
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn(
          'mt-1 px-3 py-2.5 rounded-md border text-sm text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed',
          isStreaming && 'border-muted-foreground/20 bg-muted/50'
        )}>
          {content}
          {isStreaming && (
            <span className="inline-block w-1 h-3 bg-muted-foreground/40 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
