import { ChevronDown, Copy, ClipboardPaste } from 'lucide-react'
import { encodeTerminalKeyAction, type TerminalKeyAction } from './soft-keyboard'
import { TooltipHint } from '@/components/ui/tooltip'

interface SoftKeyDef {
  label: string
  title: string
  /** Terminal key action — encoded via encodeTerminalKeyAction and sent. */
  action?: TerminalKeyAction
  /** Raw text to send instead of an encoded action (punctuation helpers). */
  data?: string
  /** Icon-only buttons. */
  icon?: 'copy' | 'paste'
}

const TERMINAL_SOFT_KEYS: SoftKeyDef[] = [
  { label: 'esc', title: 'Escape', action: 'esc' },
  { label: 'tab', title: 'Tab (completion)', action: 'tab' },
  { label: '^C', title: 'Ctrl+C — interrupt / SIGINT', action: 'ctlc' },
  { label: '^D', title: 'Ctrl+D — EOF / logout', action: 'ctld' },
  { label: '^Z', title: 'Ctrl+Z — suspend process', action: 'ctlz' },
  { label: '^R', title: 'Ctrl+R — search shell history', action: 'ctlr' },
  { label: '^W', title: 'Ctrl+W — delete word', action: 'ctlw' },
  { label: '^L', title: 'Ctrl+L — clear screen', action: 'ctll' },
  { label: '↑', title: 'Arrow up (previous history)', action: 'up' },
  { label: '↓', title: 'Arrow down (next history)', action: 'down' },
  { label: '←', title: 'Arrow left', action: 'left' },
  { label: '→', title: 'Arrow right', action: 'right' },
  { label: 'Home', title: 'Home', action: 'home' },
  { label: 'End', title: 'End', action: 'end' },
  { label: '|', title: 'Pipe', data: '|' },
  { label: '~', title: 'Tilde (home path)', data: '~' },
  { label: '-', title: 'Dash / flag', data: '-' },
  { label: '--', title: 'Double dash / long flag', data: '--' },
  { label: '/', title: 'Slash (path separator)', data: '/' },
  { label: 'Copy', title: 'Copy selection', icon: 'copy' },
  { label: 'Paste', title: 'Paste clipboard', icon: 'paste' },
]

interface TerminalSoftKeyBarProps {
  /** Send a raw data sequence to the terminal (websocket terminal.input). */
  onData: (data: string) => void
  onCopy: () => void
  onPaste: () => void
  onCollapse: () => void
}

/**
 * Horizontal accessory key bar shown while the mobile soft keyboard is open.
 * Buttons must not steal focus (that would close the keyboard), so the
 * focus-stealing tap is neutralised with preventDefault on the synthesized
 * mousedown before the click fires.
 */
export function TerminalSoftKeyBar({ onData, onCopy, onPaste, onCollapse }: TerminalSoftKeyBarProps) {
  const pressKey = (def: SoftKeyDef) => {
    if (def.icon === 'copy') {
      onCopy()
      return
    }
    if (def.icon === 'paste') {
      onPaste()
      return
    }
    const data = def.data ?? (def.action ? encodeTerminalKeyAction(def.action) : null)
    if (data) onData(data)
  }

  return (
    <div
      className="flex items-center gap-1 px-1.5 py-1 border-t bg-background select-none shrink-0 overflow-x-auto"
      style={{ touchAction: 'manipulation' }}
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => e.preventDefault()}
    >
      <TooltipHint content="Hide key bar">
      <button
        type="button"
        aria-label="Hide terminal key bar"
        onClick={onCollapse}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground active:bg-accent active:text-accent-foreground"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      </TooltipHint>
      {TERMINAL_SOFT_KEYS.map((def) => (
        <TooltipHint key={def.label} content={def.title}>
        <button
          type="button"
          aria-label={def.title}
          onClick={() => pressKey(def)}
          className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/40 px-2 text-xs font-medium text-foreground/90 active:bg-accent active:text-accent-foreground"
        >
          {def.icon === 'copy'
            ? <Copy className="h-3.5 w-3.5" />
            : def.icon === 'paste'
              ? <ClipboardPaste className="h-3.5 w-3.5" />
              : def.label}
        </button>
        </TooltipHint>
      ))}
    </div>
  )
}