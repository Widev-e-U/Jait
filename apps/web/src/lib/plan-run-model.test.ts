import type { OrchestrationRunView, OrchestrationTaskView } from '@jait/shared'
import { describe, expect, it } from 'vitest'

import {
  buildDecisions,
  canCancelRun,
  canResumeRun,
  describeWorker,
  interruptedTaskIds,
  MAX_DECISION_NOTE,
  runProgress,
} from './plan-run-model'

function task(taskId: string, state: OrchestrationTaskView['state']): OrchestrationTaskView {
  return { taskId, title: `Task ${taskId}`, state, dependsOn: [], attemptCount: 1, maxAttempts: 2, agentRef: null } as unknown as OrchestrationTaskView
}

function run(status: OrchestrationRunView['status'], tasks: OrchestrationTaskView[], paused = false) {
  return { status, paused, tasks }
}

describe('plan run rules', () => {
  it('lets an owner cancel only a run that has not reached a final state', () => {
    expect(canCancelRun({ status: 'running' })).toBe(true)
    expect(canCancelRun({ status: 'interrupted' })).toBe(true)
    expect(canCancelRun({ status: 'passed' })).toBe(false)
    expect(canCancelRun({ status: 'failed' })).toBe(false)
    expect(canCancelRun({ status: 'cancelled' })).toBe(false)
  })

  it('lists the interrupted tasks that need a decision, in order', () => {
    const tasks = [task('A', 'passed'), task('B', 'interrupted'), task('C', 'running'), task('D', 'interrupted')]
    expect(interruptedTaskIds(run('interrupted', tasks))).toEqual(['B', 'D'])
  })

  it('offers resume for a paused run or one with interrupted tasks, and not otherwise', () => {
    expect(canResumeRun(run('running', [task('A', 'running')], true))).toBe(true)
    expect(canResumeRun(run('interrupted', [task('A', 'interrupted')]))).toBe(true)
    expect(canResumeRun(run('running', [task('A', 'running')]))).toBe(false)
  })
})

describe('buildDecisions', () => {
  it('turns one explicit decision and note per interrupted task into the request, with the note trimmed', () => {
    expect(buildDecisions(['B', 'D'], {
      B: { decision: 'retry', note: '  Worktree clean, tests re-run  ' },
      D: { decision: 'fail', note: 'Conflict left in the branch' },
    })).toEqual({
      ok: true,
      decisions: [
        { taskId: 'B', decision: 'retry', note: 'Worktree clean, tests re-run' },
        { taskId: 'D', decision: 'fail', note: 'Conflict left in the branch' },
      ],
    })
  })

  it('never defaults to a retry: a task without a chosen decision blocks the resume', () => {
    expect(buildDecisions(['B'], { B: { note: 'checked' } })).toEqual({
      ok: false,
      error: 'Choose retry or fail for task B.',
    })
  })

  it('requires a note of what was inspected, within the gateway limit', () => {
    expect(buildDecisions(['B'], { B: { decision: 'retry', note: '   ' } })).toEqual({
      ok: false,
      error: 'Note what you checked for task B.',
    })
    const long = 'x'.repeat(MAX_DECISION_NOTE + 1)
    expect(buildDecisions(['B'], { B: { decision: 'fail', note: long } })).toEqual({
      ok: false,
      error: `Keep the note for task B to ${MAX_DECISION_NOTE} characters.`,
    })
  })

  it('needs no decisions when nothing is interrupted', () => {
    expect(buildDecisions([], {})).toEqual({ ok: true, decisions: [] })
  })
})

describe('plan run labels', () => {
  it('names an ACP worker by its provider, and an in-process worker by a short id', () => {
    expect(describeWorker('acp:claude-code:attempt-1')).toBe('ACP agent · claude-code')
    expect(describeWorker('0198f3c2-aaaa-7bbb-8ccc-ddddeeeeffff')).toBe('In-process worker · 0198f3c2')
    expect(describeWorker(null)).toBe('No worker yet')
  })

  it('counts passed tasks against all tasks', () => {
    expect(runProgress(run('running', [task('A', 'passed'), task('B', 'running'), task('C', 'pending')]))).toEqual({
      passed: 1,
      total: 3,
    })
  })
})
