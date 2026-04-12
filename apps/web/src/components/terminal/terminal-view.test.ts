import { describe, expect, it, vi } from 'vitest'
import { pasteClipboardTextIntoTerminal } from './terminal-view'

describe('pasteClipboardTextIntoTerminal', () => {
  it('sends non-empty clipboard text', async () => {
    const sendInput = vi.fn()

    await expect(pasteClipboardTextIntoTerminal({
      readText: vi.fn().mockResolvedValue('echo pasted'),
    }, sendInput)).resolves.toBe(true)

    expect(sendInput).toHaveBeenCalledWith('echo pasted')
  })

  it('ignores empty or unavailable clipboard text', async () => {
    const sendInput = vi.fn()

    await expect(pasteClipboardTextIntoTerminal({
      readText: vi.fn().mockResolvedValue(''),
    }, sendInput)).resolves.toBe(false)
    await expect(pasteClipboardTextIntoTerminal(null, sendInput)).resolves.toBe(false)

    expect(sendInput).not.toHaveBeenCalled()
  })

  it('returns false when clipboard reads are blocked', async () => {
    const sendInput = vi.fn()

    await expect(pasteClipboardTextIntoTerminal({
      readText: vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError')),
    }, sendInput)).resolves.toBe(false)

    expect(sendInput).not.toHaveBeenCalled()
  })
})
