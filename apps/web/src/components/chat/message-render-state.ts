import type { UserMessageSegment } from '@/lib/user-message-segments'

export function hasRenderableUserMessageContent(params: {
  content: string
  userDisplayText: string
  userDisplaySegments: UserMessageSegment[]
  imageAttachmentCount: number
}): boolean {
  return (
    params.content.length > 0 ||
    params.userDisplayText.length > 0 ||
    params.userDisplaySegments.length > 0 ||
    params.imageAttachmentCount > 0
  )
}
