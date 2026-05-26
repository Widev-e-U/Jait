import { describe, expect, it } from 'vitest'
import { getInjectedMemoryProvenanceEntries } from './memory-provenance'
import type { LlmContextFlow } from '@/hooks/useChat'

describe('getInjectedMemoryProvenanceEntries', () => {
  it('returns only memory entries injected into the answer', () => {
    const contextFlow: LlmContextFlow = {
      provider: 'jait',
      rounds: [],
      memory: {
        query: 'memory provenance',
        retrieved: [
          {
            id: 'used-memory',
            scope: 'project',
            source: 'pre_compaction:session-1@chat',
            sourceType: 'pre_compaction',
            sourceId: 'session-1',
            sourceSurface: 'chat',
            updatedAt: '2026-05-24T00:00:00.000Z',
            content: 'Use compact provenance chips.',
          },
          {
            id: 'retrieved-only',
            scope: 'contact',
            source: 'agent:action-2@chat',
            sourceType: 'agent',
            sourceId: 'action-2',
            sourceSurface: 'chat',
            updatedAt: '2026-05-24T00:00:00.000Z',
            content: 'Do not show this one.',
          },
        ],
        injectedIds: ['used-memory'],
        ignoredIds: ['retrieved-only'],
        savedIds: [],
      },
    }

    expect(getInjectedMemoryProvenanceEntries(contextFlow).map((entry) => entry.id)).toEqual(['used-memory'])
  })
})
