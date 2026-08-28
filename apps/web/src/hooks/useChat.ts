import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { flushSync } from 'react-dom'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'
import type { TodoItem } from '@/components/chat/todo-list'
import type { ChangedFile, FileChangeState } from '@/components/chat/files-changed'
import type { QueuedMessage } from '@/components/chat/message-queue'
import { pushSSEDebugEvent } from '@/components/debug/sse-debug-panel'
import { getApiUrl } from '@/lib/gateway-url'
import { getToolFilePath } from '@/lib/tool-call-body'
import { parseContextFlowEvent } from '@/lib/context-flow'
import { normalizeTodoStateValue } from '@/lib/todo-state'
import type { RuntimeMode } from '@/lib/agents-api'
import { createOptimisticAssistantPlaceholder, mergeSnapshotMessagesWithOptimisticUsers } from '@/lib/optimistic-chat-messages'
import {
  deleteCachedChatHistory,
  getChatCacheScope,
  INITIAL_CHAT_HISTORY_MESSAGE_LIMIT,
  readCachedChatHistory,
  readCachedStartupChat,
  reconcileChatHistory,
  reuseUnchangedMessages,
  selectImmediateChatHistory,
  writeCachedChatHistory,
} from '@/lib/chat-history-cache'
import { normalizeMessageSegments } from '@/lib/stream-segments'
import { createMessageStream, snapshotToChatMessageUpdates, type MessageStreamSnapshot, type MessageStreamWriter } from '@/lib/message-stream'
import { createStreamRenderScheduler } from '@/lib/stream-render-scheduler'
import { createStreamTextPacer } from '@/lib/stream-text-pacer'
import { createStartupChatCacheWriter } from '@/lib/startup-chat-cache-writer'
import {
  openSessionEventSubscription,
  type SessionEventSubscription,
} from '@/lib/session-event-subscription'
import { providerTypeFromId, type ResponseStyle } from '@jait/shared'
import {
  parseLegacyReferencedFilesBlock,
  parseUserMessageSegments,
  userMessageTextFromSegments,
  userReferencedFilesFromSegments,
  type UserMessageSegment,
} from '@/lib/user-message-segments'

const API_URL = getApiUrl()
const STREAM_SNAPSHOT_LIMIT = INITIAL_CHAT_HISTORY_MESSAGE_LIMIT
// Older history remains available in larger batches when the user scrolls up.
const LAZY_LOAD_BATCH_SIZE = 60
const TRANSIENT_CONNECTION_MESSAGE = 'Connection interrupted. Attempting to reconnect...'
/**
 * How many consecutive failed reconnects before the banner appears. The gateway
 * replays every event after `Last-Event-ID`, so a short drop loses nothing and
 * repairs itself within one retry — surfacing it immediately was pure noise.
 */
const RECONNECT_ATTEMPTS_BEFORE_BANNER = 3
/** Bounded retries for the one-shot snapshot fetch that seeds the subscription. */
const SNAPSHOT_RETRY_DELAYS_MS = [400, 1_200, 3_000]

function authHeaders(token?: string | null): Record<string, string> {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function createOptimisticMessageId(prefix: 'user' | 'assistant'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getVisibleChangedFiles(changedFiles: ChangedFile[], isSwitchingSession: boolean): ChangedFile[] {
  return isSwitchingSession ? [] : changedFiles
}

function isTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return false
  const message = error.message.toLowerCase()
  return (
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('load failed') ||
    message.includes('network connection was lost') ||
    message.includes('the internet connection appears to be offline')
  )
}

export function shouldResumeChatSession(params: {
  sessionId: string | null
  isLoading: boolean
  isLoadingHistory: boolean
  messageCount: number
  error?: string | null
  forceRefresh?: boolean
}): boolean {
  if (!params.sessionId || params.isLoadingHistory) return false
  return params.forceRefresh === true
    || params.isLoading
    || params.messageCount === 0
    || params.error === TRANSIENT_CONNECTION_MESSAGE
}

export type ChatWakeRecoveryAction = 'snapshot' | 'none'

export function getChatWakeRecoveryAction(params: {
  sessionId: string | null
  isLoading: boolean
  isLoadingHistory: boolean
  messageCount: number
  error?: string | null
  hasSubscription: boolean
}): ChatWakeRecoveryAction {
  if (!shouldResumeChatSession({ ...params, forceRefresh: true })) return 'none'
  // Replaying from Last-Event-ID cannot repair a frame the backgrounded client
  // already consumed but never committed to React. A snapshot is authoritative
  // for both active and completed turns, then the new subscription resumes from
  // that snapshot's exact sequence without losing later events.
  return 'snapshot'
}

export function shouldShowContinueAfterDone(event: { hit_max_rounds?: unknown; has_timed_out_tools?: unknown }): boolean {
  return event.hit_max_rounds === true || event.has_timed_out_tools === true
}

export function shouldFlushStreamTextImmediately(eventType: unknown): boolean {
  // Preserve the provider's text cadence. Tool output may still be coalesced,
  // but visible assistant text and thinking must reach React per stream delta.
  return eventType === 'token' || eventType === 'thinking' || eventType === 'mode_notice'
}

const STREAMING_FLUSH_DEADLINE_MS = 300

export function shouldForceMessageLifecycleRefresh(event: 'started' | 'complete'): boolean {
  return event === 'started' || event === 'complete'
}

/**
 * The gateway emits a synthetic `request` event as the first event of every
 * turn — local send, queued drain, or a hidden background-command notification.
 * Because the `/events` subscription now outlives individual turns, this is what
 * tells the consumer to start a fresh assistant message instead of appending to
 * the previous turn's segment list.
 */
export function isTurnStartEvent(eventType: unknown): boolean {
  return eventType === 'request'
}

/**
 * A turn's last event. After one of these the consumer drops its per-turn
 * accumulator so the next `request` starts clean.
 */
export function isTurnEndEvent(eventType: unknown): boolean {
  return eventType === 'done' || eventType === 'error'
}

/**
 * Extract the server-assigned queue entry from the 202 response to POST
 * /api/chat.
 *
 * This is the one and only place the client still parses an SSE body. The
 * gateway answers a send that arrives mid-turn with 202 and a two-event body
 * (`queued` then `done`) and then closes — the message never becomes a turn, so
 * it produces nothing on the `/events` stream to read it from instead. The body
 * is two lines and already complete, so it is read with `response.text()`
 * rather than a reader loop.
 */
export function parseQueuedChatResponse(body: string): Record<string, unknown> | null {
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      const data = JSON.parse(line.slice(6)) as Record<string, unknown>
      if (data.type === 'queued') return data
    } catch {
      // Partial or non-JSON line — the caller falls back to the WS broadcast,
      // which is the authoritative source for queue state anyway.
    }
  }
  return null
}

export function reconcileQueuedMessagesAtTurnStart(
  queue: QueuedChatMessage[],
  startedContent: unknown,
): QueuedChatMessage[] {
  if (typeof startedContent !== 'string') return queue
  const normalizedContent = startedContent.trim()
  if (!normalizedContent) return queue

  const nextQueue = queue.filter((item) => item.content.trim() !== normalizedContent)
  return nextQueue.length === queue.length ? queue : nextQueue
}

function attachmentsFromSegments(segments: UserMessageSegment[] | undefined): ChatAttachment[] | undefined {
  if (!segments?.length) return undefined
  const attachments = segments.flatMap((segment) => (
    segment.type === 'image' || segment.type === 'attachment'
      ? [{
          name: segment.name,
          mimeType: segment.mimeType,
          data: segment.data,
          ...(segment.type === 'image' ? { preview: `data:${segment.mimeType};base64,${segment.data}` } : {}),
        }]
      : []
  ))
  return attachments.length > 0 ? attachments : undefined
}

