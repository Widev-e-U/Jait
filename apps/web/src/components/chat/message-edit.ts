import {
  type UserMessageSegment,
  userReferencedFilesFromSegments,
  normalizeUserMessageSegments,
  userMessageTextFromSegments,
} from '@/lib/user-message-segments'
import type { QueuedMessage } from './message-queue'
import type { ChatAttachment } from '@/hooks/useChat'
import { mergeAttachmentsIntoSegments } from '@/lib/message-segment-builders'

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
  const sourceSegments = normalizeUserMessageSegments(editedSegments ?? preservedSegments)
  const sourceText = userMessageTextFromSegments(sourceSegments).trim()
  const attachments = currentAttachments === undefined
    ? normalizeUserMessageSegments(preservedSegments ?? editedSegments).filter(
        (segment) => segment.type === 'image' || segment.type === 'attachment',
      )
    : currentAttachments
  const keptSegments = sourceSegments.filter(segment => {
    if (segment.type !== 'image' && segment.type !== 'attachment') return true
    return attachments.some(item => item.name === segment.name && item.mimeType === segment.mimeType && item.data === segment.data)
  })
  const editableSegments = sourceText === trimmed
    ? keptSegments
    : [
        ...(trimmed ? [{ type: 'text' as const, text: trimmed }] : []),
        ...keptSegments.filter((segment) => segment.type !== 'text'),
      ]
  const displaySegments = mergeAttachmentsIntoSegments(editableSegments, attachments) ?? []
  if (!trimmed && !displaySegments.some(segment => segment.type !== 'text')) return null
  return {
    text: trimmed,
    referencedFiles: userReferencedFilesFromSegments(displaySegments),
    displaySegments,
  }
}

export function getQueuedMessageEditSegments(item: QueuedMessage): UserMessageSegment[] {
  const segments: UserMessageSegment[] = item.displaySegments?.length
    ? item.displaySegments
    : [{ type: 'text', text: item.displayContent ?? item.content }]
  if (segments.some(segment => segment.type === 'file') || !item.referencedFiles?.length) return segments
  return [...segments, ...item.referencedFiles.map(file => ({ ...file, type: 'file' as const }))]
}
