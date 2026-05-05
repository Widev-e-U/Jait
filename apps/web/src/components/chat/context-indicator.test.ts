import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('ContextIndicator', () => {
  it('keeps hook calls before the unavailable-usage return', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./context-indicator.tsx', import.meta.url)),
      'utf8',
    )

    const componentStart = source.indexOf('export function ContextIndicator')
    const unavailableReturn = source.indexOf('if (!usage || usage.limit <= 0) return null', componentStart)

    expect(componentStart).toBeGreaterThanOrEqual(0)
    expect(unavailableReturn).toBeGreaterThan(componentStart)
    expect(source.indexOf('useState(', componentStart)).toBeLessThan(unavailableReturn)
    expect(source.indexOf('useMemo(', componentStart)).toBeLessThan(unavailableReturn)
    expect(source.lastIndexOf('useMemo(', unavailableReturn)).toBeGreaterThan(componentStart)
  })
})
