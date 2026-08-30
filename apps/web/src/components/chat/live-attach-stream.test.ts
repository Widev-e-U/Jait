import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Regression guard: while a terminal tool call is RUNNING with the card
// expanded (no result yet, streaming), the expanded body must embed the real
// attached terminal view (the partial console), not a plain <pre> dump. It
// broke before (the attach used to depend on a result-derived terminal id /
// offsets), so pin the enable gate at the source level too.
const source = readFileSync(
  fileURLToPath(new URL('./tool-call-card.tsx', import.meta.url)),
  'utf8',
)

describe('streaming expanded terminal card keeps the live partial console', () => {
  it('keeps the terminal surface enabled while the call runs or is expanded', () => {
    expect(source).toMatch(
      /enabled:\s*isPersistentTerminal && \(effectiveOpen \|\| isBackgroundCall \|\| call\.status === 'running' \|\| call\.status === 'pending'\)/,
    )
  })

  it('does not gate the running-card attach on a result-only output offset', () => {
    const surfaceBlock = source.slice(
      source.indexOf('const terminalSurfaceState = useToolTerminalSurface'),
      source.indexOf('const toolTerminal = terminalSurfaceState.terminal'),
    )
    expect(surfaceBlock).not.toContain('getStructuredTerminalOutputOffset')
    // The pushed live binding is what makes the attach instant — keep it wired.
    expect(source).toContain('findLiveToolTerminal')
  })
})