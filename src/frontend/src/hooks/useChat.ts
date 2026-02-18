import { useState, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  thinkingDuration?: number
  toolCalls?: Array<{
    tool: string
    arguments?: Record<string, unknown>
    result?: unknown
  }>
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  sessionId: string | null
  promptCount: number
  remainingPrompts: number | null
  error: string | null
}

interface SendMessageOptions {
  token?: string | null
  onLoginRequired?: () => void
}

export function useChat() {
  const [state, setState] = useState<ChatState>(() => {
    const savedSessionId = localStorage.getItem('jait_session_id')
    const savedRemaining = localStorage.getItem('jait_remaining_prompts')
    return {
      messages: [],
      isLoading: false,
      sessionId: savedSessionId,
      promptCount: 0,
      remainingPrompts: savedRemaining !== null ? parseInt(savedRemaining, 10) : 5,
      error: null,
    }
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (
    content: string,
    options: SendMessageOptions = {}
  ) => {
    const { token, onLoginRequired } = options

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

    abortControllerRef.current = new AbortController()

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: content, session_id: state.sessionId }),
        signal: abortControllerRef.current.signal,
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
      const toolCalls: ChatMessage['toolCalls'] = []
      let currentToolCall: { tool: string; arguments?: Record<string, unknown> } | null = null
      let lineBuffer = ''

      const assistantId = `assistant-${Date.now()}`
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, { id: assistantId, role: 'assistant', content: '', thinking: '' }],
      }))

      const updateMessage = (updates: Partial<ChatMessage>) => {
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
            } else if (data.type === 'tool_call') {
              currentToolCall = { tool: data.tool, arguments: data.arguments }
            } else if (data.type === 'tool_result') {
              if (currentToolCall) {
                toolCalls.push({ ...currentToolCall, result: data.result })
                currentToolCall = null
              }
            } else if (data.type === 'done') {
              if (thinkingStart && !thinkingDuration) {
                thinkingDuration = Math.round((Date.now() - thinkingStart) / 1000)
              }
              if (data.session_id) localStorage.setItem('jait_session_id', data.session_id)
              if (data.remaining_prompts !== null && data.remaining_prompts !== undefined) {
                localStorage.setItem('jait_remaining_prompts', String(data.remaining_prompts))
              }
              setState(prev => ({
                ...prev,
                sessionId: data.session_id,
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
            } else if (data.type === 'error') {
              throw new Error(data.message)
            }
          } catch {
            // incomplete chunk
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'An error occurred',
      }))
    }
  }, [state.sessionId])

  const cancelRequest = useCallback(() => {
    abortControllerRef.current?.abort()
    setState(prev => ({ ...prev, isLoading: false }))
  }, [])

  const clearMessages = useCallback(() => {
    localStorage.removeItem('jait_session_id')
    localStorage.removeItem('jait_remaining_prompts')
    setState({ messages: [], isLoading: false, sessionId: null, promptCount: 0, remainingPrompts: 5, error: null })
  }, [])

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    sessionId: state.sessionId,
    remainingPrompts: state.remainingPrompts,
    error: state.error,
    sendMessage,
    cancelRequest,
    clearMessages,
  }
}
