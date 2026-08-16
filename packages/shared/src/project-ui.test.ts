import { describe, expect, it } from 'vitest'

import { mergeSavedProjectLayout, resolveProjectPanelOpen } from './project-ui'

describe('resolveProjectPanelOpen', () => {
  it('preserves a project whose editor panel was closed', () => {
    expect(resolveProjectPanelOpen(undefined, { open: false })).toBe(false)
  })

  it('preserves a project whose editor panel was open', () => {
    expect(resolveProjectPanelOpen(undefined, { open: true })).toBe(true)
  })

  it('does not open projects without a saved preference by default', () => {
    expect(resolveProjectPanelOpen(undefined, null)).toBe(false)
  })

  it('allows an explicit editor action to override the saved preference', () => {
    expect(resolveProjectPanelOpen(true, { open: false })).toBe(true)
    expect(resolveProjectPanelOpen(false, { open: true })).toBe(false)
  })
})

describe('mergeSavedProjectLayout', () => {
  it('preserves saved dimensions during visibility-only sync', () => {
    expect(mergeSavedProjectLayout(
      {
        tree: true,
        editor: true,
        panelSize: 720,
        treeSize: 260,
        terminalHeight: 360,
        terminalColumnWidth: 480,
      },
      { tree: false, editor: true },
    )).toEqual({
      tree: false,
      editor: true,
      panelSize: 720,
      treeSize: 260,
      terminalHeight: 360,
      terminalColumnWidth: 480,
    })
  })

  it('clears the layout only for an explicit null update', () => {
    const existing = { tree: true, editor: true }
    expect(mergeSavedProjectLayout(existing, undefined)).toEqual(existing)
    expect(mergeSavedProjectLayout(existing, null)).toBeNull()
  })
})
