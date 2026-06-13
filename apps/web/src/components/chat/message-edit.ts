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
  editedSegments?: UserMessageSegment[] | null,
  preservedSegments?: UserMessageSegment[] | null,
): UserMessageEditSubmission | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const sourceSegments = preservedSegments ?? editedSegments
  const preservedAttachments = (sourceSegments ?? []).filter(
    (segment): segment is Extract<UserMessageSegment, { type: 'image' | 'attachment' }> => (
      segment.type === 'image' || segment.type === 'attachment'
    ),
  )
  const displaySegments = [
    ...buildEditedUserMessageSegments(trimmed, editedSegments),
    ...preservedAttachments.filter((attachment) => !editedSegments?.some((segment) => (
      (segment.type === 'image' || segment.type === 'attachment')
      && segment.name === attachment.name
      && segment.data === attachment.data
    ))),
  ]
  return {
    text: trimmed,
    referencedFiles: userReferencedFilesFromSegments(displaySegments),
    displaySegments,
  }
}
