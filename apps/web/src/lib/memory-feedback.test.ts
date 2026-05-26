import { describe, expect, it } from 'vitest'
import { buildMemoryFeedbackReminder, getMemoryFeedbackSuccessMessage } from './memory-feedback'

describe('buildMemoryFeedbackReminder', () => {
  it('creates a reminder payload for missing memory feedback', () => {
    const request = buildMemoryFeedbackReminder({
      kind: 'should_have_remembered',
      messageId: 'message-1',
      sessionId: 'session-1',
      projectId: 'project-1',
      answerContent: 'The answer ignored a saved project preference.',
    })

    expect(request).toEqual({
      content: 'Memory feedback: Memorize this. The user wants this assistant answer reviewed as durable memory.\nAssistant answer excerpt: The answer ignored a saved project preference.',
      projectId: 'project-1',
      sessionId: 'session-1',
      sourceType: 'memory_feedback',
      sourceId: 'message-1',
      sourceSurface: 'chat',
      tags: ['memory-feedback', 'feedback', 'should-have-remembered'],
    })
  })

  it('creates a reminder payload for wrong-memory feedback', () => {
    const request = buildMemoryFeedbackReminder({
      kind: 'wrong_memory_used',
      messageId: 'message-2',
      sessionId: null,
      projectId: null,
    })

    expect(request.content).toBe('Memory feedback: Wrong memory used. The user says an incorrect or irrelevant memory influenced this answer.')
    expect(request.tags).toEqual(['memory-feedback', 'feedback', 'wrong-memory-used'])
    expect(request.sessionId).toBeNull()
    expect(request.projectId).toBeNull()
  })

  it('truncates long answer excerpts', () => {
    const request = buildMemoryFeedbackReminder({
      kind: 'wrong_memory_used',
      messageId: 'message-3',
      answerContent: 'x'.repeat(600),
    })

    expect(request.content).toContain(`Assistant answer excerpt: ${'x'.repeat(497)}...`)
    expect(request.content.split('Assistant answer excerpt: ')[1]).toHaveLength(500)
  })

  it('labels saved feedback for toast messages', () => {
    expect(getMemoryFeedbackSuccessMessage('should_have_remembered')).toBe('Memorize this feedback saved')
  })
})
