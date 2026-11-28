import { memo } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface MessageRailEntry {
  key: string | number
  index: number
  preview: string
}

export function getMessageRailPreview(text = ''): string {
  const limit = 320
  const trimmed = text.trimStart()
  const preview = trimmed.slice(0, limit).replace(/\s+/g, ' ').trimEnd()
  if (!preview) return 'Message without text'
  return trimmed.length > limit ? `${preview}…` : preview
}

export const ConversationMessageRail = memo(function ConversationMessageRail({ entries, onJump }: {
  entries: readonly MessageRailEntry[]
  onJump: (index: number) => void
}) {
  return (
    <nav className="chat-message-rail" aria-label="Jump to user message">
      <div className="chat-message-rail-scroll scrollbar-none">
        <TooltipProvider delayDuration={100} disableHoverableContent>
          {entries.map(({ key, index, preview }, ordinal) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="chat-message-rail-tick"
                  aria-label={`Message ${ordinal + 1}: ${preview}`}
                  onClick={() => onJump(index)}
                >
                  <span aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8}>
                <span className="block max-w-[min(16rem,45vw)] truncate">{preview}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </nav>
  )
})
