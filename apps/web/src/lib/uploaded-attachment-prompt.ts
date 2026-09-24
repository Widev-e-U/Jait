import type { ChatAttachment } from '@/hooks/useChat'

const UPLOADED_ATTACHMENT_CONTEXT_LIMIT = 20_000

function decodeAttachmentText(attachment: ChatAttachment): string | null {
  try {
    const binary = window.atob(attachment.data)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function buildUploadedAttachmentPromptBlock(attachments: ChatAttachment[] | undefined): string | null {
  const sections = (attachments ?? []).flatMap((attachment) => {
    if (attachment.mimeType.startsWith('image/')) return []
    const decoded = decodeAttachmentText(attachment)
    if (decoded == null) return []
    const truncated = decoded.length > UPLOADED_ATTACHMENT_CONTEXT_LIMIT
    return [`[File: ${attachment.name} (${attachment.mimeType})]\n${decoded.slice(0, UPLOADED_ATTACHMENT_CONTEXT_LIMIT)}${truncated ? '\n[truncated]' : ''}`]
  })
  return sections.length > 0 ? `Uploaded file attachments:\n\n${sections.join('\n\n')}` : null
}

export function appendUploadedAttachmentPromptBlock(content: string, attachments: ChatAttachment[] | undefined): string {
  const block = buildUploadedAttachmentPromptBlock(attachments)
  if (!block) return content
  return content.trim() ? `${content}\n\n${block}` : block
}

export function getUploadedAttachmentDisplayLabel(attachments: ChatAttachment[] | undefined): string {
  const names = (attachments ?? []).map((attachment) => attachment.name).filter(Boolean)
  if (names.length === 0) return ''
  if (names.length === 1) return `Uploaded ${names[0]}`
  return `Uploaded ${names.length} files`
}

