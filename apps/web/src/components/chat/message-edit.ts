import {
  buildEditedUserMessageSegments,
  type UserMessageSegment,
  userReferencedFilesFromSegments,
} from '@/lib/user-message-segments'

export interface UserMessageEditSubmission {
  text: string
  referencedFiles: { path: string; name: string }[]
  displaySegments: UserMessageSegment[]
}

export function createUserMessageEditSubmission(
  text: string,
  previousSegments?: UserMessageSegment[] | null,
): UserMessageEditSubmission | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const displaySegments = buildEditedUserMessageSegments(trimmed, previousSegments)
  return {
    text: trimmed,
    referencedFiles: userReferencedFilesFromSegments(displaySegments),
    displaySegments,
  }
}

export function isUserMessageEditUnchanged(
  text: string,
  currentText: string,
  previousSegments?: UserMessageSegment[] | null,
): boolean {
  const submission = createUserMessageEditSubmission(text, previousSegments)
  if (!submission) return false

  return submission.text === currentText.trim()
    && JSON.stringify(submission.displaySegments) === JSON.stringify(previousSegments ?? [])
}
