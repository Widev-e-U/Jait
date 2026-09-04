import { describe, expect, it } from 'vitest'
import { getNextDeveloperSidebarState } from './developer-sidebar'

describe('getNextDeveloperSidebarState', () => {
  it('opens the requested view when the sidebar is closed', () => {
    expect(getNextDeveloperSidebarState('projects', false, 'chats')).toEqual({
      open: true,
      view: 'chats',
    })
  })

  it('switches views without closing the sidebar', () => {
    expect(getNextDeveloperSidebarState('projects', true, 'chats')).toEqual({
      open: true,
      view: 'chats',
    })
  })

  it('closes the sidebar when its active view is selected again', () => {
    expect(getNextDeveloperSidebarState('chats', true, 'chats')).toEqual({
      open: false,
      view: 'chats',
    })
  })
})
