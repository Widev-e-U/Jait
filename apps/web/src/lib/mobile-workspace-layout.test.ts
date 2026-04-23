import { describe, expect, it } from 'vitest'
import {
  collapseMobileWorkspace,
  normalizeHydratedWorkspaceLayout,
  showMobileWorkspacePane,
  toggleMobileWorkspacePane,
} from './mobile-workspace-layout'

describe('mobile workspace layout', () => {
  it('collapses both mobile panes by default', () => {
    expect(collapseMobileWorkspace()).toEqual({ tree: false, editor: false })
  })

  it('shows one pane at a time', () => {
    expect(showMobileWorkspacePane('tree')).toEqual({ tree: true, editor: false })
    expect(showMobileWorkspacePane('editor')).toEqual({ tree: false, editor: true })
  })

  it('toggles the active pane closed', () => {
    expect(toggleMobileWorkspacePane({ tree: true, editor: false }, 'tree')).toEqual({ tree: false, editor: false })
    expect(toggleMobileWorkspacePane({ tree: false, editor: true }, 'editor')).toEqual({ tree: false, editor: false })
  })

  it('switches between panes when the other one is active', () => {
    expect(toggleMobileWorkspacePane({ tree: false, editor: true }, 'tree')).toEqual({ tree: true, editor: false })
    expect(toggleMobileWorkspacePane({ tree: true, editor: false }, 'editor')).toEqual({ tree: false, editor: true })
  })

  it('normalizes a dual-open layout into a single active pane', () => {
    expect(toggleMobileWorkspacePane({ tree: true, editor: true }, 'tree')).toEqual({ tree: true, editor: false })
    expect(toggleMobileWorkspacePane({ tree: true, editor: true }, 'editor')).toEqual({ tree: false, editor: true })
  })

  it('prevents hydrated mobile state from reopening the editor', () => {
    expect(normalizeHydratedWorkspaceLayout({ tree: false, editor: true }, true)).toEqual({ tree: false, editor: false })
    expect(normalizeHydratedWorkspaceLayout({ tree: true, editor: true }, true)).toEqual({ tree: true, editor: false })
  })

  it('keeps hydrated editor state on desktop', () => {
    expect(normalizeHydratedWorkspaceLayout({ tree: false, editor: true }, false)).toEqual({ tree: false, editor: true })
  })
})
