import { describe, expect, it } from 'vitest'

import { normalizeHydratedProjectLayout } from '@/lib/mobile-project-layout'
import { mergeProjectLayout } from '@/lib/project-ui-state'

describe('mergeProjectLayout', () => {
  it('preserves persisted panelSize/treeSize when only visibility changes', () => {
    const existing = { tree: true, editor: true, panelSize: 720, treeSize: 260 }

    expect(mergeProjectLayout(existing, { tree: false, editor: true })).toEqual({
      tree: false,
      editor: true,
      panelSize: 720,
      treeSize: 260,
    })
    expect(mergeProjectLayout(existing, { tree: true, editor: false })).toEqual({
      tree: true,
      editor: false,
      panelSize: 720,
      treeSize: 260,
    })
  })

  it('preserves terminal dimensions when editor visibility changes', () => {
    const existing = {
      tree: true,
      editor: true,
      panelSize: 720,
      treeSize: 260,
      terminalHeight: 420,
      terminalColumnWidth: 520,
    }

    expect(mergeProjectLayout(existing, { tree: false, editor: true })).toEqual({
      tree: false,
      editor: true,
      panelSize: 720,
      treeSize: 260,
      terminalHeight: 420,
      terminalColumnWidth: 520,
    })
  })

  it('preserves tree/editor visibility when only sizes change', () => {
    const existing = { tree: false, editor: true, panelSize: 720, treeSize: 260 }

    expect(mergeProjectLayout(existing, { panelSize: 800, treeSize: 300 })).toEqual({
      tree: false,
      editor: true,
      panelSize: 800,
      treeSize: 300,
    })
  })

  it('defaults to both panes visible when there is no saved layout', () => {
    expect(mergeProjectLayout(null, { tree: true, editor: true })).toEqual({
      tree: true,
      editor: true,
    })
  })

  it('keeps a fully collapsed layout collapsed when only sizes change', () => {
    const existing = { tree: false, editor: false, panelSize: 500, treeSize: 240 }

    expect(mergeProjectLayout(existing, { panelSize: 640 })).toEqual({
      tree: false,
      editor: false,
      panelSize: 640,
      treeSize: 240,
    })
  })

  it('keeps projects isolated — merging one project layout never touches another', () => {
    const projectA = mergeProjectLayout(null, { tree: true, editor: true, panelSize: 720, treeSize: 260 })
    const projectB = mergeProjectLayout(null, { tree: false, editor: false, panelSize: 500, treeSize: 240 })

    expect(projectA).toEqual({ tree: true, editor: true, panelSize: 720, treeSize: 260 })
    expect(projectB).toEqual({ tree: false, editor: false, panelSize: 500, treeSize: 240 })

    // A later visibility toggle on A must not affect B's sizes.
    const projectAAfterToggle = mergeProjectLayout(projectA, { tree: false, editor: true })
    expect(projectAAfterToggle).toEqual({ tree: false, editor: true, panelSize: 720, treeSize: 260 })
    expect(projectB).toEqual({ tree: false, editor: false, panelSize: 500, treeSize: 240 })
  })

  it('does not clobber sizes with undefined when saving a visibility-only layout', () => {
    const existing = { tree: true, editor: true, panelSize: 720, treeSize: 260 }
    const merged = mergeProjectLayout(existing, { tree: true, editor: true })

    // JSON round-trip (what the persistence layer actually stores) keeps sizes.
    expect(JSON.parse(JSON.stringify(merged))).toEqual({
      tree: true,
      editor: true,
      panelSize: 720,
      treeSize: 260,
    })
  })

  it('defaults visibility to both panes open for a size-only update on a fresh project', () => {
    // A project with no saved layout that gets its first drag-end size report
    // must not be forced collapsed or forced to a single pane.
    expect(mergeProjectLayout(null, { panelSize: 800, treeSize: 300 })).toEqual({
      tree: true,
      editor: true,
      panelSize: 800,
      treeSize: 300,
    })
  })

  it('keeps an explicit fully-collapsed layout collapsed on a fresh project', () => {
    expect(mergeProjectLayout(null, { tree: false, editor: false })).toEqual({
      tree: false,
      editor: false,
    })
  })

  it('is a no-op identity merge for an empty update', () => {
    const existing = { tree: false, editor: true, panelSize: 720, treeSize: 260 }
    expect(mergeProjectLayout(existing, {})).toEqual(existing)
  })

  it('preserves a zero panelSize instead of falling back to the existing value', () => {
    // `??` (nullish) must not treat 0 as missing — a persisted 0 would be
    // meaningful even though the drag hook never reports one.
    const existing = { tree: true, editor: true, panelSize: 720, treeSize: 260 }
    expect(mergeProjectLayout(existing, { panelSize: 0 })).toEqual({
      tree: true,
      editor: true,
      panelSize: 0,
      treeSize: 260,
    })
  })

  it('never leaks undefined keys into the JSON-persisted object', () => {
    // Visibility-only save on a project that never had sizes persisted.
    const merged = mergeProjectLayout({ tree: true, editor: true }, { tree: false, editor: true })
    const roundTripped = JSON.parse(JSON.stringify(merged))
    expect(roundTripped).toEqual({ tree: false, editor: true })
    expect(Object.keys(roundTripped).sort()).toEqual(['editor', 'tree'])
  })

  it('simulates a full project-switch cycle without cross-project leakage', () => {
    // Mirrors the App.tsx flow: reset to defaults on switch, then apply the
    // new project's saved layout, then merge any visibility save with the
    // persisted sizes. Uses the real helpers so a regression in either one
    // fails this test.
    const switchTo = (savedLayout: { tree: boolean; editor: boolean; panelSize?: number; treeSize?: number } | null) => {
      // 1. Reset effect: defaults (tree + editor both visible).
      let showTree = true
      let showEditor = true
      // 2. applyProjectUI: hydrate the new project's saved layout.
      if (savedLayout) {
        const hydrated = normalizeHydratedProjectLayout(
          { tree: savedLayout.tree !== false, editor: savedLayout.editor !== false },
          false,
        )
        showTree = hydrated.tree
        showEditor = hydrated.editor
      }
      // 3. Visibility-save effect: merge with persisted sizes.
      const persisted = mergeProjectLayout(savedLayout, { tree: showTree, editor: showEditor })
      return { showTree, showEditor, persisted }
    }

    // Project A: tree hidden, editor visible, wide panel.
    const a = switchTo({ tree: false, editor: true, panelSize: 720, treeSize: 260 })
    expect(a.showTree).toBe(false)
    expect(a.showEditor).toBe(true)
    expect(a.persisted).toEqual({ tree: false, editor: true, panelSize: 720, treeSize: 260 })

    // Project B: fully collapsed, narrow panel.
    const b = switchTo({ tree: false, editor: false, panelSize: 500, treeSize: 240 })
    expect(b.showTree).toBe(false)
    expect(b.showEditor).toBe(false)
    expect(b.persisted).toEqual({ tree: false, editor: false, panelSize: 500, treeSize: 240 })

    // Project C: no saved layout — defaults to both visible, nothing forced.
    const c = switchTo(null)
    expect(c.showTree).toBe(true)
    expect(c.showEditor).toBe(true)
    expect(c.persisted).toEqual({ tree: true, editor: true })

    // Switching back to A restores A's own layout, not B's or C's.
    const aAgain = switchTo({ tree: false, editor: true, panelSize: 720, treeSize: 260 })
    expect(aAgain.showTree).toBe(false)
    expect(aAgain.showEditor).toBe(true)
    expect(aAgain.persisted).toEqual({ tree: false, editor: true, panelSize: 720, treeSize: 260 })
  })
})
