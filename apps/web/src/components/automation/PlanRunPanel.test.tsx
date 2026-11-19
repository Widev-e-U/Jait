import type { OrchestrationRunView, OrchestrationTaskView } from '@jait/shared'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PlanRunDetail, type PlanRunDetailProps } from './PlanRunPanel'

const noop = () => {}

/** Text of the rendered markup, with React's text-node comments and tags removed. */
function textOf(html: string): string {
  return html.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

function render(overrides: Partial<PlanRunDetailProps> & Pick<PlanRunDetailProps, 'run'>): string {
  return renderToStaticMarkup(
    <PlanRunDetail
      drafts={{}}
      attempts={{}}
      busy={false}
      onDraftChange={noop}
      onShowAttempts={noop}
      onCancel={noop}
      onResume={noop}
      {...overrides}
    />,
  )
}

function task(overrides: Partial<OrchestrationTaskView> & Pick<OrchestrationTaskView, 'taskId' | 'state'>): OrchestrationTaskView {
  return {
    title: `Task ${overrides.taskId}`,
    dependsOn: [],
    resources: { reads: [], writes: [], protects: [] },
    attemptCount: 1,
    maxAttempts: 2,
    currentAttemptId: null,
    lastError: null,
    agentRef: null,
    worktreeRef: null,
    verification: null,
    result: null,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  } as OrchestrationTaskView
}

function run(overrides: Partial<OrchestrationRunView>): OrchestrationRunView {
  return {
    id: 'run-1',
    planId: 'plan-1',
    title: 'Guide plan',
    status: 'running',
    paused: false,
    maxWorkers: 2,
    error: null,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:05:00.000Z',
    finishedAt: null,
    workerSessionId: 'workflow:run-1',
    pendingApprovals: [],
    tasks: [],
    ...overrides,
  }
}

describe('PlanRunDetail', () => {
  it('shows an interrupted task with a decision and note for the owner, and the ACP worker that held it', () => {
    const html = textOf(render({
      run: run({
        status: 'interrupted',
        tasks: [
          task({ taskId: 'A', title: 'Analyse', state: 'passed', result: { summary: 'Mapped the parser' } as OrchestrationTaskView['result'] }),
          task({
            taskId: 'B',
            title: 'Write guide',
            state: 'interrupted',
            dependsOn: ['A'],
            agentRef: 'acp:claude-code:attempt-1',
            worktreeRef: '/state/worktrees/workflow/run-1/B',
            lastError: 'The worker stopped before its turn finished',
          }),
        ],
      }),
    }))

    expect(html).toContain('1 of 2 tasks passed, up to 2 at once')
    expect(html).toContain('Mapped the parser')
    expect(html).toContain('ACP agent · claude-code')
    expect(html).toContain('After A')
    expect(html).toContain('The worker stopped before its turn finished')
    expect(html).toContain('Decide each interrupted task after you inspect its worktree')
    expect(html).toContain('Resume run')
    expect(html).toContain('Cancel run')
  })

  it('shows the approvals a worker waits on, with the session that answers them', () => {
    const html = textOf(render({
      run: run({
        pendingApprovals: [{ id: 'req-1', toolName: 'acp.claude-code', summary: 'claude-code asks to run "Edit file"', createdAt: '2026-11-18T10:04:00.000Z' }],
        tasks: [task({ taskId: 'B', state: 'running', agentRef: 'acp:claude-code:attempt-1' })],
      }),
    }))

    expect(html).toContain('Waiting for approval (1)')
    expect(html).toContain('acp.claude-code')
    expect(html).toContain('Edit file')
    expect(html).toContain('workflow:run-1')
  })

  it('offers no resume or cancel for a finished run, and no decisions', () => {
    const html = textOf(render({
      run: run({ status: 'passed', finishedAt: '2026-11-18T10:09:00.000Z', tasks: [task({ taskId: 'A', state: 'passed' })] }),
    }))

    expect(html).toContain('Passed')
    expect(html).not.toContain('Resume run')
    expect(html).not.toContain('Cancel run')
    expect(html).not.toContain('Decide each interrupted task')
  })

  it('lets a paused running run be resumed without any interrupted task', () => {
    const html = textOf(render({ run: run({ paused: true, tasks: [task({ taskId: 'A', state: 'running' })] }) }))

    expect(html).toContain('Paused')
    expect(html).toContain('Resume run')
    expect(html).not.toContain('Decide each interrupted task')
  })
})
