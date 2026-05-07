import { describe, expect, it, vi } from 'vitest'
import { collapseMobileWorkspace, showMobileWorkspacePane } from '@/lib/mobile-workspace-layout'

describe('workspace editor reopen behavior', () => {
  it('reopening an existing desktop workspace restores the editor pane', () => {
    const setShowWorkspace = vi.fn()
    const setShowWorkspaceTree = vi.fn()
    const showWorkspaceEditorPanel = vi.fn()
    const setSavedWorkspace = vi.fn()

    const reopenExistingDesktopWorkspace = () => {
      setShowWorkspace(true)
      setShowWorkspaceTree(true)
      showWorkspaceEditorPanel()
      setSavedWorkspace({ open: true, remotePath: '/repo' })
    }

    reopenExistingDesktopWorkspace()

    expect(setShowWorkspace).toHaveBeenCalledWith(true)
    expect(setShowWorkspaceTree).toHaveBeenCalledWith(true)
    expect(showWorkspaceEditorPanel).toHaveBeenCalledOnce()
    expect(setSavedWorkspace).toHaveBeenCalledWith({ open: true, remotePath: '/repo' })
  })

  it('reopening a persisted desktop workspace forces the editor pane visible', async () => {
    const openRemoteWorkspaceOnGateway = vi.fn(async () => {})
    const setShowWorkspace = vi.fn()
    const setShowWorkspaceTree = vi.fn()
    const showWorkspaceEditorPanel = vi.fn()
    const setSavedWorkspace = vi.fn()

    const reopenPersistedWorkspace = async (path: string) => {
      await openRemoteWorkspaceOnGateway(path)
      setShowWorkspace(true)
      setShowWorkspaceTree(true)
      showWorkspaceEditorPanel()
      setSavedWorkspace({ open: true, remotePath: path })
    }

    await reopenPersistedWorkspace('/repo')

    expect(openRemoteWorkspaceOnGateway).toHaveBeenCalledWith('/repo')
    expect(setShowWorkspace).toHaveBeenCalledWith(true)
    expect(setShowWorkspaceTree).toHaveBeenCalledWith(true)
    expect(showWorkspaceEditorPanel).toHaveBeenCalledOnce()
    expect(setSavedWorkspace).toHaveBeenCalledWith({ open: true, remotePath: '/repo' })
  })

  it('reopening a persisted mobile workspace keeps the editor collapsed', async () => {
    const openRemoteWorkspaceOnGateway = vi.fn(async () => {})
    const setShowWorkspace = vi.fn()
    const applyWorkspaceLayout = vi.fn()
    const setSavedWorkspace = vi.fn()

    const reopenPersistedWorkspace = async (path: string) => {
      await openRemoteWorkspaceOnGateway(path)
      setShowWorkspace(true)
      applyWorkspaceLayout(collapseMobileWorkspace(), { immediateSync: true })
      setSavedWorkspace({ open: true, remotePath: path })
    }

    await reopenPersistedWorkspace('/repo')

    expect(openRemoteWorkspaceOnGateway).toHaveBeenCalledWith('/repo')
    expect(setShowWorkspace).toHaveBeenCalledWith(true)
    expect(applyWorkspaceLayout).toHaveBeenCalledWith({ tree: false, editor: false }, { immediateSync: true })
    expect(setSavedWorkspace).toHaveBeenCalledWith({ open: true, remotePath: '/repo' })
  })

  it('mobile editor toolbar selects the editor tab after reopening a collapsed workspace', async () => {
    const applyWorkspaceLayout = vi.fn()
    const handleToggleEditor = vi.fn(async () => {
      applyWorkspaceLayout(collapseMobileWorkspace(), { immediateSync: true })
    })

    const showMobileWorkspaceEditorTab = () => {
      applyWorkspaceLayout(showMobileWorkspacePane('editor'), { immediateSync: true })
    }

    const handleMobileEditorTargetAction = async () => {
      await handleToggleEditor()
      showMobileWorkspaceEditorTab()
    }

    await handleMobileEditorTargetAction()

    expect(handleToggleEditor).toHaveBeenCalledOnce()
    expect(applyWorkspaceLayout).toHaveBeenNthCalledWith(1, { tree: false, editor: false }, { immediateSync: true })
    expect(applyWorkspaceLayout).toHaveBeenNthCalledWith(2, { tree: false, editor: true }, { immediateSync: true })
  })

  it('opening an existing mobile workspace persists editor layout before panel state', () => {
    const calls: string[] = []
    const setShowWorkspace = vi.fn(() => calls.push('showWorkspace'))
    const applyWorkspaceLayout = vi.fn(() => calls.push('layout'))
    const setSavedWorkspace = vi.fn(() => calls.push('panel'))

    const showMobileWorkspaceEditorTab = () => {
      applyWorkspaceLayout(showMobileWorkspacePane('editor'), { immediateSync: true })
    }

    const openExistingMobileWorkspace = () => {
      setShowWorkspace(true)
      showMobileWorkspaceEditorTab()
      setSavedWorkspace({ open: true, remotePath: '/repo' })
    }

    openExistingMobileWorkspace()

    expect(setShowWorkspace).toHaveBeenCalledWith(true)
    expect(applyWorkspaceLayout).toHaveBeenCalledWith({ tree: false, editor: true }, { immediateSync: true })
    expect(setSavedWorkspace).toHaveBeenCalledWith({ open: true, remotePath: '/repo' })
    expect(calls).toEqual(['showWorkspace', 'layout', 'panel'])
  })

  it('opening an existing desktop workspace persists editor layout before panel state', () => {
    const calls: string[] = []
    const setShowWorkspace = vi.fn(() => calls.push('showWorkspace'))
    const applyWorkspaceLayout = vi.fn(() => calls.push('layout'))
    const setSavedWorkspace = vi.fn(() => calls.push('panel'))

    const openExistingDesktopWorkspace = () => {
      setShowWorkspace(true)
      applyWorkspaceLayout({ tree: true, editor: true }, { immediateSync: true })
      setSavedWorkspace({ open: true, remotePath: '/repo' })
    }

    openExistingDesktopWorkspace()

    expect(setShowWorkspace).toHaveBeenCalledWith(true)
    expect(applyWorkspaceLayout).toHaveBeenCalledWith({ tree: true, editor: true }, { immediateSync: true })
    expect(setSavedWorkspace).toHaveBeenCalledWith({ open: true, remotePath: '/repo' })
    expect(calls).toEqual(['showWorkspace', 'layout', 'panel'])
  })
})
