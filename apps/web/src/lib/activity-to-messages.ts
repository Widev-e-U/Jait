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
import type { ChatMessage, LlmContextFlow, MessageSegment } from '@/hooks/useChat'
import { parseUserMessageSegments, userMessageTextFromSegments } from '@/lib/user-message-segments'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'
import { normalizeToolArgs } from '@/lib/tool-call-body'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as unknown
    return asRecord(parsed)
  } catch {
    return null
  }
}

function mergeArgs(...sources: Array<Record<string, unknown> | null | undefined>): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const source of sources) {
    if (!source) continue
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && value !== null && value !== '') {
        merged[key] = value
      }
    }
  }
  return merged
}

function extractToolArgs(payload: Record<string, unknown>, tool: string): Record<string, unknown> {
  const args = asRecord(payload.args)
  const data = asRecord(payload.data)
  const parsedMessage = parseJsonObject(payload.message)
  const normalizedTool = tool.replace('_', '.')

  const fallback = mergeArgs(data, parsedMessage)
  if (Object.keys(args ?? {}).length > 0) {
    return mergeArgs(fallback, args)
  }

  if (normalizedTool === 'edit' || normalizedTool.startsWith('file.')) {
    return mergeArgs(fallback, {
      path: asString(payload.path) ?? asString(payload.file) ?? asString(payload.name) ?? asString(data?.path) ?? asString(data?.file) ?? '',
      search: payload.search ?? data?.search,
      replace: payload.replace ?? data?.replace,
      content: payload.content ?? data?.content,
    })
  }

  if (normalizedTool === 'web' || normalizedTool.startsWith('web.') || normalizedTool.startsWith('browser.')) {
    return mergeArgs(fallback, {
      url: asString(payload.url) ?? asString(data?.url) ?? asString(data?.finalUrl) ?? '',
      query: asString(payload.query) ?? asString(payload.name) ?? asString(data?.query) ?? '',
      content: payload.content ?? data?.content,
    })
  }

  return fallback
}

