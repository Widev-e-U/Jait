import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMobileMessageActionsPositionClassName } from '@/components/chat/message-mobile-actions'
import '@/index.css'

function UserBubble({ text }: { text: string }) {
  return (
    <div className="relative max-w-[85%]">
      <div className="min-w-0 rounded-lg bg-muted pl-4 pt-3 pr-6 pb-6 break-words [overflow-wrap:anywhere]">
        {text}
      </div>
      <div className={cn('absolute z-10', getMobileMessageActionsPositionClassName(true, false))}>
        <button
          type="button"
          aria-label="Message actions"
          className="flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors active:text-foreground"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function MobileActionsRepro() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Mobile Actions Repro (user bubble)</h1>
      <div className="flex w-full justify-end px-3 py-1">
        <UserBubble text="This is a user message with a fair amount of text so the three-dot menu overlaps the last line of text on mobile." />
      </div>
      <div className="mt-8 flex w-full justify-end px-3 py-1">
        <UserBubble text="Short message." />
      </div>
    </main>
  )
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Missing root element')
}

createRoot(container).render(
  <StrictMode>
    <MobileActionsRepro />
  </StrictMode>,
)
