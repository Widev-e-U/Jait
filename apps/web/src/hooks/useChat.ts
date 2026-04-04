import { useState, useCallback, useRef, useEffect } from 'react'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'
import type { TodoItem } from '@/components/chat/todo-list'
import type { ChangedFile, FileChangeState } from '@/components/chat/files-changed'
import type { QueuedMessage } from '@/components/chat/message-queue'
import { pushSSEDebugEvent } from '@/components/debug/sse-debug-panel'
import { getApiUrl } from '@/lib/gateway-url'
import { getToolFilePath } from '@/lib/tool-call-body'
import type { RuntimeMode } from '@/lib/agents-api'
import {
  parseLegacyReferencedFilesBlock,
  parseUserMessageSegments,
  userMessageTextFromSegments,
  userReferencedFilesFromSegments,
  type UserMessageSegment,
} from '@/lib/user-message-segments'

const API_URL = getApiUrl()
const STREAM_SNAPSHOT_LIMIT = 120
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

function attachmentsFromSegments(segments: UserMessageSegment[] | undefined): ChatAttachment[] | undefined {
  if (!segments?.length) return undefined
  const attachments = segments.flatMap((segment) => (
    segment.type === 'image'
      ? [{
          name: segment.name,
          mimeType: segment.mimeType,
          data: segment.data,
          preview: `data:${segment.mimeType};base64,${segment.data}`,
        }]
      : []
  ))
  return attachments.length > 0 ? attachments : undefined
}

/**
 * A segment in the ordered response stream. Consecutive tool calls
 * are grouped; text between tool-call groups forms its own segment.
 */
export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'toolGroup'; callIds: string[] }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
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
}

/** Execution context info sent by the gateway at the start of a CLI session */
export interface SessionInfo {
  provider: string
  workspacePath: string
  isRemote: boolean
  remoteNode?: { nodeId: string; nodeName: string; platform: string }
}

export type ChatMode = 'ask' | 'agent' | 'plan'

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

interface SendMessageOptions {
  token?: string | null
  sessionId?: string | null  // explicit override — avoids stale-closure race after createSession
  onLoginRequired?: () => void
  mode?: ChatMode
  /** CLI provider to use for this message (jait, codex, claude-code) */
  provider?: string
  runtimeMode?: RuntimeMode
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
  model?: string | null
  mode?: ChatMode
  referencedFiles?: { path: string; name: string }[]
  displaySegments?: UserMessageSegment[]
  attachments?: ChatAttachment[]
}

type SendMessageResult = 'sent' | 'retry' | 'aborted'

/**
 * @param sessionId - externally managed session ID (from useSessions)
 */
