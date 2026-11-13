import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ChatLoop } from '@jait/shared'
import { describe, expect, it } from 'vitest'
import { LoopGoalCard } from './loop-goal-card'

const loop: ChatLoop = {
  id: 'goal', goal: 'Finish migration', criteria: ['All checks pass'], status: 'error',
  iteration: 6, revision: 13, checkedIteration: 4, summary: 'Workspace is out of credits',
  nextMessage: '', evidence: [], updatedAt: '2026-10-24T10:33:19.836Z',
}

const render = (mobile: boolean, goal = loop) => renderToStaticMarkup(createElement(LoopGoalCard, {
  loop: goal, sessionId: 'goal-chat', mobile, onControl: async () => {},
}))

describe('stopped goal visibility', () => {
  it('shows the error while the mobile goal is collapsed', () => {
    const html = render(true)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('role="status"')
    expect(html).toContain('Stopped · error')
    expect(html).toContain('Workspace is out of credits')
    expect(html).toContain('text-destructive')
  })
  it('shows the error and recovery action in the expanded goal', () => {
    const html = render(false)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Workspace is out of credits')
    expect(html).toContain('Resolve the error, then resume the goal')
    expect(html).toContain('Resume goal loop')
  })
  it.each(['paused', 'waiting', 'completed'] as const)('keeps %s visible on mobile', status => {
    const html = render(true, { ...loop, status })
    expect(html).toContain(status)
    expect(html).not.toContain('Stopped · error')
  })
})


describe('goal progress diagnostics', () => {
  it('shows repeated checkpoint warnings and measured timings', () => {
    const html = render(false, { ...loop, status: 'running', stalledChecks: 2, lastTurnDurationMs: 12500, monitor: { status: 'accepted', reviewedRevision: 12, reviewedAt: loop.updatedAt, durationMs: 750, criteriaPassed: [], progress: 'stalled', reason: '' } })
    expect(html).toContain('2 consecutive checkpoints were flagged')
    expect(html).toContain('Last turn: 12.5s')
    expect(html).toContain('latest checkpoint review: 0.8s')
  })
  it('does not warn on a single flagged checkpoint', () => {
    expect(render(false, { ...loop, status: 'running', stalledChecks: 1 })).not.toContain('consecutive checkpoints')
  })
})
