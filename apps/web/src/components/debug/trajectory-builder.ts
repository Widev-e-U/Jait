import type { SSEDebugEvent } from './sse-debug-panel'

export interface TrajectoryMeta {
  provider?: string
  model?: string
  mode?: string
  runtimeMode?: string
}

export type TrajectoryStep =
  | {
      kind: 'turn'
      role: 'user'
      index: number
      turn: number
      content: string
      provider?: string
      model?: string
      mode?: string
      runtimeMode?: string
      ts: number
    }
  | {
      kind: 'assistant'
      role: 'assistant'
      index: number
      turn: number
      thinking: string
      text: string
      completedAt?: number
      ts: number
    }
  | {
      kind: 'context'
      role: 'context'
      index: number
      turn: number
      system: number
      history: number
      toolResults: number
      tools: number
      total: number
      limit: number
      ratio: number
      pruned: boolean
      ts: number
    }
  | {
      kind: 'tool'
      role: 'tool'
      index: number
      turn: number
      callId?: string
      parentCallId?: string
      tool: string
      args: string
      argsPreview: string
      output: string
      completedAt?: number
      result?: { ok: boolean; message: string; data?: string }
      ts: number
    }
  | {
      kind: 'done'
      role: 'done'
      index: number
      turn: number
      message: string
      sessionId?: string
      promptCount?: number
      ts: number
    }
  | { kind: 'error'; role: 'error'; index: number; turn: number; message: string; ts: number }

export interface Trajectory {
  meta: TrajectoryMeta
  steps: TrajectoryStep[]
}

type StepInput =
  | {
      kind: 'turn'
      role: 'user'
      content: string
      provider?: string
      model?: string
      mode?: string
      runtimeMode?: string
      ts: number
    }
  | {
      kind: 'assistant'
      role: 'assistant'
      thinking: string
      text: string
      completedAt?: number
      ts: number
    }
  | {
      kind: 'context'
      role: 'context'
      system: number
      history: number
      toolResults: number
      tools: number
      total: number
      limit: number
      ratio: number
      pruned: boolean
      ts: number
    }
  | {
      kind: 'tool'
      role: 'tool'
      callId?: string
      parentCallId?: string
      tool: string
      args: string
      argsPreview: string
      output: string
      completedAt?: number
      result?: { ok: boolean; message: string; data?: string }
      ts: number
    }
  | {
      kind: 'done'
      role: 'done'
      message: string
      sessionId?: string
      promptCount?: number
      ts: number
    }
  | { kind: 'error'; role: 'error'; message: string; ts: number }

/** Trim long payloads for inline previews while preserving full detail. */
function preview(raw: string, max = 200): string {
  const cleaned = raw.trim()
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned
}

function stringify(value: unknown, compact = false): string {
  try {
    return JSON.stringify(value, null, compact ? 0 : 2) ?? ''
  } catch {
    return String(value ?? '')
  }
}

/**
 * Reconstructs a human-readable trajectory timeline from the raw SSE event log.
 * A request event starts a turn; thinking/token stream into the assistant step;
 * tool_start/output/result build up tool steps keyed by call_id.
 */
