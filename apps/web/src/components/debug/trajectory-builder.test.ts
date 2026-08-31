import { describe, expect, it } from 'vitest'

import type { SSEDebugEvent } from './sse-debug-panel'
import { buildTrajectory } from './trajectory-builder'

function event(id: number, ts: number, type: string, payload: Record<string, unknown>): SSEDebugEvent {
  return { id, ts, type, raw: JSON.stringify({ type, ...payload }) }
}

describe('buildTrajectory', () => {
  it('preserves request, tool, result, and timing details for the inspector', () => {
    const trajectory = buildTrajectory([
      event(1, 1_000, 'request', {
        content: 'Inspect the build',
        provider: 'codex',
        model: 'gpt-5',
        mode: 'agent',
        runtimeMode: 'workspace',
      }),
      event(2, 1_100, 'thinking', { content: 'Checking files' }),
      event(3, 1_200, 'token', { content: 'I found it.' }),
      event(4, 1_300, 'tool_start', {
        call_id: 'call-1',
        parent_call_id: 'parent-1',
        tool: 'terminal.run',
        args: { command: 'bun test' },
      }),
      event(5, 1_400, 'tool_output', { call_id: 'call-1', content: 'passing\n' }),
      event(6, 1_650, 'tool_result', {
        call_id: 'call-1',
        tool: 'terminal.run',
        ok: true,
        message: 'Completed successfully',
        data: { exitCode: 0 },
      }),
      event(7, 1_700, 'context_usage', {
        system: 100,
        history: 200,
        toolResults: 50,
        tools: 25,
        total: 375,
        limit: 1_000,
        ratio: 0.375,
        pruned: true,
      }),
      event(8, 1_800, 'done', {
        message: 'done',
        session_id: 'session-1',
        prompt_count: 4,
      }),
    ])

    expect(trajectory.meta).toEqual({
      provider: 'codex',
      model: 'gpt-5',
      mode: 'agent',
      runtimeMode: 'workspace',
    })
    expect(trajectory.steps[0]).toMatchObject({
      kind: 'turn',
      provider: 'codex',
      model: 'gpt-5',
      mode: 'agent',
      runtimeMode: 'workspace',
    })
    expect(trajectory.steps[1]).toMatchObject({
      kind: 'assistant',
      thinking: 'Checking files',
      text: 'I found it.',
      completedAt: 1_800,
    })
    expect(trajectory.steps[2]).toMatchObject({
      kind: 'tool',
      callId: 'call-1',
      parentCallId: 'parent-1',
      tool: 'terminal.run',
      output: 'passing\n',
      completedAt: 1_650,
      result: {
        ok: true,
        message: 'Completed successfully',
        data: '{\n  "exitCode": 0\n}',
      },
    })
    expect(trajectory.steps[2]).toHaveProperty('args', '{\n  "command": "bun test"\n}')
    expect(trajectory.steps[3]).toMatchObject({
      kind: 'context',
      system: 100,
      history: 200,
      toolResults: 50,
      tools: 25,
      total: 375,
      limit: 1_000,
      ratio: 0.375,
      pruned: true,
    })
    expect(trajectory.steps[4]).toMatchObject({
      kind: 'done',
      sessionId: 'session-1',
      promptCount: 4,
    })
  })

  it('keeps Codex Guardian assessments in the trajectory timeline', () => {
    const trajectory = buildTrajectory([
      event(1, 1_000, 'tool_start', {
        call_id: 'guardian_assessment:review-1',
        tool: 'Guardian Review',
        args: { reviewId: 'review-1' },
      }),
      event(2, 1_100, 'tool_result', {
        call_id: 'guardian_assessment:review-1',
        tool: 'Guardian Review',
        ok: true,
        message: 'approved',
      }),
    ])

    expect(trajectory.steps).toContainEqual(expect.objectContaining({
      kind: 'tool',
      callId: 'guardian_assessment:review-1',
      tool: 'Guardian Review',
      completedAt: 1_100,
    }))
  })
})
