import { useState, useCallback, useRef, useEffect } from 'react'
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
import { mergeSnapshotMessagesWithOptimisticUsers } from '@/lib/optimistic-chat-messages'
import {
  deleteCachedChatHistory,
  getChatCacheScope,
  readCachedChatHistory,
  reconcileChatHistory,
  writeCachedChatHistory,
} from '@/lib/chat-history-cache'
import { normalizeMessageSegments } from '@/lib/stream-segments'
import { createMessageStream, snapshotToChatMessageUpdates } from '@/lib/message-stream'
import { createStreamRenderScheduler } from '@/lib/stream-render-scheduler'
import { createStreamTextPacer } from '@/lib/stream-text-pacer'
import type { ResponseStyle } from '@jait/shared'
import {
  parseLegacyReferencedFilesBlock,
  parseUserMessageSegments,
  userMessageTextFromSegments,
  userReferencedFilesFromSegments,
  type UserMessageSegment,
} from '@/lib/user-message-segments'

const API_URL = getApiUrl()
const STREAM_SNAPSHOT_LIMIT = 120
const LAZY_LOAD_BATCH_SIZE = 20
const TRANSIENT_CONNECTION_MESSAGE = 'Connection interrupted. Attempting to reconnect...'

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
}): boolean {
  if (!params.sessionId || params.isLoadingHistory) return false
  return params.isLoading || params.messageCount === 0 || params.error === TRANSIENT_CONNECTION_MESSAGE
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

export function shouldProcessResumeStreamEvent(
  lastSeqBySession: Map<string, number>,
  sessionId: string,
  event: { seq?: unknown },
): boolean {
  if (typeof event.seq !== 'number' || !Number.isFinite(event.seq)) return true
  const lastSeq = lastSeqBySession.get(sessionId) ?? 0
  if (event.seq <= lastSeq) return false
  lastSeqBySession.set(sessionId, event.seq)
  return true
}

export function shouldOpenResumeStream(params: {
  sessionId: string | null
  activeResumeSessionId: string | null
  hasActiveResumeStream: boolean
  directStreamSessionId: string | null
  hasActiveDirectStream: boolean
}): boolean {
  if (!params.sessionId) return false
  if (params.hasActiveDirectStream && params.directStreamSessionId === params.sessionId) return false
  if (params.hasActiveResumeStream && params.activeResumeSessionId === params.sessionId) return false
  return true
}

export function shouldOwnDirectChatStream(params: {
  sessionId: string | null
  directStreamSessionId: string | null
  hasActiveDirectStream: boolean
}): boolean {
  if (!params.sessionId) return true
  return !(params.hasActiveDirectStream && params.directStreamSessionId === params.sessionId)
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
  /** Local-only user message awaiting confirmation from a server snapshot. */
  optimistic?: boolean
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
    if (context.provider === 'codex' && hasImageAttachment(context)) {
      return 'Codex cannot use image uploads in Jait yet, and this image is too large for the gateway to accept. Remove the image or reference it as a project file path instead.'
    }
    if (hasImageAttachment(context)) {
      return 'That image is too large for this chat request. Use a smaller image or reference it as a project file path instead.'
    }
    return 'That chat request is too large for the gateway. Remove large attachments or reference files from the project instead.'
  }
  return `HTTP ${status}`
}

interface SendMessageOptions {
  token?: string | null
  sessionId?: string | null  // explicit override — avoids stale-closure race after createSession
  onLoginRequired?: () => void
  mode?: ChatMode
  /** CLI provider to use for this message (jait, codex, claude-code) */
  provider?: string
  runtimeMode?: RuntimeMode
  responseStyle?: ResponseStyle
  /** Model override for CLI providers */
  model?: string | null
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
}

