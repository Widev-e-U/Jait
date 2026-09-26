import {
  type UserMessageSegment,
  userReferencedFilesFromSegments,
  normalizeUserMessageSegments,
  userMessageTextFromSegments,
} from '@/lib/user-message-segments'
import type { ChatAttachment } from '@/hooks/useChat'

export interface UserMessageEditSubmission {
  text: string
  referencedFiles: { path: string; name: string }[]
  displaySegments: UserMessageSegment[]
}

export function createUserMessageEditSubmission(
  text: string,
  editedSegments?: UserMessageSegment[] | null,
  preservedSegments?: UserMessageSegment[] | null,
  currentAttachments?: ChatAttachment[],
): UserMessageEditSubmission | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const sourceSegments = normalizeUserMessageSegments(editedSegments ?? preservedSegments)
  const sourceText = userMessageTextFromSegments(sourceSegments).trim()
  const editableSegments = sourceText === trimmed
    ? sourceSegments.filter((segment) => segment.type !== 'image' && segment.type !== 'attachment')
    : [
        { type: 'text' as const, text: trimmed },
        ...sourceSegments.filter((segment) => segment.type !== 'text' && segment.type !== 'image' && segment.type !== 'attachment'),
      ]
  const attachments = currentAttachments === undefined
    ? normalizeUserMessageSegments(preservedSegments ?? editedSegments).filter(
        (segment) => segment.type === 'image' || segment.type === 'attachment',
      )
    : currentAttachments.map((attachment) => ({
        type: attachment.mimeType.startsWith('image/') ? 'image' as const : 'attachment' as const,
        name: attachment.name,
        mimeType: attachment.mimeType,
        data: attachment.data,
      }))
  const displaySegments = [...editableSegments, ...attachments]
  return {
    text: trimmed,
    referencedFiles: userReferencedFilesFromSegments(displaySegments),
    displaySegments,
  }
}
