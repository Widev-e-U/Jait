import { describe, expect, it } from 'vitest'

import { getMobileProjectActiveTarget, isMobileProjectTargetActive, shouldRenderSessionSidebar } from './mobile-project-controls'

describe('mobile project controls', () => {
  it('returns the terminal target when terminal fullscreen is open', () => {
    expect(getMobileProjectActiveTarget({
      showProject: true,
      showTerminal: true,
      showProjectTree: true,
      showProjectEditor: false,
      treeTab: 'files',
    })).toBe('terminal')
  })

  it('returns null when no mobile project surface is open', () => {
    expect(getMobileProjectActiveTarget({
      showProject: false,
      showTerminal: false,
      showProjectTree: false,
      showProjectEditor: false,
      treeTab: 'files',
    })).toBe(null)
  })

  it('marks files active only when the project tree is open on the files tab', () => {
    expect(isMobileProjectTargetActive({
      showProject: true,
      showTerminal: false,
      showProjectTree: true,
      showProjectEditor: false,
      treeTab: 'files',
    }, 'files')).toBe(true)

    expect(isMobileProjectTargetActive({
      showProject: true,
      showTerminal: false,
      showProjectTree: true,
      showProjectEditor: false,
      treeTab: 'git',
    }, 'files')).toBe(false)
  })

  it('marks git active only when the changes tab is the visible tree panel', () => {
    expect(isMobileProjectTargetActive({
      showProject: true,
      showTerminal: false,
      showProjectTree: true,
      showProjectEditor: false,
      treeTab: 'git',
    }, 'git')).toBe(true)

    expect(isMobileProjectTargetActive({
      showProject: true,
      showTerminal: false,
      showProjectTree: false,
      showProjectEditor: true,
      treeTab: 'git',
    }, 'git')).toBe(false)
  })

  it('marks editor active only when the editor pane is visible', () => {
    expect(isMobileProjectTargetActive({
      showProject: true,
      showTerminal: false,
      showProjectTree: false,
      showProjectEditor: true,
      treeTab: 'files',
    }, 'editor')).toBe(true)
  })

  it('marks terminal active independently from project visibility', () => {
    expect(isMobileProjectTargetActive({
      showProject: true,
      showTerminal: true,
      showProjectTree: false,
      showProjectEditor: true,
      treeTab: 'files',
    }, 'terminal')).toBe(true)

    expect(isMobileProjectTargetActive({
      showProject: false,
      showTerminal: false,
      showProjectTree: false,
      showProjectEditor: false,
      treeTab: 'files',
    }, 'terminal')).toBe(false)
  })

  it('treats project targets as inactive while terminal fullscreen is open', () => {
    expect(isMobileProjectTargetActive({
      showProject: true,
      showTerminal: true,
      showProjectTree: true,
      showProjectEditor: false,
      treeTab: 'files',
    }, 'files')).toBe(false)
  })

  it('renders the session sidebar only when explicitly open', () => {
    expect(shouldRenderSessionSidebar(false)).toBe(false)
    expect(shouldRenderSessionSidebar(true)).toBe(true)
  })
})
