import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({ useCallback: (callback: unknown) => callback }))
vi.mock('@/components/project', () => ({ projectLanguageForPath: () => 'plaintext' }))
vi.mock('@/components/project/project-file-preview', () => ({ isProjectBinaryPreview: () => false }))
vi.mock('@/lib/gateway-url', () => ({ getApiUrl: () => '' }))
vi.mock('@/lib/git-api', () => ({ gitApi: {} }))
vi.mock('@/lib/html-presentation', () => ({ openHtmlPresentation: vi.fn() }))

import { useProjectFileActions } from './useProjectFileActions'

function useTestActions(approved: boolean) {
  const confirm = vi.fn(() => approved)
  vi.stubGlobal('window', { confirm })
  const openProject = vi.fn(async () => {})
  const openFile = vi.fn(async () => true)
  const actions = useProjectFileActions({
    acceptFile: vi.fn(),
    activeProject: { projectRoot: '/project', nodeId: 'node-1', surfaceId: 'old' },
    activeProjectRecord: null,
    activeSessionId: 'session-1',
    openRemoteProjectOnGateway: openProject,
    projectFiles: [],
    projectRef: { current: { openFileByPath: openFile } } as never,
    setActiveProjectFileId: vi.fn(),
    setProjectFiles: vi.fn(),
    setShowProject: vi.fn(),
    showProject: false,
    showProjectEditorPanel: vi.fn(),
    showProjectRef: { current: false },
    token: null,
  })
  return { actions, confirm, openProject, openFile }
}

afterEach(() => vi.unstubAllGlobals())

describe('opening outside-project documents', () => {
  it('requires confirmation before granting access to the directory', async () => {
    const { actions, confirm, openProject, openFile } = useTestActions(false)
    await actions.handleOpenMessagePath('/outside/file.pdf')
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('/outside'))
    expect(openProject).not.toHaveBeenCalled()
    expect(openFile).not.toHaveBeenCalled()
  })

  it('opens the confirmed directory on the selected node and opens the file', async () => {
    const { actions, openProject, openFile } = useTestActions(true)
    await actions.handleOpenMessagePath('/outside/file.pdf')
    expect(openProject).toHaveBeenCalledWith('/outside', 'node-1', 'session-1', true, true)
    expect(openFile).toHaveBeenCalledWith('/outside/file.pdf')
  })

  it('handles Windows drive roots', async () => {
    const { actions, openProject } = useTestActions(true)
    await actions.handleOpenMessagePath('C:\\file.txt')
    expect(openProject).toHaveBeenCalledWith('C:/', 'node-1', 'session-1', true, true)
  })
})
