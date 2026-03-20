import { ArrowDown } from 'lucide-react'
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
        'relative flex-1 overflow-hidden rounded-[1.4rem] border border-border/70 bg-[radial-gradient(circle_at_top,hsl(var(--card))_0%,hsl(var(--background))_72%)] shadow-[0_24px_80px_-48px_hsl(var(--foreground)/0.28)]',
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
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'absolute bottom-4 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full border-border/80 bg-background/92 shadow-lg backdrop-blur',
        className,
      )}
      {...props}
    >
      <ArrowDown className="h-4 w-4" />
    </Button>
  )
}
