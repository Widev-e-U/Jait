import { describe, expect, it } from 'vitest'
import { parseChatPersona } from './chat-persona'
import { reuseUnchangedMessages } from './chat-history-cache'
import { editQueuedChatMessage, mapSnapshotMessages } from '@/hooks/useChat'

const persona = { id: 'agent-a', name: 'Original name', avatar: 'creature-2', providerId: 'codex', model: 'original-model' }

describe('saved agent chat attribution', () => {
  it('restores the captured identity from persisted history without looking up today’s profile', () => {
    const [message] = mapSnapshotMessages([{ id: 'response', role: 'assistant', content: 'Hello', persona }], false)
    expect(message.persona).toEqual(persona)
    expect(message.content).toBe('Hello')
  })
  it('keeps default assistant responses unattributed and rejects malformed identity', () => {
    expect(mapSnapshotMessages([{ id: 'response', role: 'assistant', content: 'Hello' }], false)[0].persona).toBeUndefined()
    expect(parseChatPersona({ name: 'Fake', avatar: 5 })).toBeUndefined()
  })
  it('refreshes the rendered identity when an authoritative snapshot adds attribution', () => {
    const before = { id: 'response', role: 'assistant' as const, content: 'Hello' }
    const after = { ...before, persona }
    expect(reuseUnchangedMessages([after], [before])[0].persona).toEqual(persona)
  })
  it('keeps each queued entry’s recipient when editing its prompt', () => {
    const entry = editQueuedChatMessage({ id: 'q1', content: 'before', queuedAt: 1, personaAgentId: 'agent-a' }, 'after')
    expect(entry.personaAgentId).toBe('agent-a')
    expect(entry.content).toBe('after')
  })
})
