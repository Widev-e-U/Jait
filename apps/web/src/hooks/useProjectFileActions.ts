import { useCallback, type RefObject } from 'react'
import { toast } from 'sonner'

import { projectLanguageForPath, type ProjectFile, type ProjectPanelHandle } from '@/components/project'
import { getApiUrl } from '@/lib/gateway-url'
import { gitApi } from '@/lib/git-api'
import { isPathWithinProject } from '@/lib/project-links'

const API_URL = getApiUrl()

interface UseProjectFileActionsOptions {
  acceptFile: (filePath: string) => void
  activeProject: any
  activeProjectRecord: { rootPath?: string | null } | null | undefined
  activeSessionId: string | null
  openRemoteProjectOnGateway: (dirPath: string, nodeId?: string, sessionIdOverride?: string | null) => Promise<void>
  projectFiles: ProjectFile[]
  projectRef: RefObject<ProjectPanelHandle | null>
  setActiveProjectFileId: (fileId: string | null | ((prev: string | null) => string | null)) => void
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFile[]>>
  setShowProject: (show: boolean) => void
  showProject: boolean
  showProjectEditorPanel: () => void
  showProjectRef: RefObject<boolean>
  token: string | null
}

export function useProjectFileActions({
  acceptFile,
  activeProject,
  activeProjectRecord,
  activeSessionId,
  openRemoteProjectOnGateway,
  projectFiles,
  projectRef,
  setActiveProjectFileId,
  setProjectFiles,
  setShowProject,
  showProject,
  showProjectEditorPanel,
  showProjectRef,
  token,
}: UseProjectFileActionsOptions) {
  const mergeProjectFiles = useCallback((incoming: ProjectFile[]) => {
    if (incoming.length === 0) return
    setProjectFiles((prev) => {
      const next = [...prev]
      for (const file of incoming) {
        const idx = next.findIndex((existing) => existing.path === file.path)
        if (idx >= 0) next[idx] = file
        else next.push(file)
      }
      return next
    })
    setActiveProjectFileId((prev) => prev ?? incoming[0]?.id ?? null)
  }, [setActiveProjectFileId, setProjectFiles])

  const resolveKnownProjectRootForFile = useCallback((filePath: string) => {
    if (isPathWithinProject(filePath, activeProject?.projectRoot)) {
      return activeProject?.projectRoot ?? null
    }
    if (activeProjectRecord?.rootPath && isPathWithinProject(filePath, activeProjectRecord.rootPath)) {
      return activeProjectRecord.rootPath
    }
    return null
  }, [activeProject?.projectRoot, activeProjectRecord?.rootPath])

  const handleChangedFileClick = useCallback(async (filePath: string) => {
    try {
      const targetProjectRoot = resolveKnownProjectRootForFile(filePath)

      if (!targetProjectRoot) {
        toast('File is outside the active project. Open its directory explicitly to browse it.')
        return
      }

      if (targetProjectRoot && (!activeProject || activeProject.projectRoot !== targetProjectRoot)) {
        await openRemoteProjectOnGateway(targetProjectRoot, activeProject?.nodeId, activeSessionId)
      }

      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const surfaceQuery = activeProject?.surfaceId && targetProjectRoot === activeProject.projectRoot
        ? `&surfaceId=${encodeURIComponent(activeProject.surfaceId)}`
        : ''
      const name = filePath.split(/[/\\]/).pop() ?? filePath
      const language = projectLanguageForPath(name)

      const ensureProjectDiffHostReady = async () => {
        if (!showProject) {
          showProjectRef.current = true
          setShowProject(true)
        }
        showProjectEditorPanel()
        if (projectRef.current) return true
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        return projectRef.current != null
      }

      const openReviewDiff = async (path: string, originalContent: string | null | undefined, modifiedContent: string) => {
        const ready = await ensureProjectDiffHostReady()
        if (!ready) return
        await projectRef.current?.openReviewDiff({
          path,
          originalContent: originalContent ?? '',
          modifiedContent,
          language,
        })
        showProjectEditorPanel()
      }

      const openGitDiffFallback = async (path: string, currentContent: string): Promise<boolean> => {
        if (!targetProjectRoot) return false
        try {
          const diffs = await gitApi.fileDiffs(targetProjectRoot)
          const normalizedPath = path.replace(/\\/g, '/');
          const entry = diffs.find((diff) => diff.path === normalizedPath)
            ?? diffs.find((diff) => normalizedPath.endsWith(`/${diff.path}`))
          if (!entry) return false
          await openReviewDiff(path, entry.original, currentContent || entry.modified)
          return true
        } catch {
          return false
        }
      }

      const backupRes = await fetch(`${API_URL}/api/project/backup?path=${encodeURIComponent(filePath)}${surfaceQuery}`, { headers })

      if (backupRes.ok) {
        const data = await backupRes.json() as { path: string; originalContent: string | null; currentContent: string }
        await openReviewDiff(data.path, data.originalContent, data.currentContent)
        return
      }

      const file = await projectRef.current?.readFileByPath(filePath)
      if (file) {
        if (await openGitDiffFallback(file.path, file.content)) return
        await openReviewDiff(file.path, file.content, file.content)
        return
      }
      const readRes = await fetch(`${API_URL}/api/project/read?path=${encodeURIComponent(filePath)}${surfaceQuery}`, { headers })
      if (!readRes.ok) return
      const readData = await readRes.json() as { path: string; content: string }
      if (await openGitDiffFallback(readData.path, readData.content)) return
      await openReviewDiff(readData.path, readData.content, readData.content)
    } catch {
      // silently ignore
    }
  }, [activeSessionId, activeProject, openRemoteProjectOnGateway, resolveKnownProjectRootForFile, token, showProject, showProjectEditorPanel, projectRef, setShowProject, showProjectRef])

  const handleOpenMessagePath = useCallback(async (filePath: string) => {
    try {
      const targetProjectRoot = resolveKnownProjectRootForFile(filePath)

      if (!targetProjectRoot) {
        const existing = projectFiles.find((file) => file.path === filePath)
        if (existing) {
          mergeProjectFiles([existing])
          setActiveProjectFileId(existing.id)
          if (!showProject) {
            showProjectRef.current = true
            setShowProject(true)
          }
          showProjectEditorPanel()
          return
        }
        toast('File is outside the active project. Open its directory explicitly to browse it.')
        return
      }

      if (targetProjectRoot && (!activeProject || activeProject.projectRoot !== targetProjectRoot)) {
        await openRemoteProjectOnGateway(targetProjectRoot, activeProject?.nodeId, activeSessionId)
      }

      const openedInTree = await projectRef.current?.openFileByPath(filePath)
      if (openedInTree) {
        if (!showProject) {
          showProjectRef.current = true
          setShowProject(true)
        }
        showProjectEditorPanel()
        return
      }

      const existing = projectFiles.find((file) => file.path === filePath)
      if (existing) {
        mergeProjectFiles([existing])
        setActiveProjectFileId(existing.id)
      } else {
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const readRes = await fetch(`${API_URL}/api/project/read?path=${encodeURIComponent(filePath)}`, { headers })
        if (!readRes.ok) throw new Error(`Failed to open file: ${readRes.status}`)

        const readData = await readRes.json() as { path: string; content: string }
        const name = filePath.split(/[\\/]/).pop() ?? filePath
        const file: ProjectFile = {
          id: readData.path,
          name,
          path: readData.path,
          content: readData.content,
          language: projectLanguageForPath(name),
        }
        mergeProjectFiles([file])
        setActiveProjectFileId(file.id)
      }

      if (!showProject) {
        showProjectRef.current = true
        setShowProject(true)
      }
      showProjectEditorPanel()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to open linked file')
    }
  }, [activeSessionId, activeProject, mergeProjectFiles, openRemoteProjectOnGateway, resolveKnownProjectRootForFile, showProject, showProjectEditorPanel, token, projectFiles, projectRef, setActiveProjectFileId, setShowProject, showProjectRef])

  const handleApplyProjectDiff = useCallback(async (filePath: string, resultContent: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      await fetch(`${API_URL}/api/project/apply-diff`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: filePath, content: resultContent }),
      })
    } catch {
      // ignore
    }
    acceptFile(filePath)
  }, [token, acceptFile])

  const handleFileDrop = useCallback(async (dropped: FileList | File[]) => {
    const list = Array.from(dropped)
    const resolved = await Promise.all(
      list
        .filter((file) => file.size < 1024 * 1024)
        .map(async (file) => {
          const content = await file.text()
          const path = file.webkitRelativePath || file.name
          return {
            id: `${path}-${file.lastModified}`,
            name: file.name,
            path,
            content,
            language: projectLanguageForPath(path),
          } satisfies ProjectFile
        }),
    )
    mergeProjectFiles(resolved)
  }, [mergeProjectFiles])

  const handleSearchFiles = useCallback(async (query: string, limit: number, signal?: AbortSignal) => {
    return projectRef.current?.searchFiles(query, limit, signal) ?? []
  }, [projectRef])

  return {
    handleApplyProjectDiff,
    handleChangedFileClick,
    handleFileDrop,
    handleOpenMessagePath,
    handleSearchFiles,
    mergeProjectFiles,
    resolveKnownProjectRootForFile,
  }
}
