import { useState, useRef, useEffect, type ComponentProps } from 'react'
import { MicIcon, MicOffIcon, PhoneOffIcon, MessageSquareTextIcon, SendHorizontal, Loader } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'

// ── Styles matching agents-ui livekit variant ────────────────────

const LK_TOGGLE_ON_OFF = [
  'data-[state=off]:bg-destructive/10 data-[state=off]:text-destructive',
  'data-[state=off]:hover:bg-destructive/15',
  'data-[state=off]:focus-visible:ring-destructive/30',
  'data-[state=on]:bg-accent data-[state=on]:text-accent-foreground',
  'data-[state=on]:hover:bg-foreground/10',
]

const LK_TOGGLE_FEATURE = [
  'data-[state=off]:bg-accent data-[state=off]:hover:bg-foreground/10',
  'data-[state=off]:text-foreground',
  'data-[state=on]:bg-blue-500/20 data-[state=on]:hover:bg-blue-500/30',
  'data-[state=on]:text-blue-700 dark:data-[state=on]:text-blue-300',
  'data-[state=on]:border-blue-700/10 data-[state=on]:ring-blue-700/30',
]

const DISCONNECT_CLASSES =
  'bg-destructive/10 dark:bg-destructive/10 text-destructive hover:bg-destructive/20 dark:hover:bg-destructive/20 focus:bg-destructive/20 focus-visible:ring-destructive/20 rounded-full font-mono text-xs font-bold tracking-wider'

// ── Chat input ───────────────────────────────────────────────────

function ChatInput({ open, onSend }: { open: boolean; onSend: (msg: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const disabled = sending || msg.trim().length === 0

  const send = async () => {
    if (disabled) return
    setSending(true)
    try {
      onSend(msg.trim())
      setMsg('')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])

  return (
    <div className="flex grow items-end gap-2 rounded-md pl-1 text-sm">
      <textarea
        ref={ref}
        autoFocus
        value={msg}
        disabled={!open || sending}
        placeholder="Type something…"
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        onChange={(e) => setMsg(e.target.value)}
        className="field-sizing-content max-h-16 min-h-8 flex-1 resize-none bg-transparent py-2 [scrollbar-width:thin] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Button
        size="icon"
        type="button"
        disabled={disabled}
        variant={disabled ? 'secondary' : 'default'}
        title={sending ? 'Sending…' : 'Send'}
        onClick={send}
        className="self-end rounded-full disabled:cursor-not-allowed"
      >
        {sending ? <Loader className="animate-spin" /> : <SendHorizontal />}
      </Button>
    </div>
  )
}

// ── Control bar ──────────────────────────────────────────────────

export interface VoiceControlBarProps extends ComponentProps<'div'> {
  micActive: boolean
  isConnected: boolean
  showChat?: boolean
  onToggleMic: () => void
  onDisconnect: () => void
  onSendChat?: (msg: string) => void
}

export function VoiceControlBar({
  micActive,
  isConnected,
  showChat = false,
  onToggleMic,
  onDisconnect,
  onSendChat,
  className,
  ...props
}: VoiceControlBarProps) {
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div
      aria-label="Voice assistant controls"
      className={cn(
        'bg-background border-input/50 dark:border-muted flex flex-col border p-3 drop-shadow-md/3 rounded-[31px]',
        className,
      )}
      {...props}
    >
      {/* Expandable chat input */}
      {showChat && (
        <div
          className={cn(
            'border-input/50 flex w-full items-start overflow-hidden border-b transition-all duration-300',
            chatOpen ? 'h-auto opacity-100 mb-3' : 'h-0 opacity-0 mb-0 border-b-0',
          )}
          inert={!chatOpen ? (true as any) : undefined}
        >
          <ChatInput
            open={chatOpen}
            onSend={(msg) => { onSendChat?.(msg); setChatOpen(false) }}
          />
        </div>
      )}

      <div className="flex gap-1">
        <div className="flex grow gap-1">
          {/* Microphone toggle */}
          <Toggle
            aria-label="Toggle microphone"
            pressed={micActive}
            onPressedChange={onToggleMic}
            disabled={!isConnected}
            className={cn(
              'size-9 rounded-full',
              ...LK_TOGGLE_ON_OFF,
            )}
          >
            {micActive ? <MicIcon className="size-4" /> : <MicOffIcon className="size-4" />}
          </Toggle>

          {/* Chat toggle */}
          {showChat && (
            <Toggle
              aria-label="Toggle chat"
              pressed={chatOpen}
              onPressedChange={setChatOpen}
              className={cn(
                'size-9 rounded-full',
                ...LK_TOGGLE_FEATURE,
              )}
            >
              <MessageSquareTextIcon className="size-4" />
            </Toggle>
          )}
        </div>

        {/* Disconnect */}
        <Button
          size="default"
          variant="ghost"
          disabled={!isConnected}
          onClick={onDisconnect}
          className={DISCONNECT_CLASSES}
        >
          <PhoneOffIcon className="size-4" />
          <span className="hidden sm:inline ml-1">END</span>
        </Button>
      </div>
    </div>
  )
}
