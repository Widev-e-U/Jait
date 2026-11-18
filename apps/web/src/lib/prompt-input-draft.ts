import { normalizeUserMessageSegments, type UserMessageSegment } from '@/lib/user-message-segments'

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
  localText: string,
): boolean {
  const nextSignature = getPromptDraftSignature(nextValue, nextSegments)
  if (previousSignature === nextSignature) return false

  const normalizedNextSegments = normalizeUserMessageSegments(nextSegments)
  if (normalizedNextSegments.length > 0) {
    return JSON.stringify(localSegments) !== JSON.stringify(normalizedNextSegments)
  }

  return localText !== nextValue
}
