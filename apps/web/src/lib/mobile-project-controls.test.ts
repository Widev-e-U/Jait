import { describe, expect, it } from 'vitest'
import {
  getMobileProjectActiveTarget,
  isMobileProjectTargetActive,
  resolveProjectPanelOpenAfterChatSelection,
  type MobileProjectControlState,
} from './mobile-project-controls'

describe('resolveProjectPanelOpenAfterChatSelection', () => {
  it('does NOT open the panel on desktop for a project that never had editor mode enabled (default-false)', () => {
    // A project with no saved editor-mode preference must not auto-open its panel.
    expect(
      resolveProjectPanelOpenAfterChatSelection({
        isMobile: false,
        focusChat: false,
        requestedOpen: false,
      }),
    ).toBe(false)
  })

  it('does NOT open the panel on desktop when focusChat is on and no preference saved', () => {
    expect(
      resolveProjectPanelOpenAfterChatSelection({
        isMobile: false,
        focusChat: true,
        requestedOpen: false,
      }),
    ).toBe(false)
  })

  it('honours requestedOpen=true (project had editor mode persisted) on desktop', () => {
    expect(
      resolveProjectPanelOpenAfterChatSelection({
        isMobile: false,
        focusChat: false,
        requestedOpen: true,
      }),
    ).toBe(true)
  })

  it('on mobile, focus-chat collapses the panel even when editor mode is persisted', () => {
    expect(
      resolveProjectPanelOpenAfterChatSelection({
        isMobile: true,
        focusChat: true,
        requestedOpen: true,
      }),
    ).toBe(false)
  })

  it('on mobile without focus-chat, honours the persisted editor-mode state', () => {
    expect(
      resolveProjectPanelOpenAfterChatSelection({
        isMobile: true,
        focusChat: false,
        requestedOpen: true,
      }),
    ).toBe(true)
    expect(
      resolveProjectPanelOpenAfterChatSelection({
        isMobile: true,
        focusChat: false,
        requestedOpen: false,
      }),
    ).toBe(false)
  })
})

describe('getMobileProjectActiveTarget / isMobileProjectTargetActive', () => {
  const base: MobileProjectControlState = {
    showProject: true,
    showTerminal: false,
    showProjectTree: true,
    showProjectEditor: false,
    treeTab: 'files',
  }

  it('returns editor when the editor panel is active', () => {
    expect(
      getMobileProjectActiveTarget({ ...base, showProjectEditor: true }),
    ).toBe('editor')
    expect(isMobileProjectTargetActive({ ...base, showProjectEditor: true }, 'editor')).toBe(true)
  })

  it('returns files tab when only the tree is shown', () => {
    expect(getMobileProjectActiveTarget(base)).toBe('files')
    expect(isMobileProjectTargetActive(base, 'git')).toBe(false)
  })

  it('returns null when the project panel is closed', () => {
    expect(getMobileProjectActiveTarget({ ...base, showProject: false })).toBeNull()
  })

  it('prioritises terminal over all other targets', () => {
    expect(
      getMobileProjectActiveTarget({
        ...base,
        showTerminal: true,
        showProjectEditor: true,
      }),
    ).toBe('terminal')
  })
})
