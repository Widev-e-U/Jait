import {
  CircleQuestionMark,
  Loader2,
  MessageSquare,
  MessageSquareX,
  MousePointerClick,
  ShieldQuestion,
  TerminalSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  HTMLAttributes,
  MouseEventHandler,
} from 'react'
import type { SessionWait, SessionWaitKind } from '@jait/shared'
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
  isWaitingForApproval?: boolean
  /** True while the chat has an open question awaiting the user's answer. */
  isAwaitingAnswer?: boolean
  /**
   * Why the chat is stopped right now, straight from the gateway. Takes
   * precedence over the legacy `isAwaitingAnswer`/`isWaitingForApproval`
   * booleans so every user-facing wait — a question, approval, a secret, a
   * terminal prompt, browser control — is visible in the list. Waits with no
   * row icon (a running background command) are ignored here.
   */
  wait?: SessionWait
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
 * One icon per wait reason that actually stops the chat for the user.
 *
 * `background` (a command the agent asked to be woken up for) has no entry on
 * purpose: it is the agent's own reminder, it lingers for the whole run and it
 * used to badge rows that were simply working, so those rows keep their
 * streaming spinner / normal chat icon instead.
 */
const SESSION_WAIT_ICONS: Partial<Record<SessionWaitKind, LucideIcon>> = {
  question: CircleQuestionMark,
  consent: ShieldQuestion,
  secret: ShieldQuestion,
  browser: MousePointerClick,
  terminal: TerminalSquare,
}

/** Icon for a wait reason, or undefined when the wait needs no row badge. */
export function sessionWaitIcon(wait: SessionWait | undefined): LucideIcon | undefined {
  return wait ? SESSION_WAIT_ICONS[wait.kind] : undefined
}

/** Icon + tooltip for one wait reason. Blocking waits are amber, non-blocking ones pulse. */
function SessionWaitIcon({ wait, Icon }: { wait: SessionWait; Icon: LucideIcon }) {
  const title = wait.detail ? `${wait.label} — ${wait.detail}` : wait.label
  const tone = wait.blocking ? 'text-amber-500' : 'text-muted-foreground'
  return (
    <TooltipHint content={title}>
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${tone} ${wait.blocking ? '' : 'animate-pulse'}`}
        aria-label={title}
        data-testid={`session-row-wait-${wait.kind}`}
      />
    </TooltipHint>
  )
}

/**
 * Single chat-session row in the sidebar: status icon, name, provider badge,
 * read state, relative time. Used for both project sessions and personal chats.
 */
export function SessionRow({
  session,
  isActive,
  isStreaming = false,
  isWaitingForApproval = false,
  isAwaitingAnswer = false,
  wait,
  fallbackLabel = 'Untitled session',
  onRowClick,
  onRowContextMenu,
  dragProps,
  longPressProps,
}: SessionRowProps) {
  const chatError = parseSessionChatError(session.metadata)
  const waitIcon = sessionWaitIcon(wait)
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
      {wait && waitIcon ? (
        <SessionWaitIcon wait={wait} Icon={waitIcon} />
      ) : isAwaitingAnswer ? (
        <TooltipHint content="Waiting for your answer">
          <CircleQuestionMark
            className="h-3.5 w-3.5 shrink-0 text-amber-500"
            aria-label="Waiting for your answer"
            data-testid="session-row-question"
          />
        </TooltipHint>
      ) : isWaitingForApproval ? (
        <TooltipHint content="Waiting for approval">
          <ShieldQuestion className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Waiting for approval" />
        </TooltipHint>
      ) : isStreaming ? (
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
        <div className={`truncate text-xs ${unread ? 'font-bold text-foreground' : 'font-normal'}`}>
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