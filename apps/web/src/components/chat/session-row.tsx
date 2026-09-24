import { Loader2, MessageSquare, MessageSquareX } from 'lucide-react'
import type {
  HTMLAttributes,
  MouseEventHandler,
} from 'react'
import { SessionChatIcon } from '@/components/chat/session-chat-icon'
import { formatAgo } from '@/lib/relative-time'
import { TooltipHint } from '@/components/ui/tooltip'
import { parseSessionChatError } from '@/lib/session-chat-selection'

/** Minimal shape both ProjectSession and the switcher's session objects satisfy. */
export interface SessionRowSession {
  id: string
  name?: string | null
  metadata?: string | null
  lastActiveAt?: string | null
  createdAt?: string | null
  viewedAt?: string | null
}

/** True when a session has activity newer than when the user last opened it. */
export function isSessionUnread(session: { lastActiveAt: string; viewedAt: string | null; createdAt?: string | null }): boolean {
  const lastActive = Date.parse(session.lastActiveAt)
  if (!Number.isFinite(lastActive)) return false
  if (!session.viewedAt) return !session.createdAt || lastActive > Date.parse(session.createdAt)
  return lastActive > Date.parse(session.viewedAt)
}

export interface SessionRowProps {
  session: SessionRowSession
  isActive: boolean
  isStreaming?: boolean
  /** Shown when session.name is empty (e.g. "Personal chat" vs "Untitled session"). */
  fallbackLabel?: string
  onRowClick?: () => void
  onRowContextMenu?: MouseEventHandler<HTMLDivElement>
  /** Drag handlers (draggable/onDragStart/onDragEnd) built by the sidebar. */
  dragProps?: Pick<HTMLAttributes<HTMLDivElement>, 'draggable' | 'onDragStart' | 'onDragEnd'>
  /** Extra long-press/pointer handlers spread onto the row. */
  longPressProps?: HTMLAttributes<HTMLDivElement>
}

/**
 * Single chat-session row in the sidebar: status icon, name, provider badge,
 * read state, relative time. Used for both project sessions and personal chats.
 */
export function SessionRow({
  session,
  isActive,
  isStreaming = false,
  fallbackLabel = 'Untitled session',
  onRowClick,
  onRowContextMenu,
  dragProps,
  longPressProps,
}: SessionRowProps) {
  const chatError = parseSessionChatError(session.metadata)
  const unread = isSessionUnread({
    lastActiveAt: session.lastActiveAt ?? '',
    viewedAt: session.viewedAt ?? null,
    createdAt: session.createdAt,
  })
  return (
    <div
      className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm transition-colors ${
        isActive ? 'bg-secondary/70 cursor-default' : 'cursor-pointer hover:bg-muted/40'
      }`}
      onClick={onRowClick}
      onContextMenu={onRowContextMenu}
      {...dragProps}
      {...longPressProps}
    >
      {isStreaming ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      ) : chatError ? (
        <TooltipHint content={`Last reply failed: ${chatError.message}`}>
          <MessageSquareX
            className="h-3.5 w-3.5 shrink-0 text-destructive"
            aria-label="Last reply failed"
          />
        </TooltipHint>
      ) : (
        <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
      )}
      <div className="min-w-0 flex-1">
        <div className={`truncate text-xs ${unread ? 'font-semibold' : 'font-normal'}`}>
          {session.name || fallbackLabel}
        </div>
      </div>
      <SessionChatIcon metadata={session.metadata ?? null} unread={unread} />
      <span className="shrink-0 text-2xs text-muted-foreground">
        {formatAgo(session.lastActiveAt || session.createdAt || '')}
      </span>
    </div>
  )
}