export function useChat(
  sessionId: string | null,
  authToken?: string | null,
  onLoginRequired?: () => void,
  workspaceSurfaceId?: string | null,
) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    isLoadingHistory: false,
    promptCount: 0,
    remainingPrompts: null,
    error: null,
    hitMaxRounds: false,
  })

  const [pendingPlan, setPendingPlan] = useState<PlanData | null>(null)
  const [todoList, setTodoList] = useState<TodoItem[]>([])
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([])
  const [messageQueue, setMessageQueue] = useState<QueuedChatMessage[]>([])
  const [completionCount, setCompletionCount] = useState(0)
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const prevSessionIdRef = useRef<string | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const directStreamSessionRef = useRef<string | null>(null)
  const requestVersionRef = useRef(0)
  const restartInFlightRef = useRef(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const resumeSessionStream = useCallback(() => {
    if (!sessionId) return
    if (directStreamSessionRef.current === sessionId && abortControllerRef.current) return
    prevSessionIdRef.current = null
    setRefreshTrigger(n => n + 1)
  }, [sessionId])

  // When sessionId changes, load history / resume active stream via SSE
  useEffect(() => {
    if (sessionId === prevSessionIdRef.current) return
    requestVersionRef.current += 1
    prevSessionIdRef.current = sessionId

    // Abort any previous stream-resume connection
    if (streamAbortRef.current) {
      streamAbortRef.current.abort()
      streamAbortRef.current = null
    }

    if (!sessionId) {
      setState({ messages: [], isLoading: false, isLoadingHistory: false, promptCount: 0, remainingPrompts: null, hitMaxRounds: false, error: null })
      setTodoList([])
      setChangedFiles([])
      setMessageQueue([])
      setContextUsage(null)
      return
    }

    let cancelled = false
    setState(prev => ({ ...prev, messages: [], isLoading: false, isLoadingHistory: true, error: null }))
    setContextUsage(null)

    // Connect to the stream-resume SSE endpoint.
    // It returns a snapshot of current messages, then live tokens if still streaming.
    const streamController = new AbortController()
    streamAbortRef.current = streamController

    ;(async () => {
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
        if (!res.ok || cancelled) return
        const reader = res.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let lineBuffer = ''
        let assistantId: string | null = null

        /** Immutably append a text chunk to a message's segments array */
        const withTextSegment = (segs: MessageSegment[] | undefined, text: string): MessageSegment[] => {
          const arr = segs ? [...segs] : []
          const last = arr[arr.length - 1]
          if (last?.type === 'text') {
            arr[arr.length - 1] = { type: 'text', content: last.content + text }
          } else {
            arr.push({ type: 'text', content: text })
          }
          return arr
        }

        /** Immutably append a tool callId to a message's segments array */
        const withToolSegment = (segs: MessageSegment[] | undefined, callId: string): MessageSegment[] => {
          const arr = segs ? [...segs] : []
          const last = arr[arr.length - 1]
          if (last?.type === 'toolGroup') {
            if (!last.callIds.includes(callId)) {
              arr[arr.length - 1] = { type: 'toolGroup', callIds: [...last.callIds, callId] }
            }
          } else {
            arr.push({ type: 'toolGroup', callIds: [callId] })
          }
          return arr
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (cancelled) { reader.cancel(); break }

          lineBuffer += decoder.decode(value, { stream: true })
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6)) as Record<string, unknown>
              pushSSEDebugEvent(String(data.type ?? 'unknown'), line.slice(6))

              if (data.type === 'snapshot') {
                const rawMsgs = data.messages as Array<{
                  id: string;
                  role: 'user' | 'assistant';
                  content: string;
                  segments?: unknown[];
                  toolCalls?: Array<{
                    callId: string;
                    tool: string;
                    args: Record<string, unknown>;
                    status?: 'pending' | 'running' | 'success' | 'error';
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
                const msgs: ChatMessage[] = rawMsgs.map(m => {
                  const msg: ChatMessage = { id: m.id, role: m.role, content: m.content }
                  if (m.role === 'user' && m.segments && m.segments.length > 0) {
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
                  } else if (m.segments && m.segments.length > 0) {
                    msg.segments = m.segments as MessageSegment[]
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
                      return {
                        callId: tc.callId,
                        tool: tc.tool,
                        args: tc.args ?? {},
                        status,
                        result: status === 'running'
                          ? undefined
                          : {
                              ok: !!tc.ok,
                              message: tc.message ?? 'Cancelled',
                              // Prefer full data object (new format); fall back to
                              // { output } wrapper for old persisted rows.
                              data: tc.data ?? (tc.output != null ? { output: tc.output } : undefined),
                            },
                        streamingOutput: tc.streamingOutput,
                        startedAt: tc.startedAt ?? 0,
                        completedAt: tc.completedAt ?? 0,
                      }
                    })
                  }
                  return msg
                })
                // Track the last assistant message for token updates
                const lastMsg = msgs[msgs.length - 1]
                if (lastMsg?.role === 'assistant') assistantId = lastMsg.id
                setState(prev => ({
                  ...prev,
                  messages: msgs,
                  isLoadingHistory: false,
                  isLoading: snapshotStreaming,
                  error: null,
                }))
              } else if (data.type === 'token' && assistantId) {
                // Append token to the tracked assistant message
                const token = data.content as string
                setState(prev => ({
                  ...prev,
                  messages: prev.messages.map(m =>
                    m.id === assistantId
                      ? { ...m, content: m.content + token, segments: withTextSegment(m.segments, token) }
                      : m
                  ),
                }))
              } else if (data.type === 'tool_call_delta' && assistantId) {
                const callId = data.call_id as string
                const nameDelta = (data.name_delta as string) || ''
                const argsDelta = (data.args_delta as string) || ''
                setState(prev => {
                  const msg = prev.messages.find(m => m.id === assistantId)
                  const existing = msg?.toolCalls?.find(tc => tc.callId === callId)
                  if (existing) {
                    return {
                      ...prev,
                      messages: prev.messages.map(m =>
                        m.id === assistantId
                          ? {
                              ...m,
                              toolCalls: m.toolCalls?.map(tc =>
                                tc.callId === callId
                                  ? { ...tc, tool: tc.tool + nameDelta, streamingArgs: (tc.streamingArgs ?? '') + argsDelta }
                                  : tc
                              ),
                            }
                          : m
                      ),
                    }
                  }
                  const callInfo: ToolCallInfo = {
                    callId,
                    tool: nameDelta,
                    args: {},
                    status: 'pending',
                    streamingArgs: argsDelta,
                    startedAt: Date.now(),
                  }
                  return {
                    ...prev,
                    messages: prev.messages.map(m =>
                      m.id === assistantId
                        ? { ...m, toolCalls: [...(m.toolCalls ?? []), callInfo], segments: withToolSegment(m.segments, callId) }
                        : m
                    ),
                  }
                })
              } else if (data.type === 'tool_start' && assistantId) {
                const callId = data.call_id as string
                setState(prev => {
                  const msg = prev.messages.find(m => m.id === assistantId)
                  const existing = msg?.toolCalls?.find(tc => tc.callId === callId)
                  if (existing) {
                    // Upgrade pending → running, fill in final args
                    return {
                      ...prev,
                      messages: prev.messages.map(m =>
                        m.id === assistantId
                          ? {
                              ...m,
                              toolCalls: m.toolCalls?.map(tc =>
                                tc.callId === callId
                                  ? { ...tc, tool: data.tool as string, args: (data.args as Record<string, unknown>) ?? {}, status: 'running' as const, streamingArgs: undefined }
                                  : tc
                              ),
                            }
                          : m
                      ),
                    }
                  }
                  const callInfo: ToolCallInfo = {
                    callId,
                    tool: data.tool as string,
                    args: (data.args as Record<string, unknown>) ?? {},
                    status: 'running',
                    startedAt: Date.now(),
                  }
                  return {
                    ...prev,
                    messages: prev.messages.map(m =>
                      m.id === assistantId
                        ? { ...m, toolCalls: [...(m.toolCalls ?? []), callInfo], segments: withToolSegment(m.segments, callId) }
                        : m
                    ),
                  }
                })
              } else if (data.type === 'tool_output' && assistantId) {
                setState(prev => ({
                  ...prev,
                  messages: prev.messages.map(m => {
                    if (m.id !== assistantId) return m
                    return {
                      ...m,
                      toolCalls: m.toolCalls?.map(tc =>
                        tc.callId === (data.call_id as string)
                          ? { ...tc, streamingOutput: (tc.streamingOutput ?? '') + (data.content as string) }
                          : tc
                      ),
                    }
                  }),
                }))
              } else if (data.type === 'tool_result' && assistantId) {
                setState(prev => ({
                  ...prev,
                  messages: prev.messages.map(m => {
                    if (m.id !== assistantId) return m
                    return {
                      ...m,
                      toolCalls: m.toolCalls?.map(tc =>
                        tc.callId === (data.call_id as string)
                          ? {
                              ...tc,
                              status: (data.ok as boolean) ? 'success' as const : 'error' as const,
                              result: { ok: data.ok as boolean, message: data.message as string, data: data.data as unknown },
                              completedAt: Date.now(),
                            }
                          : tc
                      ),
                    }
                  }),
                }))

                // Auto-track file edits in changedFiles (stream-resume path)
                if (data.ok) {
                  const msg = state.messages.find(m => m.id === assistantId)
                  const tc = msg?.toolCalls?.find(t => t.callId === (data.call_id as string))
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
                const items = data.items as TodoItem[]
                setTodoList(items)
              } else if (data.type === 'context_usage') {
                setContextUsage(data as unknown as ContextUsage)
              } else if (data.type === 'provider_fallback') {
                // Provider was unavailable, gateway fell back to jait
                setSessionInfo({
                  provider: 'jait',
                  workspacePath: '',
                  isRemote: false,
                })
              } else if (data.type === 'session_info') {
                // Execution context info from the gateway
                setSessionInfo({
                  provider: data.provider as string,
                  workspacePath: data.workspacePath as string,
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
                setState(prev => {
                  // Only signal completion if this was an active chat response,
                  // not just the end of a history-only stream.
                  if (prev.isLoading) setCompletionCount(c => c + 1)
                  return {
                    ...prev,
                    isLoading: false,
                    promptCount: (data.prompt_count as number) ?? prev.promptCount,
                    remainingPrompts: (data.remaining_prompts as number | null) ?? prev.remainingPrompts,
                    // Mark any tool calls still stuck in 'running' as cancelled
                    // (can happen if reload snapshot races with cancel processing)
                    messages: prev.messages.map(m =>
                      m.toolCalls?.some(tc => tc.status === 'running')
                        ? {
                            ...m,
                            toolCalls: m.toolCalls!.map(tc =>
                              tc.status === 'running'
                                ? { ...tc, status: 'error' as const, result: { ok: false, message: 'Cancelled' }, completedAt: Date.now() }
                                : tc
                            ),
                          }
                        : m
                    ),
                  }
                })
              } else if (data.type === 'error') {
                setState(prev => ({
                  ...prev,
                  isLoading: false,
                  error: data.message as string,
                }))
              }
            } catch (parseErr) {
              if (!(parseErr instanceof SyntaxError)) throw parseErr
              // incomplete JSON chunk — wait for next line
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!cancelled) setState(prev => ({ ...prev, isLoadingHistory: false }))
      }
    })()

    return () => {
      cancelled = true
      streamController.abort()
      // Reset so React strict-mode re-mount can re-run the effect
      prevSessionIdRef.current = null
    }
  }, [authToken, onLoginRequired, sessionId, refreshTrigger])

  /** Force-reload messages from the server (used by cross-client WS refresh). */
  const refreshMessages = useCallback(() => {
    // Skip if no active session or already loading / streaming
    if (!sessionId || state.isLoading) return
    resumeSessionStream()
  }, [resumeSessionStream, sessionId, state.isLoading])

  const sendMessage = useCallback(async (
    content: string,
    options: SendMessageOptions = {}
  ): Promise<SendMessageResult> => {
    const { token, sessionId: explicitSessionId, onLoginRequired: requestLoginRequired } = options
    const effectiveToken = token ?? authToken
    const notifyLoginRequired = requestLoginRequired ?? onLoginRequired
    const requestSessionId = explicitSessionId ?? sessionId // prefer explicit override
    const assistantId = createOptimisticMessageId('assistant')

    const userMessage: ChatMessage = {
      id: createOptimisticMessageId('user'),
      role: 'user',
      content,
      ...(options.displayContent ? { displayContent: options.displayContent } : {}),
      ...(options.referencedFiles?.length ? { referencedFiles: options.referencedFiles } : {}),
      ...(options.displaySegments?.length ? { displaySegments: options.displaySegments } : {}),
      ...(options.attachments?.length ? { attachments: options.attachments } : {}),
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
    abortControllerRef.current = controller
    directStreamSessionRef.current = requestSessionId
    if (streamAbortRef.current) {
      streamAbortRef.current.abort()
      streamAbortRef.current = null
    }
    const requestVersion = ++requestVersionRef.current

    // Guard: only update state if we're still on the same session
    const isStale = () =>
      prevSessionIdRef.current !== requestSessionId || requestVersionRef.current !== requestVersion
    let pendingMessageUpdates: Partial<ChatMessage> | null = null
    let pendingMessageFrame: number | null = null

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (effectiveToken) headers['Authorization'] = `Bearer ${effectiveToken}`

      const requestBody = {
        content,
        sessionId: requestSessionId,
        ...(options.mode && options.mode !== 'agent' ? { mode: options.mode } : {}),
        ...(options.provider && options.provider !== 'jait' ? { provider: options.provider } : {}),
        ...(options.provider && options.provider !== 'jait' && options.runtimeMode ? { runtimeMode: options.runtimeMode } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.displaySegments?.length ? { displaySegments: options.displaySegments } : {}),
        ...(options.attachments?.length ? { attachments: options.attachments.map((a) => ({ name: a.name, mimeType: a.mimeType, data: a.data })) } : {}),
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
            isLoading: false,
            error: data.detail,
            messages: prev.messages.filter(m =>
              options.queued
                ? m.id !== assistantId && m.id !== userMessage.id
                : !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
            ),
          }))
          if (data.detail === 'login_required') notifyLoginRequired?.()
          return 'retry'
        }
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let assistantContent = ''
      let thinkingContent = ''
      let thinkingStart: number | null = null
      let thinkingDuration: number | undefined
      const toolCalls: ToolCallInfo[] = []
      const segments: MessageSegment[] = []
      let lineBuffer = ''
      let completed = false

      /** Push or extend a text segment at the end of the segments list */
      const appendTextSegment = (text: string) => {
        const last = segments[segments.length - 1]
        if (last?.type === 'text') {
          last.content += text
        } else {
          segments.push({ type: 'text', content: text })
        }
      }

      /** Push a tool callId into the current trailing tool-group, or start a new one */
      const appendToolSegment = (callId: string) => {
        const last = segments[segments.length - 1]
        if (last?.type === 'toolGroup') {
          if (!last.callIds.includes(callId)) last.callIds.push(callId)
        } else {
          segments.push({ type: 'toolGroup', callIds: [callId] })
        }
      }

      const flushPendingMessageUpdates = () => {
        if (pendingMessageFrame !== null) {
          window.cancelAnimationFrame(pendingMessageFrame)
          pendingMessageFrame = null
        }
        if (isStale() || !pendingMessageUpdates) return
        const updates = pendingMessageUpdates
        pendingMessageUpdates = null
        setState(prev => ({
          ...prev,
          messages: prev.messages.map(m =>
            m.id === assistantId ? { ...m, ...updates } : m
          ),
        }))
      }

      const updateMessage = (updates: Partial<ChatMessage>) => {
        if (isStale()) return
        pendingMessageUpdates = {
          ...(pendingMessageUpdates ?? {}),
          ...updates,
        }
        if (pendingMessageFrame !== null) return
        pendingMessageFrame = window.requestAnimationFrame(() => {
          pendingMessageFrame = null
          flushPendingMessageUpdates()
        })
      }

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
            pushSSEDebugEvent(String(data.type ?? 'unknown'), line.slice(6))

            if (data.type === 'thinking') {
              if (!thinkingStart) thinkingStart = Date.now()
              thinkingContent += data.content
              updateMessage({ thinking: thinkingContent })
            } else if (data.type === 'token') {
              if (thinkingStart && !thinkingDuration) {
                thinkingDuration = Math.round((Date.now() - thinkingStart) / 1000)
              }
              assistantContent += data.content
              appendTextSegment(data.content as string)
              updateMessage({ content: assistantContent, thinkingDuration, segments: [...segments] })
            } else if (data.type === 'tool_call_delta') {
              const callId = data.call_id as string
              const nameDelta = (data.name_delta as string) || ''
              const argsDelta = (data.args_delta as string) || ''
              const idx = toolCalls.findIndex(tc => tc.callId === callId)
              if (idx !== -1) {
                toolCalls[idx] = {
                  ...toolCalls[idx],
                  tool: toolCalls[idx].tool + nameDelta,
                  streamingArgs: (toolCalls[idx].streamingArgs ?? '') + argsDelta,
                }
              } else {
                toolCalls.push({
                  callId,
                  tool: nameDelta,
                  args: {},
                  status: 'pending',
                  streamingArgs: argsDelta,
                  startedAt: Date.now(),
                })
                appendToolSegment(callId)
              }
              updateMessage({ toolCalls: [...toolCalls], segments: [...segments] })
            } else if (data.type === 'tool_start') {
              const callId = data.call_id as string
              const idx = toolCalls.findIndex(tc => tc.callId === callId)
              if (idx !== -1) {
                // Upgrade pending → running with final args
                toolCalls[idx] = {
                  ...toolCalls[idx],
                  tool: data.tool as string,
                  args: (data.args as Record<string, unknown>) ?? {},
                  status: 'running',
                  streamingArgs: undefined,
                }
              } else {
                toolCalls.push({
                  callId,
                  tool: data.tool as string,
                  args: (data.args as Record<string, unknown>) ?? {},
                  status: 'running',
                  startedAt: Date.now(),
                })
                appendToolSegment(callId)
              }
              updateMessage({ toolCalls: [...toolCalls], segments: [...segments] })
            } else if (data.type === 'tool_output') {
              const idx = toolCalls.findIndex(tc => tc.callId === (data.call_id as string))
              if (idx !== -1) {
                toolCalls[idx] = {
                  ...toolCalls[idx],
                  streamingOutput: (toolCalls[idx].streamingOutput ?? '') + (data.content as string),
                }
                updateMessage({ toolCalls: [...toolCalls] })
              }
            } else if (data.type === 'tool_result') {
              const idx = toolCalls.findIndex(tc => tc.callId === (data.call_id as string))
              if (idx !== -1) {
                toolCalls[idx] = {
                  ...toolCalls[idx],
                  status: (data.ok as boolean) ? 'success' : 'error',
                  result: { ok: data.ok as boolean, message: data.message as string, data: data.data as unknown },
                  completedAt: Date.now(),
                }
                updateMessage({ toolCalls: [...toolCalls] })

                // Auto-track file edits in changedFiles
                if (data.ok) {
                  const tc = toolCalls[idx]
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
            } else if (data.type === 'plan_complete') {
              // Plan mode completed — store the plan for review
              const plan: PlanData = {
                plan_id: data.plan_id as string,
                summary: data.summary as string,
                actions: (data.actions as PlanAction[]) ?? [],
              }
              setPendingPlan(plan)
            } else if (data.type === 'mode_notice') {
              // Mode notice — append as assistant content
              const notice = `\n\n*${data.message as string}*`
              assistantContent += notice
              appendTextSegment(notice)
              updateMessage({ content: assistantContent, segments: [...segments] })
            } else if (data.type === 'todo_list') {
              // AI updated the task list
              const items = data.items as TodoItem[]
              setTodoList(items)
            } else if (data.type === 'context_usage') {
              setContextUsage(data as unknown as ContextUsage)
            } else if (data.type === 'provider_fallback') {
              // Provider was unavailable, gateway fell back to jait
              setSessionInfo({
                provider: 'jait',
                workspacePath: '',
                isRemote: false,
              })
            } else if (data.type === 'session_info') {
              setSessionInfo({
                provider: data.provider as string,
                workspacePath: data.workspacePath as string,
                isRemote: data.isRemote as boolean,
                remoteNode: data.remoteNode as SessionInfo['remoteNode'],
              })
            } else if (data.type === 'file_changed') {
              // AI reported a file change
              const filePath = data.path as string
              const fileName = data.name as string
              setChangedFiles(prev => {
                const existing = prev.find(f => f.path === filePath)
                if (existing) return prev
                return [...prev, { path: filePath, name: fileName, state: 'undecided' as const }]
              })
            } else if (data.type === 'done') {
              completed = true
              flushPendingMessageUpdates()
              if (thinkingStart && !thinkingDuration) {
                thinkingDuration = Math.round((Date.now() - thinkingStart) / 1000)
              }
              if (!isStale()) {
                const isEmptyAssistant = assistantContent.length === 0 && thinkingContent.length === 0 && toolCalls.length === 0
                setState(prev => ({
                  ...prev,
                  promptCount: data.prompt_count,
                  remainingPrompts: data.remaining_prompts,
                  isLoading: false,
                  hitMaxRounds: !!(data.hit_max_rounds),
                  messages: isEmptyAssistant
                    ? prev.messages.filter(m => m.id !== assistantId)
                    : prev.messages.map(m =>
                        m.id === assistantId
                          ? {
                              ...m,
                              content: assistantContent,
                              thinking: thinkingContent || undefined,
                              thinkingDuration,
                              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                              segments: segments.length > 0 ? segments : undefined,
                            }
                          : m
                      ),
                        }))
              }
              if (abortControllerRef.current === controller) abortControllerRef.current = null
              if (directStreamSessionRef.current === requestSessionId) directStreamSessionRef.current = null
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
      flushPendingMessageUpdates()
      if (!completed && !isStale()) {
        if (thinkingStart && !thinkingDuration) {
          thinkingDuration = Math.round((Date.now() - thinkingStart) / 1000)
        }
        const isEmptyAssistant = assistantContent.length === 0 && thinkingContent.length === 0 && toolCalls.length === 0
        setState(prev => ({
          ...prev,
          isLoading: false,
          messages: isEmptyAssistant
            ? prev.messages.filter(m => m.id !== assistantId)
            : prev.messages.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: assistantContent,
                      thinking: thinkingContent || undefined,
                      thinkingDuration,
                      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                      segments: segments.length > 0 ? segments : undefined,
                    }
                  : m
              ),
        }))
        setCompletionCount((prev) => prev + 1)
      }
    } catch (error) {
      if (pendingMessageFrame !== null) {
        window.cancelAnimationFrame(pendingMessageFrame)
        pendingMessageFrame = null
      }
      pendingMessageUpdates = null
      if (error instanceof Error && error.name === 'AbortError') {
        if (abortControllerRef.current === controller) abortControllerRef.current = null
        if (directStreamSessionRef.current === requestSessionId) directStreamSessionRef.current = null
        if (!isStale()) {
          setState(prev => ({
            ...prev,
            isLoading: false,
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
        }
        return 'aborted'
      }
      if (abortControllerRef.current === controller) abortControllerRef.current = null
      if (directStreamSessionRef.current === requestSessionId) directStreamSessionRef.current = null
      if (!isStale()) {
        const transientConnectionError = isTransientConnectionError(error)
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: transientConnectionError
            ? TRANSIENT_CONNECTION_MESSAGE
            : error instanceof Error ? error.message : 'An error occurred',
          messages: prev.messages.filter(m =>
            options.queued
              ? m.id !== assistantId && m.id !== userMessage.id
              : !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
          ),
        }))
        if (transientConnectionError && requestSessionId) {
          window.setTimeout(() => {
            if (prevSessionIdRef.current === requestSessionId) resumeSessionStream()
          }, 250)
        }
      }
      return 'retry'
    }
    if (abortControllerRef.current === controller) abortControllerRef.current = null
    if (directStreamSessionRef.current === requestSessionId) directStreamSessionRef.current = null
    return 'sent'
  }, [authToken, onLoginRequired, sessionId])

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
      if (!sessionId || state.isLoadingHistory || !state.isLoading) return
      if (directStreamSessionRef.current === sessionId && abortControllerRef.current) return
      resumeSessionStream()
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        resumeActiveStreamIfNeeded()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [state.isLoading, state.isLoadingHistory, resumeSessionStream, sessionId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const resumeActiveStreamIfNeeded = () => {
      if (!sessionId || state.isLoadingHistory || !state.isLoading) return
      if (directStreamSessionRef.current === sessionId && abortControllerRef.current) return
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
  }, [state.isLoading, state.isLoadingHistory, resumeSessionStream, sessionId])

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
      await fetch(`${API_URL}/api/workspace/apply-diff`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path,
          content: null,
          ...(workspaceSurfaceId ? { surfaceId: workspaceSurfaceId } : {}),
        }), // null content = just clear backup
      })
    } catch { /* ignore */ }
  }, [authToken, updateAndBroadcastFiles, workspaceSurfaceId])

  const rejectFile = useCallback(async (path: string) => {
    // Call undo endpoint to restore the original file
    let restored = false
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`
      const res = await fetch(`${API_URL}/api/workspace/undo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path,
          ...(workspaceSurfaceId ? { surfaceId: workspaceSurfaceId } : {}),
        }),
      })
      restored = res.ok
    } catch {
      restored = false
    }
    if (!restored) return
    updateAndBroadcastFiles(prev => prev.map(f => f.path === path ? { ...f, state: 'rejected' as FileChangeState } : f))
  }, [authToken, updateAndBroadcastFiles, workspaceSurfaceId])

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
        const res = await fetch(`${API_URL}/api/workspace/undo-all`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            paths: undecidedPaths,
            ...(workspaceSurfaceId ? { surfaceId: workspaceSurfaceId } : {}),
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
  }, [authToken, changedFiles, updateAndBroadcastFiles, workspaceSurfaceId])

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
    setState({ messages: [], isLoading: false, isLoadingHistory: false, promptCount: 0, remainingPrompts: null, error: null, hitMaxRounds: false })
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

      const data = await res.json() as { messages?: ChatMessage[] }
      setState(prev => ({
        ...prev,
        messages: data.messages ?? [],
        isLoading: false,
        error: null,
      }))

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

  /** Add a changed file from an external source (e.g. cross-client WS sync). Deduplicates by path. */
  const addChangedFile = useCallback((path: string, name: string) => {
    setChangedFiles(prev => {
      if (prev.some(f => f.path === path)) return prev
      return [...prev, { path, name, state: 'undecided' as const }]
    })
  }, [])

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    isLoadingHistory: state.isLoadingHistory,
    remainingPrompts: state.remainingPrompts,
    error: state.error,
    hitMaxRounds: state.hitMaxRounds,
    pendingPlan,
    todoList,
    changedFiles,
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
  }
}
