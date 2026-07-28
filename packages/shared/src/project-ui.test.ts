import { describe, expect, it } from 'vitest'

import { resolveProjectPanelOpen } from './project-ui'

describe('resolveProjectPanelOpen', () => {
  it('preserves a project whose editor panel was closed', () => {
    expect(resolveProjectPanelOpen(undefined, { open: false })).toBe(false)
  })

  it('preserves a project whose editor panel was open', () => {
    expect(resolveProjectPanelOpen(undefined, { open: true })).toBe(true)
  })

  it('opens projects without a saved preference by default', () => {
    expect(resolveProjectPanelOpen(undefined, null)).toBe(true)
  })

  it('allows an explicit editor action to override the saved preference', () => {
    expect(resolveProjectPanelOpen(true, { open: false })).toBe(true)
    expect(resolveProjectPanelOpen(false, { open: true })).toBe(false)
  })
})
