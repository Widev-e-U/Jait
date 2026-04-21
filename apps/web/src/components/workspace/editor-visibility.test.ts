import { describe, expect, it, vi } from 'vitest'

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
})
