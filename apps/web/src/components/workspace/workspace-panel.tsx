import { useEffect, useMemo, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import Editor from '@monaco-editor/react'
import { ChevronRight, FolderOpen, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileIcon, FolderIcon } from '@/components/icons/file-icons'

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface WorkspaceFile {
  id: string
  name: string
  path: string
  content: string
  language: string
}

interface WorkspacePanelProps {
  /** Files that were added externally (drag-drop, tool calls, etc.) */
  files: WorkspaceFile[]
  activeFileId: string | null
  onActiveFileChange: (id: string) => void
  onFileDrop: (files: FileList | File[]) => void
  onReferenceFile: (file: WorkspaceFile) => void
  /** Called whenever the set of browsable files changes (for @ mention) */
  onAvailableFilesChange?: (files: { path: string; name: string }[]) => void
  /** When set, automatically open a remote (server-backed) workspace at this path */
  autoOpenRemotePath?: string | null
}

export interface WorkspacePanelHandle {
  /** Scan a local directory. If a handle is provided, use it directly; otherwise prompt the user. */
  openDirectory: (handle?: FileSystemDirectoryHandle) => Promise<void>
  /** Open a remote (server-side) workspace by root path. Uses /api/workspace/* endpoints. */
  openRemoteWorkspace: (rootPath: string) => Promise<void>
  /** Read a file from the lazy tree by path and return a WorkspaceFile, or null. */
  readFileByPath: (path: string) => Promise<WorkspaceFile | null>
  /** Lazily search the entire directory for files matching a query. Cancellable via AbortSignal. */
  searchFiles: (query: string, limit: number, signal?: AbortSignal) => Promise<{ path: string; name: string }[]>
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out',
  '.next', '.nuxt', '.output', '.cache', '__pycache__', '.tox',
  '.venv', 'venv', 'env', '.idea', '.vscode', '.DS_Store',
  'coverage', '.turbo', '.parcel-cache', 'target',
])

function inferLanguage(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  if (!ext) return 'plaintext'
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css', scss: 'scss', less: 'less',
    html: 'html', py: 'python', yml: 'yaml', yaml: 'yaml', rs: 'rust',
    go: 'go', java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql', xml: 'xml',
    toml: 'toml', ini: 'ini', dockerfile: 'dockerfile', graphql: 'graphql',
  }
  return map[ext] ?? 'plaintext'
}

export function workspaceLanguageForPath(path: string) {
  return inferLanguage(path)
}

/* ------------------------------------------------------------------ */
/*  Lazy tree node types                                               */
/* ------------------------------------------------------------------ */

interface LazyDir {
  kind: 'dir'
  name: string
  path: string
  /** Browser-mode handle — null in remote mode */
  handle: FileSystemDirectoryHandle | null
  children: LazyNode[] | null
  childrenLoading?: boolean
}

interface LazyFile {
  kind: 'file'
  name: string
  path: string
  /** Browser-mode handle — null in remote mode */
  handle: FileSystemFileHandle | null
}

type LazyNode = LazyDir | LazyFile

async function scanDir(dirHandle: FileSystemDirectoryHandle, prefix: string): Promise<LazyNode[]> {
  const dirs: LazyDir[] = []
  const files: LazyFile[] = []

  for await (const entry of (dirHandle as any).values()) {
    const entryName = entry.name as string
    const entryPath = prefix ? `${prefix}/${entryName}` : entryName

    if (entry.kind === 'directory') {
      if (SKIP_DIRS.has(entryName)) continue
      dirs.push({ kind: 'dir', name: entryName, path: entryPath, handle: entry, children: null })
    } else {
      files.push({ kind: 'file', name: entryName, path: entryPath, handle: entry })
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))
  return [...dirs, ...files]
}

async function readFileHandle(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  if (file.size > 2 * 1024 * 1024) return '// File too large to preview'
  return file.text()
}

/* ------------------------------------------------------------------ */
/*  Remote (server-backed) workspace helpers                           */
/* ------------------------------------------------------------------ */

const API_URL = import.meta.env.VITE_API_URL || ''

async function remoteScanDir(dirPath: string): Promise<LazyNode[]> {
  const res = await fetch(`${API_URL}/api/workspace/list?path=${encodeURIComponent(dirPath)}`)
  if (!res.ok) throw new Error(`Failed to list directory: ${res.statusText}`)
  const data = (await res.json()) as { entries: string[] }

  const dirs: LazyDir[] = []
  const files: LazyFile[] = []

  for (const entry of data.entries) {
    const isDir = entry.endsWith('/')
    const name = isDir ? entry.slice(0, -1) : entry
    if (SKIP_DIRS.has(name)) continue
    const entryPath = dirPath.replace(/[\\/]$/, '') + '/' + name

    if (isDir) {
      dirs.push({ kind: 'dir', name, path: entryPath, handle: null, children: null })
    } else {
      files.push({ kind: 'file', name, path: entryPath, handle: null })
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))
  return [...dirs, ...files]
}

