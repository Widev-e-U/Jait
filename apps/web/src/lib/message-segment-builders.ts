import type { ReferencedFile } from '@/components/chat'
import type { ChatAttachment } from '@/hooks/useChat'
import type { PreviewInspectInteractiveElement } from '@/components/project/project-preview-inspect-panel'
import type { UserMessageSegment, UserTerminalReference } from '@/lib/user-message-segments'

export function mergeAttachmentsIntoSegments(
  segments: UserMessageSegment[] | undefined,
  attachments: ChatAttachment[] | undefined,
) {
  const nextSegments = [...(segments ?? [])]
  const seen = new Set(nextSegments.flatMap((segment) => (
    segment.type === 'image' || segment.type === 'attachment'
      ? [`${segment.name}:${segment.mimeType}:${segment.data}`]
      : []
  )))
  for (const attachment of attachments ?? []) {
    const key = `${attachment.name}:${attachment.mimeType}:${attachment.data}`
    if (seen.has(key)) continue
    seen.add(key)
    if (attachment.mimeType.startsWith('image/')) {
      nextSegments.push({
        type: 'image',
        name: attachment.name,
        mimeType: attachment.mimeType,
        data: attachment.data,
      })
    } else {
      nextSegments.push({
        type: 'attachment',
        name: attachment.name,
        mimeType: attachment.mimeType,
        data: attachment.data,
      })
    }
  }
  return nextSegments.length > 0 ? nextSegments : undefined
}

export function buildFileSelectionReferenceSegments(
  file: ReferencedFile,
  startLine: number,
  endLine: number,
): UserMessageSegment[] {
  return [
    { type: 'file', path: file.path, name: file.name, ...(file.kind ? { kind: file.kind } : {}), lineRange: { startLine, endLine } },
  ]
}

export function buildTerminalSelectionReferenceSegments(
  terminal: UserTerminalReference,
  selection: string,
  startLine?: number,
  endLine?: number,
): UserMessageSegment[] {
  const lineCount = Math.max(1, selection.split(/\r?\n/).length)
  const lineRange = startLine && endLine && endLine >= startLine
    ? { startLine, endLine }
    : { startLine: 1, endLine: lineCount }
  return [
    {
      type: 'terminal',
      terminalId: terminal.terminalId,
      name: terminal.name,
      ...(terminal.projectRoot ? { projectRoot: terminal.projectRoot } : {}),
      lineRange,
      selectedText: selection.trim(),
    },
  ]
}

export function buildPreviewElementReferenceSegments(
  element: PreviewInspectInteractiveElement,
): UserMessageSegment[] {
  const label = element.name?.trim() || element.text?.trim() || element.placeholder?.trim() || 'unnamed element'
  const kind = element.role ?? element.tagName ?? 'element'
  const details = [
    `Selected preview element: ${kind} "${label}"`,
    element.selector ? `Selector: ${element.selector}` : null,
    element.placeholder ? `Placeholder: ${element.placeholder}` : null,
    element.value ? `Value: ${element.value}` : null,
  ].filter(Boolean).join('\n')
  return [{ type: 'text', text: `${details}\n` }]
}
