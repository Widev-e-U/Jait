import type { AgentRuntime } from '@jait/shared'

export function formatAgentElapsed(startedAt: string | null, now: number): string {
  if (!startedAt || !Number.isFinite(Date.parse(startedAt))) return '—'
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const remainder = String(seconds % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`
}

export function earliestAgentStart(runtimes: AgentRuntime[]): string | null {
  const starts = runtimes.filter((runtime) => runtime.running && runtime.startedAt && Number.isFinite(Date.parse(runtime.startedAt))).map((runtime) => runtime.startedAt!)
  return starts.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
}
