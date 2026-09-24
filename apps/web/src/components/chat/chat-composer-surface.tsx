import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ChatComposerSurfaceProps {
  children: ReactNode
  className?: string
}

/** Plain footer for chat history, send target, and new chat controls. */
export function ChatComposerSurface({ children, className }: ChatComposerSurfaceProps) {
  return (
    <footer
      data-chat-composer-surface="true"
      className={cn(
        'px-1 py-1',
        className,
      )}
    >
      {children}
    </footer>
  )
}
