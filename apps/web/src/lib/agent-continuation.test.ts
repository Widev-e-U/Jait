import { describe, expect, it } from 'vitest'
import type { AgentThread } from './agents-api'
import { agentContinuation, agentContinuationLabel } from './agent-continuation'
const agent = { id: 'agent-1' }
const thread = (id: string, status: AgentThread['status'], updatedAt = id, extra: Partial<AgentThread> = {}) =>
  ({ id, status, updatedAt, personaAgentId: agent.id, kind: 'delivery', ...extra } as AgentThread)

describe('agent continuation', () => {
  it('offers failed work even after another thread completed', () => {
    expect(agentContinuation(agent, [thread('1', 'error'), thread('2', 'completed')])?.id).toBe('1')
  })
  it('chooses the newest unfinished task and preserves other agents', () => {
    expect(agentContinuation(agent, [thread('1', 'error'), thread('2', 'interrupted'), thread('3', 'error', '3', { personaAgentId: 'other' })])?.id).toBe('2')
  })
  it('does not start duplicate work or resume closed PRs and helper runs', () => {
    expect(agentContinuation(agent, [thread('1', 'error'), thread('2', 'running')])).toBeUndefined()
    expect(agentContinuation({ ...agent, activeTasks: 1 }, [thread('1', 'error')])).toBeUndefined()
    expect(agentContinuation(agent, [thread('1', 'error', '1', { prState: 'merged' }), thread('2', 'error', '2', { kind: 'delegation' })])).toBeUndefined()
  })
  it('explains usage failures and distinguishes a manual stop', () => {
    expect(agentContinuationLabel(thread('1', 'error', '1', { error: 'Usage limit reached' }))).toContain('change provider/model')
    expect(agentContinuationLabel(thread('2', 'interrupted'))).toContain('press Play')
  })
})
