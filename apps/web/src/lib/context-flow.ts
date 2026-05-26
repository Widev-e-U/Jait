import type { LlmContextFlow } from '@/hooks/useChat'

function parseMemoryEntry(value: unknown): NonNullable<LlmContextFlow['memory']>['retrieved'][number] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entry = value as Record<string, unknown>
  if (typeof entry.id !== 'string' || typeof entry.scope !== 'string') return null
  if (entry.scope !== 'project' && entry.scope !== 'contact') return null

  return {
    id: entry.id,
    scope: entry.scope,
    source: typeof entry.source === 'string' ? entry.source : '',
    sourceType: typeof entry.sourceType === 'string' ? entry.sourceType : undefined,
    sourceId: typeof entry.sourceId === 'string' ? entry.sourceId : undefined,
    sourceSurface: typeof entry.sourceSurface === 'string' ? entry.sourceSurface : undefined,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
    content: typeof entry.content === 'string' ? entry.content : '',
  }
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function parseContextFlowEvent(data: Record<string, unknown>): LlmContextFlow {
  const memoryData = data.memory && typeof data.memory === 'object' && !Array.isArray(data.memory)
    ? data.memory as Record<string, unknown>
    : null
  const retrieved = Array.isArray(memoryData?.retrieved)
    ? memoryData.retrieved.map(parseMemoryEntry).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : []
  const memory = memoryData
    ? {
        query: typeof memoryData.query === 'string' ? memoryData.query : '',
        retrieved,
        injectedIds: parseStringArray(memoryData.injectedIds),
        ignoredIds: parseStringArray(memoryData.ignoredIds),
        savedIds: parseStringArray(memoryData.savedIds),
      }
    : undefined

  return {
    provider: String(data.provider ?? 'jait'),
    model: typeof data.model === 'string' ? data.model : undefined,
    rounds: Array.isArray(data.rounds) ? data.rounds as LlmContextFlow['rounds'] : [],
    note: typeof data.note === 'string' ? data.note : undefined,
    ...(memory ? { memory } : {}),
  }
}
