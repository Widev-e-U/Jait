import { describe, expect, it } from 'vitest'
import { shouldStartUserMessageEdit } from './message-bubble-click'
import { editQueuedChatMessage } from '@/hooks/useChat'

describe('message attachment interactions', () => {
  it('ignores a portaled image viewer event outside the bubble', () => {
    const target = { nodeType: 1, closest: () => null }
    expect(shouldStartUserMessageEdit({ target, currentTarget: { contains: () => false } }, '', { canEdit: true, isEditing: false })).toBe(false)
  })

  it('respects a child that already prevented its click default', () => {
    expect(shouldStartUserMessageEdit({ defaultPrevented: true }, '', { canEdit: true, isEditing: false })).toBe(false)
  })

  it('keeps ordered segments and explicit upload removals when editing a queue entry', () => {
    const first = { name: 'first.png', mimeType: 'image/png', data: 'AAA' }
    const second = { name: 'second.png', mimeType: 'image/png', data: 'BBB' }
    const document = { name: 'notes.txt', mimeType: 'text/plain', data: 'CCC' }
    const original = { id: 'queue', queuedAt: 1, content: 'before after', held: true, attachments: [first, second, document], displaySegments: [
      { type: 'text' as const, text: 'before ' }, { type: 'image' as const, ...first },
      { type: 'image' as const, ...second }, { type: 'text' as const, text: 'after' }, { type: 'attachment' as const, ...document },
    ] }
    const segments = [{ type: 'text' as const, text: 'before ' }, { type: 'image' as const, ...second }, { type: 'text' as const, text: 'after changed' }]
    const result = editQueuedChatMessage(original, 'before after changed', [second], segments)
    expect(result.attachments).toEqual([second])
    expect(result.displaySegments).toEqual(segments)
    expect(result.held).toBe(true)
    expect(original.attachments).toHaveLength(3)
  })

  it('allows image-only queue edits and preserves document review metadata', () => {
    const image = { name: 'image.png', mimeType: 'image/png', data: 'AAA' }
    const document = { name: 'text.txt', mimeType: 'text/plain', data: 'QQ==', pastedText: { text: 'hello', lineCount: 1 } }
    const item = { id: 'queue', queuedAt: 1, content: 'review', attachments: [image, document] }
    const edited = editQueuedChatMessage(item, '', [image], [{ type: 'image', ...image }])
    expect(edited.content).toBe('')
    expect(edited.attachments).toEqual([image])
    expect(edited.displaySegments).toEqual([{ type: 'image', ...image }])
    const withDocument = editQueuedChatMessage(item, 'updated', [document], [{ type: 'text', text: 'updated' }])
    expect(withDocument.attachments).toEqual([document])
  })
})
