import { describe, expect, it, vi } from 'vitest'

import { copyTextToClipboard } from './clipboard'

function createWindow(options?: { clipboardSucceeds?: boolean; fallbackSucceeds?: boolean }) {
  const textarea = {
    value: '',
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    focus: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
  }
  const writeText = options?.clipboardSucceeds === false
    ? vi.fn().mockRejectedValue(new Error('clipboard permission denied'))
    : vi.fn().mockResolvedValue(undefined)
  const execCommand = vi.fn().mockReturnValue(options?.fallbackSucceeds ?? false)
  const targetWindow = {
    navigator: { clipboard: { writeText } },
    document: {
      body: { appendChild: vi.fn() },
      createElement: vi.fn().mockReturnValue(textarea),
      execCommand,
    },
    focus: vi.fn(),
  } as unknown as Window

  return { targetWindow, textarea, writeText, execCommand }
}

describe('copyTextToClipboard', () => {
  it('uses the browser clipboard when permission is available', async () => {
    const { targetWindow, writeText, execCommand } = createWindow({ clipboardSucceeds: true })

    await expect(copyTextToClipboard('8K2R-X4D9', targetWindow)).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('8K2R-X4D9')
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('copies through the focused login window when clipboard permission is denied', async () => {
    const { targetWindow, textarea, execCommand } = createWindow({
      clipboardSucceeds: false,
      fallbackSucceeds: true,
    })

    await expect(copyTextToClipboard('8K2R-X4D9', targetWindow)).resolves.toBe(true)
    expect(textarea.value).toBe('8K2R-X4D9')
    expect(textarea.focus).toHaveBeenCalled()
    expect(textarea.select).toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(textarea.remove).toHaveBeenCalled()
  })
})
