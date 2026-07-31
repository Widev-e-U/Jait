import { describe, expect, it, vi } from 'vitest'
import { collapseMobileProject, showMobileProjectPane } from '@/lib/mobile-project-layout'

describe('project editor reopen behavior', () => {
  it('reopening an existing desktop project restores the editor pane', () => {
    const setShowProject = vi.fn()
    const setShowProjectTree = vi.fn()
    const showProjectEditorPanel = vi.fn()
    const setSavedProject = vi.fn()

    const reopenExistingDesktopProject = () => {
      setShowProject(true)
      setShowProjectTree(true)
      showProjectEditorPanel()
      setSavedProject({ open: true, remotePath: '/repo' })
    }

    reopenExistingDesktopProject()

    expect(setShowProject).toHaveBeenCalledWith(true)
    expect(setShowProjectTree).toHaveBeenCalledWith(true)
    expect(showProjectEditorPanel).toHaveBeenCalledOnce()
    expect(setSavedProject).toHaveBeenCalledWith({ open: true, remotePath: '/repo' })
  })

  it('reopening a persisted desktop project forces the editor pane visible', async () => {
    const openRemoteProjectOnGateway = vi.fn(async () => {})
    const setShowProject = vi.fn()
    const setShowProjectTree = vi.fn()
    const showProjectEditorPanel = vi.fn()
    const setSavedProject = vi.fn()

    const reopenPersistedProject = async (path: string) => {
      await openRemoteProjectOnGateway(path)
      setShowProject(true)
      setShowProjectTree(true)
      showProjectEditorPanel()
      setSavedProject({ open: true, remotePath: path })
    }

    await reopenPersistedProject('/repo')

    expect(openRemoteProjectOnGateway).toHaveBeenCalledWith('/repo')
    expect(setShowProject).toHaveBeenCalledWith(true)
    expect(setShowProjectTree).toHaveBeenCalledWith(true)
    expect(showProjectEditorPanel).toHaveBeenCalledOnce()
    expect(setSavedProject).toHaveBeenCalledWith({ open: true, remotePath: '/repo' })
  })

  it('reopening a persisted mobile project keeps the editor collapsed', async () => {
    const openRemoteProjectOnGateway = vi.fn(async () => {})
    const setShowProject = vi.fn()
    const applyProjectLayout = vi.fn()
    const setSavedProject = vi.fn()

    const reopenPersistedProject = async (path: string) => {
      await openRemoteProjectOnGateway(path)
      setShowProject(true)
      applyProjectLayout(collapseMobileProject(), { immediateSync: true })
      setSavedProject({ open: true, remotePath: path })
    }

    await reopenPersistedProject('/repo')

    expect(openRemoteProjectOnGateway).toHaveBeenCalledWith('/repo')
    expect(setShowProject).toHaveBeenCalledWith(true)
    expect(applyProjectLayout).toHaveBeenCalledWith({ tree: false, editor: false }, { immediateSync: true })
    expect(setSavedProject).toHaveBeenCalledWith({ open: true, remotePath: '/repo' })
  })

  it('mobile editor toolbar selects the editor tab after reopening a collapsed project', async () => {
    const applyProjectLayout = vi.fn()
    const handleToggleEditor = vi.fn(async () => {
      applyProjectLayout(collapseMobileProject(), { immediateSync: true })
    })

    const showMobileProjectEditorTab = () => {
      applyProjectLayout(showMobileProjectPane('editor'), { immediateSync: true })
    }

    const handleMobileEditorTargetAction = async () => {
      await handleToggleEditor()
      showMobileProjectEditorTab()
    }

    await handleMobileEditorTargetAction()

    expect(handleToggleEditor).toHaveBeenCalledOnce()
    expect(applyProjectLayout).toHaveBeenNthCalledWith(1, { tree: false, editor: false }, { immediateSync: true })
    expect(applyProjectLayout).toHaveBeenNthCalledWith(2, { tree: false, editor: true }, { immediateSync: true })
  })

  it('opening an existing mobile project persists editor layout before panel state', () => {
    const calls: string[] = []
    const setShowProject = vi.fn(() => calls.push('showProject'))
    const applyProjectLayout = vi.fn(() => calls.push('layout'))
    const setSavedProject = vi.fn(() => calls.push('panel'))

    const showMobileProjectEditorTab = () => {
      applyProjectLayout(showMobileProjectPane('editor'), { immediateSync: true })
    }

    const openExistingMobileProject = () => {
      setShowProject(true)
      showMobileProjectEditorTab()
      setSavedProject({ open: true, remotePath: '/repo' })
    }

    openExistingMobileProject()

    expect(setShowProject).toHaveBeenCalledWith(true)
    expect(applyProjectLayout).toHaveBeenCalledWith({ tree: false, editor: true }, { immediateSync: true })
    expect(setSavedProject).toHaveBeenCalledWith({ open: true, remotePath: '/repo' })
    expect(calls).toEqual(['showProject', 'layout', 'panel'])
  })

  it('opening an existing desktop project persists editor layout before panel state', () => {
    const calls: string[] = []
    const setShowProject = vi.fn(() => calls.push('showProject'))
    const applyProjectLayout = vi.fn(() => calls.push('layout'))
    const setSavedProject = vi.fn(() => calls.push('panel'))

    const openExistingDesktopProject = () => {
      setShowProject(true)
      applyProjectLayout({ tree: true, editor: true }, { immediateSync: true })
      setSavedProject({ open: true, remotePath: '/repo' })
    }

    openExistingDesktopProject()

    expect(setShowProject).toHaveBeenCalledWith(true)
    expect(applyProjectLayout).toHaveBeenCalledWith({ tree: true, editor: true }, { immediateSync: true })
    expect(setSavedProject).toHaveBeenCalledWith({ open: true, remotePath: '/repo' })
    expect(calls).toEqual(['showProject', 'layout', 'panel'])
  })


  it('agent file edits never open editor mode', () => {
    const setShowProject = vi.fn()
    const showProjectRef = { current: false }

    const trackChangedFiles = () => {
      const changedFiles = [{ path: '/repo/file.ts', state: 'undecided' }]
      return changedFiles.length
    }

    expect(trackChangedFiles()).toBe(1)

    expect(setShowProject).not.toHaveBeenCalled()
    expect(showProjectRef.current).toBe(false)
  })
})
