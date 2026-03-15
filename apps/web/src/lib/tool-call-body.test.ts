import { describe, expect, it } from 'vitest'
import { canRenderEditDiff, getToolCallBodyKind } from './tool-call-body'

describe('tool call body helpers', () => {
  it('does not force a diff view for codex edit calls that only provide a path', () => {
    expect(canRenderEditDiff('edit', { path: 'apps/web/src/App.tsx' })).toBe(false)
    expect(
      getToolCallBodyKind({
        tool: 'edit',
        args: { path: 'apps/web/src/App.tsx' },
        status: 'success',
        displayOutput: '',
        snapshotText: null,
        screenshotPath: null,
      }),
    ).toBe('none')
  })

  it('keeps web calls without output as compact rows instead of empty expanders', () => {
    expect(
      getToolCallBodyKind({
        tool: 'web',
        args: { query: 'openai codex' },
        status: 'success',
        displayOutput: '',
        snapshotText: null,
        screenshotPath: null,
      }),
    ).toBe('none')
  })

  it('renders an edit diff when replacement details are present', () => {
    expect(canRenderEditDiff('edit', { path: 'a.ts', search: 'a', replace: 'b' })).toBe(true)
    expect(
      getToolCallBodyKind({
        tool: 'edit',
        args: { path: 'a.ts', search: 'a', replace: 'b' },
        status: 'success',
        displayOutput: '',
        snapshotText: null,
        screenshotPath: null,
      }),
    ).toBe('editDiff')
  })
})
