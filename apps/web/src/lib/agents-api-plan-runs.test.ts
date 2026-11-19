import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentsApi } from './agents-api'

type Call = { url: string; init: RequestInit | undefined }

/** Records every request and answers each with the given response. */
function stubFetch(respond: () => Response): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return respond()
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AgentsApi plan runs', () => {
  it('starts a run of a plan with the chosen number of workers', async () => {
    const calls = stubFetch(() => Response.json({ run: { id: 'run-1' } }, { status: 201 }))

    const run = await new AgentsApi().startPlanRun('plan-1', 3)

    expect(run).toEqual({ id: 'run-1' })
    expect(calls[0]?.url).toContain('/api/plans/plan-1/runs')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ maxWorkers: 3 })
  })

  it('leaves the worker count to the gateway default when none is chosen', async () => {
    const calls = stubFetch(() => Response.json({ run: { id: 'run-1' } }, { status: 201 }))

    await new AgentsApi().startPlanRun('plan-1')

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({})
  })

  it('sends the decisions for interrupted tasks when resuming', async () => {
    const calls = stubFetch(() => Response.json({ run: { id: 'run-1' } }))
    const decisions = [{ taskId: 'B', decision: 'retry' as const, note: 'Checked the worktree' }]

    await new AgentsApi().resumePlanRun('run-1', decisions)

    expect(calls[0]?.url).toContain('/api/plan-runs/run-1/resume')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ decisions })
  })

  it('reads the attempts of one task of a run', async () => {
    const calls = stubFetch(() => Response.json({ attempts: [{ id: 'att-1', attemptNo: 1, state: 'passed' }] }))

    const attempts = await new AgentsApi().listPlanRunAttempts('run-1', 'B')

    expect(calls[0]?.url).toContain('/api/plan-runs/run-1/tasks/B/attempts')
    expect(attempts).toEqual([{ id: 'att-1', attemptNo: 1, state: 'passed' }])
  })

  it('shows the reason the gateway gives when a run request is refused', async () => {
    stubFetch(() => Response.json({ error: 'run is halted' }, { status: 409 }))

    await expect(new AgentsApi().cancelPlanRun('run-1')).rejects.toThrow('run is halted')
  })

  it('falls back to the status when the refusal carries no error body', async () => {
    stubFetch(() => new Response('not json', { status: 500, statusText: 'Server Error' }))

    await expect(new AgentsApi().getPlanRun('run-1')).rejects.toThrow('Failed to load run: Server Error')
  })
})
