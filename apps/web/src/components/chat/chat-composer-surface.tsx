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
        // No horizontal padding here: callers sit flush on the shared chat
        // column edge and PromptInput insets its own text, so the box lines up
        // with the transcript gutter instead of drifting inward by a few px.
        'py-1',
        className,
      )}
    >
      {children}
    </footer>
  )
}
