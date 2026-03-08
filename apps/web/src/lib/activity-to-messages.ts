/**
 * Convert ThreadActivity[] into ChatMessage[] so Manager-mode activities
 * can be rendered with the same Message component used in Developer mode.
 *
 * Grouping logic:
 *  - A `message` activity with role=user produces a standalone user message.
 *  - Consecutive tool activities (tool.start / tool.output / tool.result / tool.error / tool.approval)
 *    are collected into a single assistant message's `toolCalls` array.
 *  - A `message` activity with role=assistant produces an assistant message
 *    (text content). If it immediately follows tool calls, those are folded
 *    into the same assistant message; otherwise a new one is started.
 *  - `session` and `error` kinds produce lightweight assistant messages.
 */

import type { ThreadActivity } from '@/lib/agents-api'
import type { ChatMessage, MessageSegment } from '@/hooks/useChat'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'

export function activitiesToMessages(activities: ThreadActivity[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  let current: ChatMessage | null = null
  // Segments track the interleaving of text ↔ tool groups
  let currentSegments: MessageSegment[] = []
  // callId → ToolCallInfo for fast look-up when results arrive
  const toolCallMap = new Map<string, ToolCallInfo>()
  // callIds accumulated in the current tool group for segments
  let currentToolGroupIds: string[] = []

  function flushToolGroup() {
    if (currentToolGroupIds.length > 0) {
      currentSegments.push({ type: 'toolGroup', callIds: [...currentToolGroupIds] })
      currentToolGroupIds = []
    }
  }

  function flush() {
    if (!current) return
    flushToolGroup()
    if (currentSegments.length > 0) {
      current.segments = [...currentSegments]
    }
    messages.push(current)
    current = null
    currentSegments = []
  }

  function ensureAssistant(id: string) {
    if (!current || current.role !== 'assistant') {
      flush()
      current = {
        id,
        role: 'assistant',
        content: '',
        toolCalls: [],
      }
      currentSegments = []
    }
    return current
  }

  for (const act of activities) {
    const payload = (act.payload ?? {}) as Record<string, unknown>

    switch (act.kind) {
      // ── User / Assistant text ───────────────────────────────────
      case 'message': {
        const role = payload.role as string | undefined
        // Prefer full content from payload (summary is truncated to 500 chars)
        const fullContent = typeof payload.content === 'string' ? payload.content : act.summary
        if (role === 'user') {
          flush()
          messages.push({
            id: act.id,
            role: 'user',
            content: fullContent,
          })
        } else {
          // assistant text — fold into current assistant message
          const msg = ensureAssistant(act.id)
          flushToolGroup()
          const text = fullContent ?? ''
          if (text) {
            msg.content += (msg.content ? '\n' : '') + text
            currentSegments.push({ type: 'text', content: text })
          }
        }
        break
      }

      // ── Tool lifecycle ──────────────────────────────────────────
      case 'tool.start': {
        const msg = ensureAssistant(act.id)
        const callId = (payload.callId as string) ?? act.id
        // Deduplicate: if we already have a tool call with this callId, skip
        if (toolCallMap.has(callId)) break
        const tc: ToolCallInfo = {
          callId,
          tool: (payload.tool as string) ?? 'unknown',
          args: (payload.args as Record<string, unknown>) ?? {},
          status: 'running',
          startedAt: new Date(act.createdAt).getTime(),
        }
        msg.toolCalls = msg.toolCalls ?? []
        msg.toolCalls.push(tc)
        toolCallMap.set(callId, tc)
        currentToolGroupIds.push(callId)
        break
      }

      case 'tool.output': {
        const callId = payload.callId as string | undefined
        if (callId && toolCallMap.has(callId)) {
          const tc = toolCallMap.get(callId)!
          tc.streamingOutput = (tc.streamingOutput ?? '') + ((payload.content as string) ?? '')
        }
        break
      }

      case 'tool.result':
      case 'tool.error': {
        const callId = payload.callId as string | undefined
        if (callId && toolCallMap.has(callId)) {
          const tc = toolCallMap.get(callId)!
          tc.status = (payload.ok as boolean) ? 'success' : 'error'
          tc.result = {
            ok: (payload.ok as boolean) ?? false,
            message: (payload.message as string) ?? act.summary,
          }
          tc.completedAt = new Date(act.createdAt).getTime()
        }
        break
      }

      case 'tool.approval': {
        const msg = ensureAssistant(act.id)
        const callId = (payload.requestId as string) ?? act.id
        const tc: ToolCallInfo = {
          callId,
          tool: (payload.tool as string) ?? 'unknown',
          args: (payload.args as Record<string, unknown>) ?? {},
          status: 'pending',
          startedAt: new Date(act.createdAt).getTime(),
        }
        msg.toolCalls = msg.toolCalls ?? []
        msg.toolCalls.push(tc)
        toolCallMap.set(callId, tc)
        currentToolGroupIds.push(callId)
        break
      }

      // ── Session ─────────────────────────────────────────────────
      case 'session': {
        flush()
        // Omit "Session started/completed" as noise — the thread status
        // already communicates this. Uncomment if you want them shown:
        // messages.push({ id: act.id, role: 'assistant', content: `*${act.summary}*` })
        break
      }

      // ── Error ───────────────────────────────────────────────────
      case 'error': {
        const msg = ensureAssistant(act.id)
        flushToolGroup()
        const text = `**Error:** ${act.summary}`
        msg.content += (msg.content ? '\n' : '') + text
        currentSegments.push({ type: 'text', content: text })
        break
      }

      // ── Fallback for generic activity kinds ─────────────────────
      default: {
        // Try to extract meaningful text from payload
        const text =
          typeof payload.content === 'string' ? payload.content
          : typeof payload.text === 'string' ? payload.text
          : typeof payload.message === 'string' ? payload.message
          : null

        // If it looks like a user or assistant message (from Codex generic events)
        const role = payload.role as string | undefined
        if (role === 'user' && text) {
          flush()
          messages.push({ id: act.id, role: 'user', content: text })
        } else if (text) {
          const msg = ensureAssistant(act.id)
          flushToolGroup()
          msg.content += (msg.content ? '\n' : '') + text
          currentSegments.push({ type: 'text', content: text })
        }
        // Silently skip activities with no extractable text (reasoning deltas,
        // token counts, lifecycle noise, etc.)
        break
      }
    }
  }

  flush()
  return messages
}
