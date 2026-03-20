import { type ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Message({
  className,
  from,
  ...props
}: ComponentProps<'div'> & { from: 'user' | 'assistant' }) {
  return (
    <div
      className={cn(
        'group/message flex w-full',
        from === 'user' ? 'justify-end' : 'justify-start',
        className,
      )}
      data-message-from={from}
      {...props}
    />
  )
}

export function MessageContent({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative min-w-0 max-w-[min(100%,52rem)] rounded-[1.25rem] border px-4 py-3 shadow-sm backdrop-blur-sm',
        'data-[message-from=user]:border-primary/20 data-[message-from=user]:bg-primary/[0.08] data-[message-from=user]:shadow-[0_16px_36px_-28px_hsl(var(--primary)/0.7)]',
        'data-[message-from=assistant]:border-border/70 data-[message-from=assistant]:bg-card/75 data-[message-from=assistant]:shadow-[0_20px_48px_-36px_hsl(var(--foreground)/0.32)]',
        className,
      )}
      {...props}
    />
  )
}

export function MessageActions({
  className,
  ...props
}: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-1', className)} {...props} />
}

export function MessageAction({
  tooltip,
  label,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & { tooltip?: string; label?: string }) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7 rounded-full', className)}
      {...props}
    >
      {children}
      <span className="sr-only">{label ?? tooltip}</span>
    </Button>
  )

  if (!tooltip) return button

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function MessageToolbar({
  className,
  ...props
}: ComponentProps<'div'>) {
  return <div className={cn('mt-3 flex items-center justify-between gap-3', className)} {...props} />
}

export function MessageResponse({
  className,
  children,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-pre:max-w-full prose-pre:overflow-x-auto prose-code:before:content-none prose-code:after:content-none',
        className,
      )}
      {...props}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(children ?? '')}</ReactMarkdown>
    </div>
  )
}
