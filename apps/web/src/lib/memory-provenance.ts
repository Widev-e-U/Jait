import type { LlmContextFlow } from '@/hooks/useChat'

export interface MemoryProvenanceSource {
  memoryId: string
  sourceType?: string
  sourceId?: string
  sourceSurface?: string
}

export function getInjectedMemoryProvenanceEntries(contextFlow?: LlmContextFlow): NonNullable<LlmContextFlow['memory']>['retrieved'] {
  const memory = contextFlow?.memory
  if (!memory || memory.injectedIds.length === 0) return []
  const injectedIds = new Set(memory.injectedIds)
  return memory.retrieved.filter((entry) => injectedIds.has(entry.id))
}
