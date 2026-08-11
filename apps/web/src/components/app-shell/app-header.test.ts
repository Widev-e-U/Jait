import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('AppHeader manager model control', () => {
  it('shows the shared model selector in the header for manager mode', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./app-header.tsx', import.meta.url)),
      'utf8',
    )

    expect(source).toContain("viewMode === 'manager'")
    expect(source).toContain('<CliModelSelector')
    expect(source).toContain('model={cliModel}')
    expect(source).toContain('onChange={onCliModelChange}')
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
