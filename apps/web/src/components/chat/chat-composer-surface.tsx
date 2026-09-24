import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ChatComposerSurfaceProps {
  children: ReactNode
  className?: string
}

/** Bordered toolbar for chat history, send target, and new chat controls. */
export function ChatComposerSurface({ children, className }: ChatComposerSurfaceProps) {
  return (
    <div
      data-chat-composer-surface="true"
      className={cn(
        'overflow-hidden rounded-xl border bg-background dark:bg-card px-2 py-1',
        className,
      )}
    >
      {children}
    </div>
  )
}
