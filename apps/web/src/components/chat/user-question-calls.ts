import type { ToolCallInfo } from './tool-call-card'
import { normalizeToolName } from '@/lib/tool-call-body'
import { questionResultData } from './user-question-result'

/** Presentation only: retain every executed call in the persisted trace. */
export function coalesceQuestionCalls(calls: ToolCallInfo[]): ToolCallInfo[] {
  const visible: ToolCallInfo[] = []
  const requests = new Map<string, number>()
  for (const call of calls) {
    const tool = call.tool.replace(/^functions[._]/, '')
    const isQuestion = normalizeToolName(tool) === 'user.ask'
      || /^mcp__jait(?:_core)?__user_ask$/.test(tool)
    if (!isQuestion) {
      visible.push(call)
      continue
    }
    const result = questionResultData(call.result?.data) ?? questionResultData(call.result?.message)
    const requestId = typeof call.args.requestId === 'string' ? call.args.requestId
      : typeof result?.requestId === 'string' ? result.requestId : undefined
    // A successful polling transport call is still an unanswered question.
    const display = result?.status === 'pending' && call.status === 'success'
      ? { ...call, status: 'running' as const, completedAt: undefined }
      : result?.ok === false
        ? { ...call, status: 'error' as const, result: { ok: false, message: String(result.message), data: call.result?.data } }
        : call
    const key = requestId ? JSON.stringify([call.parentCallId ?? null, requestId]) : undefined
    const index = key ? requests.get(key) : undefined
    if (index === undefined) {
      if (key) requests.set(key, visible.length)
      visible.push(display)
    } else {
      const original = visible[index]
      visible[index] = {
        ...display,
        callId: original.callId,
        args: original.args,
        startedAt: original.startedAt,
      }
    }
  }
  return visible
}
