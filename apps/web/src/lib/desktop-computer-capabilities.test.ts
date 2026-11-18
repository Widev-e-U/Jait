import { describe, expect, it, vi } from 'vitest'
import { desktopComputerControlAvailable, desktopScreenShareControlAvailable } from './desktop-computer-capabilities'

describe('desktop computer control capabilities', () => {
  it('requires a Windows host that implements both input and observation', async () => {
    const toolOp = vi.fn().mockResolvedValue({ ok: true, data: { input: true, observe: true } })
    expect(await desktopComputerControlAvailable({ nativePlatform: 'win32', toolOp })).toBe(true)
    expect(await desktopComputerControlAvailable({ nativePlatform: 'linux', toolOp })).toBe(false)
    toolOp.mockResolvedValueOnce({ ok: true, data: { input: true } })
    expect(await desktopComputerControlAvailable({ nativePlatform: 'windows', toolOp })).toBe(false)
  })
  it('requires explicit capture and clipboard support for interactive shares', async () => {
    const toolOp = vi.fn().mockResolvedValue({ ok: true, data: { input: true, observe: true } })
    expect(await desktopScreenShareControlAvailable({ nativePlatform: 'win32', toolOp })).toBe(false)
    toolOp.mockResolvedValueOnce({ ok: true, data: { input: true, observe: true, shareControl: true } })
    expect(await desktopScreenShareControlAvailable({ nativePlatform: 'win32', toolOp })).toBe(true)
  })
  it('fails closed for old hosts and unsupported operations', async () => {
    expect(await desktopComputerControlAvailable(undefined)).toBe(false)
    expect(await desktopComputerControlAvailable({ nativePlatform: 'win32', toolOp: async () => { throw new Error('unsupported') } })).toBe(false)
  })
})
