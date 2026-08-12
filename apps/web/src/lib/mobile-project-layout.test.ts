import { describe, expect, it } from 'vitest'
import {
  collapseMobileProject,
  getReopenedMobileProjectLayout,
  normalizeHydratedProjectLayout,
  showMobileProjectPane,
  toggleMobileProjectPane,
} from './mobile-project-layout'

describe('mobile project layout', () => {
  it('collapses both mobile panes by default', () => {
    expect(collapseMobileProject()).toEqual({ tree: false, editor: false })
  })

  it('shows one pane at a time', () => {
    expect(showMobileProjectPane('tree')).toEqual({ tree: true, editor: false })
    expect(showMobileProjectPane('editor')).toEqual({ tree: false, editor: true })
  })

  it('reopens the editor pane directly when the user explicitly requested editor mode', () => {
    expect(getReopenedMobileProjectLayout('editor')).toEqual({ tree: false, editor: true })
    expect(getReopenedMobileProjectLayout()).toEqual({ tree: false, editor: false })
  })

  it('toggles the active pane closed', () => {
    expect(toggleMobileProjectPane({ tree: true, editor: false }, 'tree')).toEqual({ tree: false, editor: false })
    expect(toggleMobileProjectPane({ tree: false, editor: true }, 'editor')).toEqual({ tree: false, editor: false })
  })

  it('switches between panes when the other one is active', () => {
    expect(toggleMobileProjectPane({ tree: false, editor: true }, 'tree')).toEqual({ tree: true, editor: false })
    expect(toggleMobileProjectPane({ tree: true, editor: false }, 'editor')).toEqual({ tree: false, editor: true })
  })

  it('normalizes a dual-open layout into a single active pane', () => {
    expect(toggleMobileProjectPane({ tree: true, editor: true }, 'tree')).toEqual({ tree: true, editor: false })
    expect(toggleMobileProjectPane({ tree: true, editor: true }, 'editor')).toEqual({ tree: false, editor: true })
  })

  it('preserves hydrated mobile editor state without opening both panes', () => {
    expect(normalizeHydratedProjectLayout({ tree: false, editor: true }, true)).toEqual({ tree: false, editor: true })
    expect(normalizeHydratedProjectLayout({ tree: true, editor: true }, true)).toEqual({ tree: true, editor: false })
  })

  it('keeps hydrated editor state on desktop', () => {
    expect(normalizeHydratedProjectLayout({ tree: false, editor: true }, false)).toEqual({ tree: false, editor: true })
  })

  it('preserves a fully collapsed desktop layout (explicit user choice)', () => {
    // A saved { tree: false, editor: false } layout is an explicit choice to
    // collapse everything — it must stay collapsed, never force the editor open.
    expect(normalizeHydratedProjectLayout({ tree: false, editor: false }, false)).toEqual({ tree: false, editor: false })
  })

  it('restores each project from its own saved layout without leaking', () => {
    // Project A: tree hidden, editor visible.
    expect(normalizeHydratedProjectLayout({ tree: false, editor: true }, false)).toEqual({ tree: false, editor: true })
    // Project B: everything collapsed.
    expect(normalizeHydratedProjectLayout({ tree: false, editor: false }, false)).toEqual({ tree: false, editor: false })
    // Project C: both visible.
    expect(normalizeHydratedProjectLayout({ tree: true, editor: true }, false)).toEqual({ tree: true, editor: true })
  })
})