function mergeChatAttachments(
  explicitAttachments: ChatAttachment[] | undefined,
  segmentAttachments: ChatAttachment[] | undefined,
): ChatAttachment[] | undefined {
  const merged: ChatAttachment[] = []
  const seen = new Set<string>()
  for (const attachment of [...(explicitAttachments ?? []), ...(segmentAttachments ?? [])]) {
    const key = `${attachment.name}:${attachment.mimeType}:${attachment.data}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(attachment)
  }
  return merged.length > 0 ? merged : undefined
}

function finiteTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * A segment in the ordered response stream. Consecutive tool calls
 * are grouped; text between tool-call groups forms its own segment.
 */
export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'toolGroup'; callIds: string[] }
  | { type: 'error'; content: string }
  /** A user message injected into a running turn via steering, anchored at the point it was received. */
  | { type: 'steering'; content: string; displayContent?: string }

/**
 * Segments for a turn the gateway ended with an error — a rate limit, spent
 * quota, or unreachable backend — with the failure appended where it happened.
 *
 * Keeps everything that streamed (text, reasoning, tool cards) rather than
 * replacing the turn with a bare error line, and mirrors the transcript the
 * gateway persists for the same failure so the message doesn't change shape
 * on reload.
 */
export function segmentsWithError(snapshot: MessageStreamSnapshot, message: string): MessageSegment[] {
  const base = snapshot.segments.length > 0
    ? snapshot.segments
    : snapshot.content
      ? [{ type: 'text' as const, content: snapshot.content }]
      : []
  return [...base, { type: 'error', content: message }]
}

export interface LlmContextFlowRound {
  round: number
  createdAt: string
  model: string
  messages: Array<Record<string, unknown>>
  tools?: unknown[]
  tool_choice?: 'auto'
  /** Per-round metrics (timing, tokens, context budget). */
  metrics?: RoundMetrics
}

/** Per-round performance and token metrics. */
export interface RoundMetrics {
  durationMs: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  tokensPerSecond?: number
  contextUsage?: {
    system: number
    history: number
    toolResults: number
    tools: number
    total: number
    limit: number
    ratio: number
    pruned?: boolean
  }
}

export interface LlmContextFlow {
  provider: string
  model?: string
  rounds: LlmContextFlowRound[]
  note?: string
  memory?: {
    query: string
    retrieved: Array<{
      id: string
      scope: 'project' | 'contact'
      source: string
      sourceType?: string
      sourceId?: string
      sourceSurface?: string
      updatedAt: string
      content: string
    }>
    injectedIds: string[]
    ignoredIds: string[]
    savedIds: string[]
  }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /**
   * Visible system notice (e.g. a background terminal command finishing) —
   * rendered as a small gray line where a user message would be.
   */
  kind?: 'system-notice'
  /** Local-only user message awaiting confirmation from a server snapshot. */
  optimistic?: boolean
  /** Injected into a running agent turn via steering rather than sent as a normal turn. */
  steered?: boolean
  /** Clean display text for user messages (without appended file contents) */
  displayContent?: string
  /** File references attached by the user (shown as chips in the bubble) */
  referencedFiles?: { path: string; name: string }[]
  /** Ordered display model for inline user text + file chips. */
  displaySegments?: UserMessageSegment[]
  /** Inline image/file attachments associated with the user message. */
  attachments?: ChatAttachment[]
  thinking?: string
  thinkingDuration?: number
  toolCalls?: ToolCallInfo[]
  /** Outbound model request snapshots that produced this response. */
  contextFlow?: LlmContextFlow
  /** Lightweight badge: message has a contextFlow payload (lazy-loaded on demand). */
  hasContextFlow?: boolean
  /** Lightweight badge: message has injected memory provenance (lazy-loaded). */
  hasMemoryProvenance?: boolean
  /**
   * Ordered interleaving of text and tool-call groups.
   * Present on messages built from a live stream; absent on
   * historical snapshots (renderer falls back to old layout).
   */
  segments?: MessageSegment[]
}

type RawSnapshotMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  systemNotice?: boolean
  contextFlow?: LlmContextFlow
  hasContextFlow?: boolean
  hasMemoryProvenance?: boolean
  thinking?: string
  segments?: unknown[]
  toolCalls?: Array<{
    callId: string
    parentCallId?: string
    tool: string
    args: Record<string, unknown>
    status?: 'pending' | 'running' | 'success' | 'error'
    approvalRequestId?: string
    approvalState?: 'pending' | 'approved' | 'rejected'
    ok?: boolean
    message?: string
    output?: string
    data?: unknown
    streamingOutput?: string
    startedAt?: number
    completedAt?: number
    /** Ordered child segments of a sub-agent tool call (text/thinking/nested tool groups) so a reload replays the full interleaved layout. */
    childSegments?: MessageSegment[]
  }>
}

/** Shared by the live resume-stream loop and the one-shot snapshot fetch (see loadedMessagesSessionRef). */
function mapSnapshotMessages(rawMsgs: RawSnapshotMessage[], snapshotStreaming: boolean): ChatMessage[] {
  return rawMsgs.map(m => {
    const safeContent = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? (m.content as Array<{type?: string; text?: string}>).filter(p => p.type === 'text').map(p => p.text ?? '').join('') : String(m.content ?? ''))
    // Visible system notices (e.g. background terminal commands) are
    // surfaced as a right-aligned gray line rather than a bubble.
    if (m.role === 'system') {
      return { id: m.id, role: 'user', kind: 'system-notice', content: safeContent }
    }
    const msg: ChatMessage = { id: m.id, role: m.role, content: safeContent, thinking: m.thinking }
    if (m.hasContextFlow) msg.hasContextFlow = true
    if (m.hasMemoryProvenance) msg.hasMemoryProvenance = true
    if (m.role === 'user' && Array.isArray(m.segments) && m.segments.length > 0) {
      msg.displaySegments = parseUserMessageSegments(m.segments)
      msg.displayContent = userMessageTextFromSegments(msg.displaySegments)
      msg.referencedFiles = userReferencedFilesFromSegments(msg.displaySegments)
      msg.attachments = attachmentsFromSegments(msg.displaySegments)
    } else if (m.role === 'user') {
      const parsed = parseLegacyReferencedFilesBlock(m.content)
      if (parsed.files.length > 0) {
        msg.displayContent = parsed.text
        msg.referencedFiles = parsed.files
        msg.displaySegments = parsed.displaySegments
        msg.attachments = attachmentsFromSegments(msg.displaySegments)
      }
    } else if (Array.isArray(m.segments) && m.segments.length > 0) {
      msg.segments = normalizeMessageSegments(m.segments)
    }
    if (m.toolCalls && m.toolCalls.length > 0) {
      msg.toolCalls = m.toolCalls.map(tc => {
        // Streaming snapshots may provide explicit running status.
        // Persisted DB snapshots provide ok/message for completed calls.
        let status: 'pending' | 'running' | 'success' | 'error' =
          tc.status ?? (tc.ok ? 'success' as const : 'error' as const)
        // Safety net: if the server says streaming is done, no tool
        // call should remain in 'running' or 'pending' state (handles race conditions).
        if ((status === 'running' || status === 'pending') && !snapshotStreaming) status = 'error'
        const completedAt = finiteTimestamp(tc.completedAt)
        const startedAt = finiteTimestamp(tc.startedAt) ?? completedAt ?? Date.now()
        const resolvedCompletedAt =
          status === 'running' || status === 'pending'
            ? undefined
            : completedAt != null && completedAt >= startedAt
              ? completedAt
              : startedAt
        return {
          callId: tc.callId,
          parentCallId: tc.parentCallId,
          approvalRequestId: tc.approvalRequestId,
          approvalState: tc.approvalState,
          tool: tc.tool,
          args: tc.args ?? {},
          status,
          result: status === 'running' || status === 'pending'
            ? undefined
            : {
                ok: !!tc.ok,
                message: tc.message ?? 'Cancelled',
                // Prefer full data object (new format); fall back to
                // { output } wrapper for old persisted rows.
                data: tc.data ?? (tc.output != null ? { output: tc.output } : undefined),
              },
          streamingOutput: tc.streamingOutput,
          childSegments: tc.childSegments,
          startedAt,
          completedAt: resolvedCompletedAt,
        }
      })
    }
    return msg
  })
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  isLoadingHistory: boolean
  promptCount: number
  remainingPrompts: number | null
  error: string | null
  /** Whether the last response was cut short by hitting the max tool rounds limit */
  hitMaxRounds: boolean
  /** Whether there are older messages available for lazy loading */
  hasMore: boolean
  /** Total message count on the server (for lazy loading progress) */
  totalMessages: number
}

/** Execution context info sent by the gateway at the start of a CLI session */
export interface SessionInfo {
  provider: string
  projectPath: string
  isRemote: boolean
  remoteNode?: { nodeId: string; nodeName: string; platform: string }
}

export type ChatMode = 'ask' | 'agent' | 'swarm' | 'plan'

/** Context window usage breakdown from the gateway */
export interface ContextUsage {
  system: number
  history: number
  toolResults: number
  tools: number
  total: number
  limit: number
  ratio: number
  pruned?: boolean
}

export interface PlanAction {
  id: string
  tool: string
  args: unknown
  description: string
  order: number
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
  result?: { ok: boolean; message: string; data?: unknown }
}

export interface PlanData {
  plan_id: string
  summary: string
  actions: PlanAction[]
}

export interface ChatAttachment {
  name: string
  mimeType: string
  data: string
  preview?: string
}

interface ChatHttpErrorContext {
  provider?: string
  attachments?: ChatAttachment[]
  displaySegments?: UserMessageSegment[]
}

function hasImageAttachment(context: ChatHttpErrorContext): boolean {
  return (
    context.attachments?.some((attachment) => attachment.mimeType.toLowerCase().startsWith('image/')) ||
    context.displaySegments?.some((segment) => segment.type === 'image') ||
    false
  )
}

export function formatChatHttpError(status: number, context: ChatHttpErrorContext = {}): string {
  if (status === 413) {
    if (context.provider && providerTypeFromId(context.provider) === 'codex' && hasImageAttachment(context)) {
      return 'Codex cannot use image uploads in Jait yet, and this image is too large for the gateway to accept. Remove the image or reference it as a project file path instead.'
    }
    if (hasImageAttachment(context)) {
      return 'That image is too large for this chat request. Use a smaller image or reference it as a project file path instead.'
    }
    return 'That chat request is too large for the gateway. Remove large attachments or reference files from the project instead.'
  }
  return `HTTP ${status}`
}

export function buildReasoningEffortRequestField(
  reasoningEffort: string | null | undefined,
): { reasoningEffort?: string | null } {
  return reasoningEffort === undefined ? {} : { reasoningEffort }
}

interface SendMessageOptions {
  token?: string | null
  sessionId?: string | null  // explicit override — avoids stale-closure race after createSession
  sessionIdPromise?: Promise<string | null>
  onLoginRequired?: () => void
  mode?: ChatMode
  /** CLI provider to use for this message (jait, codex, claude-code) */
  provider?: string
  runtimeMode?: RuntimeMode
  responseStyle?: ResponseStyle
  /** Model override for CLI providers */
  model?: string | null
  /** Provider-specific reasoning/thinking effort */
  reasoningEffort?: string | null
  /** Clean display text for user message (without file contents appended) */
  displayContent?: string
  /** File references to attach as metadata on the user message */
  referencedFiles?: { path: string; name: string }[]
  /** Ordered text/file segments for UI rendering. */
  displaySegments?: UserMessageSegment[]
  /** File attachments (images, documents) as base64 data */
  attachments?: ChatAttachment[]
  /** True when the message originates from the local queue and should roll back on send failure. */
  queued?: boolean
  /**
   * Raw content of the message being restarted-from, as currently rendered.
   * Lets the server cross-check that the index/id it resolved actually
   * points at the message the user clicked, instead of trusting a
   * positional index that can drift from a locally stale message list.
   */
  expectedContent?: string
}

interface QueuedChatMessage extends QueuedMessage {
  provider?: string
  runtimeMode?: RuntimeMode
  responseStyle?: ResponseStyle
  model?: string | null
  reasoningEffort?: string | null
  mode?: ChatMode
  referencedFiles?: { path: string; name: string }[]
  displaySegments?: UserMessageSegment[]
  attachments?: ChatAttachment[]
}

type SendMessageResult = 'sent' | 'retry' | 'aborted' | 'queued'

/**
 * @param sessionId - externally managed session ID (from useSessions)
 */
export function useChat(
  sessionId: string | null,
  authToken?: string | null,
  onLoginRequired?: () => void,
  projectSurfaceId?: string | null,
  sessionLastActiveAt?: string | null,
) {
  const cacheScope = getChatCacheScope(authToken, API_URL)
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    isLoadingHistory: false,
    promptCount: 0,
    remainingPrompts: null,
    error: null,
    hitMaxRounds: false,
    hasMore: false,
    totalMessages: 0,
  })

  const [pendingPlan, setPendingPlan] = useState<PlanData | null>(null)
  const [todoList, setTodoList] = useState<TodoItem[]>([])
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([])
  const [messageQueue, setMessageQueue] = useState<QueuedChatMessage[]>([])
  const [completionCount, setCompletionCount] = useState(0)
  const [fileChangeCount, setFileChangeCount] = useState(0)
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)

  const clearUnfinishedTodoList = useCallback(() => {
    setTodoList((items) => items.some((item) => item.status !== 'completed') ? [] : items)
  }, [])

  const prevSessionIdRef = useRef<string | null>(null)
  const subscriptionRunIdRef = useRef(0)
  const requestVersionRef = useRef(0)
  /**
   * The message-stream writer for the turn that is currently streaming, so a
   * mid-turn steer can be spliced into that turn's own ordered segment list
   * instead of always being appended after the whole conversation. The writer is
   * fetched through a getter because the subscription outlives individual turns
   * and swaps in a fresh accumulator at each turn boundary. `isCurrent` is the
   * subscription's own staleness check, so a steer that arrives after the turn
   * finished falls back to the standalone-message behavior.
   */
  const activeStreamRef = useRef<{
    getAssistantId: () => string | null
    getWriter: () => MessageStreamWriter
    flush: () => void
    isCurrent: () => boolean
  } | null>(null)
  const cacheWriteReadySessionRef = useRef<string | null>(null)
  const messageQueueSessionRef = useRef<string | null>(null)
  const startedTurnContentRef = useRef<string | null>(null)
  /**
   * The optimistic assistant bubble `sendMessage` rendered for a turn that has
   * been POSTed but whose first event has not arrived yet. The event consumer
   * adopts it as the turn's target instead of appending a second bubble beside
   * it. Session-scoped: a placeholder left behind in chat A must never be
   * adopted by chat B's subscription.
   */
  const pendingAssistantPlaceholderRef = useRef<{ sessionId: string; messageId: string } | null>(null)
  const startupCacheWriterRef = useRef<ReturnType<typeof createStartupChatCacheWriter> | null>(null)
  if (!startupCacheWriterRef.current) startupCacheWriterRef.current = createStartupChatCacheWriter()
  const restartInFlightRef = useRef(false)
  const preserveMessagesOnNextResumeRef = useRef(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const resumeSessionStreamRef = useRef<(() => void) | null>(null)
  /** Lets wake/online handlers drop a parked socket and replay immediately. */
  const subscriptionRef = useRef<SessionEventSubscription | null>(null)
  const documentWasHiddenRef = useRef(typeof document !== 'undefined' ? document.hidden : false)
  const browserWasOfflineRef = useRef(typeof navigator !== 'undefined' ? !navigator.onLine : false)

  useEffect(() => () => startupCacheWriterRef.current?.flush(), [])

  useEffect(() => {
    if (
      !cacheScope
      || !sessionId
      || cacheWriteReadySessionRef.current !== sessionId
      || state.isLoadingHistory
      || state.messages.length === 0
    ) return

    startupCacheWriterRef.current?.schedule({
      scope: cacheScope,
      sessionId,
      history: {
        messages: state.messages,
        hasMore: state.hasMore,
        totalMessages: state.totalMessages,
        streaming: state.isLoading,
        sessionLastActiveAt,
      },
    })
    const timer = window.setTimeout(() => {
      void writeCachedChatHistory(cacheScope, sessionId, {
        messages: state.messages,
        hasMore: state.hasMore,
        totalMessages: state.totalMessages,
        sessionLastActiveAt,
      })
    }, 750)
    return () => window.clearTimeout(timer)
  }, [cacheScope, sessionId, sessionLastActiveAt, state.hasMore, state.isLoading, state.isLoadingHistory, state.messages, state.totalMessages])

  /**
   * Re-seed the session from the server: fresh snapshot, then resubscribe.
   *
   * The durable subscription already self-heals transport drops on its own (it
   * replays from `Last-Event-ID`), so this is only for the case live events
   * cannot describe — the server's history changed underneath us, e.g. a
   * restart-from that rewrote the transcript, or a cross-client refresh signal.
   */
  const resumeSessionStream = useCallback(() => {
    preserveMessagesOnNextResumeRef.current = true
    prevSessionIdRef.current = null
    setRefreshTrigger(n => n + 1)
  }, [])

  useLayoutEffect(() => {
    resumeSessionStreamRef.current = resumeSessionStream
  }, [resumeSessionStream])

  // ══ The session's single live connection ═══════════════════════════════
  // One JSON snapshot, then one `/events` subscription that stays open across
  // turns until the session changes. The snapshot reports the event-log position
  // it was taken at and the subscription resumes from exactly that position, so
  // no event can fall in the gap between them, and a dropped socket replays
  // rather than forcing a reconcile round-trip.
  //
  // Everything the UI renders arrives here — including this tab's own sends,
  // which POST and then discard their response body instead of reading a second
  // copy of the same events off it. That is what removes the whole
  // two-consumers-on-one-turn problem the direct stream used to create.
  useLayoutEffect(() => {
    if (sessionId === prevSessionIdRef.current) return
    startupCacheWriterRef.current?.flush()
    const preserveExistingMessages = preserveMessagesOnNextResumeRef.current
    preserveMessagesOnNextResumeRef.current = false
    requestVersionRef.current += 1
    prevSessionIdRef.current = sessionId
    cacheWriteReadySessionRef.current = null

    subscriptionRef.current?.close()
    subscriptionRef.current = null

    if (!sessionId) {
      setState({ messages: [], isLoading: false, isLoadingHistory: false, promptCount: 0, remainingPrompts: null, hitMaxRounds: false, error: null, hasMore: false, totalMessages: 0 })
      setPendingPlan(null)
      setTodoList([])
      setChangedFiles([])
      setMessageQueue([])
      messageQueueSessionRef.current = null
      startedTurnContentRef.current = null
      setContextUsage(null)
      setSessionInfo(null)
      return
    }

    // Session-scoped transient UI must never remain visible under the next
    // chat while its authoritative full-state packet is still in flight.
    setPendingPlan(null)
    setTodoList([])
    setContextUsage(null)
    setSessionInfo(null)
    if (messageQueueSessionRef.current !== sessionId) {
      messageQueueSessionRef.current = sessionId
      setMessageQueue([])
    }

    let cancelled = false
    const runId = ++subscriptionRunIdRef.current
    const isCurrent = () => !cancelled && subscriptionRunIdRef.current === runId

    const startupCache = selectImmediateChatHistory(
      readCachedStartupChat(cacheScope, sessionId),
      sessionLastActiveAt,
    )

    // Show a skeleton (never cached messages) until the fresh server snapshot
    // is received, evaluated and merged. Rendering cached messages immediately
    // caused a stale-then-sudden-update flash once the snapshot arrived.
    setState(prev => ({
      ...prev,
      messages: preserveExistingMessages ? prev.messages : [],
      isLoading: startupCache?.streaming === true,
      isLoadingHistory: !preserveExistingMessages,
      error: null,
      hasMore: startupCache?.hasMore ?? false,
      totalMessages: startupCache?.totalMessages ?? 0,
    }))
    if (!preserveExistingMessages) setChangedFiles([])
    setContextUsage(null)

    // ── Per-turn render state ──
    // The subscription outlives individual turns, so unlike the old
    // one-connection-per-turn design these are reset explicitly at each turn
    // boundary (the gateway's synthetic `request` event) instead of implicitly
    // by a connection being torn down and reopened.
    let stream = createMessageStream()
    let assistantId: string | null = null
    let pendingContextFlow: LlmContextFlow | undefined
    let pendingUpdates: Partial<ChatMessage> | null = null

    const flushUpdates = () => {
      if (!isCurrent() || !pendingUpdates || !assistantId) return
      const updates = pendingUpdates
      const targetId = assistantId
      pendingUpdates = null
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m => (m.id === targetId ? { ...m, ...updates } : m)),
      }))
    }

    // Coalesce only React commits. Transport events keep flowing synchronously
    // and the latest snapshot is rendered on the next paint.
    const scheduler = createStreamRenderScheduler({
      onFlush: flushUpdates,
      deadlineMs: STREAMING_FLUSH_DEADLINE_MS,
    })

    const batchUpdate = (updates: Partial<ChatMessage>, immediate = false) => {
      pendingUpdates = { ...pendingUpdates, ...updates }
      if (immediate) flushSync(scheduler.flushNow)
      else scheduler.schedule()
    }

    const applyStreamSnapshot = (immediate = false) => {
      const updates = snapshotToChatMessageUpdates(stream.snapshot())
      if (pendingContextFlow !== undefined) updates.contextFlow = pendingContextFlow
      batchUpdate(updates, immediate)
    }

    const textPacer = createStreamTextPacer({
      onText: (chunk) => stream.pushText(chunk),
      onThinking: (chunk) => stream.pushThinking(chunk),
      onCommit: () => applyStreamSnapshot(true),
      deadlineMs: STREAMING_FLUSH_DEADLINE_MS,
    })

    activeStreamRef.current = {
      getAssistantId: () => assistantId,
      getWriter: () => stream,
      flush: () => applyStreamSnapshot(true),
      isCurrent,
    }

    /** Claim the optimistic bubble `sendMessage` rendered for this session, if any. */
    const consumePendingPlaceholder = (): string | null => {
      const pending = pendingAssistantPlaceholderRef.current
      if (!pending || pending.sessionId !== sessionId) return null
      pendingAssistantPlaceholderRef.current = null
      return pending.messageId
    }

    // A turn can start producing content before this client has an assistant
    // message to stream into: a subscription that attached mid-run before the
    // first token, or a queued/remote turn this tab never sent. Without a
    // target every token would be dropped and the answer would only appear on
    // the next reload.
    const ensureStreamingAssistant = (): string | null => {
      if (assistantId) return assistantId
      if (!isCurrent()) return null
      const adopted = consumePendingPlaceholder()
      if (adopted) {
        assistantId = adopted
        return assistantId
      }
      const id = createOptimisticMessageId('assistant')
      assistantId = id
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, { id, role: 'assistant', content: '' }],
      }))
      return id
    }

    /** Turn boundary: drop the previous turn's accumulator and start clean. */
    const beginTurn = () => {
      // Drain into the *outgoing* stream/message before swapping them out.
      textPacer.flushNow()
      scheduler.flushNow()
      stream = createMessageStream()
      assistantId = null
      pendingContextFlow = undefined
      pendingUpdates = null
      setState(prev => ({ ...prev, isLoading: true, error: null, hitMaxRounds: false }))
      setTodoList([])
    }

    /** Resolve which bubble a turn-ending event belongs to, and release it. */
    const endTurn = (): string | null => {
      const finished = assistantId ?? consumePendingPlaceholder()
      assistantId = null
      return finished
    }

    const trackChangedFile = (filePath: string, fileName: string) => {
      setChangedFiles(prev => {
        if (prev.some(f => f.path === filePath)) return prev
        return [...prev, { path: filePath, name: fileName, state: 'undecided' as const }]
      })
    }

    const handleEvent = (data: Record<string, unknown>) => {
      if (!isCurrent()) return
      // Liveness-only frame. It carries no `id:`, so it never advances the
      // resume position and nothing here depends on it.
      if (data.type === 'heartbeat') return
      // The gateway tags events it replayed from the durable log (switching
      // back to this chat, or reconnecting after a drop). Those are the tail of
      // an already-finished turn: turn-end side effects must not run for them.
      const isReplay = data.replay === true
      pushSSEDebugEvent(String(data.type ?? 'unknown'), JSON.stringify(data))

      if (isTurnStartEvent(data.type)) {
        // Queue state is broadcast over WebSocket while turn events arrive over
        // SSE, so the started turn can render before the queue-removal packet.
        // Reconcile from the request marker too: a running message must never
        // remain visible as queued, regardless of cross-transport ordering.
        startedTurnContentRef.current = typeof data.content === 'string'
          ? data.content.trim() || null
          : null
        setMessageQueue(prev => reconcileQueuedMessagesAtTurnStart(prev, data.content))
        beginTurn()
      } else if (data.type === 'token') {
        if (!ensureStreamingAssistant()) return
        textPacer.enqueueText(data.content as string)
      } else if (data.type === 'thinking') {
        if (!ensureStreamingAssistant()) return
        textPacer.enqueueThinking(data.content as string)
      } else if (data.type === 'mode_notice') {
        if (!ensureStreamingAssistant()) return
        textPacer.enqueueText(`\n\n*${data.message as string}*`)
      } else if (data.type === 'tool_call_delta') {
        // Flush pending text synchronously instead of awaiting the text pacer's
        // idle. In swarm mode the coordinator's first content is a tool call
        // (not text), so awaiting would block event delivery behind the (long)
        // paced mode-notice text and delay tool / sub-agent / approval
        // rendering. flushNow drains text now and keeps ordering (text before
        // tool) without blocking.
        textPacer.flushNow()
        if (!ensureStreamingAssistant()) return
        scheduler.flushNow()
        stream.pushToolCallDelta(
          data.call_id as string,
          (data.name_delta as string) || '',
          (data.args_delta as string) || '',
          data.parent_call_id as string | undefined,
          // Cumulative provider slot index (see agent-loop.ts): lets the stream
          // re-key a provisional `pending-N` id once the real id arrives.
          typeof data.index === 'number' ? data.index : undefined,
        )
        applyStreamSnapshot()
      } else if (data.type === 'tool_start') {
        textPacer.flushNow()
        if (!ensureStreamingAssistant()) return
        scheduler.flushNow()
        stream.pushToolStart(
          data.call_id as string,
          data.tool as string,
          (data.args as Record<string, unknown>) ?? {},
          data.parent_call_id as string | undefined,
        )
        applyStreamSnapshot()
      } else if (data.type === 'approval_required') {
        textPacer.flushNow()
        if (!ensureStreamingAssistant()) return
        scheduler.flushNow()
        stream.pushApprovalRequired(
          data.request_id as string,
          (data.call_id as string) || `approval-${data.request_id as string}`,
          (data.tool as string) || 'approval',
          (data.args as Record<string, unknown>) ?? {},
        )
        applyStreamSnapshot()
      } else if (data.type === 'tool_output') {
        textPacer.flushNow()
        if (!ensureStreamingAssistant()) return
        stream.pushToolOutput(data.call_id as string, data.content as string, data.channel as 'text' | 'thinking' | undefined)
        applyStreamSnapshot()
      } else if (data.type === 'tool_result') {
        textPacer.flushNow()
        if (!ensureStreamingAssistant()) return
        scheduler.flushNow()
        stream.pushToolResult(
          data.call_id as string,
          data.ok as boolean,
          data.message as string,
          data.data as unknown,
          data.parent_call_id as string | undefined,
        )
        applyStreamSnapshot()

        // Auto-track file edits in changedFiles
        if (data.ok) {
          const tc = stream.snapshot().toolCalls.find(t => t.callId === (data.call_id as string))
          if (tc) {
            const toolName = tc.tool.replace('_', '.')
            if (toolName === 'file.write' || toolName === 'file.patch' || toolName === 'edit') {
              const resultData = data.data && typeof data.data === 'object'
                ? data.data as Record<string, unknown>
                : undefined
              const filePath = getToolFilePath(toolName, tc.args ?? {}, resultData, data.message as string | undefined) ?? ''
              if (filePath) trackChangedFile(filePath, filePath.split('/').pop() ?? filePath)
            }
          }
        }
      } else if (data.type === 'content_rollback') {
        // The gateway discarded a degenerate generation after streaming
        // (runaway repetition / replayed-reasoning loop); drop the
        // already-rendered text past the rollback point.
        textPacer.flushNow()
        stream.rollbackText((data.contentLength as number) ?? 0)
        applyStreamSnapshot(true)
      } else if (data.type === 'plan_complete') {
        setPendingPlan({
          plan_id: data.plan_id as string,
          summary: data.summary as string,
          actions: Array.isArray(data.actions) ? data.actions as PlanAction[] : [],
        })
      } else if (data.type === 'todo_list') {
        setTodoList(normalizeTodoStateValue(data.items))
      } else if (data.type === 'context_usage') {
        setContextUsage(data as unknown as ContextUsage)
      } else if (data.type === 'context_flow') {
        if (!ensureStreamingAssistant()) return
        pendingContextFlow = parseContextFlowEvent(data)
        applyStreamSnapshot()
      } else if (data.type === 'provider_fallback') {
        // Provider was unavailable, gateway fell back to jait
        setSessionInfo({ provider: 'jait', projectPath: '', isRemote: false })
      } else if (data.type === 'session_info') {
        setSessionInfo({
          provider: data.provider as string,
          projectPath: data.projectPath as string,
          isRemote: data.isRemote as boolean,
          remoteNode: data.remoteNode as SessionInfo['remoteNode'],
        })
      } else if (data.type === 'file_changed') {
        setFileChangeCount((count) => count + 1)
        trackChangedFile(data.path as string, data.name as string)
      } else if (data.type === 'done') {
        textPacer.flushNow()
        scheduler.flushNow()
        const finalSnapshot = stream.finish()
        const finishedId = endTurn()
        const producedNothing =
          finalSnapshot.content.length === 0 &&
          finalSnapshot.thinking.length === 0 &&
          finalSnapshot.toolCalls.length === 0
        setState(prev => {
          // Only signal completion if this was an active chat response, not the
          // tail of a history-only replay. The same guard protects the todo
          // list: a replayed `request` sets isLoading, and wiping here would
          // erase the todos the gateway just restored for this chat.
          if (prev.isLoading && !isReplay) {
            setCompletionCount(c => c + 1)
            clearUnfinishedTodoList()
          }
          return {
            ...prev,
            isLoading: false,
            promptCount: (data.prompt_count as number) ?? prev.promptCount,
            remainingPrompts: (data.remaining_prompts as number | null) ?? prev.remainingPrompts,
            hitMaxRounds: shouldShowContinueAfterDone(data),
            messages: !finishedId
              ? prev.messages
              // A turn that ended without producing anything (cancelled before
              // the first token, an empty provider reply) must not leave the
              // optimistic bubble behind as a permanent blank message.
              : producedNothing
                ? prev.messages.filter(m => m.id !== finishedId)
                : prev.messages.map(m =>
                    m.id === finishedId ? { ...m, ...snapshotToChatMessageUpdates(finalSnapshot) } : m
                  ),
          }
        })
      } else if (data.type === 'error') {
        const errorMsg = data.message as string
        textPacer.flushNow()
        scheduler.flushNow()
        const finalSnapshot = stream.finish()
        const finishedId = endTurn()
        setState(prev => {
          // Append the failure to the turn it belongs to. Adding a second,
          // separate error bubble left the partial answer above it looking
          // complete, and did not match the single persisted message the
          // gateway writes for this turn.
          const hasTurn = !!finishedId && prev.messages.some(m => m.id === finishedId)
          return {
            ...prev,
            isLoading: false,
            // Shown inline in red at the end of the turn — raising the composer
            // banner too would say the same thing twice.
            error: hasTurn ? null : errorMsg,
            messages: hasTurn
              ? prev.messages.map(m =>
                  m.id === finishedId
                    ? {
                        ...m,
                        ...snapshotToChatMessageUpdates(finalSnapshot),
                        content: finalSnapshot.content || errorMsg,
                        segments: segmentsWithError(finalSnapshot, errorMsg),
                      }
                    : m
                )
              : [
                  ...prev.messages,
                  {
                    id: crypto.randomUUID(),
                    role: 'assistant' as const,
                    content: errorMsg,
                    segments: [{ type: 'error' as const, content: errorMsg }],
                  },
                ],
          }
        })
      }
    }

    interface SnapshotResponse {
      messages?: RawSnapshotMessage[]
      streaming?: boolean
      seq?: number
      total?: number
      hasMore?: boolean
    }

    let snapshotApplied = false

    const applySnapshot = (data: SnapshotResponse) => {
      textPacer.flushNow()
      scheduler.flushNow()
      pendingUpdates = null
      snapshotApplied = true
      cacheWriteReadySessionRef.current = sessionId
      const snapshotStreaming = data.streaming === true
      const msgs = mapSnapshotMessages(data.messages ?? [], snapshotStreaming)

      // Re-seed the per-turn accumulator from the snapshot so live events append
      // to the same ordered segments / toolCalls instead of opening a second
      // bubble beside the partial answer the snapshot already rendered. Only
      // adopt while a turn is actually running: adopting a *finished* answer
      // would make the next turn's tokens stream into the previous one.
      stream = createMessageStream()
      assistantId = null
      pendingContextFlow = undefined
      const lastMsg = msgs[msgs.length - 1]
      if (snapshotStreaming && lastMsg?.role === 'assistant') {
        assistantId = lastMsg.id
        stream.hydrate({
          content: lastMsg.content,
          thinking: lastMsg.thinking ?? undefined,
          segments: lastMsg.segments,
          toolCalls: lastMsg.toolCalls,
        })
      }

      setState(prev => {
        const totalMessages = typeof data.total === 'number' ? data.total : msgs.length
        const reconciledMessages = reconcileChatHistory(prev.messages, msgs, totalMessages)
        const nextMessages = reuseUnchangedMessages(
          mergeSnapshotMessagesWithOptimisticUsers(reconciledMessages, prev.messages),
          prev.messages,
        )
        return {
          ...prev,
          messages: nextMessages,
          isLoadingHistory: false,
          isLoading: snapshotStreaming,
          error: null,
          hasMore: reconciledMessages.length < totalMessages,
          totalMessages,
        }
      })
    }

    // Offline/snapshot-failure fallback: only surfaces cached history when the
    // server snapshot could not be fetched, so it never preempts fresh data and
    // never causes the cached-then-updated flash.
    const applyCachedFallback = async () => {
      if (!isCurrent() || snapshotApplied) return
      const stored = await readCachedChatHistory(cacheScope, sessionId)
      if (!isCurrent() || snapshotApplied) return
      const cached = selectImmediateChatHistory(stored, sessionLastActiveAt)
      if (!cached || cached.messages.length === 0) return
      setState(prev => ({
        ...prev,
        messages: cached.messages,
        isLoadingHistory: false,
        hasMore: cached.hasMore,
        totalMessages: cached.totalMessages,
      }))
    }

    const subscribe = (fromSeq: string | null) => {
      if (!isCurrent()) return
      subscriptionRef.current = openSessionEventSubscription({
        url: `${API_URL}/api/sessions/${sessionId}/events`,
        headers: authHeaders(authToken),
        lastEventId: fromSeq,
        onEvent: handleEvent,
        onOpen: () => {
          if (!isCurrent()) return
          setState(prev => (prev.error === TRANSIENT_CONNECTION_MESSAGE ? { ...prev, error: null } : prev))
        },
        onReconnect: (attempt) => {
          // A drop that repairs itself within a retry or two loses nothing —
          // the replay fills the gap — so only a sustained outage is worth
          // telling the user about.
          if (!isCurrent() || attempt < RECONNECT_ATTEMPTS_BEFORE_BANNER) return
          setState(prev => ({ ...prev, isLoadingHistory: false, error: TRANSIENT_CONNECTION_MESSAGE }))
        },
        onFatal: (reason) => {
          if (!isCurrent()) return
          if (reason === 'unauthorized') {
            onLoginRequired?.()
            return
          }
          if (reason === 'not-found') {
            void deleteCachedChatHistory(cacheScope, sessionId)
            setState(prev => ({ ...prev, messages: [], isLoading: false, isLoadingHistory: false, hasMore: false, totalMessages: 0 }))
            return
          }
          setState(prev => ({
            ...prev,
            isLoading: false,
            isLoadingHistory: false,
            error: 'Connection lost. Reconnect attempts exhausted.',
          }))
        },
      })
    }

    void (async () => {
      for (let attempt = 0; ; attempt += 1) {
        if (!isCurrent()) return
        try {
          const res = await fetch(
            `${API_URL}/api/sessions/${sessionId}/messages?limit=${STREAM_SNAPSHOT_LIMIT}`,
            { headers: authHeaders(authToken), credentials: 'include' },
          )
          if (!isCurrent()) return
          if (res.status === 401) {
            onLoginRequired?.()
            setState(prev => ({ ...prev, isLoadingHistory: false }))
            return
          }
          if (res.status === 404) {
            void deleteCachedChatHistory(cacheScope, sessionId)
            setState(prev => ({ ...prev, messages: [], isLoadingHistory: false, hasMore: false, totalMessages: 0 }))
            return
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json() as SnapshotResponse
          if (!isCurrent()) return
          applySnapshot(data)
          // Subscribe from the exact log position the snapshot was taken at, so
          // an event that lands between the two is replayed rather than lost.
          subscribe(typeof data.seq === 'number' ? String(data.seq) : null)
          return
        } catch (error) {
          if (!isCurrent()) return
          void applyCachedFallback()
          const delay = SNAPSHOT_RETRY_DELAYS_MS[attempt]
          if (delay === undefined) {
            setState(prev => ({
              ...prev,
              isLoadingHistory: false,
              error: isTransientConnectionError(error) ? TRANSIENT_CONNECTION_MESSAGE : prev.error,
            }))
            // Subscribe anyway. Live events still render, and the
            // subscription's own retry ladder keeps working the connection —
            // without a snapshot position it just starts from "now".
            subscribe(null)
            return
          }
          setState(prev => ({ ...prev, isLoadingHistory: false }))
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    })()

    return () => {
      cancelled = true
      subscriptionRef.current?.close()
      subscriptionRef.current = null
      textPacer.cancel()
      scheduler.cancel()
      if (activeStreamRef.current?.isCurrent === isCurrent) activeStreamRef.current = null
      // Reset so React strict-mode re-mount can re-run the effect
      prevSessionIdRef.current = null
    }
  }, [authToken, cacheScope, clearUnfinishedTodoList, onLoginRequired, sessionId, sessionLastActiveAt, refreshTrigger])

  /** Force-reload messages from the server (used by cross-client WS refresh). */
  const refreshMessages = useCallback((options?: { force?: boolean }) => {
    // Skip if no active session or already loading / streaming, unless a
    // remote turn has started and the caller needs a hard re-read of history.
    if (!sessionId || (state.isLoading && !options?.force)) return
    resumeSessionStream()
  }, [resumeSessionStream, sessionId, state.isLoading])

  const loadingOlderRef = useRef(false)

  /** Load older messages for lazy-loading / scroll-up pagination. */
  const loadOlderMessages = useCallback(async () => {
    if (!sessionId || !state.hasMore || loadingOlderRef.current) return
    loadingOlderRef.current = true
    try {
      const before = state.totalMessages - state.messages.length
      if (before <= 0) {
        setState(prev => ({ ...prev, hasMore: false }))
        return
      }
      const res = await fetch(
        `${API_URL}/api/sessions/${sessionId}/messages?limit=${LAZY_LOAD_BATCH_SIZE}&before=${before}`,
        { headers: authHeaders(authToken) },
      )
      if (!res.ok) return
      const data = await res.json() as {
        messages: Array<{
          id: string;
          role: 'user' | 'assistant';
          content: string;
          contextFlow?: LlmContextFlow;
          hasContextFlow?: boolean;
          hasMemoryProvenance?: boolean;
          thinking?: string;
          segments?: unknown[];
          toolCalls?: Array<{
            callId: string;
            parentCallId?: string;
            tool: string;
            args: Record<string, unknown>;
            status?: 'pending' | 'running' | 'success' | 'error';
            approvalRequestId?: string;
            approvalState?: 'pending' | 'approved' | 'rejected';
            ok?: boolean;
            message?: string;
            output?: string;
            data?: unknown;
            startedAt?: number;
            completedAt?: number;
          }>;
        }>;
        hasMore: boolean;
        total: number;
      }
      const olderMsgs: ChatMessage[] = data.messages.map(m => {
        const safeContent = typeof m.content === 'string' ? m.content : String(m.content ?? '')
        const msg: ChatMessage = { id: m.id, role: m.role, content: safeContent, thinking: m.thinking }
        if (m.hasContextFlow) msg.hasContextFlow = true
        if (m.hasMemoryProvenance) msg.hasMemoryProvenance = true
        if (m.role === 'user' && Array.isArray(m.segments) && m.segments.length > 0) {
          msg.displaySegments = parseUserMessageSegments(m.segments)
          msg.displayContent = userMessageTextFromSegments(msg.displaySegments)
          msg.referencedFiles = userReferencedFilesFromSegments(msg.displaySegments)
          msg.attachments = attachmentsFromSegments(msg.displaySegments)
        } else if (m.role === 'user') {
          const parsed = parseLegacyReferencedFilesBlock(m.content)
          if (parsed.files.length > 0) {
            msg.displayContent = parsed.text
            msg.referencedFiles = parsed.files
            msg.displaySegments = parsed.displaySegments
            msg.attachments = attachmentsFromSegments(msg.displaySegments)
          }
        } else if (Array.isArray(m.segments) && m.segments.length > 0) {
          msg.segments = normalizeMessageSegments(m.segments)
        }
        if (m.toolCalls && m.toolCalls.length > 0) {
          msg.toolCalls = m.toolCalls.map(tc => ({
            callId: tc.callId,
            parentCallId: tc.parentCallId,
            approvalRequestId: tc.approvalRequestId,
            approvalState: tc.approvalState,
            tool: tc.tool,
            args: tc.args ?? {},
            status: tc.status ?? (tc.ok ? 'success' as const : 'error' as const),
            result: {
              ok: !!tc.ok,
              message: tc.message ?? '',
              data: tc.data ?? (tc.output != null ? { output: tc.output } : undefined),
            },
            startedAt: tc.startedAt ?? 0,
            completedAt: tc.completedAt ?? 0,
          }))
        }
        return msg
      })
      cacheWriteReadySessionRef.current = sessionId
      setState(prev => ({
        ...prev,
        messages: [...olderMsgs, ...prev.messages],
        hasMore: data.hasMore,
        totalMessages: data.total,
      }))
    } finally {
      loadingOlderRef.current = false
    }
  }, [authToken, sessionId, state.hasMore, state.messages.length, state.totalMessages])

  /**
   * Send a prompt and let the session's `/events` subscription render it.
   *
   * The gateway still answers POST /api/chat with the turn's SSE stream, but
   * this client no longer reads it: every one of those events is also emitted
   * to the session's durable subscription, which is already open. Reading both
   * meant two consumers appending into the same turn (duplicated tokens on
   * screen), and the "which consumer owns this session" bookkeeping —
   * ownership flags, handoff refs and a 40s stall watchdog to unstick a
   * black-holed socket — existed only to arbitrate between them.
   *
   * So the body is discarded. The gateway treats the client close as
   * `clientDisconnected` and keeps producing and persisting the turn (unlike
   * /cancel, which actually aborts it), and the subscription renders it. The
   * one response that still has to be read is the 202 queued reply, which is
   * two lines long and describes a message that never becomes a turn.
   */
  const sendMessage = useCallback(async (
    content: string,
    options: SendMessageOptions = {}
  ): Promise<SendMessageResult> => {
    const { token, sessionId: explicitSessionId, onLoginRequired: requestLoginRequired } = options
    const effectiveToken = token ?? authToken
    const notifyLoginRequired = requestLoginRequired ?? onLoginRequired
    let requestSessionId = explicitSessionId ?? sessionId // prefer explicit override
    const outboundAttachments = mergeChatAttachments(options.attachments, attachmentsFromSegments(options.displaySegments))
    const assistantId = createOptimisticMessageId('assistant')

    const userMessage: ChatMessage = {
      id: createOptimisticMessageId('user'),
      role: 'user',
      content,
      optimistic: true,
      ...(options.displayContent ? { displayContent: options.displayContent } : {}),
      ...(options.referencedFiles?.length ? { referencedFiles: options.referencedFiles } : {}),
      ...(options.displaySegments?.length ? { displaySegments: options.displaySegments } : {}),
      ...(outboundAttachments?.length ? { attachments: outboundAttachments } : {}),
    }

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage, createOptimisticAssistantPlaceholder(assistantId)],
      isLoading: true,
      error: null,
      hitMaxRounds: false,
    }))

    // Clear the todo list for the new turn. Keep changed files so pending
    // review state survives across follow-up prompts until the user decides.
    setTodoList([])

    if (!requestSessionId && options.sessionIdPromise) {
      requestSessionId = await options.sessionIdPromise
    }
    if (!requestSessionId) {
      const errorMessage = 'Failed to create chat session'
      setState(prev => ({
        ...prev,
        isLoading: false,
        messages: prev.messages.map(message =>
          message.id === assistantId
            ? { ...message, content: errorMessage, segments: [{ type: 'error' as const, content: errorMessage }] }
            : message
        ),
      }))
      return 'retry'
    }

    cacheWriteReadySessionRef.current = requestSessionId
    if (prevSessionIdRef.current !== requestSessionId) {
      prevSessionIdRef.current = requestSessionId
    }

    // Hand the placeholder to the event consumer so the turn's first token
    // streams into this bubble instead of appending a second one next to it.
    pendingAssistantPlaceholderRef.current = { sessionId: requestSessionId, messageId: assistantId }

    /**
     * Drop the optimistic pair when the send never became a turn. Anything the
     * consumer has already adopted is left alone — that bubble now belongs to a
     * live turn and the subscription owns its lifecycle.
     */
    const releasePlaceholder = (): boolean => {
      const pending = pendingAssistantPlaceholderRef.current
      if (!pending || pending.messageId !== assistantId) return false
      pendingAssistantPlaceholderRef.current = null
      return true
    }

    const dropOptimisticPair = () => {
      const owned = releasePlaceholder()
      setState(prev => ({
        ...prev,
        messages: prev.messages.filter(m =>
          m.id !== userMessage.id && !(owned && m.id === assistantId)
        ),
      }))
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (effectiveToken) headers['Authorization'] = `Bearer ${effectiveToken}`

      const requestBody = {
        content,
        sessionId: requestSessionId,
        ...(options.mode && options.mode !== 'agent' ? { mode: options.mode } : {}),
        ...(options.provider && options.provider !== 'jait' ? { provider: options.provider } : {}),
        ...(options.runtimeMode ? { runtimeMode: options.runtimeMode } : {}),
        ...(options.responseStyle && options.responseStyle !== 'normal' ? { responseStyle: options.responseStyle } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...buildReasoningEffortRequestField(options.reasoningEffort),
        ...(options.displaySegments?.length ? { displaySegments: options.displaySegments } : {}),
        ...(outboundAttachments?.length ? { attachments: outboundAttachments.map((a) => ({ name: a.name, mimeType: a.mimeType, data: a.data })) } : {}),
      }
      // The gateway emits its own `request` event at turn start (with prompt +
      // provider metadata), so the trajectory/debug log gets a single source.

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(requestBody),
      })

      if (response.status === 401) {
        const data = await response.json().catch(() => ({})) as { detail?: string }
        if (data.detail === 'login_required' || data.detail === 'limit_reached') {
          const detail = data.detail
          const owned = releasePlaceholder()
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: detail,
            messages: prev.messages.filter(m =>
              options.queued
                ? m.id !== assistantId && m.id !== userMessage.id
                : !(owned && m.id === assistantId)
            ),
          }))
          if (data.detail === 'login_required') notifyLoginRequired?.()
          return 'retry'
        }
      }

      if (!response.ok && response.status !== 202) {
        throw new Error(formatChatHttpError(response.status, {
          provider: options.provider,
          attachments: outboundAttachments,
          displaySegments: options.displaySegments,
        }))
      }

      // ── Queued (202) ──
      // The session was already streaming, so the gateway persisted this
      // message on the queue and closed without starting a turn. Nothing will
      // arrive on `/events` for it, so this is the one response body still
      // worth reading — and it is already complete, so `.text()` suffices.
      if (response.status === 202) {
        const queued = parseQueuedChatResponse(await response.text())?.message as Partial<QueuedChatMessage> | undefined
        dropOptimisticPair()
        setState(prev => ({ ...prev, isLoading: false }))
        // Only mirror the server-assigned queue entry into local state for
        // user-initiated sends. When this send itself originated from the queue
        // (options.queued), the server is the authoritative owner of the
        // persisted queue and broadcasts the canonical `queued_messages` state
        // over WS. Re-adding here with a freshly generated server id raced the
        // server-side drain and caused every queued message to multiply.
        if (!options.queued && queued?.id && typeof queued.content === 'string') {
          setMessageQueue(prev => prev.some(item => item.id === queued.id)
            ? prev
            : [...prev, {
                ...queued,
                id: queued.id,
                content: queued.content,
                displayContent: queued.displayContent ?? queued.content,
                queuedAt: typeof queued.queuedAt === 'number' ? queued.queuedAt : Date.now(),
              } as QueuedChatMessage])
        }
        return 'queued'
      }

      // The turn is running. Release the socket — every event it would have
      // carried is already on this session's subscription, and the gateway
      // keeps producing the turn after a client close.
      void response.body?.cancel().catch(() => {})
      return 'sent'
    } catch (error) {
      const transientConnectionError = isTransientConnectionError(error)
      const errorMessage = transientConnectionError
        ? TRANSIENT_CONNECTION_MESSAGE
        : error instanceof Error ? error.message : 'An error occurred'
      // A POST that never reached the gateway produced no turn, so no `error`
      // event is coming over the subscription to render this failure — the
      // send itself has to. If the consumer already adopted the placeholder the
      // turn *did* start, and its own terminal event owns the outcome.
      const owned = releasePlaceholder()
      setState(prev => {
        if (!owned) return { ...prev, isLoading: false, error: errorMessage }
        // A transient failure keeps no partial turn worth marking up, and a
        // queued-drain send owns neither bubble.
        const dropPair = transientConnectionError || options.queued === true
        return {
          ...prev,
          isLoading: false,
          // Rendered inline in red at the end of the turn, so the composer
          // banner would say the same thing twice.
          error: dropPair ? errorMessage : null,
          messages: dropPair
            ? prev.messages.filter(m =>
                options.queued
                  ? m.id !== assistantId && m.id !== userMessage.id
                  : m.id !== assistantId
              )
            : prev.messages.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: errorMessage,
                      segments: [{ type: 'error' as const, content: errorMessage }],
                    }
                  : m
              ),
        }
      })
      if (transientConnectionError && requestSessionId) {
        // The turn may well have started before the socket failed. Re-read
        // history so a turn that is running server-side reappears.
        window.setTimeout(() => {
          if (prevSessionIdRef.current === requestSessionId) resumeSessionStream()
        }, 250)
      }
      return 'retry'
    }
  }, [authToken, onLoginRequired, resumeSessionStream, sessionId])

  // --- Message queue (queueing & steering) ---
  const enqueueMessage = useCallback((item: Omit<QueuedChatMessage, 'id' | 'queuedAt'>) => {
    const queueItem: QueuedChatMessage = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...item,
      queuedAt: Date.now(),
    }
    setMessageQueue(prev => [...prev, queueItem])
  }, [])

  const dequeueMessage = useCallback((id: string) => {
    setMessageQueue(prev => prev.filter(q => q.id !== id))
  }, [])

  /**
   * Insert a visible marker into the transcript for a message that was injected
   * into the running turn via steering. When a turn is actively streaming, the
   * marker is spliced into that turn's own ordered segment list so it stays
   * anchored between the content that came before and after the steer, rather
   * than always being appended after the whole conversation (which made it look
   * permanently stuck at the bottom while the assistant kept streaming above it).
   */
  const recordSteeredMessage = useCallback((content: string, displayContent?: string) => {
    const active = activeStreamRef.current
    if (active?.isCurrent() && active.getAssistantId()) {
      active.getWriter().pushSteering(content, displayContent)
      active.flush()
      return
    }
    const steeredMessage: ChatMessage = {
      id: createOptimisticMessageId('user'),
      role: 'user',
      content,
      displayContent: displayContent ?? content,
      steered: true,
    }
    setState(prev => ({ ...prev, messages: [...prev.messages, steeredMessage] }))
  }, [])

  /** Update the content of a queued message (inline edit). */
  const updateQueueItem = useCallback((id: string, content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    setMessageQueue(prev => prev.map(q => q.id === id
      ? {
        ...q,
        content: trimmed,
        displayContent: trimmed,
        referencedFiles: undefined,
        displaySegments: undefined,
      }
      : q))
  }, [])

  const reorderQueueItem = useCallback((sourceId: string, targetId: string | null, placement: 'before' | 'after') => {
    setMessageQueue(prev => {
      const sourceIndex = prev.findIndex(item => item.id === sourceId)
      if (sourceIndex < 0) return prev

      const next = [...prev]
      const [moved] = next.splice(sourceIndex, 1)
      if (!moved) return prev

      if (targetId == null) {
        next.push(moved)
        return next
      }

      const targetIndex = next.findIndex(item => item.id === targetId)
      if (targetIndex < 0) return prev
      next.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, moved)
      return next
    })
  }, [])

  const toggleHoldQueueItem = useCallback((id: string) => {
    setMessageQueue(prev => prev.map(q => q.id === id ? { ...q, held: !q.held } : q))
  }, [])

  const setMessageQueueState = useCallback((items: QueuedChatMessage[]) => {
    const startedContent = startedTurnContentRef.current
    const nextItems = reconcileQueuedMessagesAtTurnStart(items, startedContent)
    setMessageQueue(nextItems)
    if (items.length === 0) startedTurnContentRef.current = null
  }, [])

  // ── Wake / reconnect nudges ──
  // A socket parked by a sleeping tab, a Wi-Fi→LTE handoff or a bfcache restore
  // usually produces no error at all. Always rebuild from an authoritative
  // snapshot on wake: a replay-only reconnect cannot repair events whose IDs
  // advanced while their throttled React updates never reached the screen. The
  // fresh subscription resumes from the snapshot sequence, closing the gap
  // without flashing away the transcript already visible to the user.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const reattach = () => {
      const subscription = subscriptionRef.current
      const recoveryAction = getChatWakeRecoveryAction({
        sessionId,
        isLoading: state.isLoading,
        isLoadingHistory: state.isLoadingHistory,
        messageCount: state.messages.length,
        error: state.error,
        hasSubscription: subscription != null,
      })
      if (recoveryAction === 'snapshot') resumeSessionStream()
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        documentWasHiddenRef.current = true
        return
      }
      if (!documentWasHiddenRef.current) return
      documentWasHiddenRef.current = false
      reattach()
    }
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reattach()
    }
    const handleOffline = () => {
      browserWasOfflineRef.current = true
    }
    const handleOnline = () => {
      const wasOffline = browserWasOfflineRef.current
      browserWasOfflineRef.current = false
      if (wasOffline) reattach()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [state.error, state.isLoading, state.isLoadingHistory, state.messages.length, resumeSessionStream, sessionId])

  // --- File change callbacks ---
  // Ref for broadcasting changed files to other clients
  const onChangedFilesSyncRef = useRef<((files: ChangedFile[]) => void) | null>(null)

  /** Register an external callback for broadcasting file state changes to other clients. */
  const setOnChangedFilesSync = useCallback((cb: ((files: ChangedFile[]) => void) | null) => {
    onChangedFilesSyncRef.current = cb
  }, [])

  /** Helper to update + broadcast changed files in one step. */
  const updateAndBroadcastFiles = useCallback((updater: (prev: ChangedFile[]) => ChangedFile[]) => {
    setChangedFiles(prev => {
      const next = updater(prev)
      // Fire the sync callback with the new state
      onChangedFilesSyncRef.current?.(next)
      return next
    })
  }, [])

  const acceptFile = useCallback(async (path: string) => {
    updateAndBroadcastFiles(prev => prev.map(f => f.path === path ? { ...f, state: 'accepted' as FileChangeState } : f))
    // Clear the server-side backup since the user accepted the changes
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`
      await fetch(`${API_URL}/api/project/apply-diff`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path,
          content: null,
          ...(projectSurfaceId ? { surfaceId: projectSurfaceId } : {}),
        }), // null content = just clear backup
      })
    } catch { /* ignore */ }
  }, [authToken, updateAndBroadcastFiles, projectSurfaceId])

  const rejectFile = useCallback(async (path: string) => {
    // Call undo endpoint to restore the original file
    let restored = false
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`
      const res = await fetch(`${API_URL}/api/project/undo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path,
          ...(projectSurfaceId ? { surfaceId: projectSurfaceId } : {}),
        }),
      })
      restored = res.ok
    } catch {
      restored = false
    }
    if (!restored) return
    updateAndBroadcastFiles(prev => prev.map(f => f.path === path ? { ...f, state: 'rejected' as FileChangeState } : f))
  }, [authToken, updateAndBroadcastFiles, projectSurfaceId])

  const acceptAllFiles = useCallback(() => {
    updateAndBroadcastFiles(prev => prev.map(f => f.state === 'undecided' ? { ...f, state: 'accepted' as FileChangeState } : f))
  }, [updateAndBroadcastFiles])

  const rejectAllFiles = useCallback(async () => {
    // Collect all undecided file paths and undo them in batch
    const undecidedPaths = changedFiles.filter(f => f.state === 'undecided').map(f => f.path)
    if (undecidedPaths.length > 0) {
      let restoredPaths = new Set<string>()
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`
        const res = await fetch(`${API_URL}/api/project/undo-all`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            paths: undecidedPaths,
            ...(projectSurfaceId ? { surfaceId: projectSurfaceId } : {}),
          }),
        })
        if (res.ok) {
          const data = await res.json() as { results?: { path: string; restored: boolean }[] }
          restoredPaths = new Set((data.results ?? []).filter((r) => r.restored).map((r) => r.path))
        }
      } catch {
        // Silently ignore
      }
      if (restoredPaths.size === 0) return
      updateAndBroadcastFiles(prev => prev.map(f =>
        f.state === 'undecided' && restoredPaths.has(f.path)
          ? { ...f, state: 'rejected' as FileChangeState }
          : f,
      ))
      return
    }
  }, [authToken, changedFiles, updateAndBroadcastFiles, projectSurfaceId])

  // Auto-hide the files-changed list once every file has been decided
  useEffect(() => {
    if (changedFiles.length === 0) return
    const allDecided = changedFiles.every(f => f.state !== 'undecided')
    if (!allDecided) return
    const timer = setTimeout(() => updateAndBroadcastFiles(() => []), 1200)
    return () => clearTimeout(timer)
  }, [changedFiles, updateAndBroadcastFiles])

  const cancelRequest = useCallback(() => {
    requestVersionRef.current += 1
    // Tell the gateway to abort the turn. This is now the *only* thing a stop
    // does to the transport: the session subscription stays open, so the
    // gateway's own terminal `done` still arrives and reconciles the turn.
    // Tearing the connection down here used to be necessary to stop a second
    // consumer from writing into the turn — there is no second consumer now,
    // and closing it would only blind the client to the cancellation.
    const sid = prevSessionIdRef.current
    if (sid) {
      fetch(`${API_URL}/api/sessions/${sid}/cancel`, {
        method: 'POST',
        headers: authHeaders(authToken),
      }).catch(() => {})
    }
    // Optimistically stop the spinners — mark any in-flight tool calls as
    // cancelled rather than waiting a round-trip for the gateway to confirm.
    setState(prev => ({
      ...prev,
      isLoading: false,
      messages: prev.messages.map(m => {
        if (!m.toolCalls?.some(tc => tc.status === 'running')) return m
        return {
          ...m,
          toolCalls: m.toolCalls!.map(tc =>
            tc.status === 'running'
              ? { ...tc, status: 'error' as const, result: { ok: false, message: 'Cancelled' }, completedAt: Date.now() }
              : tc
          ),
        }
      }),
    }))
  }, [authToken])

  const clearMessages = useCallback(() => {
    setState({ messages: [], isLoading: false, isLoadingHistory: false, promptCount: 0, remainingPrompts: null, error: null, hitMaxRounds: false, hasMore: false, totalMessages: 0 })
    setTodoList([])
    updateAndBroadcastFiles(() => [])
    setMessageQueue([])
  }, [updateAndBroadcastFiles])

  /** Send "Continue" to resume the agent after hitting max tool rounds */
  const continueChat = useCallback((options: SendMessageOptions = {}) => {
    setState(prev => ({ ...prev, hitMaxRounds: false }))
    return sendMessage('Continue from where you left off.', options)
  }, [sendMessage])

  const restartFromMessage = useCallback(async (
    messageId: string,
    editedContent: string,
    messageIndex?: number,
    messageFromEnd?: number,
    options: SendMessageOptions = {},
  ) => {
    const { token, sessionId: explicitSessionId, onLoginRequired: requestLoginRequired, expectedContent } = options
    const effectiveToken = token ?? authToken
    const notifyLoginRequired = requestLoginRequired ?? onLoginRequired
    const requestSessionId = explicitSessionId ?? sessionId
    if (!requestSessionId || !editedContent.trim() || restartInFlightRef.current) return false
    restartInFlightRef.current = true

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (effectiveToken) headers['Authorization'] = `Bearer ${effectiveToken}`

      const postRestart = () =>
        fetch(`${API_URL}/api/sessions/${requestSessionId}/restart-from`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ messageId, messageIndex, messageFromEnd, expectedContent }),
        })

      const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
      const waitForStreamingToStop = async () => {
        for (let attempt = 0; attempt < 32; attempt += 1) {
          const statusRes = await fetch(
            `${API_URL}/api/sessions/${requestSessionId}/messages?limit=1`,
            { headers },
          ).catch(() => null)
          if (statusRes?.ok) {
            const statusData = await statusRes.json().catch(() => ({})) as { streaming?: boolean }
            if (!statusData.streaming) return true
          }
          await wait(250)
        }
        return false
      }

      // Proactively cancel the server-side turn before restarting. This avoids
      // a common race where restart is sent before the backend has finished
      // clearing active stream state. The subscription stays open throughout —
      // `restart-from` rewrites history, and the fresh snapshot below (plus the
      // `sendMessage` that follows) is what re-seeds the view.
      requestVersionRef.current += 1
      await fetch(`${API_URL}/api/sessions/${requestSessionId}/cancel`, { method: 'POST', headers: authHeaders(effectiveToken) }).catch(() => null)
      await waitForStreamingToStop()

      let res = await postRestart()
      if (res.status === 409) {
        // Fallback: one more wait cycle, then a final restart attempt.
        await waitForStreamingToStop()
        res = await postRestart()
      }

      if (res.status === 401) {
        const data = await res.json().catch(() => ({})) as { detail?: string }
        if (data.detail === 'login_required') notifyLoginRequired?.()
        return false
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || `HTTP ${res.status}`)
      }

      const data = await res.json() as {
        messages?: ChatMessage[]
        total?: number
        hasMore?: boolean
      }
      cacheWriteReadySessionRef.current = requestSessionId
      setState(prev => {
        const messages = data.messages ?? []
        const totalMessages = data.total ?? messages.length
        return {
          ...prev,
          messages,
          isLoading: false,
          error: null,
          hasMore: data.hasMore ?? messages.length < totalMessages,
          totalMessages,
        }
      })

      const sendResult = await sendMessage(editedContent.trim(), {
        token: effectiveToken,
        sessionId: requestSessionId,
        mode: options.mode,
        provider: options.provider,
        runtimeMode: options.runtimeMode,
        model: options.model,
        reasoningEffort: options.reasoningEffort,
        displayContent: options.displayContent ?? editedContent.trim(),
        referencedFiles: options.referencedFiles,
        displaySegments: options.displaySegments,
        onLoginRequired: notifyLoginRequired,
      })
      return sendResult === 'sent' || sendResult === 'queued'
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to restart from message',
      }))
      return false
    } finally {
      restartInFlightRef.current = false
    }
  }, [authToken, onLoginRequired, sessionId, sendMessage])

  const executePlan = useCallback(async (actionIds?: string[]) => {
    const sid = prevSessionIdRef.current
    if (!sid || !pendingPlan) return

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`

    try {
      const res = await fetch(`${API_URL}/api/sessions/${sid}/plan/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify(actionIds ? { action_ids: actionIds } : {}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let lineBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'plan_action_start') {
              setPendingPlan(prev => prev ? {
                ...prev,
                actions: prev.actions.map(a =>
                  a.id === data.action_id ? { ...a, status: 'approved' as const } : a
                ),
              } : null)
            } else if (data.type === 'plan_action_result') {
              setPendingPlan(prev => prev ? {
                ...prev,
                actions: prev.actions.map(a =>
                  a.id === data.action_id ? {
                    ...a,
                    status: (data.ok ? 'executed' : 'failed') as PlanAction['status'],
                    result: { ok: data.ok, message: data.message, data: data.data },
                  } : a
                ),
              } : null)
            } else if (data.type === 'plan_execution_complete') {
              // Plan execution complete — clear plan after a brief delay so user sees final state
              setTimeout(() => setPendingPlan(null), 2000)
            }
          } catch { /* incomplete JSON */ }
        }
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Plan execution failed',
      }))
    }
  }, [authToken, pendingPlan])

  const rejectPlan = useCallback(async () => {
    const sid = prevSessionIdRef.current
    if (!sid || !pendingPlan) return

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`

    try {
      await fetch(`${API_URL}/api/sessions/${sid}/plan/reject`, {
        method: 'POST',
        headers,
      })
      setPendingPlan(null)
    } catch {
      setPendingPlan(null)
    }
  }, [authToken, pendingPlan])

  const respondToApproval = useCallback(async (requestId: string, approved: boolean) => {
    const targetSessionId = prevSessionIdRef.current ?? sessionId
    if (!targetSessionId || !requestId) return
    const completedAt = Date.now()
    const applyDecision = (ok: boolean, message: string) => {
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m => !m.toolCalls ? m : ({
          ...m,
          toolCalls: m.toolCalls.map(tc => (
            tc.approvalRequestId === requestId || tc.callId === `approval-${requestId}` || tc.callId === requestId
              ? {
                  ...tc,
                  status: ok ? 'success' as const : 'error' as const,
                  approvalState: ok ? 'approved' as const : 'rejected' as const,
                  result: { ok, message },
                  completedAt,
                }
              : tc
          )),
        })),
      }))
    }

    applyDecision(approved, approved ? 'Approved' : 'Rejected')
    const res = await fetch(`${API_URL}/api/sessions/${encodeURIComponent(targetSessionId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(authToken) },
      body: JSON.stringify({ requestId, approved }),
    })
    if (!res.ok) {
      const message = await res.text().catch(() => '')
      applyDecision(false, message || `Approval failed: HTTP ${res.status}`)
      throw new Error(message || `Approval failed: HTTP ${res.status}`)
    }
  }, [authToken, sessionId])

  /** Add a changed file from an external source (e.g. cross-client WS sync). Deduplicates by path. */
  const addChangedFile = useCallback((path: string, name: string) => {
    setChangedFiles(prev => {
      if (prev.some(f => f.path === path)) return prev
      return [...prev, { path, name, state: 'undecided' as const }]
    })
  }, [])

  const isSwitchingSession = Boolean(sessionId && sessionId !== prevSessionIdRef.current)
  const isLoadingHistory = state.isLoadingHistory || isSwitchingSession

  return {
    messages: isSwitchingSession ? [] : state.messages,
    isLoading: state.isLoading,
    isLoadingHistory,
    remainingPrompts: state.remainingPrompts,
    error: state.error,
    hitMaxRounds: state.hitMaxRounds,
    hasMore: state.hasMore,
    pendingPlan,
    todoList,
    changedFiles: getVisibleChangedFiles(changedFiles, isSwitchingSession),
    messageQueue,
    completionCount,
    fileChangeCount,
    contextUsage,
    sessionInfo,
    sendMessage,
    restartFromMessage,
    cancelRequest,
    clearMessages,
    continueChat,
    executePlan,
    rejectPlan,
    enqueueMessage,
    dequeueMessage,
    recordSteeredMessage,
    updateQueueItem,
    reorderQueueItem,
    toggleHoldQueueItem,
    setMessageQueueState,
    acceptFile,
    rejectFile,
    acceptAllFiles,
    rejectAllFiles,
    setTodoList,
    addChangedFile,
    setChangedFiles,
    setOnChangedFilesSync,
    refreshMessages,
    loadOlderMessages,
    respondToApproval,
  }
}
