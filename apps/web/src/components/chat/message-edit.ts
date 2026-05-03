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
  const preservedImages = (sourceSegments ?? []).filter(
    (segment): segment is Extract<UserMessageSegment, { type: 'image' }> => segment.type === 'image',
  )
  const displaySegments = [
    ...buildEditedUserMessageSegments(trimmed, editedSegments),
    ...preservedImages.filter((image) => !editedSegments?.some((segment) => (
      segment.type === 'image' && segment.name === image.name && segment.data === image.data
    ))),
  ]
  return {
    text: trimmed,
    referencedFiles: userReferencedFilesFromSegments(displaySegments),
    displaySegments,
  }
}
