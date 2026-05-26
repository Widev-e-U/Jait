import { describe, expect, it } from 'vitest'
import { parseContextFlowEvent } from './context-flow'

describe('parseContextFlowEvent', () => {
  it('preserves memory provenance from context_flow events', () => {
    const flow = parseContextFlowEvent({
      type: 'context_flow',
      provider: 'jait',
      model: 'gpt-4o',
      note: 'request snapshot',
      rounds: [{ round: 1, messages: [] }],
      memory: {
        query: 'todo controls',
        retrieved: [{
          id: 'mem-1',
          scope: 'project',
          source: 'pre_compaction:session-1@chat',
          sourceType: 'pre_compaction',
          sourceId: 'session-1',
          sourceSurface: 'chat',
          updatedAt: '2026-05-24T00:00:00.000Z',
          content: 'Todo controls should stay compact.',
        }],
        injectedIds: ['mem-1'],
        ignoredIds: ['mem-old'],
        savedIds: [],
      },
    })

    expect(flow.memory).toEqual({
      query: 'todo controls',
      retrieved: [{
        id: 'mem-1',
        scope: 'project',
        source: 'pre_compaction:session-1@chat',
        sourceType: 'pre_compaction',
        sourceId: 'session-1',
        sourceSurface: 'chat',
        updatedAt: '2026-05-24T00:00:00.000Z',
        content: 'Todo controls should stay compact.',
      }],
      injectedIds: ['mem-1'],
      ignoredIds: ['mem-old'],
      savedIds: [],
    })
  })
})
