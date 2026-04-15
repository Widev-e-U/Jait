import type { AgentThread } from './agents-api'
import type { GitStatusPr } from './git-api'

export type ThreadPrState = GitStatusPr['state'] | 'creating' | null

export function resolveThreadPrStateFromPoll(
  polledPr: Pick<GitStatusPr, 'state'> | null | undefined,
  persistedPrState: AgentThread['prState'],
): ThreadPrState {
  if (polledPr?.state) return polledPr.state
  const hasPersistedPrState =
    persistedPrState === 'creating' ||
    persistedPrState === 'open' ||
    persistedPrState === 'closed' ||
    persistedPrState === 'merged'

  return hasPersistedPrState ? persistedPrState : null
}
