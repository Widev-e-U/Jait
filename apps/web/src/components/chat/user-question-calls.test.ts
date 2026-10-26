import { describe, expect, it } from 'vitest'
import type { ToolCallInfo } from './tool-call-card'
import { coalesceQuestionCalls } from './user-question-calls'

const requestId = 'question-1'
const envelope = (data: unknown) => ({ result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, data }) }] } })
const questions = [{ id: 'publish', header: 'Publish', question: 'Push the fix?' }]
const initial: ToolCallInfo = {
  callId: 'ask', tool: 'user.ask', args: { title: 'Publish fix', questions },
  status: 'success', startedAt: 1, completedAt: 60_001,
  result: { ok: true, message: 'Pending', data: envelope({ status: 'pending', requestId }) },
}
const resume = (index: number): ToolCallInfo => ({
  ...initial, callId: `wait-${index}`, args: { requestId }, startedAt: index * 60_001,
})

describe('question wait presentation', () => {
  it('coalesces six polling calls and preserves the original identity and question', () => {
    const calls = [initial, ...Array.from({ length: 6 }, (_, i) => resume(i + 1))]
    const [visible] = coalesceQuestionCalls(calls)
    expect(coalesceQuestionCalls(calls)).toHaveLength(1)
    expect(visible).toMatchObject({ callId: 'ask', args: initial.args, startedAt: 1, status: 'running' })
    expect(visible.completedAt).toBeUndefined()
    expect(calls).toHaveLength(7)
    expect(initial.status).toBe('success')
  })

  it('updates the original card with the final answer and full elapsed time', () => {
    const answered = { ...resume(7), completedAt: 400_000, result: { ok: true, message: 'Answered', data: envelope({ answers: { publish: { selected: ['Yes'] } } }) } }
    const visible = coalesceQuestionCalls([initial, resume(1), answered])
    expect(visible).toHaveLength(1)
    expect(visible[0]).toMatchObject({ callId: 'ask', args: initial.args, startedAt: 1, completedAt: 400_000, status: 'success', result: answered.result })
    expect(coalesceQuestionCalls(visible)).toEqual(visible)
  })

  it('keeps a live resume pending and displays cancellation without a false success', () => {
    expect(coalesceQuestionCalls([initial, { ...resume(1), status: 'running', result: undefined }])[0].status).toBe('running')
    const cancelled = { ...resume(2), result: { ok: true, message: 'Transport completed', data: { content: [{ type: 'text', text: JSON.stringify({ ok: false, message: 'Question cancelled' }) }] } } }
    expect(coalesceQuestionCalls([initial, cancelled])[0]).toMatchObject({ status: 'error', result: { ok: false, message: 'Question cancelled' } })
  })

  it('keeps unrelated requests, nested owners and other tools separate', () => {
    const unrelated = { ...initial, callId: 'other', result: undefined }
    const nested = { ...resume(2), parentCallId: 'agent' }
    const terminal = { ...resume(3), tool: 'jait.terminal' }
    expect(coalesceQuestionCalls([initial, unrelated, nested, terminal])).toHaveLength(4)
    expect(coalesceQuestionCalls([{ ...resume(1), result: undefined }])).toHaveLength(1)
  })

  it.each(['user_ask', 'functions.mcp__jait_core__user_ask', 'mcp__jait__user_ask'])('recognizes provider spelling %s and message-only replay', (tool) => {
    const replay = { ...initial, tool, result: { ok: true, message: JSON.stringify({ data: { status: 'pending', requestId } }) } }
    expect(coalesceQuestionCalls([replay, { ...resume(1), tool }])).toHaveLength(1)
  })
})
