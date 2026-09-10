import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ChatComposerSurfaceProps {
  children: ReactNode
  className?: string
}

/** Shared visual shell for the primary and additional chat composers. */
export function ChatComposerSurface({ children, className }: ChatComposerSurfaceProps) {
  return (
    <div
      data-chat-composer-surface="true"
      className={cn(
        'overflow-hidden rounded-2xl border bg-background dark:bg-card focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20',
        className,
      )}
    >
      {children}
    </div>
  )
}
