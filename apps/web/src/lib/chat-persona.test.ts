import { describe, expect, it } from 'vitest'
import { parseChatPersona } from './chat-persona'
import { reuseUnchangedMessages } from './chat-history-cache'
import { editQueuedChatMessage, mapSnapshotMessages } from '@/hooks/useChat'
import { createMessageStream } from './message-stream'

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

it('resumes provisional calls through the snapshot mapping path', () => {
  const [message] = mapSnapshotMessages([{ id: 'a', role: 'assistant', content: '',
    segments: [{ type: 'toolGroup', callIds: ['pending-0', 'pending-1'] }],
    toolCalls: [
      { callId: 'pending-0', tool: 'file_', args: {}, status: 'pending', streamingArgs: '{', streamIndex: 4 },
      { callId: 'pending-1', tool: 'other', args: {}, status: 'pending', streamingArgs: '', streamIndex: 1 },
    ],
  }], true)
  const stream = createMessageStream()
  stream.hydrate({ toolCalls: message.toolCalls, segments: message.segments })
  stream.pushToolCallDelta('real-a', 'read', '}', undefined, 4)
  expect(stream.snapshot().toolCalls.map(call => [call.callId, call.tool, call.streamingArgs])).toEqual([
    ['real-a', 'file_read', '{}'], ['pending-1', 'other', ''],
  ])
})

it('preserves explicit provisional identity through snapshot hydration', () => {
  const [message] = mapSnapshotMessages([{ id: 'a', role: 'assistant', content: '',
    segments: [{ type: 'toolGroup', callIds: ['pending-0', 'pending-2'] }],
    toolCalls: [
      { callId: 'pending-0', tool: 'file_', args: {}, status: 'pending', streamIndex: 4, provisional: true },
      { callId: 'pending-2', tool: 'other', args: {}, status: 'pending', streamIndex: 1, provisional: false },
    ],
  }], true)
  const stream = createMessageStream()
  stream.hydrate({ toolCalls: message.toolCalls, segments: message.segments })
  stream.pushToolCallDelta('pending-3', 'read', '{}', undefined, 4, false)
  stream.pushToolStart('unrelated', 'other', {})
  const snapshot = stream.snapshot()
  expect(snapshot.toolCalls.map(call => [call.callId, call.tool, call.provisional])).toEqual([
    ['pending-3', 'file_read', false], ['pending-2', 'other', false], ['unrelated', 'other', undefined],
  ])
  expect(snapshot.segments[0]).toEqual({ type: 'toolGroup', callIds: ['pending-3', 'pending-2', 'unrelated'] })
})
