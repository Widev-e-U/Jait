import type { AgentThread } from './agents-api'
import type { PersonaAgentDraft } from './persona-agents'

// Play resumes the newest unfinished task, never a completed or closed PR.
export function agentContinuation(agent: Pick<PersonaAgentDraft, 'id' | 'chatThreadId' | 'activeTasks'>, threads: AgentThread[]) {
  if ((agent.activeTasks ?? 0) > 0) return undefined
  const own = threads.filter(thread => thread.personaAgentId === agent.id || thread.id === agent.chatThreadId)
  if (own.some(thread => thread.status === 'running')) return undefined
  return own.filter(thread => (thread.status === 'error' || thread.status === 'interrupted')
    && thread.prState !== 'merged' && thread.prState !== 'closed'
    && thread.kind !== 'delegation').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

export function agentContinuationLabel(thread: AgentThread) {
  const usageLimited = /quota|resource.?exhausted|429|hit.{0,12}limit|usage.{0,24}(limit|exhaust)|rate.?limit|credits?|allowance|insufficient.{0,12}balance|five.hour|5.hour/i.test(thread.error ?? '')
  return usageLimited ? 'Usage limit reached · change provider/model, then Play' : 'Interrupted · press Play to continue'
}
