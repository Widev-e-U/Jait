import type { ChatAttachment } from '@/hooks/useChat'

export function isLongPaste(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length >= 10_000 && trimmed.split(/\r\n|\r|\n/).length >= 10
}

/** Use the normal UTF-8 file transport without an asynchronous FileReader race. */
export function createPastedTextAttachment(text: string, existing: readonly Pick<ChatAttachment, 'name'>[]): ChatAttachment {
  const names = new Set(existing.map(attachment => attachment.name))
  let index = 1
  while (names.has(`Pasted text #${index}.txt`)) index++
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return {
    name: `Pasted text #${index}.txt`,
    mimeType: 'text/plain',
    data: btoa(binary),
    pastedText: { text, lineCount: text.split(/\r\n|\r|\n/).length },
  }
}
