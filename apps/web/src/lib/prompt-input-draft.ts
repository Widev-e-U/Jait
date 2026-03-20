import { normalizeUserMessageSegments, userMessageTextFromSegments, type UserMessageSegment } from '@/lib/user-message-segments'

export function getPromptDraftSignature(value: string, segments: UserMessageSegment[] | undefined): string {
  return JSON.stringify({
    value,
    segments: normalizeUserMessageSegments(segments),
  })
}

export function shouldSyncComposerDraft(
  previousSignature: string | null,
  nextValue: string,
  nextSegments: UserMessageSegment[] | undefined,
  localSegments: UserMessageSegment[],
): boolean {
  const nextSignature = getPromptDraftSignature(nextValue, nextSegments)
  if (previousSignature === nextSignature) return false

  const normalizedNextSegments = normalizeUserMessageSegments(nextSegments)
  if (normalizedNextSegments.length > 0) {
    return JSON.stringify(localSegments) !== JSON.stringify(normalizedNextSegments)
  }

  if (localSegments.length === 0) {
    return nextValue.length > 0
  }

  return userMessageTextFromSegments(localSegments) !== nextValue
}
