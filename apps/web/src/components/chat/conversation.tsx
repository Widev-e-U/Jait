import { useStickToBottom } from 'use-stick-to-bottom'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ConversationProps {
  children: React.ReactNode
  className?: string
}

export function Conversation({ children, className }: ConversationProps) {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom()

  return (
    <div className={cn('relative flex-1 overflow-hidden', className)}>
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <div ref={contentRef} className="max-w-3xl mx-auto px-4 py-6">
          {children}
        </div>
      </div>

      {!isAtBottom && (
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
