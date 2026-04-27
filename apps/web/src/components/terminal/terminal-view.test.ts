import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getTerminalContextMenuPosition,
  handleTerminalContextMenuAction,
  isTerminalPasteShortcut,
  pasteClipboardEventTextIntoTerminal,
  pasteClipboardTextIntoTerminal,
  shouldUseTerminalCustomContextMenu,
  shouldSuppressTerminalPasteControlData,
} from './terminal-view'

const originalWindow = globalThis.window

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    globalThis.window = originalWindow
  }
})

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

  it('uses the desktop clipboard bridge when available', async () => {
    const sendInput = vi.fn()
    const browserClipboard = { readText: vi.fn().mockResolvedValue('browser clipboard') }
    globalThis.window = {
      jaitDesktop: {
        readClipboardText: vi.fn().mockResolvedValue('desktop clipboard'),
      },
    } as unknown as Window & typeof globalThis

    await expect(pasteClipboardTextIntoTerminal(browserClipboard, sendInput)).resolves.toBe(true)

    expect(sendInput).toHaveBeenCalledWith('desktop clipboard')
    expect(browserClipboard.readText).not.toHaveBeenCalled()
  })

  it('falls back to the browser clipboard when the desktop bridge fails', async () => {
    const sendInput = vi.fn()
    const browserClipboard = { readText: vi.fn().mockResolvedValue('browser clipboard') }
    globalThis.window = {
      jaitDesktop: {
        readClipboardText: vi.fn().mockRejectedValue(new Error('blocked')),
      },
    } as unknown as Window & typeof globalThis

    await expect(pasteClipboardTextIntoTerminal(browserClipboard, sendInput)).resolves.toBe(true)

    expect(sendInput).toHaveBeenCalledWith('browser clipboard')
    expect(browserClipboard.readText).toHaveBeenCalledTimes(1)
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

  it('trims whitespace-only selections and pastes instead', async () => {
    const sendInput = vi.fn()
    const clipboard = {
      readText: vi.fn().mockResolvedValue('from-clipboard'),
      writeText: vi.fn(),
    }

    await expect(handleTerminalContextMenuAction(clipboard, '   \n  ', sendInput)).resolves.toBe('pasted')

    expect(clipboard.writeText).not.toHaveBeenCalled()
    expect(sendInput).toHaveBeenCalledWith('from-clipboard')
  })

  it('copies multiline selections', async () => {
    const sendInput = vi.fn()
    const clipboard = {
      readText: vi.fn(),
      writeText: vi.fn().mockResolvedValue(undefined),
    }

    const multiline = 'line 1\nline 2\nline 3'
    await expect(handleTerminalContextMenuAction(clipboard, multiline, sendInput)).resolves.toBe('copied')

    expect(clipboard.writeText).toHaveBeenCalledWith(multiline)
    expect(sendInput).not.toHaveBeenCalled()
  })
})

describe('pasteClipboardEventTextIntoTerminal', () => {
  it('sends clipboard text from a paste event', () => {
    const sendInput = vi.fn()
    const preventDefault = vi.fn()

    const pasted = pasteClipboardEventTextIntoTerminal({
      clipboardData: {
        getData: vi.fn().mockReturnValue('echo from event'),
      } as unknown as DataTransfer,
      preventDefault,
    }, sendInput)

    expect(pasted).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(sendInput).toHaveBeenCalledWith('echo from event')
  })

  it('ignores paste events without text', () => {
    const sendInput = vi.fn()
    const preventDefault = vi.fn()

    const pasted = pasteClipboardEventTextIntoTerminal({
      clipboardData: {
        getData: vi.fn().mockReturnValue(''),
      } as unknown as DataTransfer,
      preventDefault,
    }, sendInput)

    expect(pasted).toBe(false)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(sendInput).not.toHaveBeenCalled()
  })

  it('falls back to text clipboard data when text/plain is unavailable', () => {
    const sendInput = vi.fn()
    const preventDefault = vi.fn()

    const pasted = pasteClipboardEventTextIntoTerminal({
      clipboardData: {
        getData: vi.fn((type: string) => type === 'text' ? 'echo fallback' : ''),
      } as unknown as DataTransfer,
      preventDefault,
    }, sendInput)

    expect(pasted).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(sendInput).toHaveBeenCalledWith('echo fallback')
  })
})

describe('isTerminalPasteShortcut', () => {
  it('accepts ctrl+v and cmd+v keydown shortcuts', () => {
    expect(isTerminalPasteShortcut({
      type: 'keydown',
      key: 'v',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    })).toBe(true)

    expect(isTerminalPasteShortcut({
      type: 'keydown',
      key: 'V',
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false,
    })).toBe(true)
  })

  it('rejects modified or non-keydown shortcuts', () => {
    expect(isTerminalPasteShortcut({
      type: 'keyup',
      key: 'v',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    })).toBe(false)

    expect(isTerminalPasteShortcut({
      type: 'keydown',
      key: 'v',
      ctrlKey: true,
      metaKey: false,
      altKey: true,
      shiftKey: false,
    })).toBe(false)
  })
})

describe('shouldSuppressTerminalPasteControlData', () => {
  it('suppresses raw ctrl+v data immediately after a paste shortcut', () => {
    expect(shouldSuppressTerminalPasteControlData('\x16', 1000, 1100)).toBe(true)
  })

  it('allows normal input and stale ctrl+v data', () => {
    expect(shouldSuppressTerminalPasteControlData('v', 1000, 1100)).toBe(false)
    expect(shouldSuppressTerminalPasteControlData('\x16', 1000, 1300)).toBe(false)
  })
})

describe('shouldUseTerminalCustomContextMenu', () => {
  it('uses the custom context menu only when the desktop bridge is present', () => {
    expect(shouldUseTerminalCustomContextMenu(true)).toBe(true)
    expect(shouldUseTerminalCustomContextMenu(false)).toBe(false)
  })
})

describe('getTerminalContextMenuPosition', () => {
  it('keeps the menu below the click when there is room', () => {
    expect(getTerminalContextMenuPosition(100, 100, 400, 400)).toEqual({ left: 100, top: 100 })
  })

  it('flips the menu upward near the bottom of the viewport', () => {
    expect(getTerminalContextMenuPosition(100, 390, 400, 400)).toEqual({ left: 100, top: 318 })
  })

  it('clamps the menu inside the viewport horizontally', () => {
    expect(getTerminalContextMenuPosition(390, 100, 400, 400)).toEqual({ left: 252, top: 100 })
  })
})
