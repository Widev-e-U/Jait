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

  // When sessionId changes, load history / resume active stream via SSE
  useEffect(() => {
    if (sessionId === prevSessionIdRef.current) return
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
                    ok: boolean;
                    message: string;
                    output?: string;
                    startedAt?: number;
                    completedAt?: number;
                  }>;
                }>
                const msgs: ChatMessage[] = rawMsgs.map(m => {
                  const msg: ChatMessage = { id: m.id, role: m.role, content: m.content }
                  if (m.toolCalls && m.toolCalls.length > 0) {
                    msg.toolCalls = m.toolCalls.map(tc => ({
                      callId: tc.callId,
                      tool: tc.tool,
                      args: tc.args ?? {},
                      status: tc.ok ? 'success' as const : 'error' as const,
                      result: { ok: tc.ok, message: tc.message, data: tc.output != null ? { output: tc.output } : undefined },
                      startedAt: tc.startedAt ?? 0,
                      completedAt: tc.completedAt ?? 0,
                    }))
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
                  isLoading: data.streaming as boolean,
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

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    }

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      error: null,
    }))

    const controller = new AbortController()
    abortControllerRef.current = controller

    // Guard: only update state if we're still on the same session
    const isStale = () => prevSessionIdRef.current !== requestSessionId

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
          setState(prev => ({ ...prev, isLoading: false, error: data.detail }))
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

      const assistantId = `assistant-${Date.now()}`
      if (!isStale()) {
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, { id: assistantId, role: 'assistant', content: '', thinking: '' }],
        }))
      }

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
                setState(prev => ({
                  ...prev,
                  promptCount: data.prompt_count,
                  remainingPrompts: data.remaining_prompts,
                  isLoading: false,
                  messages: prev.messages.map(m =>
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
        if (!isStale()) setState(prev => ({ ...prev, isLoading: false }))
        return
      }
      if (!isStale()) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'An error occurred',
        }))
      }
    }
  }, [sessionId])

  const cancelRequest = useCallback(() => {
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
    // 4. Update UI
    setState(prev => ({ ...prev, isLoading: false }))
  }, [])

  const clearMessages = useCallback(() => {
    setState({ messages: [], isLoading: false, isLoadingHistory: false, promptCount: 0, remainingPrompts: null, error: null })
  }, [])

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    isLoadingHistory: state.isLoadingHistory,
    remainingPrompts: state.remainingPrompts,
    error: state.error,
    sendMessage,
    cancelRequest,
    clearMessages,
  }
}
