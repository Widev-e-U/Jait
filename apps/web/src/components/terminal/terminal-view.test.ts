import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getTerminalContextMenuPosition,
  handleTerminalContextMenuAction,
  isTerminalPasteShortcut,
  pasteClipboardEventTextIntoTerminal,
  pasteClipboardTextIntoTerminal,
  shouldUseTerminalCustomContextMenu,
  shouldSuppressTerminalPasteControlData,
  terminalBelongsToProject,
  type TerminalInfo,
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

  it('preserves selected whitespace when copying terminal text', async () => {
    const sendInput = vi.fn()
    const clipboard = {
      readText: vi.fn(),
      writeText: vi.fn().mockResolvedValue(undefined),
    }

    const selection = '  indented value  \n'
    await expect(handleTerminalContextMenuAction(clipboard, selection, sendInput)).resolves.toBe('copied')

    expect(clipboard.writeText).toHaveBeenCalledWith(selection)
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
  it('always shows the custom context menu', () => {
    expect(shouldUseTerminalCustomContextMenu(true)).toBe(true)
    expect(shouldUseTerminalCustomContextMenu(false)).toBe(true)
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

describe('terminalBelongsToProject', () => {
  const baseTerminal = (overrides: Partial<TerminalInfo> = {}): TerminalInfo => ({
    id: 'term-1',
    type: 'terminal',
    state: 'running',
    sessionId: 's1',
    projectRoot: '/remote/project',
    metadata: {},
    ...overrides,
  })

  it('matches a gateway terminal to a gateway project by projectRoot', () => {
    expect(terminalBelongsToProject(
      baseTerminal({ projectRoot: '/home/me/project' }),
      '/home/me/project',
      'gateway',
    )).toBe(true)
  })

  it('matches a remote-node terminal to the same node + projectRoot', () => {
    const t = baseTerminal({ projectRoot: '/remote/project', metadata: { nodeId: 'node-A', remote: true, cwd: '/remote/project' } })
    expect(terminalBelongsToProject(t, '/remote/project', 'node-A')).toBe(true)
  })

  it('rejects a remote-node terminal when the project is on a different node', () => {
    const t = baseTerminal({ projectRoot: '/remote/project', metadata: { nodeId: 'node-A', remote: true, cwd: '/remote/project' } })
    expect(terminalBelongsToProject(t, '/remote/project', 'node-B')).toBe(false)
  })

  it('rejects a gateway terminal when the project is on a remote node', () => {
    // A gateway-owned terminal must not be reused for a remote-node project,
    // otherwise opening the terminal would spawn it on the wrong host.
    const t = baseTerminal({ projectRoot: '/remote/project', metadata: { cwd: '/remote/project' } })
    expect(terminalBelongsToProject(t, '/remote/project', 'node-A')).toBe(false)
  })

  it('treats an undefined nodeId as gateway', () => {
    const t = baseTerminal({ projectRoot: '/home/me/project', metadata: { cwd: '/home/me/project' } })
    expect(terminalBelongsToProject(t, '/home/me/project', undefined)).toBe(true)
    expect(terminalBelongsToProject(t, '/home/me/project', 'gateway')).toBe(true)
  })

  it('normalizes backslash paths and case-insensitively compares roots', () => {
    const t = baseTerminal({ projectRoot: 'C:\\Projects\\App', metadata: { cwd: 'C:\\Projects\\App' } })
    expect(terminalBelongsToProject(t, 'c:/projects/app', 'gateway')).toBe(true)
  })

  it('rejects terminals without a projectRoot', () => {
    expect(terminalBelongsToProject(baseTerminal({ projectRoot: null as unknown as string }), '/any', 'gateway')).toBe(false)
  })
})
