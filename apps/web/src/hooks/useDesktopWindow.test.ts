import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const lifecycle = vi.hoisted(() => ({ effect: undefined as (() => void | (() => void)) | undefined }))
vi.mock('react', () => ({
  useState: (initial: unknown) => [initial, vi.fn()],
  useEffect: (effect: () => void | (() => void)) => { lifecycle.effect = effect },
}))
import { useDesktopWindow } from './useDesktopWindow'

function mount(desktop: unknown) {
  vi.stubGlobal('window', { jaitDesktop: desktop })
  useDesktopWindow()
  return lifecycle.effect!() as (() => void) | undefined
}

afterEach(() => { vi.unstubAllGlobals() })

describe('desktop window effect cleanup', () => {
  it('unmounts with the real Tauri shim without calling a Promise', async () => {
    const window = {
      __TAURI_INTERNALS__: { invoke: vi.fn(() => Promise.resolve(false)) },
    }
    const source = readFileSync('apps/desktop/src-tauri/guest-js/shim.js', 'utf8')
    vm.runInNewContext(source, { window, setTimeout, clearTimeout, console })
    const cleanup = mount((window as any).jaitDesktop)
    await Promise.resolve()
    expect(() => cleanup!()).not.toThrow()
    await Promise.resolve()
  })

  it('cleans up a listener resolved after unmount', async () => {
    let resolve!: (stop: () => void) => void
    const stop = vi.fn()
    const cleanup = mount({ onMaximizedChange: () => new Promise<() => void>(r => { resolve = r }) })
    cleanup!()
    resolve(stop)
    await Promise.resolve()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('cleans up an already resolved async listener', async () => {
    const stop = vi.fn()
    const cleanup = mount({ onMaximizedChange: () => Promise.resolve(stop) })
    await Promise.resolve()
    cleanup!()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('preserves synchronous listener cleanup', () => {
    const stop = vi.fn()
    const cleanup = mount({ onMaximizedChange: () => stop })
    cleanup!()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('does nothing outside the desktop shell', () => {
    expect(mount(undefined)).toBeUndefined()
  })
})
