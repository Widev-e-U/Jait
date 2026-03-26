import { describe, expect, it } from 'vitest'
import {
  collapseMobileWorkspace,
  restoreWorkspaceLayout,
  showMobileWorkspacePane,
  toggleMobileWorkspacePane,
} from './mobile-workspace-layout'

describe('mobile workspace layout', () => {
  it('collapses both mobile panes by default', () => {
    expect(collapseMobileWorkspace()).toEqual({ tree: false, editor: false })
  })

  it('restores saved layout collapsed on mobile', () => {
    expect(restoreWorkspaceLayout({ tree: false, editor: true }, true)).toEqual({ tree: false, editor: false })
    expect(restoreWorkspaceLayout({ tree: true, editor: true }, true)).toEqual({ tree: false, editor: false })
  })

  it('restores saved layout as-is on desktop', () => {
    expect(restoreWorkspaceLayout({ tree: false, editor: true }, false)).toEqual({ tree: false, editor: true })
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
})
