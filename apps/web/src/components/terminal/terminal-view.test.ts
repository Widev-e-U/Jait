import { describe, expect, it, vi } from 'vitest'
import { handleTerminalContextMenuAction, pasteClipboardTextIntoTerminal } from './terminal-view'

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

describe('handleTerminalContextMenuAction', () => {
  it('copies the current terminal selection on right click', async () => {
    const sendInput = vi.fn()
    const clipboard = {
      readText: vi.fn(),
      writeText: vi.fn().mockResolvedValue(undefined),
    }

    await expect(handleTerminalContextMenuAction(clipboard, 'echo selected', sendInput)).resolves.toBe('copied')

    expect(clipboard.writeText).toHaveBeenCalledWith('echo selected')
    expect(clipboard.readText).not.toHaveBeenCalled()
    expect(sendInput).not.toHaveBeenCalled()
  })

  it('pastes clipboard contents when nothing is selected', async () => {
    const sendInput = vi.fn()
    const clipboard = {
      readText: vi.fn().mockResolvedValue('echo pasted'),
      writeText: vi.fn(),
    }

    await expect(handleTerminalContextMenuAction(clipboard, '', sendInput)).resolves.toBe('pasted')

    expect(clipboard.readText).toHaveBeenCalledTimes(1)
    expect(clipboard.writeText).not.toHaveBeenCalled()
    expect(sendInput).toHaveBeenCalledWith('echo pasted')
  })

  it('returns noop when copy and paste are unavailable', async () => {
    const sendInput = vi.fn()

    await expect(handleTerminalContextMenuAction(null, 'selected', sendInput)).resolves.toBe('noop')
    await expect(handleTerminalContextMenuAction({
      readText: vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError')),
      writeText: vi.fn(),
    }, '', sendInput)).resolves.toBe('noop')

    expect(sendInput).not.toHaveBeenCalled()
  })
})
