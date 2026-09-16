import { describe, expect, it } from 'vitest'
import { createPastedTextAttachment, isLongPaste } from './pasted-text-attachment'

describe('pasted text attachments', () => {
  it('requires both the character and line thresholds', () => {
    const boundary = 'x'.repeat(9991) + '\na\nb\nc\nd\ne\nf\ng\nh\ni'
    expect(isLongPaste(boundary)).toBe(true)
    expect(isLongPaste('x'.repeat(9990) + '\n'.repeat(9))).toBe(false)
    expect(isLongPaste('x'.repeat(20_000))).toBe(false)
    expect(isLongPaste('short\n'.repeat(10))).toBe(false)
    expect(isLongPaste(' \n'.repeat(10_000))).toBe(false)
    const exact = 'x'.repeat(9982) + '\na'.repeat(9)
    expect(isLongPaste(exact)).toBe(true)
    expect(isLongPaste(exact.slice(1))).toBe(false)
  })

  it.each(['\n', '\r\n', '\r'])('recognizes %j line endings', separator => {
    expect(isLongPaste(Array(10).fill('x'.repeat(1000)).join(separator))).toBe(true)
  })

  it('preserves whitespace and Unicode through the gateway base64 transport', () => {
    const text = '  日本語 😀 ä\r\n'.repeat(10_000) + '  '
    const attachment = createPastedTextAttachment(text, [])
    expect(Buffer.from(attachment.data, 'base64').toString('utf8')).toBe(text)
    expect(attachment.mimeType).toBe('text/plain')
    expect(attachment.pastedText).toEqual({ text, lineCount: 10_001 })
  })

  it('keeps repeated pastes distinct and avoids uploaded filename collisions', () => {
    const first = createPastedTextAttachment('first', [{ name: 'Pasted text #1.txt' }])
    const second = createPastedTextAttachment('second', [{ name: 'Pasted text #1.txt' }, first])
    expect(first.name).toBe('Pasted text #2.txt')
    expect(second.name).toBe('Pasted text #3.txt')
  })
})
