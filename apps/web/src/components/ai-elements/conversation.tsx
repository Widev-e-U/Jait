import { ArrowDown, ArrowUp } from 'lucide-react'
import { type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Conversation({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative flex-1 overflow-hidden bg-transparent shadow-none',
        className,
      )}
      {...props}
    />
  )
}

export function ConversationContent({
  className,
  ...props
}: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-6 p-4 sm:p-5', className)} {...props} />
}

export function ConversationScrollButton({
  className,
  direction = 'down',
  userTone = false,
  ...props
}: ComponentProps<typeof Button> & { direction?: 'up' | 'down'; userTone?: boolean }) {
  const Icon = direction === 'up' ? ArrowUp : ArrowDown
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'absolute bottom-4 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full border-border/80 bg-background shadow-lg',
        userTone &&
          'border-blue-500/40 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 hover:text-blue-500',
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}
