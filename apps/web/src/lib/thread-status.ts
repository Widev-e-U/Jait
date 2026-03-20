import type { AgentThread } from './agents-api'

type ThreadStopState = Pick<AgentThread, 'status'>

export function canStopThread(thread: ThreadStopState): boolean {
  return thread.status === 'running'
}