async function remoteReadFile(filePath: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/workspace/read?path=${encodeURIComponent(filePath)}`)
  if (!res.ok) throw new Error(`Failed to read file: ${res.statusText}`)
  const data = (await res.json()) as { content: string; size: number }
  if (data.size > 2 * 1024 * 1024) return '// File too large to preview'
  return data.content
}

/* ------------------------------------------------------------------ */
/*  Drag resize hook                                                   */
/* ------------------------------------------------------------------ */

function useDragResize(
  initial: number,
  min: number,
  max: number,
  direction: 'horizontal' | 'vertical' = 'horizontal',
) {
  const [size, setSize] = useState(initial)
  const dragging = useRef(false)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      const startPos = direction === 'horizontal' ? e.clientX : e.clientY
      const startSize = size

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const pos = direction === 'horizontal' ? ev.clientX : ev.clientY
        const delta = pos - startPos
        setSize(Math.min(max, Math.max(min, startSize + delta)))
      }
      const onUp = () => {
        dragging.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [size, min, max, direction],
  )

  return { size, onMouseDown } as const
}

/* ------------------------------------------------------------------ */
/*  Tree node component                                                */
/* ------------------------------------------------------------------ */

function TreeNodeRow({
  node,
  depth,
  activeFilePath,
  expandedDirs,
  onToggleDir,
  onSelectFile,
  onContextFile,
}: {
  node: LazyNode
  depth: number
  activeFilePath: string | null
  expandedDirs: Set<string>
  onToggleDir: (node: LazyDir) => void
  onSelectFile: (node: LazyFile) => void
  onContextFile: (node: LazyFile) => void
}) {
  const paddingLeft = 8 + depth * 14

  if (node.kind === 'dir') {
    const expanded = expandedDirs.has(node.path)
    const loading = node.childrenLoading
    return (
      <>
        <div
          className="group flex items-center gap-1 rounded px-1 py-1 cursor-pointer text-xs hover:bg-muted"
          style={{ paddingLeft }}
          onClick={() => onToggleDir(node)}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 shrink-0 text-muted-foreground animate-spin" />
          ) : (
            <ChevronRight
              className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            />
          )}
          <FolderIcon name={node.name} open={expanded} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate flex-1">{node.name}</span>
        </div>
        {expanded && node.children?.map((child) => (
          <TreeNodeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            activeFilePath={activeFilePath}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
            onSelectFile={onSelectFile}
            onContextFile={onContextFile}
          />
        ))}
      </>
    )
  }

  const isActive = activeFilePath === node.path
  return (
    <div
      className={`group flex items-center gap-1 rounded px-1 py-1 cursor-pointer text-xs ${
        isActive ? 'bg-primary/15 text-foreground' : 'hover:bg-muted'
      }`}
      style={{ paddingLeft: paddingLeft + 14 }}
      onClick={() => onSelectFile(node)}
      onContextMenu={(e) => { e.preventDefault(); onContextFile(node) }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/jait-file', JSON.stringify({ path: node.path, name: node.name }))
        e.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <FileIcon filename={node.name} className="h-3.5 w-3.5" />
      <span className="truncate flex-1" title={node.path}>{node.name}</span>
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-background"
        onClick={(e) => { e.stopPropagation(); onContextFile(node) }}
        title="Add to chat"
      >
        <Send className="h-3 w-3" />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  WorkspacePanel                                                     */
/* ------------------------------------------------------------------ */

export const WorkspacePanel = forwardRef<WorkspacePanelHandle, WorkspacePanelProps>(function WorkspacePanel({
  files,
  activeFileId,
  onActiveFileChange,
  onFileDrop,
  onReferenceFile,
  onAvailableFilesChange,
  autoOpenRemotePath,
}, ref) {
  const dragCounter = useRef(0)
  const [dragging, setDragging] = useState(false)
  const rootDirHandle = useRef<FileSystemDirectoryHandle | null>(null)
  /** When non-null, we're in remote (server-backed) mode */
  const [remoteRoot, setRemoteRoot] = useState<string | null>(null)

  // Resizable: file tree width + total panel width
  // Target a 4:2 (workspace:chat) ratio of the space after the sidebar (~224px)
  const tree = useDragResize(260, 180, 500, 'horizontal')
  const initialPanel = Math.round((window.innerWidth - 224) * (4 / 6))
  const panel = useDragResize(initialPanel, 400, 1800, 'horizontal')

  // Lazy tree state
  const [lazyTree, setLazyTree] = useState<LazyNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set())
  const [activeNativePath, setActiveNativePath] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [previewLanguage, setPreviewLanguage] = useState('plaintext')
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)

  const [treeVersion, setTreeVersion] = useState(0)
  const bumpTree = useCallback(() => setTreeVersion((v) => v + 1), [])

  // Report available files up whenever the tree changes
  useEffect(() => {
    if (!onAvailableFilesChange) return
    const collected: { path: string; name: string }[] = []
    const walk = (nodes: LazyNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'file') {
          collected.push({ path: n.path, name: n.name })
        } else if (n.children) {
          walk(n.children)
        }
      }
    }
    walk(lazyTree)
    // Also include external files
    for (const f of files) {
      if (!collected.some((c) => c.path === f.path)) {
        collected.push({ path: f.path, name: f.name })
      }
    }
    onAvailableFilesChange(collected)
  }, [lazyTree, treeVersion, files, onAvailableFilesChange])
  const activeExtFile = useMemo(() => files.find((f) => f.id === activeFileId) ?? null, [files, activeFileId])

  const editorFile = activeNativePath
    ? { path: previewPath ?? '', language: previewLanguage, content: previewContent ?? '' }
    : activeExtFile
      ? { path: activeExtFile.path, language: activeExtFile.language, content: activeExtFile.content }
      : null

  /* ---- Open directory ---- */
  const handleOpenDirectory = useCallback(async (handle?: FileSystemDirectoryHandle) => {
    let root = handle
    if (!root) {
      // Fallback: prompt the user for a directory
      if (typeof window === 'undefined') return
      const w = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
      if (!w.showDirectoryPicker) {
        window.alert('Directory picker is not supported in this browser.')
        return
      }
      try {
        root = await w.showDirectoryPicker()
      } catch {
        // user cancelled
        return
      }
    }
    const children = await scanDir(root, '')
    rootDirHandle.current = root
    setRemoteRoot(null) // switch to local mode
    setLazyTree(children)
    setExpandedDirs(new Set())
    setActiveNativePath(null)
    setPreviewContent(null)
  }, [])

  /* ---- Open remote (server-backed) workspace ---- */
  const handleOpenRemoteWorkspace = useCallback(async (rootPath: string) => {
    try {
      const children = await remoteScanDir(rootPath)
      rootDirHandle.current = null // no local handle in remote mode
      setRemoteRoot(rootPath)
      setLazyTree(children)
      setExpandedDirs(new Set())
      setActiveNativePath(null)
      setPreviewContent(null)
    } catch (err) {
      console.error('Failed to open remote workspace:', err)
    }
  }, [])

  // Auto-open remote workspace when prop changes
  useEffect(() => {
    if (!autoOpenRemotePath) return
    // Skip if we're already showing this remote root
    if (remoteRoot === autoOpenRemotePath) return
    handleOpenRemoteWorkspace(autoOpenRemotePath)
  }, [autoOpenRemotePath, handleOpenRemoteWorkspace]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Read file by path (for @ mention selection) ---- */
  const handleReadFileByPath = useCallback(async (path: string): Promise<WorkspaceFile | null> => {
    // First check the lazy tree (already-scanned nodes)
    const findFile = (nodes: LazyNode[]): LazyFile | null => {
      for (const n of nodes) {
        if (n.kind === 'file' && n.path === path) return n
        if (n.kind === 'dir' && n.children) {
          const found = findFile(n.children)
          if (found) return found
        }
      }
      return null
    }
    const node = findFile(lazyTree)
    if (node) {
      try {
        const content = node.handle ? await readFileHandle(node.handle) : await remoteReadFile(node.path)
        return { id: node.path, name: node.name, path: node.path, content, language: inferLanguage(node.path) }
      } catch { return null }
    }

    // Remote mode fallback: just try reading via API
    if (remoteRoot) {
      try {
        const content = await remoteReadFile(path)
        const name = path.split('/').pop() ?? path
        return { id: path, name, path, content, language: inferLanguage(path) }
      } catch { return null }
    }

    // Local mode fallback: walk the real FS to find the file by path
    const root = rootDirHandle.current
    if (!root) return null
    const parts = path.split('/')
    let dir: FileSystemDirectoryHandle = root
    try {
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i]!)
      }
      const fileHandle = await dir.getFileHandle(parts[parts.length - 1]!)
      const content = await readFileHandle(fileHandle)
      const name = parts[parts.length - 1]!
      return { id: path, name, path, content, language: inferLanguage(path) }
    } catch { return null }
  }, [lazyTree, remoteRoot])

  /* ---- Lazy search across the entire directory ---- */
  const handleSearchFiles = useCallback(async (
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<{ path: string; name: string }[]> => {
    if (!query) return []

    // Remote mode: walk tree already loaded + expand lazily. For simplicity,
    // we filter the already-scanned tree in both modes.
    const results: { path: string; name: string }[] = []
    const lowerQuery = query.toLowerCase()

    // Walk already-loaded lazy tree first (works for both local and remote)
    const walkTree = (nodes: LazyNode[]) => {
      for (const n of nodes) {
        if (signal?.aborted || results.length >= limit) return
        if (n.kind === 'file' && n.name.toLowerCase().includes(lowerQuery)) {
          results.push({ path: n.path, name: n.name })
        } else if (n.kind === 'dir' && n.children) {
          walkTree(n.children)
        }
      }
    }
    walkTree(lazyTree)
    if (results.length >= limit || signal?.aborted) return results

    // Local mode: additionally walk unscanned parts via FileSystemDirectoryHandle
    const root = rootDirHandle.current
    if (root && !remoteRoot) {
      const walkDir = async (dirHandle: FileSystemDirectoryHandle, prefix: string): Promise<boolean> => {
        if (signal?.aborted) return true
        try {
          for await (const entry of (dirHandle as any).values()) {
            if (signal?.aborted) return true
            if (results.length >= limit) return true
            const entryName = entry.name as string
            const entryPath = prefix ? `${prefix}/${entryName}` : entryName
            if (entry.kind === 'directory') {
              if (SKIP_DIRS.has(entryName)) continue
              const done = await walkDir(entry as FileSystemDirectoryHandle, entryPath)
              if (done) return true
            } else {
              if (entryName.toLowerCase().includes(lowerQuery) && !results.some(r => r.path === entryPath)) {
                results.push({ path: entryPath, name: entryName })
                if (results.length >= limit) return true
              }
            }
          }
        } catch { /* permission error or similar */ }
        return false
      }

      await walkDir(root, '')
    }

    return results
  }, [lazyTree, remoteRoot])

  useImperativeHandle(ref, () => ({
    openDirectory: handleOpenDirectory,
    openRemoteWorkspace: handleOpenRemoteWorkspace,
    readFileByPath: handleReadFileByPath,
    searchFiles: handleSearchFiles,
  }), [handleOpenDirectory, handleOpenRemoteWorkspace, handleReadFileByPath, handleSearchFiles])

  /* ---- Toggle directory ---- */
  const handleToggleDir = useCallback(async (node: LazyDir) => {
    const isExpanded = expandedDirs.has(node.path)
    if (isExpanded) {
      setExpandedDirs((prev) => { const n = new Set(prev); n.delete(node.path); return n })
      return
    }
    if (node.children === null) {
      node.childrenLoading = true
      bumpTree()
      const children = node.handle
        ? await scanDir(node.handle, node.path)
        : await remoteScanDir(node.path)
      node.children = children
      node.childrenLoading = false
      bumpTree()
    }
    setExpandedDirs((prev) => { const n = new Set(prev); n.add(node.path); return n })
  }, [expandedDirs, bumpTree])

  /* ---- Select native file ---- */
  const handleSelectNativeFile = useCallback(async (node: LazyFile) => {
    onActiveFileChange('')
    setActiveNativePath(node.path)
    setPreviewPath(node.path)
    setPreviewLanguage(inferLanguage(node.path))
    setLoadingFile(true)
    try {
      const content = node.handle ? await readFileHandle(node.handle) : await remoteReadFile(node.path)
      setPreviewContent(content)
    } catch {
      setPreviewContent('// Failed to read file')
    }
    setLoadingFile(false)
  }, [onActiveFileChange])

  /* ---- Context / reference ---- */
  const handleContextNativeFile = useCallback(async (node: LazyFile) => {
    try {
      const content = node.handle ? await readFileHandle(node.handle) : await remoteReadFile(node.path)
      onReferenceFile({ id: node.path, name: node.name, path: node.path, content, language: inferLanguage(node.path) })
    } catch { /* ignore */ }
  }, [onReferenceFile])

  /* ---- Select external file ---- */
  const handleSelectExtFile = useCallback((id: string) => {
    setActiveNativePath(null)
    setPreviewContent(null)
    onActiveFileChange(id)
  }, [onActiveFileChange])

  /* ---- Drag-and-drop (counter-based to fix child element issues) ---- */
  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (dragCounter.current === 1) setDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    const items = e.dataTransfer.items
    if (items?.length) {
      // Try to get directory handles via webkitGetAsEntry for folders
      const entries: FileSystemEntry[] = []
      const plainFiles: globalThis.File[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) {
          entries.push(entry)
        } else {
          const f = items[i].getAsFile()
          if (f) plainFiles.push(f)
        }
      }
      if (entries.length > 0) {
        void readEntries(entries)
      } else if (plainFiles.length > 0) {
        onFileDrop(plainFiles)
      }
    } else if (e.dataTransfer.files?.length) {
      onFileDrop(e.dataTransfer.files)
    }
  }, [onFileDrop])

  /** Recursively read FileSystemEntry trees from drag-and-drop */
  const readEntries = useCallback(async (entries: FileSystemEntry[]) => {
    const collected: WorkspaceFile[] = []

    const readEntry = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory) {
        if (SKIP_DIRS.has(entry.name)) return
        const dirReader = (entry as FileSystemDirectoryEntry).createReader()
        const children = await new Promise<FileSystemEntry[]>((resolve, reject) => {
          dirReader.readEntries(resolve, reject)
        })
        for (const child of children) {
          await readEntry(child, entryPath)
        }
      } else {
        const file = await new Promise<globalThis.File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject)
        })
        if (file.size > 1024 * 1024) return
        const content = await file.text()
        collected.push({
          id: `${entryPath}-${file.lastModified}`,
          name: file.name,
          path: entryPath,
          content,
          language: inferLanguage(entryPath),
        })
      }
    }

    for (const entry of entries) {
      await readEntry(entry, '')
    }
    if (collected.length > 0) onFileDrop(collected as any)
  }, [onFileDrop])

  const hasNativeTree = lazyTree.length > 0
  const hasExtFiles = files.length > 0

  return (
    <aside className="border-r bg-muted/20 flex min-h-0 shrink-0" style={{ width: panel.size, maxWidth: '70vw' }}>
      {/* File explorer pane */}
      <div
        className={`border-r bg-background transition-colors flex flex-col shrink-0 ${dragging ? 'ring-2 ring-primary/30 ring-inset bg-primary/5' : ''}`}
        style={{ width: tree.size }}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="p-2 space-y-2 border-b shrink-0">
          <Button variant="secondary" className="w-full justify-start" onClick={() => { void handleOpenDirectory() }}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Open directory
          </Button>
          <p className="text-[11px] text-muted-foreground leading-tight px-1">
            Drag &amp; drop files here, click to preview, right-click to add as chat context.
          </p>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-1">
            {hasNativeTree && lazyTree.map((node) => (
              <TreeNodeRow
                key={node.path}
                node={node}
                depth={0}
                activeFilePath={activeNativePath}
                expandedDirs={expandedDirs}
                onToggleDir={handleToggleDir}
                onSelectFile={handleSelectNativeFile}
                onContextFile={handleContextNativeFile}
              />
            ))}

            {hasExtFiles && (
              <>
                {hasNativeTree && (
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-3 pb-1 font-medium">
                    Dropped files
                  </div>
                )}
                {files.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => handleSelectExtFile(file.id)}
                    onContextMenu={(e) => { e.preventDefault(); onReferenceFile(file) }}
                    className={`group flex items-center gap-1 rounded px-1 py-1 cursor-pointer text-xs ${
                      !activeNativePath && activeFileId === file.id ? 'bg-primary/15 text-foreground' : 'hover:bg-muted'
                    }`}
                    style={{ paddingLeft: 22 }}
                  >
                    <FileIcon filename={file.name} className="h-3.5 w-3.5" />
                    <span className="truncate flex-1" title={file.path}>{file.path}</span>
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-background"
                      onClick={(e) => { e.stopPropagation(); onReferenceFile(file) }}
                      title="Add to chat"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </>
            )}

            {!hasNativeTree && !hasExtFiles && (
              <div className="text-xs text-muted-foreground p-2">No files loaded yet.</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Resize handle: tree ↔ editor */}
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={tree.onMouseDown}
      />

      {/* Editor pane */}
      <div className="flex-1 min-w-0 min-h-0">
        {loadingFile ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : editorFile ? (
          <Editor
            height="100%"
            theme="vs-dark"
            path={editorFile.path}
            language={editorFile.language}
            value={editorFile.content}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Open a file from the explorer to preview it here.
          </div>
        )}
      </div>

      {/* Resize handle: panel ↔ chat (right edge) */}
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={panel.onMouseDown}
      />
    </aside>
  )
})
