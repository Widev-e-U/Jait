import { describe, expect, it } from 'vitest'

import { beginEditorSubpanelToggle, endEditorSubpanelToggle, getEditorSubpanelToggleIntent } from './editor-subpanels'

describe('editor subpanel toggle intent', () => {
  it('opens the editor and selects a persisted subpanel when the editor is hidden', () => {
    expect(getEditorSubpanelToggleIntent({ editorOpen: false, subpanelOpen: true })).toBe('open')
  })

  it('closes a visible subpanel without closing the editor', () => {
    expect(getEditorSubpanelToggleIntent({ editorOpen: true, subpanelOpen: true })).toBe('close')
  })

  it('opens a closed subpanel in the editor', () => {
    expect(getEditorSubpanelToggleIntent({ editorOpen: true, subpanelOpen: false })).toBe('open')
  })
})


describe('editor subpanel toggle guard', () => {
  it('coalesces repeated clicks while project activation is pending', () => {
    const guard = { current: false }

    expect(beginEditorSubpanelToggle(guard)).toBe(true)
    expect(beginEditorSubpanelToggle(guard)).toBe(false)

    endEditorSubpanelToggle(guard)
    expect(beginEditorSubpanelToggle(guard)).toBe(true)
  })
})
