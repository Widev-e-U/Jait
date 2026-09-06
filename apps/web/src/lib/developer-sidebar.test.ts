import { describe, expect, it } from 'vitest'
import { clampDeveloperSidebarWidth, getNextDeveloperSidebarState } from './developer-sidebar'

describe('getNextDeveloperSidebarState', () => {
  it('opens the requested view when the sidebar is closed', () => {
    expect(getNextDeveloperSidebarState('projects', false, 'files')).toEqual({
      open: true,
      view: 'files',
    })
  })

  it('switches views without closing the sidebar', () => {
    expect(getNextDeveloperSidebarState('projects', true, 'files')).toEqual({
      open: true,
      view: 'files',
    })
  })

  it('closes the sidebar when its active view is selected again', () => {
    expect(getNextDeveloperSidebarState('files', true, 'files')).toEqual({
      open: false,
      view: 'files',
    })
  })
})

describe('clampDeveloperSidebarWidth', () => {
  it('keeps the sidebar within its desktop width range', () => {
    expect(clampDeveloperSidebarWidth(180, 1440)).toBe(220)
    expect(clampDeveloperSidebarWidth(320, 1440)).toBe(320)
    expect(clampDeveloperSidebarWidth(560, 1440)).toBe(480)
  })

  it('leaves room for the workspace on narrower screens', () => {
    expect(clampDeveloperSidebarWidth(480, 820)).toBe(340)
  })
})
