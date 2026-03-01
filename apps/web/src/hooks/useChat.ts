import { useState, useCallback, useRef, useEffect } from 'react'
import { flushSync } from 'react-dom'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'

const API_URL = import.meta.env.VITE_API_URL || ''
const STREAM_SNAPSHOT_LIMIT = 120

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  thinkingDuration?: number
  toolCalls?: ToolCallInfo[]
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  isLoadingHistory: boolean
  promptCount: number
  remainingPrompts: number | null
  error: string | null
}

interface SendMessageOptions {
  token?: string | null
  sessionId?: string | null  // explicit override — avoids stale-closure race after createSession
  onLoginRequired?: () => void
}

/**
 * @param sessionId - externally managed session ID (from useSessions)
 */
export function useChat(sessionId: string | null) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    isLoadingHistory: false,
    promptCount: 0,
    remainingPrompts: null,
    error: null,
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  const prevSessionIdRef = useRef<string | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const requestVersionRef = useRef(0)
  const restartInFlightRef = useRef(false)

  // When sessionId changes, load history / resume active stream via SSE
  useEffect(() => {
    if (sessionId === prevSessionIdRef.current) return
    requestVersionRef.current += 1
    prevSessionIdRef.current = sessionId

    // Don't abort the in-flight chat request — let the gateway finish processing.
    abortControllerRef.current = null

    // Abort any previous stream-resume connection
    if (streamAbortRef.current) {
      streamAbortRef.current.abort()
      streamAbortRef.current = null
    }

    if (!sessionId) {
      setState({ messages: [], isLoading: false, isLoadingHistory: false, promptCount: 0, remainingPrompts: null, error: null })
      return
    }

    let cancelled = false
    setState(prev => ({ ...prev, messages: [], isLoading: false, isLoadingHistory: true, error: null }))

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
          },
        )
        if (!res.ok || cancelled) return
        const reader = res.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let lineBuffer = ''
        let assistantId: string | null = null

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

              if (data.type === 'snapshot') {
                const rawMsgs = data.messages as Array<{
                  id: string;
                  role: 'user' | 'assistant';
                  content: string;
                  toolCalls?: Array<{
                    callId: string;
                    tool: string;
                    args: Record<string, unknown>;
                    status?: 'running' | 'success' | 'error';
                    ok?: boolean;
                    message?: string;
                    output?: string;
                    streamingOutput?: string;
                    startedAt?: number;
                    completedAt?: number;
                  }>;
                }>
                const snapshotStreaming = data.streaming as boolean
                const msgs: ChatMessage[] = rawMsgs.map(m => {
                  const msg: ChatMessage = { id: m.id, role: m.role, content: m.content }
                  if (m.toolCalls && m.toolCalls.length > 0) {
                    msg.toolCalls = m.toolCalls.map(tc => {
                      // Streaming snapshots may provide explicit running status.
                      // Persisted DB snapshots provide ok/message for completed calls.
                      let status: 'running' | 'success' | 'error' =
                        tc.status ?? (tc.ok ? 'success' as const : 'error' as const)
                      // Safety net: if the server says streaming is done, no tool
                      // call should remain in 'running' state (handles race conditions).
                      if (status === 'running' && !snapshotStreaming) status = 'error'
                      return {
                        callId: tc.callId,
                        tool: tc.tool,
                        args: tc.args ?? {},
                        status,
                        result: status === 'running'
                          ? undefined
                          : { ok: !!tc.ok, message: tc.message ?? 'Cancelled', data: tc.output != null ? { output: tc.output } : undefined },
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
                }))
              } else if (data.type === 'token' && assistantId) {
                // Append token to the tracked assistant message
                const token = data.content as string
                setState(prev => ({
                  ...prev,
                  messages: prev.messages.map(m =>
                    m.id === assistantId ? { ...m, content: m.content + token } : m
                  ),
                }))
              } else if (data.type === 'tool_start' && assistantId) {
                const callInfo: ToolCallInfo = {
                  callId: data.call_id as string,
                  tool: data.tool as string,
                  args: (data.args as Record<string, unknown>) ?? {},
                  status: 'running',
                  startedAt: Date.now(),
                }
                setState(prev => ({
                  ...prev,
                  messages: prev.messages.map(m =>
                    m.id === assistantId
                      ? { ...m, toolCalls: [...(m.toolCalls ?? []), callInfo] }
                      : m
                  ),
                }))
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
              } else if (data.type === 'done') {
                setState(prev => ({
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
                }))
              } else if (data.type === 'error') {
                setState(prev => ({
                  ...prev,
                  isLoading: false,
                  error: data.message as string,
                }))
              }
            } catch {
              // incomplete JSON chunk
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
  }, [sessionId])

  const sendMessage = useCallback(async (
    content: string,
    options: SendMessageOptions = {}
  ) => {
    const { token, sessionId: explicitSessionId, onLoginRequired } = options
    const requestSessionId = explicitSessionId ?? sessionId // prefer explicit override
    const assistantId = `assistant-${Date.now()}`

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    }

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage, { id: assistantId, role: 'assistant', content: '' }],
      isLoading: true,
      error: null,
    }))

    const controller = new AbortController()
    abortControllerRef.current = controller
    const requestVersion = ++requestVersionRef.current

    // Guard: only update state if we're still on the same session
    const isStale = () =>
      prevSessionIdRef.current !== requestSessionId || requestVersionRef.current !== requestVersion

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content, sessionId: requestSessionId }),
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
              !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
            ),
          }))
          if (data.detail === 'login_required') onLoginRequired?.()
          return
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
      let lineBuffer = ''

      const updateMessage = (updates: Partial<ChatMessage>) => {
        if (isStale()) return
        flushSync(() => {
          setState(prev => ({
            ...prev,
            messages: prev.messages.map(m =>
              m.id === assistantId ? { ...m, ...updates } : m
            ),
          }))
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

            if (data.type === 'thinking') {
              if (!thinkingStart) thinkingStart = Date.now()
              thinkingContent += data.content
              updateMessage({ thinking: thinkingContent })
            } else if (data.type === 'token') {
              if (thinkingStart && !thinkingDuration) {
                thinkingDuration = Math.round((Date.now() - thinkingStart) / 1000)
              }
              assistantContent += data.content
              updateMessage({ content: assistantContent, thinkingDuration })
            } else if (data.type === 'tool_start') {
              const callInfo: ToolCallInfo = {
                callId: data.call_id as string,
                tool: data.tool as string,
                args: (data.args as Record<string, unknown>) ?? {},
                status: 'running',
                startedAt: Date.now(),
              }
              toolCalls.push(callInfo)
              updateMessage({ toolCalls: [...toolCalls] })
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
              }
            } else if (data.type === 'done') {
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
                            }
                          : m
                      ),
                }))
              }
            } else if (data.type === 'error') {
              throw new Error(data.message)
            }
          } catch {
            // incomplete chunk
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (!isStale()) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            messages: prev.messages
              .filter(m =>
                !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
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
        return
      }
      if (!isStale()) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'An error occurred',
          messages: prev.messages.filter(m =>
            !(m.id === assistantId && !m.content && !m.thinking && (!m.toolCalls || m.toolCalls.length === 0))
          ),
        }))
      }
    }
  }, [sessionId])

  const cancelRequest = useCallback(() => {
    requestVersionRef.current += 1
    // 1. Tell the gateway to abort the Ollama stream
    const sid = prevSessionIdRef.current
    if (sid) {
      fetch(`${API_URL}/api/sessions/${sid}/cancel`, { method: 'POST' }).catch(() => {})
    }
    // 2. Abort the direct chat POST (if we're the originating tab)
    abortControllerRef.current?.abort()
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
  }, [])

  const clearMessages = useCallback(() => {
    setState({ messages: [], isLoading: false, isLoadingHistory: false, promptCount: 0, remainingPrompts: null, error: null })
  }, [])

  const restartFromMessage = useCallback(async (
    messageId: string,
    editedContent: string,
    messageIndex?: number,
    messageFromEnd?: number,
    options: SendMessageOptions = {},
  ) => {
    const { token, sessionId: explicitSessionId, onLoginRequired } = options
    const requestSessionId = explicitSessionId ?? sessionId
    if (!requestSessionId || !editedContent.trim() || restartInFlightRef.current) return
    restartInFlightRef.current = true

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

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
      await fetch(`${API_URL}/api/sessions/${requestSessionId}/cancel`, { method: 'POST', headers }).catch(() => null)
      await waitForStreamingToStop()

      let res = await postRestart()
      if (res.status === 409) {
        // Fallback: one more wait cycle, then a final restart attempt.
        await waitForStreamingToStop()
        res = await postRestart()
      }

      if (res.status === 401) {
        const data = await res.json().catch(() => ({})) as { detail?: string }
        if (data.detail === 'login_required') onLoginRequired?.()
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

      await sendMessage(editedContent.trim(), { token, sessionId: requestSessionId, onLoginRequired })
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to restart from message',
      }))
    } finally {
      restartInFlightRef.current = false
    }
  }, [sessionId, sendMessage])

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    isLoadingHistory: state.isLoadingHistory,
    remainingPrompts: state.remainingPrompts,
    error: state.error,
    sendMessage,
    restartFromMessage,
    cancelRequest,
    clearMessages,
  }
}