function extractToolResultMessage(payload: Record<string, unknown>, summary: string): string {
  const direct =
    asString(payload.message) ??
    asString(payload.output) ??
    asString(payload.content) ??
    asString(payload.text) ??
    asString(payload.summary)
  if (direct) return direct

  const data = asRecord(payload.data)
  const nested =
    asString(data?.message) ??
    asString(data?.output) ??
    asString(data?.content) ??
    asString(data?.text) ??
    asString(data?.summary)
  if (nested) return nested

  return summary
}

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
        const referencedFiles = Array.isArray(payload.referencedFiles)
          ? payload.referencedFiles.flatMap((entry) => {
            if (!entry || typeof entry !== 'object') return []
            const path = typeof (entry as Record<string, unknown>).path === 'string'
              ? (entry as Record<string, unknown>).path as string
              : null
            const name = typeof (entry as Record<string, unknown>).name === 'string'
              ? (entry as Record<string, unknown>).name as string
              : null
            return path && name ? [{ path, name }] : []
          })
          : undefined
        const displaySegments = parseUserMessageSegments(payload.displaySegments)
        if (role === 'user') {
          flush()
          messages.push({
            id: act.id,
            role: 'user',
            content: fullContent,
            displayContent: displaySegments.length > 0 ? userMessageTextFromSegments(displaySegments) : fullContent,
            referencedFiles,
            displaySegments: displaySegments.length > 0 ? displaySegments : undefined,
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
        const tool = (payload.tool as string) ?? 'unknown'
        // Deduplicate: if we already have a tool call with this callId, skip
        if (toolCallMap.has(callId)) break
        const tc: ToolCallInfo = {
          callId,
          tool,
          args: normalizeToolArgs(tool, extractToolArgs(payload, tool)),
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
        const tool = (payload.tool as string) ?? 'unknown'
        const ok = typeof payload.ok === 'boolean' ? payload.ok : act.kind === 'tool.result'
        const message = extractToolResultMessage(payload, act.summary)
        const resultData = payload.data !== undefined ? payload.data : parseJsonObject(payload.message)
        let tc = callId ? toolCallMap.get(callId) : undefined

        if (!tc) {
          const msg = ensureAssistant(act.id)
          const synthesizedCallId = callId ?? act.id
          tc = {
            callId: synthesizedCallId,
            tool,
            args: normalizeToolArgs(tool, extractToolArgs(payload, tool), asRecord(resultData) ?? undefined),
            status: ok ? 'success' : 'error',
            startedAt: new Date(act.createdAt).getTime(),
          }
          msg.toolCalls = msg.toolCalls ?? []
          msg.toolCalls.push(tc)
          toolCallMap.set(synthesizedCallId, tc)
          currentToolGroupIds.push(synthesizedCallId)
        }

        tc.args = normalizeToolArgs(
          tc.tool,
          mergeArgs(tc.args, extractToolArgs(payload, tool)),
          asRecord(resultData) ?? undefined,
        )
        tc.status = ok ? 'success' : 'error'
        tc.result = {
          ok,
          message,
          ...(resultData !== undefined ? { data: resultData } : {}),
        }
        tc.completedAt = new Date(act.createdAt).getTime()
        break
      }

      case 'tool.approval': {
        const msg = ensureAssistant(act.id)
        const callId = (payload.requestId as string) ?? act.id
        const tc: ToolCallInfo = {
          callId,
          tool: (payload.tool as string) ?? 'unknown',
          args: normalizeToolArgs(
            String(payload.tool ?? 'unknown'),
            (payload.args as Record<string, unknown>) ?? {},
          ),
          status: 'pending',
          startedAt: new Date(act.createdAt).getTime(),
        }
        msg.toolCalls = msg.toolCalls ?? []
        msg.toolCalls.push(tc)
        toolCallMap.set(callId, tc)
        currentToolGroupIds.push(callId)
        break
      }

      // ── Skill activation ─────────────────────────────────────
      case 'skill.active': {
        const msg = ensureAssistant(act.id)
        const names = Array.isArray(payload.names) ? (payload.names as string[]).join(', ') : 'unknown'
        const skills = Array.isArray(payload.skills) ? payload.skills as Array<{ id: string; name: string; description: string }> : []
        const callId = act.id
        const tc: ToolCallInfo = {
          callId,
          tool: 'skill',
          args: { skills: skills.map(s => s.name).join(', ') },
          status: 'success',
          startedAt: new Date(act.createdAt).getTime(),
          completedAt: new Date(act.createdAt).getTime(),
          result: { ok: true, message: `Using skills: ${names}` },
        }
        msg.toolCalls = msg.toolCalls ?? []
        msg.toolCalls.push(tc)
        toolCallMap.set(callId, tc)
        currentToolGroupIds.push(callId)
        break
      }

      // ── Context flow (trace data) ─────────────────────────────
      case 'context_flow': {
        // Attach the context flow to the current or most recent assistant message
        const flow: LlmContextFlow = {
          provider: typeof payload.provider === 'string' ? payload.provider : 'jait',
          model: typeof payload.model === 'string' ? payload.model : undefined,
          rounds: Array.isArray(payload.rounds) ? payload.rounds as LlmContextFlow['rounds'] : [],
        }
        const cur = current as ChatMessage | null
        if (cur && cur.role === 'assistant') {
          cur.contextFlow = flow
        } else {
          // Walk backwards to find the last assistant message
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i] as ChatMessage | undefined
            if (msg && msg.role === 'assistant') {
              msg.contextFlow = flow
              break
            }
          }
        }
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
        const resolvedText = text ?? (act.kind === 'activity' ? act.summary : null)

        // If it looks like a user or assistant message (from Codex generic events)
        const role = payload.role as string | undefined
        if (role === 'user' && resolvedText) {
          flush()
          messages.push({ id: act.id, role: 'user', content: resolvedText })
        } else if (resolvedText) {
          const msg = ensureAssistant(act.id)
          flushToolGroup()
          msg.content += (msg.content ? '\n' : '') + resolvedText
          currentSegments.push({ type: 'text', content: resolvedText })
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
