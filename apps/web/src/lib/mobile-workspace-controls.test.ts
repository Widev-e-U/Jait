import { describe, expect, it } from 'vitest'

import { getMobileWorkspaceActiveTarget, isMobileWorkspaceTargetActive } from './mobile-workspace-controls'

describe('mobile workspace controls', () => {
  it('returns the terminal target when terminal fullscreen is open', () => {
    expect(getMobileWorkspaceActiveTarget({
      showWorkspace: true,
      showTerminal: true,
      showWorkspaceTree: true,
      showWorkspaceEditor: false,
      treeTab: 'files',
    })).toBe('terminal')
  })

  it('returns null when no mobile workspace surface is open', () => {
    expect(getMobileWorkspaceActiveTarget({
      showWorkspace: false,
      showTerminal: false,
      showWorkspaceTree: false,
      showWorkspaceEditor: false,
      treeTab: 'files',
    })).toBe(null)
  })

  it('marks files active only when the workspace tree is open on the files tab', () => {
    expect(isMobileWorkspaceTargetActive({
      showWorkspace: true,
      showTerminal: false,
      showWorkspaceTree: true,
      showWorkspaceEditor: false,
      treeTab: 'files',
    }, 'files')).toBe(true)

    expect(isMobileWorkspaceTargetActive({
      showWorkspace: true,
      showTerminal: false,
      showWorkspaceTree: true,
      showWorkspaceEditor: false,
      treeTab: 'git',
    }, 'files')).toBe(false)
  })

  it('marks git active only when the changes tab is the visible tree panel', () => {
    expect(isMobileWorkspaceTargetActive({
      showWorkspace: true,
      showTerminal: false,
      showWorkspaceTree: true,
      showWorkspaceEditor: false,
      treeTab: 'git',
    }, 'git')).toBe(true)

    expect(isMobileWorkspaceTargetActive({
      showWorkspace: true,
      showTerminal: false,
      showWorkspaceTree: false,
      showWorkspaceEditor: true,
      treeTab: 'git',
    }, 'git')).toBe(false)
  })

  it('marks editor active only when the editor pane is visible', () => {
    expect(isMobileWorkspaceTargetActive({
      showWorkspace: true,
      showTerminal: false,
      showWorkspaceTree: false,
      showWorkspaceEditor: true,
      treeTab: 'files',
    }, 'editor')).toBe(true)
  })

  it('marks terminal active independently from workspace visibility', () => {
    expect(isMobileWorkspaceTargetActive({
      showWorkspace: true,
      showTerminal: true,
      showWorkspaceTree: false,
      showWorkspaceEditor: true,
      treeTab: 'files',
    }, 'terminal')).toBe(true)

    expect(isMobileWorkspaceTargetActive({
      showWorkspace: false,
      showTerminal: false,
      showWorkspaceTree: false,
      showWorkspaceEditor: false,
      treeTab: 'files',
    }, 'terminal')).toBe(false)
  })

  it('treats workspace targets as inactive while terminal fullscreen is open', () => {
    expect(isMobileWorkspaceTargetActive({
      showWorkspace: true,
      showTerminal: true,
      showWorkspaceTree: true,
      showWorkspaceEditor: false,
      treeTab: 'files',
    }, 'files')).toBe(false)
  })
})