export function buildTrajectory(events: SSEDebugEvent[]): Trajectory {
  const steps: TrajectoryStep[] = []
  const meta: TrajectoryMeta = {}
  let turn = 0
  let index = 0
  // call_id -> index into steps for in-progress tool calls
  const running = new Map<string, number>()
  let assistantIdx: number | null = null

  const push = (step: StepInput) => {
    steps.push({ ...step, index, turn } as TrajectoryStep)
    index++
  }

  for (const ev of events) {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(ev.raw)
    } catch {
      data = {}
    }

    switch (ev.type) {
      case 'request': {
        turn++
        // Capture provider/model metadata from the request payload.
        if (!meta.provider && typeof data.provider === 'string' && data.provider) {
          meta.provider = data.provider
        }
        if (!meta.model && typeof data.model === 'string' && data.model) {
          meta.model = data.model
        }
        if (!meta.mode && typeof data.mode === 'string' && data.mode) {
          meta.mode = data.mode
        }
        if (!meta.runtimeMode && typeof data.runtimeMode === 'string' && data.runtimeMode) {
          meta.runtimeMode = data.runtimeMode
        }
        push({
          kind: 'turn',
          role: 'user',
          content: String(data.content ?? '(empty prompt)'),
          ...(typeof data.provider === 'string' && data.provider ? { provider: data.provider } : {}),
          ...(typeof data.model === 'string' && data.model ? { model: data.model } : {}),
          ...(typeof data.mode === 'string' && data.mode ? { mode: data.mode } : {}),
          ...(typeof data.runtimeMode === 'string' && data.runtimeMode ? { runtimeMode: data.runtimeMode } : {}),
          ts: ev.ts,
        })
        assistantIdx = steps.length
        push({ kind: 'assistant', role: 'assistant', thinking: '', text: '', ts: ev.ts })
        assistantIdx = steps.length - 1
        // A new turn invalidates any in-flight tool state
        running.clear()
        break
      }

      case 'thinking': {
        const as = assistantIdx != null ? steps[assistantIdx] : undefined
        if (as && as.kind === 'assistant') as.thinking += String(data.content ?? '')
        break
      }

      case 'token': {
        const as = assistantIdx != null ? steps[assistantIdx] : undefined
        if (as && as.kind === 'assistant') as.text += String(data.content ?? '')
        break
      }

      case 'context_usage': {
        push({
          kind: 'context',
          role: 'context',
          system: Number(data.system) || 0,
          history: Number(data.history) || 0,
          toolResults: Number(data.toolResults) || 0,
          tools: Number(data.tools) || 0,
          total: Number(data.total) || 0,
          limit: Number(data.limit) || 0,
          ratio: Number(data.ratio) || 0,
          pruned: data.pruned === true,
          ts: ev.ts,
        })
        break
      }

      case 'tool_start': {
        const callId = data.call_id as string | undefined
        const args = stringify(data.args ?? {})
        push({
          kind: 'tool',
          role: 'tool',
          callId,
          ...(typeof data.parent_call_id === 'string' && data.parent_call_id
            ? { parentCallId: data.parent_call_id }
            : {}),
          tool: String(data.tool ?? 'tool'),
          args,
          argsPreview: preview(stringify(data.args ?? {}, true)),
          output: '',
          ts: ev.ts,
        })
        if (callId) running.set(callId, steps.length - 1)
        break
      }

      case 'tool_output': {
        const callId = data.call_id as string | undefined
        if (!callId) break
        const idx = running.get(callId)
        if (idx != null && steps[idx]?.kind === 'tool') {
          steps[idx].output += String(data.content ?? '')
        }
        break
      }

      case 'tool_result': {
        const callId = data.call_id as string | undefined
        if (!callId) break
        const idx = running.get(callId)
        if (idx != null && steps[idx]?.kind === 'tool') {
          const ok = data.ok === true
          const msg = String(data.message ?? (ok ? 'ok' : 'error'))
          steps[idx].completedAt = ev.ts
          steps[idx].result = {
            ok,
            message: msg,
            ...(data.data === undefined ? {} : { data: stringify(data.data) }),
          }
        }
        running.delete(callId)
        break
      }

      case 'done': {
        const assistant = assistantIdx != null ? steps[assistantIdx] : undefined
        if (assistant?.kind === 'assistant') assistant.completedAt = ev.ts
        push({
          kind: 'done',
          role: 'done',
          message: String(data.message ?? 'done'),
          ...(typeof data.session_id === 'string' ? { sessionId: data.session_id } : {}),
          ...(typeof data.prompt_count === 'number' ? { promptCount: data.prompt_count } : {}),
          ts: ev.ts,
        })
        assistantIdx = null
        break
      }

      case 'error': {
        const assistant = assistantIdx != null ? steps[assistantIdx] : undefined
        if (assistant?.kind === 'assistant') assistant.completedAt = ev.ts
        push({
          kind: 'error',
          role: 'error',
          message: preview(String(data.error ?? data.message ?? 'error')),
          ts: ev.ts,
        })
        assistantIdx = null
        break
      }

      default:
        break
    }
  }

  return { meta, steps }
}
