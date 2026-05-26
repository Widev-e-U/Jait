import type { CreateReminderRequest } from './agents-api'

export type MemoryFeedbackKind = 'should_have_remembered' | 'wrong_memory_used'

const MEMORY_FEEDBACK_SOURCE_TYPE = 'memory_feedback'
const MAX_ANSWER_EXCERPT_LENGTH = 500

const feedbackConfig: Record<MemoryFeedbackKind, { label: string; description: string; tag: string }> = {
  should_have_remembered: {
    label: 'Memorize this',
    description: 'The user wants this assistant answer reviewed as durable memory.',
    tag: 'should-have-remembered',
  },
  wrong_memory_used: {
    label: 'Wrong memory used',
    description: 'The user says an incorrect or irrelevant memory influenced this answer.',
    tag: 'wrong-memory-used',
  },
}

export function getMemoryFeedbackLabel(kind: MemoryFeedbackKind): string {
  return feedbackConfig[kind].label
}

export function getMemoryFeedbackSuccessMessage(kind: MemoryFeedbackKind): string {
  return `${feedbackConfig[kind].label} feedback saved`
}

function normalizeAnswerExcerpt(content: string | undefined): string | null {
  const normalized = (content ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  if (normalized.length <= MAX_ANSWER_EXCERPT_LENGTH) return normalized
  return `${normalized.slice(0, MAX_ANSWER_EXCERPT_LENGTH - 3).trimEnd()}...`
}

export function buildMemoryFeedbackReminder({
  kind,
  messageId,
  sessionId,
  projectId,
  answerContent,
}: {
  kind: MemoryFeedbackKind
  messageId: string
  sessionId?: string | null
  projectId?: string | null
  answerContent?: string
}): CreateReminderRequest {
  const config = feedbackConfig[kind]
  const answerExcerpt = normalizeAnswerExcerpt(answerContent)
  return {
    content: [
      `Memory feedback: ${config.label}. ${config.description}`,
      answerExcerpt ? `Assistant answer excerpt: ${answerExcerpt}` : null,
    ].filter(Boolean).join('\n'),
    projectId: projectId ?? null,
    sessionId: sessionId ?? null,
    sourceType: MEMORY_FEEDBACK_SOURCE_TYPE,
    sourceId: messageId,
    sourceSurface: 'chat',
    tags: ['memory-feedback', 'feedback', config.tag],
  }
}
