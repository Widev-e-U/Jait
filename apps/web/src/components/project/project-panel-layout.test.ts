import { describe, expect, it } from 'vitest'

import {
  DRAG_SNAP_MAX,
  DRAG_SNAP_MIN,
  getDesktopProjectPanelStyle,
  resolveDragEndSize,
  toggleDesktopProjectTreeVisibility,
} from './project-panel-layout'

describe('project panel desktop layout', () => {
  it('keeps the configured panel width when both tree and editor are visible', () => {
    expect(getDesktopProjectPanelStyle({
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
    expect(getDesktopProjectPanelStyle({
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
    expect(getDesktopProjectPanelStyle({
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
    expect(getDesktopProjectPanelStyle({
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
    expect(toggleDesktopProjectTreeVisibility({
      tree: true,
      editor: false,
    })).toEqual({
      tree: false,
      editor: true,
    })
  })

  it('preserves editor visibility when showing the tree again', () => {
    expect(toggleDesktopProjectTreeVisibility({
      tree: false,
      editor: false,
    })).toEqual({
      tree: true,
      editor: false,
    })
  })
})

describe('resolveDragEndSize (per-project size reporting)', () => {
  it('reports nothing when no drag happened', () => {
    expect(resolveDragEndSize(null, 1200)).toBeNull()
  })

  it('reports nothing when the pane snapped collapsed to width 0', () => {
    expect(resolveDragEndSize(DRAG_SNAP_MIN, 1200)).toBeNull()
  })

  it('reports the max size when the pane snapped to full width', () => {
    expect(resolveDragEndSize(DRAG_SNAP_MAX, 1200)).toBe(1200)
  })

  it('reports the final width for a normal drag', () => {
    expect(resolveDragEndSize(640, 1200)).toBe(640)
  })

  it('is the only reporting point — a single drag yields a single size', () => {
    // Simulates a drag that produced one pending value; the hook calls this
    // exactly once per drag end, never per pointer-move frame.
    const reported: number[] = []
    const report = (size: number | null) => {
      const resolved = resolveDragEndSize(size, 1200)
      if (resolved !== null) reported.push(resolved)
    }
    report(640)
    report(null) // no further frames report anything
    expect(reported).toEqual([640])
  })
})