interface QueuedChatMessage extends QueuedMessage {
  provider?: string
  runtimeMode?: RuntimeMode
  responseStyle?: ResponseStyle
  model?: string | null
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
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)

  const clearUnfinishedTodoList = useCallback(() => {
    setTodoList((items) => items.some((item) => item.status !== 'completed') ? [] : items)
  }, [])

  const abortControllerRef = useRef<AbortController | null>(null)
  const prevSessionIdRef = useRef<string | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const streamResumeSessionRef = useRef<string | null>(null)
  const directStreamSessionRef = useRef<string | null>(null)
  const resumeStreamRunIdRef = useRef(0)
  const lastResumeSeqBySessionRef = useRef(new Map<string, number>())
  const requestVersionRef = useRef(0)
  const cacheWriteReadySessionRef = useRef<string | null>(null)
  const restartInFlightRef = useRef(false)
  const preserveMessagesOnNextResumeRef = useRef(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const pendingResumeAfterDirectStreamRef = useRef(false)
  // Backoff timer for auto-reconnecting the resume SSE stream after a
  // transient drop (network blip, proxy idle timeout) — the main cause of
  // chat "freezing" until the user manually reloads or switches sessions.
  const resumeReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumeReconnectAttemptsRef = useRef(0)

  useEffect(() => {
    if (
      !cacheScope
      || !sessionId
      || cacheWriteReadySessionRef.current !== sessionId
      || state.isLoadingHistory
      || state.messages.length === 0
    ) return

    const timer = window.setTimeout(() => {
      void writeCachedChatHistory(cacheScope, sessionId, {
        messages: state.messages,
        hasMore: state.hasMore,
        totalMessages: state.totalMessages,
      })
    }, 750)
    return () => window.clearTimeout(timer)
  }, [cacheScope, sessionId, state.hasMore, state.isLoadingHistory, state.messages, state.totalMessages])

  const resumeSessionStream = useCallback((options?: { afterDirectStream?: boolean }) => {
    if (
      options?.afterDirectStream
      && sessionId
      && abortControllerRef.current
      && directStreamSessionRef.current === sessionId
    ) {
      pendingResumeAfterDirectStreamRef.current = true
      return
    }
    if (!shouldOpenResumeStream({
      sessionId,
      activeResumeSessionId: streamResumeSessionRef.current,
      hasActiveResumeStream: !!streamAbortRef.current,
      directStreamSessionId: directStreamSessionRef.current,
      hasActiveDirectStream: !!abortControllerRef.current,
    })) return
    pendingResumeAfterDirectStreamRef.current = false
    preserveMessagesOnNextResumeRef.current = true
    prevSessionIdRef.current = null
    // Starting a fresh (re)subscribe — reset the backoff state.
    resumeReconnectAttemptsRef.current = 0
    if (resumeReconnectTimerRef.current !== null) {
      clearTimeout(resumeReconnectTimerRef.current)
      resumeReconnectTimerRef.current = null
    }
    setRefreshTrigger(n => n + 1)
  }, [sessionId])

  /**
   * Auto-reconnect the resume SSE stream after a transient drop.
   *
   * This is the fix for the "chat freezes, must reload or switch projects"
   * problem: when the SSE fetch connection dies mid-stream (network blip,
   * proxy idle timeout, browser throttling a background tab), the previous
   * code only surfaced an error banner and never resubscribed. The agent
   * loop on the gateway keeps running, but the client stops receiving tokens
   * until the user manually reloads / switches sessions (which bumps
   * refreshTrigger and re-runs the resume effect).
   *
   * We schedule a reconnect with exponential backoff, preserving the messages
   * already received (the snapshot endpoint replays the full state including
   * any partial assistant content, deduped via `seq`). Reconnecting is a no-op
   * if the user has navigated away from this session or a fresh stream already
   * opened. Capped at ~30s backoff and gives up after ~5 minutes of failures.
   */
  const scheduleResumeReconnect = useCallback(() => {
    // If the user navigated away from this session, don't reconnect.
    if (prevSessionIdRef.current !== sessionId) return
    // Don't double-schedule.
    if (resumeReconnectTimerRef.current !== null) return
    // A direct chat stream is owned by the sending client; its done/finish
    // path already triggers a resume. Avoid racing it.
    if (abortControllerRef.current && directStreamSessionRef.current === sessionId) return
    const attempt = resumeReconnectAttemptsRef.current + 1
    if (attempt > 20) return // ~5 min total of backoff — give up gracefully.
    resumeReconnectAttemptsRef.current = attempt
    const delay = Math.min(30000, 500 * Math.pow(2, attempt - 1))
    resumeReconnectTimerRef.current = setTimeout(() => {
      resumeReconnectTimerRef.current = null
      // Re-check currency inside the timer — session may have changed.
      if (prevSessionIdRef.current !== sessionId) return
      // Avoid clobbering an active resume stream that re-opened in the meantime.
      if (streamAbortRef.current && streamResumeSessionRef.current === sessionId) return
      resumeSessionStream()
    }, delay)
  }, [resumeSessionStream, sessionId])

  const finishDirectStream = useCallback((requestSessionId: string | null, controller: AbortController) => {
    if (abortControllerRef.current === controller) abortControllerRef.current = null
    if (directStreamSessionRef.current === requestSessionId) directStreamSessionRef.current = null
    if (!pendingResumeAfterDirectStreamRef.current || !requestSessionId || requestSessionId !== sessionId) return
    pendingResumeAfterDirectStreamRef.current = false
    window.setTimeout(() => {
      if (prevSessionIdRef.current === requestSessionId) resumeSessionStream()
    }, 0)
  }, [resumeSessionStream, sessionId])

  // When sessionId changes, load history / resume active stream via SSE
  useEffect(() => {
    if (sessionId === prevSessionIdRef.current) return
    const preserveExistingMessages = preserveMessagesOnNextResumeRef.current
    preserveMessagesOnNextResumeRef.current = false
    requestVersionRef.current += 1
    prevSessionIdRef.current = sessionId
    cacheWriteReadySessionRef.current = null

    // Abort any previous stream-resume connection
    if (streamAbortRef.current) {
      streamAbortRef.current.abort()
      streamAbortRef.current = null
      streamResumeSessionRef.current = null
    }

    if (!sessionId) {
      setState({ messages: [], isLoading: false, isLoadingHistory: false, promptCount: 0, remainingPrompts: null, hitMaxRounds: false, error: null, hasMore: false, totalMessages: 0 })
      setTodoList([])
      setChangedFiles([])
      setMessageQueue([])
      setContextUsage(null)
      return
    }

    // Todos are session-bound: clear the previous session's list immediately
    // so it doesn't leak into the newly selected chat.
    setTodoList([])

    let cancelled = false
    setState(prev => ({
      ...prev,
      messages: preserveExistingMessages ? prev.messages : [],
      isLoading: false,
      isLoadingHistory: true,
      error: null,
    }))
    if (!preserveExistingMessages) setChangedFiles([])
    setContextUsage(null)

    // Connect to the stream-resume SSE endpoint.
    // It returns a snapshot of current messages, then live tokens if still streaming.
    const streamController = new AbortController()
    streamAbortRef.current = streamController
    streamResumeSessionRef.current = sessionId
    const resumeRunId = ++resumeStreamRunIdRef.current
    const isCurrentResumeRun = () => !cancelled && resumeStreamRunIdRef.current === resumeRunId
    let serverSnapshotReceived = false

    void readCachedChatHistory(cacheScope, sessionId).then((cached) => {
      if (!cached || serverSnapshotReceived || !isCurrentResumeRun()) return
      setState(prev => ({
        ...prev,
        messages: cached.messages,
        isLoadingHistory: false,
        hasMore: cached.hasMore,
        totalMessages: cached.totalMessages,
      }))
    })

    ;(async () => {
      let cancelPendingSubscribeFlush: (() => void) | null = null
      let textPacer: ReturnType<typeof createStreamTextPacer> | null = null
      try {
        const res = await fetch(
          `${API_URL}/api/sessions/${sessionId}/stream?limit=${STREAM_SNAPSHOT_LIMIT}`,
          {
            signal: streamController.signal,
            headers: authHeaders(authToken),
          },
        )
        if (res.status === 401) {
          onLoginRequired?.()
          setState(prev => ({ ...prev, isLoadingHistory: false }))
          return
        }
        if (res.status === 404) {
          serverSnapshotReceived = true
          void deleteCachedChatHistory(cacheScope, sessionId)
          if (isCurrentResumeRun()) {
            setState(prev => ({
              ...prev,
              messages: [],
              isLoadingHistory: false,
              hasMore: false,
              totalMessages: 0,
            }))
          }
          return
        }
        if (!res.ok || !isCurrentResumeRun()) {
          if (isCurrentResumeRun()) setState(prev => ({ ...prev, isLoadingHistory: false }))
          return
        }
        const reader = res.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let lineBuffer = ''
        let assistantId: string | null = null
        let receivedDone = false
        let wasStreaming = false

        // Coalesce only React commits. Transport events keep flowing
        // synchronously and the latest snapshot is rendered on the next paint.
        let pendingSubscribeUpdates: Partial<ChatMessage> | null = null

        const flushSubscribeUpdates = () => {
          if (!isCurrentResumeRun() || !pendingSubscribeUpdates || !assistantId) return
          const updates = pendingSubscribeUpdates
          const targetId = assistantId
          pendingSubscribeUpdates = null
          setState(prev => ({
            ...prev,
            messages: prev.messages.map(m =>
              m.id === targetId ? { ...m, ...updates } : m
            ),
          }))
        }

        const subscribeScheduler = createStreamRenderScheduler({
          onFlush: flushSubscribeUpdates,
          deadlineMs: STREAMING_FLUSH_DEADLINE_MS,
        })
        cancelPendingSubscribeFlush = subscribeScheduler.cancel

        const batchSubscribeUpdate = (updates: Partial<ChatMessage>, immediate = false) => {
          pendingSubscribeUpdates = {
            ...pendingSubscribeUpdates,
            ...updates,
          }
          if (immediate) flushSync(subscribeScheduler.flushNow)
          else subscribeScheduler.schedule()
        }

        // Imperative stream writer: all live answer components (text, thinking,
        // tool calls/outputs/results) accumulate into one ordered segment list.
        // The resume consumer just pushes events and applies snapshots to the
        // current assistant message on each rAF flush.
        const stream = createMessageStream()
        let pendingResumeContextFlow: LlmContextFlow | undefined

        textPacer = createStreamTextPacer({
          onText: (chunk) => stream.pushText(chunk),
          onThinking: (chunk) => stream.pushThinking(chunk),
          onCommit: () => applyStreamSnapshot(true),
          deadlineMs: STREAMING_FLUSH_DEADLINE_MS,
        })

        const applyStreamSnapshot = (immediate = false) => {
          const snapshot = stream.snapshot()
          const updates = snapshotToChatMessageUpdates(snapshot)
          if (pendingResumeContextFlow !== undefined) updates.contextFlow = pendingResumeContextFlow
          batchSubscribeUpdate(updates, immediate)
        }

        // When a client (re)opens the resume stream during a run that hasn't
        // produced any content/thinking/tools yet, the snapshot has no synthetic
        // assistant message, so `assistantId` is null. Without this guard, every
        // subsequent live token/thinking/tool event would be dropped, and the
        // final answer only appears after a manual reload. Synthesize an empty
        // assistant message on the first live streaming event so tokens have a
        // target to stream into.
        const ensureStreamingAssistant = (): string | null => {
          if (assistantId) return assistantId
          if (!isCurrentResumeRun()) return null
          const id = createOptimisticMessageId('assistant')
          assistantId = id
          setState(prev => ({
            ...prev,
            messages: [...prev.messages, { id, role: 'assistant', content: '' }],
          }))
          return id
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!isCurrentResumeRun()) { reader.cancel(); break }

          lineBuffer += decoder.decode(value, { stream: true })
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop() || ''

          for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex]
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6)) as Record<string, unknown>
              if (!isCurrentResumeRun()) break
              if (data.type !== 'snapshot' && !shouldProcessResumeStreamEvent(lastResumeSeqBySessionRef.current, sessionId, data)) {
                continue
              }
              pushSSEDebugEvent(String(data.type ?? 'unknown'), line.slice(6))

              if (data.type === 'snapshot') {
                serverSnapshotReceived = true
                cacheWriteReadySessionRef.current = sessionId
                textPacer.flushNow()
                const rawMsgs = data.messages as Array<{
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
                    tool: string;
                    args: Record<string, unknown>;
                    status?: 'pending' | 'running' | 'success' | 'error';
                    approvalRequestId?: string;
                    approvalState?: 'pending' | 'approved' | 'rejected';
                    ok?: boolean;
                    message?: string;
                    output?: string;
                    data?: unknown;
                    streamingOutput?: string;
                    startedAt?: number;
                    completedAt?: number;
                  }>;
                }>
                const snapshotStreaming = data.streaming as boolean
                if (typeof data.seq === 'number' && Number.isFinite(data.seq)) {
                  const lastSeq = lastResumeSeqBySessionRef.current.get(sessionId) ?? 0
                  if (data.seq > lastSeq) lastResumeSeqBySessionRef.current.set(sessionId, data.seq)
                }
                let msgs: ChatMessage[] = rawMsgs.map(m => {
                  const safeContent = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? (m.content as Array<{type?: string; text?: string}>).filter(p => p.type === 'text').map(p => p.text ?? '').join('') : String(m.content ?? ''))
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
                        startedAt,
                        completedAt: resolvedCompletedAt,
                      }
                    })
                  }
                  return msg
                })
                // Track whether the server reported an active stream for this
                // snapshot. This MUST be set independent of whether the snapshot
                // included a synthetic assistant message: when a client (re)opens
                // mid-run before the agent has produced any content/thinking/tools,
                // the accumulator is empty and the snapshot's last message is the
                // user turn — but the stream is still live. Without setting
                // wasStreaming here, a silent SSE drop would never trigger the
                // auto-reconnect, so the chat freezes until a manual reload.
                wasStreaming = wasStreaming || snapshotStreaming
                // Track the last assistant message for token updates
                const lastMsg = msgs[msgs.length - 1]
                if (lastMsg?.role === 'assistant') {
                  assistantId = lastMsg.id
                  // Hydrate the imperative stream writer from the snapshot so live
                  // events append to the same ordered segments / toolCalls.
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
                  return {
                    ...prev,
                    messages: mergeSnapshotMessagesWithOptimisticUsers(reconciledMessages, prev.messages),
                    isLoadingHistory: false,
                    isLoading: snapshotStreaming,
                    error: null,
                    hasMore: reconciledMessages.length < totalMessages,
                    totalMessages,
                  }
                })
              } else if (data.type === 'token') {
                if (!ensureStreamingAssistant()) { /* run no longer current */ }
                textPacer.enqueueText(data.content as string)
              } else if (data.type === 'thinking') {
                if (!ensureStreamingAssistant()) { /* run no longer current */ }
                textPacer.enqueueThinking(data.content as string)
              } else if (data.type === 'tool_call_delta') {
                await textPacer.waitUntilIdle()
                if (!ensureStreamingAssistant()) { /* run no longer current */ }
                subscribeScheduler.flushNow()
                stream.pushToolCallDelta(
                  data.call_id as string,
                  (data.name_delta as string) || '',
                  (data.args_delta as string) || '',
                  data.parent_call_id as string | undefined,
                )
                applyStreamSnapshot()
              } else if (data.type === 'tool_start') {
                await textPacer.waitUntilIdle()
                if (!ensureStreamingAssistant()) { /* run no longer current */ }
                subscribeScheduler.flushNow()
                stream.pushToolStart(
                  data.call_id as string,
                  data.tool as string,
                  (data.args as Record<string, unknown>) ?? {},
                  data.parent_call_id as string | undefined,
                )
                applyStreamSnapshot()
              } else if (data.type === 'approval_required') {
                await textPacer.waitUntilIdle()
                if (!ensureStreamingAssistant()) { /* run no longer current */ }
                subscribeScheduler.flushNow()
                stream.pushApprovalRequired(
                  data.request_id as string,
                  (data.call_id as string) || `approval-${data.request_id as string}`,
                  (data.tool as string) || 'approval',
                  (data.args as Record<string, unknown>) ?? {},
                )
                applyStreamSnapshot()
              } else if (data.type === 'tool_output') {
                await textPacer.waitUntilIdle()
                if (!ensureStreamingAssistant()) { /* run no longer current */ }
                stream.pushToolOutput(data.call_id as string, data.content as string)
                applyStreamSnapshot()
              } else if (data.type === 'tool_result') {
                await textPacer.waitUntilIdle()
                if (!ensureStreamingAssistant()) { /* run no longer current */ }
                subscribeScheduler.flushNow()
                stream.pushToolResult(
                  data.call_id as string,
                  data.ok as boolean,
                  data.message as string,
                  data.data as unknown,
                  data.parent_call_id as string | undefined,
                )
                applyStreamSnapshot()

                // Auto-track file edits in changedFiles (stream-resume path)
                if (data.ok) {
                  const snapshot = stream.snapshot()
                  const tc = snapshot.toolCalls.find(t => t.callId === (data.call_id as string))
                  if (tc) {
                    const toolName = tc.tool.replace('_', '.')
                    if (toolName === 'file.write' || toolName === 'file.patch' || toolName === 'edit') {
                      const resultData = data.data && typeof data.data === 'object'
                        ? data.data as Record<string, unknown>
                        : undefined
                      const filePath = getToolFilePath(toolName, tc.args ?? {}, resultData, data.message as string | undefined) ?? ''
                      if (filePath) {
                        const fileName = filePath.split('/').pop() ?? filePath
                        setChangedFiles(prev => {
                          if (prev.some(f => f.path === filePath)) return prev
                          return [...prev, { path: filePath, name: fileName, state: 'undecided' as const }]
                        })
                      }
                    }
                  }
                }
              } else if (data.type === 'todo_list') {
                // AI updated the task list
                setTodoList(normalizeTodoStateValue(data.items))
              } else if (data.type === 'context_usage') {
                setContextUsage(data as unknown as ContextUsage)
              } else if (data.type === 'context_flow') {
                if (!ensureStreamingAssistant()) { /* run no longer current */ }
                pendingResumeContextFlow = parseContextFlowEvent(data as Record<string, unknown>)
                applyStreamSnapshot()
              } else if (data.type === 'provider_fallback') {
                // Provider was unavailable, gateway fell back to jait
                setSessionInfo({
                  provider: 'jait',
                  projectPath: '',
                  isRemote: false,
                })
              } else if (data.type === 'session_info') {
                // Execution context info from the gateway
                setSessionInfo({
                  provider: data.provider as string,
                  projectPath: data.projectPath as string,
                  isRemote: data.isRemote as boolean,
                  remoteNode: data.remoteNode as SessionInfo['remoteNode'],
                })
              } else if (data.type === 'file_changed') {
                // AI reported a file change
                const filePath = data.path as string
                const fileName = data.name as string
                setChangedFiles(prev => {
                  const existing = prev.find(f => f.path === filePath)
                  if (existing) return prev // don't reset state if already tracked
                  return [...prev, { path: filePath, name: fileName, state: 'undecided' as const }]
                })
              } else if (data.type === 'done') {
                receivedDone = true
                await textPacer.waitUntilIdle()
                // Flush any batched token updates before marking completion
                subscribeScheduler.flushNow()
                const finalSnapshot = stream.finish()
                setState(prev => {
                  // Only signal completion if this was an active chat response,
                  // not just the end of a history-only stream.
                  if (prev.isLoading) {
                    setCompletionCount(c => c + 1)
                    clearUnfinishedTodoList()
                  }
                  return {
                    ...prev,
                    isLoading: false,
                    promptCount: (data.prompt_count as number) ?? prev.promptCount,
                    remainingPrompts: (data.remaining_prompts as number | null) ?? prev.remainingPrompts,
                    hitMaxRounds: shouldShowContinueAfterDone(data),
                    messages: assistantId
                      ? prev.messages.map(m =>
                          m.id === assistantId
                            ? { ...m, ...snapshotToChatMessageUpdates(finalSnapshot) }
                            : m
                        )
                      : prev.messages,
                  }
                })
              } else if (data.type === 'error') {
                const errorMsg = data.message as string
                setState(prev => ({
                  ...prev,
                  isLoading: false,
                  error: errorMsg,
                  messages: [
                    ...prev.messages,
                    {
                      id: crypto.randomUUID(),
                      role: 'assistant' as const,
                      content: errorMsg,
                      segments: [{ type: 'error' as const, content: errorMsg }],
                    },
                  ],
                }))
              }
            } catch (parseErr) {
              if (!(parseErr instanceof SyntaxError)) throw parseErr
              // incomplete JSON chunk — wait for next line
            }
          }
        }
        // Flush any remaining batched updates when stream ends
        await textPacer.waitUntilIdle()
        subscribeScheduler.flushNow()
        // The SSE connection ended without a `done` event while the gateway
        // reported it was still streaming — the connection dropped silently
        // (proxy idle timeout, background-tab throttling, network blip).
        // Re-subscribe so live tokens keep flowing without a manual reload.
        if (!cancelled && !receivedDone && wasStreaming && isCurrentResumeRun()) {
          scheduleResumeReconnect()
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!cancelled) {
          const transient = isTransientConnectionError(err)
          setState(prev => ({
            ...prev,
            isLoadingHistory: false,
            error: preserveExistingMessages && transient
              ? TRANSIENT_CONNECTION_MESSAGE
              : prev.error,
          }))
          // Auto-reconnect after a transient drop so the chat keeps streaming
          // without the user having to reload or switch sessions.
          if (transient) scheduleResumeReconnect()
        }
      } finally {
        textPacer?.cancel()
        cancelPendingSubscribeFlush?.()
        if (streamAbortRef.current === streamController) streamAbortRef.current = null
        if (streamResumeSessionRef.current === sessionId) streamResumeSessionRef.current = null
      }
    })()

    return () => {
      cancelled = true
      streamController.abort()
      if (streamAbortRef.current === streamController) streamAbortRef.current = null
      if (streamResumeSessionRef.current === sessionId) streamResumeSessionRef.current = null
      // Cancel any pending auto-reconnect so it can't fire into a stale session.
      if (resumeReconnectTimerRef.current !== null) {
        clearTimeout(resumeReconnectTimerRef.current)
        resumeReconnectTimerRef.current = null
      }
      // Reset so React strict-mode re-mount can re-run the effect
      prevSessionIdRef.current = null
    }
  }, [authToken, cacheScope, clearUnfinishedTodoList, onLoginRequired, scheduleResumeReconnect, sessionId, refreshTrigger])

  /** Force-reload messages from the server (used by cross-client WS refresh). */
  const refreshMessages = useCallback((options?: { force?: boolean }) => {
    // Skip if no active session or already loading / streaming, unless a
    // remote turn has started and we need to attach after local stream cleanup.
    if (!sessionId || (state.isLoading && !options?.force)) return
    resumeSessionStream(options?.force ? { afterDirectStream: true } : undefined)
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

  const sendMessage = useCallback(async (
    content: string,
    options: SendMessageOptions = {}
  ): Promise<SendMessageResult> => {
    const { token, sessionId: explicitSessionId, onLoginRequired: requestLoginRequired } = options
    const effectiveToken = token ?? authToken
    const notifyLoginRequired = requestLoginRequired ?? onLoginRequired
    const requestSessionId = explicitSessionId ?? sessionId // prefer explicit override
    const outboundAttachments = mergeChatAttachments(options.attachments, attachmentsFromSegments(options.displaySegments))
    const assistantId = createOptimisticMessageId('assistant')

    if (requestSessionId && prevSessionIdRef.current !== requestSessionId) {
      prevSessionIdRef.current = requestSessionId
    }

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
      messages: [...prev.messages, userMessage, { id: assistantId, role: 'assistant', content: '' }],
      isLoading: true,
      error: null,
      hitMaxRounds: false,
    }))

    // Clear the todo list for the new turn. Keep changed files so pending
    // review state survives across follow-up prompts until the user decides.
    setTodoList([])

    const controller = new AbortController()
    const ownsDirectStream = shouldOwnDirectChatStream({
      sessionId: requestSessionId,
      directStreamSessionId: directStreamSessionRef.current,
      hasActiveDirectStream: !!abortControllerRef.current,
    })
    if (ownsDirectStream) {
      abortControllerRef.current = controller
      directStreamSessionRef.current = requestSessionId
      if (streamAbortRef.current) {
        streamAbortRef.current.abort()
        streamAbortRef.current = null
      }
    }
    const requestVersion = ownsDirectStream ? ++requestVersionRef.current : requestVersionRef.current
    const finishOwnedDirectStream = () => {
      if (ownsDirectStream) finishDirectStream(requestSessionId, controller)
    }

    // Guard: only update state if we are still on the same session/version.
    // Concurrent submits that are expected to queue do not take ownership of the
    // direct stream, so they cannot stale the in-flight answer.
    const isStale = () =>
      prevSessionIdRef.current !== requestSessionId || requestVersionRef.current !== requestVersion
    // Imperative stream writer: every component of the assistant answer (text,
    // thinking, tool calls/outputs/results) flows through one ordered
    // MessageSegment accumulator. React only sees the snapshot when we flush.
    const stream = createMessageStream()
    let pendingContextFlow: LlmContextFlow | undefined

    const textPacer = createStreamTextPacer({
      onText: (chunk) => stream.pushText(chunk),
      onThinking: (chunk) => stream.pushThinking(chunk),
      onCommit: () => updateMessage({ immediate: true }),
      deadlineMs: STREAMING_FLUSH_DEADLINE_MS,
    })

    const commitBufferedUpdates = () => {
      if (isStale()) return
      const snapshot = stream.snapshot()
      const updates = snapshotToChatMessageUpdates(snapshot)
      if (pendingContextFlow !== undefined) updates.contextFlow = pendingContextFlow
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === assistantId ? { ...m, ...updates } : m
        ),
      }))
    }

    const streamScheduler = createStreamRenderScheduler({
      onFlush: commitBufferedUpdates,
      deadlineMs: STREAMING_FLUSH_DEADLINE_MS,
    })
    const flushBufferImmediately = streamScheduler.flushNow

    const updateMessage = (options?: { immediate?: boolean }) => {
      if (isStale()) return
      if (options?.immediate) {
        flushSync(flushBufferImmediately)
        return
      }
      streamScheduler.schedule()
    }

    stream.markDirty(streamScheduler.schedule)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (effectiveToken) headers['Authorization'] = `Bearer ${effectiveToken}`

      const requestBody = {
        content,
        sessionId: requestSessionId,
        ...(options.mode && options.mode !== 'agent' ? { mode: options.mode } : {}),
        ...(options.provider && options.provider !== 'jait' ? { provider: options.provider } : {}),
        ...(options.provider && options.provider !== 'jait' && options.runtimeMode ? { runtimeMode: options.runtimeMode } : {}),
        ...(options.responseStyle && options.responseStyle !== 'normal' ? { responseStyle: options.responseStyle } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.displaySegments?.length ? { displaySegments: options.displaySegments } : {}),
        ...(outboundAttachments?.length ? { attachments: outboundAttachments.map((a) => ({ name: a.name, mimeType: a.mimeType, data: a.data })) } : {}),
      }
      pushSSEDebugEvent('request', JSON.stringify(requestBody))

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      if (response.status === 401) {
        const data = await response.json()
        if (data.detail === 'login_required' || data.detail === 'limit_reached') {
          setState(prev => ({
            ...prev,
            isLoading: ownsDirectStream ? false : prev.isLoading,
            error: data.detail,
            messages: prev.messages.filter(m =>
              options.queued
                ? m.id !== assistantId && m.id !== userMessage.id
                : !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
            ),
          }))
          if (data.detail === 'login_required') notifyLoginRequired?.()
          finishOwnedDirectStream()
          return 'retry'
        }
      }

      if (!response.ok) {
        throw new Error(formatChatHttpError(response.status, {
          provider: options.provider,
          attachments: outboundAttachments,
          displaySegments: options.displaySegments,
        }))
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let lineBuffer = ''
      let completed = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex]
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            pushSSEDebugEvent(String(data.type ?? 'unknown'), line.slice(6))

            if (data.type === 'thinking') {
              textPacer.enqueueThinking(data.content as string)
            } else if (data.type === 'token') {
              textPacer.enqueueText(data.content as string)
            } else if (data.type === 'tool_call_delta') {
              await textPacer.waitUntilIdle()
              stream.pushToolCallDelta(
                data.call_id as string,
                (data.name_delta as string) || '',
                (data.args_delta as string) || '',
                data.parent_call_id as string | undefined,
              )
              updateMessage({ immediate: true })
            } else if (data.type === 'tool_start') {
              await textPacer.waitUntilIdle()
              stream.pushToolStart(
                data.call_id as string,
                data.tool as string,
                (data.args as Record<string, unknown>) ?? {},
                data.parent_call_id as string | undefined,
              )
              updateMessage({ immediate: true })
            } else if (data.type === 'approval_required') {
              await textPacer.waitUntilIdle()
              stream.pushApprovalRequired(
                data.request_id as string,
                (data.call_id as string) || `approval-${data.request_id as string}`,
                (data.tool as string) || 'approval',
                (data.args as Record<string, unknown>) ?? {},
              )
              updateMessage({ immediate: true })
            } else if (data.type === 'tool_output') {
              await textPacer.waitUntilIdle()
              stream.pushToolOutput(data.call_id as string, data.content as string)
              updateMessage()
            } else if (data.type === 'tool_result') {
              await textPacer.waitUntilIdle()
              stream.pushToolResult(
                data.call_id as string,
                data.ok as boolean,
                data.message as string,
                data.data as unknown,
                data.parent_call_id as string | undefined,
              )
              updateMessage({ immediate: true })

              // Auto-track file edits in changedFiles
              if (data.ok) {
                const snapshot = stream.snapshot()
                const tc = snapshot.toolCalls.find(tc => tc.callId === (data.call_id as string))
                const toolName = tc?.tool.replace('_', '.')
                if (tc && (toolName === 'file.write' || toolName === 'file.patch' || toolName === 'edit')) {
                  const resultData = data.data && typeof data.data === 'object'
                    ? data.data as Record<string, unknown>
                    : undefined
                  const filePath = getToolFilePath(toolName, tc.args ?? {}, resultData, data.message as string | undefined) ?? ''
                  if (filePath && !isStale()) {
                    const fileName = filePath.split('/').pop() ?? filePath
                    setChangedFiles(prev => {
                      if (prev.some(f => f.path === filePath)) return prev
                      return [...prev, { path: filePath, name: fileName, state: 'undecided' as const }]
                    })
                  }
                }
              }
            } else if (data.type === 'plan_complete') {
              // Plan mode completed — store the plan for review
              const plan: PlanData = {
                plan_id: data.plan_id as string,
                summary: data.summary as string,
                actions: Array.isArray(data.actions) ? data.actions as PlanAction[] : [],
              }
              setPendingPlan(plan)
            } else if (data.type === 'mode_notice') {
              // Mode notice — append as assistant content
              textPacer.enqueueText(`\n\n*${data.message as string}*`)
            } else if (data.type === 'todo_list') {
              // AI updated the task list
              setTodoList(normalizeTodoStateValue(data.items))
            } else if (data.type === 'context_usage') {
              setContextUsage(data as unknown as ContextUsage)
            } else if (data.type === 'context_flow') {
              pendingContextFlow = parseContextFlowEvent(data as Record<string, unknown>)
              updateMessage({ immediate: true })
            } else if (data.type === 'provider_fallback') {
              // Provider was unavailable, gateway fell back to jait
              setSessionInfo({
                provider: 'jait',
                projectPath: '',
                isRemote: false,
              })
            } else if (data.type === 'session_info') {
              setSessionInfo({
                provider: data.provider as string,
                projectPath: data.projectPath as string,
                isRemote: data.isRemote as boolean,
                remoteNode: data.remoteNode as SessionInfo['remoteNode'],
              })
            } else if (data.type === 'file_changed') {
              // AI reported a file change
              const filePath = data.path as string
              const fileName = data.name as string
              if (!isStale()) {
                setChangedFiles(prev => {
                  const existing = prev.find(f => f.path === filePath)
                  if (existing) return prev
                  return [...prev, { path: filePath, name: fileName, state: 'undecided' as const }]
                })
              }
            } else if (data.type === 'queued') {
              await textPacer.waitUntilIdle()
              flushBufferImmediately()
              const queued = data.message as Partial<QueuedChatMessage> | undefined
              if (!isStale()) {
                setState(prev => ({
                  ...prev,
                  isLoading: ownsDirectStream ? false : prev.isLoading,
                  messages: prev.messages.filter(m => m.id !== assistantId && m.id !== userMessage.id),
                }))
                // Only mirror the server-assigned queue entry into local state
                // for user-initiated sends. When this send itself originated
                // from the queue (options.queued), the server is already the
                // authoritative owner of the persisted queue and will broadcast
                // the canonical `queued_messages` state via WS. Re-adding here
                // with a freshly generated server id raced the server-side
                // drain and caused every queued message to multiply.
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
              }
              finishOwnedDirectStream()
              return 'queued'
            } else if (data.type === 'done') {
              completed = true
              await textPacer.waitUntilIdle()
              flushBufferImmediately()
              const snapshot = stream.snapshot()
              if (!isStale()) {
                const isEmptyAssistant =
                  snapshot.content.length === 0 &&
                  snapshot.thinking.length === 0 &&
                  snapshot.toolCalls.length === 0
                setState(prev => ({
                  ...prev,
                  promptCount: data.prompt_count,
                  remainingPrompts: data.remaining_prompts,
                  isLoading: ownsDirectStream ? false : prev.isLoading,
                  hitMaxRounds: shouldShowContinueAfterDone(data),
                  messages: isEmptyAssistant
                    ? prev.messages.filter(m => m.id !== assistantId)
                    : prev.messages.map(m =>
                        m.id === assistantId
                          ? { ...m, ...snapshotToChatMessageUpdates(snapshot) }
                          : m
                      ),
                }))
                clearUnfinishedTodoList()
              } else {
                // Stream is stale (session/provider changed), but still clean up
                // the empty assistant placeholder so it doesn't linger.
                setState(prev => ({
                  ...prev,
                  messages: prev.messages.filter(m =>
                    !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
                  ),
                }))
              }
              finishOwnedDirectStream()
              setCompletionCount((prev) => prev + 1)
              return 'sent'
            } else if (data.type === 'error') {
              throw new Error(data.message)
            }
          } catch (parseErr) {
            if (!(parseErr instanceof SyntaxError)) throw parseErr
            // incomplete JSON chunk — wait for next line
          }
        }
      }
      await textPacer.waitUntilIdle()
      flushBufferImmediately()
      if (!completed && !isStale()) {
        const snapshot = stream.snapshot()
        const isEmptyAssistant =
          snapshot.content.length === 0 &&
          snapshot.thinking.length === 0 &&
          snapshot.toolCalls.length === 0
        setState(prev => ({
          ...prev,
          isLoading: ownsDirectStream ? false : prev.isLoading,
          messages: isEmptyAssistant
            ? prev.messages.filter(m => m.id !== assistantId)
            : prev.messages.map(m =>
                m.id === assistantId
                  ? { ...m, ...snapshotToChatMessageUpdates(snapshot) }
                  : m
              ),
        }))
        setCompletionCount((prev) => prev + 1)
        clearUnfinishedTodoList()
      } else if (!completed && isStale()) {
        // Stream ended without done event and session/provider changed —
        // clean up empty assistant placeholder to prevent ghost messages.
        setState(prev => ({
          ...prev,
          messages: prev.messages.filter(m =>
            !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
          ),
        }))
      }
    } catch (error) {
      textPacer.flushNow()
      streamScheduler.cancel()
      stream.finish()
      flushBufferImmediately()
      if (error instanceof Error && error.name === 'AbortError') {
        finishOwnedDirectStream()
        if (!isStale()) {
          setState(prev => ({
            ...prev,
            isLoading: ownsDirectStream ? false : prev.isLoading,
            messages: prev.messages
              .filter(m =>
                options.queued
                  ? m.id !== assistantId && m.id !== userMessage.id
                  : !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
              )
              .map(m => {
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
        } else {
          // Stale abort — still clean up empty assistant placeholder
          setState(prev => ({
            ...prev,
            messages: prev.messages.filter(m =>
              !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
            ),
          }))
        }
        return 'aborted'
      }
      finishOwnedDirectStream()
      if (!isStale()) {
        const transientConnectionError = isTransientConnectionError(error)
        const errorMessage = transientConnectionError
          ? TRANSIENT_CONNECTION_MESSAGE
          : error instanceof Error ? error.message : 'An error occurred'
        setState(prev => {
          // When the error is rendered inline as a chat message we must not also
          // surface it via the `error` banner above the composer (avoids dupes).
          const renderedInline =
            !transientConnectionError &&
            !options.queued &&
            prev.messages.some(m =>
              m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0)
            )
          return {
            ...prev,
            isLoading: ownsDirectStream ? false : prev.isLoading,
            error: renderedInline ? null : errorMessage,
            messages: transientConnectionError || options.queued
              ? prev.messages.filter(m =>
                  options.queued
                    ? m.id !== assistantId && m.id !== userMessage.id
                    : !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
                )
              : prev.messages.map(m =>
                  m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0)
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
          window.setTimeout(() => {
            if (prevSessionIdRef.current === requestSessionId) resumeSessionStream()
          }, 250)
        }
      } else {
        // Stale error — clean up empty assistant placeholder
        setState(prev => ({
          ...prev,
          messages: prev.messages.filter(m =>
            !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
          ),
        }))
      }
      return 'retry'
    }
    textPacer.cancel()
    finishOwnedDirectStream()
    return 'sent'
  }, [authToken, clearUnfinishedTodoList, finishDirectStream, onLoginRequired, resumeSessionStream, sessionId])

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

  const setMessageQueueState = useCallback((items: QueuedChatMessage[]) => {
    setMessageQueue(items)
  }, [])

  useEffect(() => {
    const resumeActiveStreamIfNeeded = () => {
      if (!shouldResumeChatSession({
        sessionId,
        isLoading: state.isLoading,
        isLoadingHistory: state.isLoadingHistory,
        messageCount: state.messages.length,
        error: state.error,
      })) return
      resumeSessionStream()
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        resumeActiveStreamIfNeeded()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [state.error, state.isLoading, state.isLoadingHistory, resumeSessionStream, sessionId, state.messages.length])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const resumeActiveStreamIfNeeded = () => {
      if (!shouldResumeChatSession({
        sessionId,
        isLoading: state.isLoading,
        isLoadingHistory: state.isLoadingHistory,
        messageCount: state.messages.length,
        error: state.error,
      })) return
      resumeSessionStream()
    }

    const handleResume = () => {
      resumeActiveStreamIfNeeded()
    }

    window.addEventListener('focus', handleResume)
    window.addEventListener('pageshow', handleResume)
    window.addEventListener('online', handleResume)
    return () => {
      window.removeEventListener('focus', handleResume)
      window.removeEventListener('pageshow', handleResume)
      window.removeEventListener('online', handleResume)
    }
  }, [state.isLoading, state.isLoadingHistory, state.messages.length, resumeSessionStream, sessionId])

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
    // 1. Tell the gateway to abort the Ollama stream
    const sid = prevSessionIdRef.current
    if (sid) {
      fetch(`${API_URL}/api/sessions/${sid}/cancel`, {
        method: 'POST',
        headers: authHeaders(authToken),
      }).catch(() => {})
    }
    // 2. Abort the direct chat POST (if we're the originating tab)
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    directStreamSessionRef.current = null
    // 3. Abort the stream-resume SSE connection
    streamAbortRef.current?.abort()
    streamAbortRef.current = null
    streamResumeSessionRef.current = null
    // 4. Update UI — mark any in-flight tool calls as cancelled so spinners stop
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
    const { token, sessionId: explicitSessionId, onLoginRequired: requestLoginRequired } = options
    const effectiveToken = token ?? authToken
    const notifyLoginRequired = requestLoginRequired ?? onLoginRequired
    const requestSessionId = explicitSessionId ?? sessionId
    if (!requestSessionId || !editedContent.trim() || restartInFlightRef.current) return
    restartInFlightRef.current = true

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (effectiveToken) headers['Authorization'] = `Bearer ${effectiveToken}`

      const postRestart = () =>
        fetch(`${API_URL}/api/sessions/${requestSessionId}/restart-from`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ messageId, messageIndex, messageFromEnd }),
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

      // Invalidate in-flight local stream updates from the current run,
      // then proactively cancel server-side stream before restart.
      // This avoids a common race where restart is sent before the backend
      // has finished clearing active stream state.
      requestVersionRef.current += 1
      abortControllerRef.current?.abort()
      streamAbortRef.current?.abort()
      streamAbortRef.current = null
      streamResumeSessionRef.current = null
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
        return
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

      await sendMessage(editedContent.trim(), {
        token: effectiveToken,
        sessionId: requestSessionId,
        mode: options.mode,
        provider: options.provider,
        model: options.model,
        displayContent: options.displayContent ?? editedContent.trim(),
        referencedFiles: options.referencedFiles,
        displaySegments: options.displaySegments,
        onLoginRequired: notifyLoginRequired,
      })
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to restart from message',
      }))
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
    updateQueueItem,
    reorderQueueItem,
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
