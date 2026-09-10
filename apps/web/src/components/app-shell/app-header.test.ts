import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('AppHeader manager model control', () => {
  it('does not show the provider/model selector in the header', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./app-header.tsx', import.meta.url)),
      'utf8',
    )

    expect(source).not.toContain('<ProviderModelSelector')
    expect(source).not.toContain('ProviderModelSelector')
  })

  it('keeps the empty navigation area draggable in Tauri', () => {
    const headerSource = readFileSync(
      fileURLToPath(new URL('./app-header.tsx', import.meta.url)),
      'utf8',
    )
    const navSource = readFileSync(
      fileURLToPath(new URL('./progressive-nav.tsx', import.meta.url)),
      'utf8',
    )

    expect(headerSource).toContain("tauriDragRegion={desktopRuntime === 'tauri'}")
    expect(navSource).toContain('data-tauri-drag-region={tauriDragRegion || undefined}')
  })

  it('shows an avatar skeleton while authentication is loading', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./app-header.tsx', import.meta.url)),
      'utf8',
    )

    expect(source).toContain('isAuthLoading ? (')
    expect(source).toContain('aria-label="Loading account"')
    expect(source).toContain('animate-pulse rounded-full bg-muted')
  })
})
