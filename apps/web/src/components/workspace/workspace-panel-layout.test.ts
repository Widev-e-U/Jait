import { describe, expect, it } from 'vitest'

import { getDesktopWorkspacePanelStyle, toggleDesktopWorkspaceTreeVisibility } from './workspace-panel-layout'

describe('workspace panel desktop layout', () => {
  it('keeps the configured panel width when both tree and editor are visible', () => {
    expect(getDesktopWorkspacePanelStyle({
      showTree: true,
      showEditor: true,
      panelSize: 720,
      treeSize: 260,
    })).toEqual({
      width: 720,
      maxWidth: '70vw',
    })
  })

  it('uses the remaining editor width when the tree is hidden', () => {
    expect(getDesktopWorkspacePanelStyle({
      showTree: false,
      showEditor: true,
      panelSize: 720,
      treeSize: 260,
    })).toEqual({
      width: 460,
      maxWidth: '70vw',
    })
  })

  it('shrinks to the tree width when the editor is hidden', () => {
    expect(getDesktopWorkspacePanelStyle({
      showTree: true,
      showEditor: false,
      panelSize: 720,
      treeSize: 260,
    })).toEqual({
      width: 260,
      maxWidth: '70vw',
    })
  })

  it('preserves the in-flow panel width for maximized tabs', () => {
    expect(getDesktopWorkspacePanelStyle({
      showTree: true,
      showEditor: true,
      panelSize: 640,
      treeSize: 240,
    })).toEqual({
      width: 640,
      maxWidth: '70vw',
    })
  })

  it('shows the editor when hiding the tree would otherwise leave no visible panes', () => {
    expect(toggleDesktopWorkspaceTreeVisibility({
      tree: true,
      editor: false,
    })).toEqual({
      tree: false,
      editor: true,
    })
  })

  it('preserves editor visibility when showing the tree again', () => {
    expect(toggleDesktopWorkspaceTreeVisibility({
      tree: false,
      editor: false,
    })).toEqual({
      tree: true,
      editor: false,
    })
  })
})
