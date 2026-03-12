import { useEffect, useMemo, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import Editor from '@monaco-editor/react'
import { ArrowLeft, ChevronRight, EyeOff, FolderOpen, Loader2, Send } from 'lucide-react'
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
  /** Surface ID for the active workspace (ensures REST calls target the right surface) */
  surfaceId?: string | null
  /** Mobile mode — renders stacked tabs instead of side-by-side panes */
  isMobile?: boolean
  /** Control visibility of the directory tree pane (default: true) */
  showTree?: boolean
  /** Control visibility of the file/editor pane (default: true) */
  showEditor?: boolean
  /** Called when user hides the tree pane from within the panel */
  onToggleTree?: () => void
  /** Called when user hides the editor pane from within the panel */
  onToggleEditor?: () => void
  /** Absolute paths of files recently changed by an agent (used to auto-refresh the editor) */
  changedPaths?: string[]
  /** Incremented by the server's native file watcher to signal external FS changes */
  fsWatcherVersion?: number
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
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

async function remoteScanDir(dirPath: string, surfaceId?: string | null): Promise<LazyNode[]> {
  let url = `${API_URL}/api/workspace/list?path=${encodeURIComponent(dirPath)}`
  if (surfaceId) url += `&surfaceId=${encodeURIComponent(surfaceId)}`
  const res = await fetch(url)
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

async function remoteReadFile(filePath: string, surfaceId?: string | null): Promise<string> {
  let url = `${API_URL}/api/workspace/read?path=${encodeURIComponent(filePath)}`
  if (surfaceId) url += `&surfaceId=${encodeURIComponent(surfaceId)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to read file: ${res.statusText}`)
  const data = (await res.json()) as { content: string; size: number }
  if (data.size > 2 * 1024 * 1024) return '// File too large to preview'
  return data.content
}

/** Lightweight stat call — returns mtime ISO string (or null on error). */
async function remoteStatFile(filePath: string, surfaceId?: string | null): Promise<string | null> {
  let url = `${API_URL}/api/workspace/stat?path=${encodeURIComponent(filePath)}`
  if (surfaceId) url += `&surfaceId=${encodeURIComponent(surfaceId)}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { modified?: string }
    return data.modified ?? null
  } catch {
    return null
  }
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
  isMobile,
}: {
  node: LazyNode
  depth: number
  activeFilePath: string | null
  expandedDirs: Set<string>
  onToggleDir: (node: LazyDir) => void
  onSelectFile: (node: LazyFile) => void
  onContextFile: (node: LazyFile) => void
  isMobile?: boolean
}) {
  const paddingLeft = isMobile ? 6 + depth * 12 : 8 + depth * 14

  if (node.kind === 'dir') {
    const expanded = expandedDirs.has(node.path)
    const loading = node.childrenLoading
    return (
      <>
        <div
          className={`group flex items-center gap-1.5 rounded px-1 cursor-pointer hover:bg-muted active:bg-muted ${
            isMobile ? 'py-2 text-sm' : 'py-1 text-xs'
          }`}
          style={{ paddingLeft }}
          onClick={() => onToggleDir(node)}
        >
          {loading ? (
            <Loader2 className={`${isMobile ? 'h-4 w-4' : 'h-3 w-3'} shrink-0 text-muted-foreground animate-spin`} />
          ) : (
            <ChevronRight
              className={`${isMobile ? 'h-4 w-4' : 'h-3 w-3'} shrink-0 text-muted-foreground transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            />
          )}
          <FolderIcon name={node.name} open={expanded} className={`${isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} shrink-0`} />
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
            isMobile={isMobile}
          />
        ))}
      </>
    )
  }

  const isActive = activeFilePath === node.path
  return (
    <div
      className={`group flex items-center gap-1.5 rounded px-1 cursor-pointer ${
        isMobile ? 'py-2 text-sm' : 'py-1 text-xs'
      } ${
        isActive ? 'bg-primary/15 text-foreground' : 'hover:bg-muted active:bg-muted'
      }`}
      style={{ paddingLeft: paddingLeft + (isMobile ? 12 : 14) }}
      onClick={() => onSelectFile(node)}
      onContextMenu={(e) => { e.preventDefault(); onContextFile(node) }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/jait-file', JSON.stringify({ path: node.path, name: node.name }))
        e.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <FileIcon filename={node.name} className={`${isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'}`} />
      <span className="truncate flex-1" title={node.path}>{node.name}</span>
      <button
        type="button"
        className={`${
          isMobile ? 'opacity-100 p-1.5' : 'opacity-0 group-hover:opacity-100 p-0.5'
        } rounded hover:bg-background`}
        onClick={(e) => { e.stopPropagation(); onContextFile(node) }}
        title="Add to chat"
      >
        <Send className={`${isMobile ? 'h-3.5 w-3.5' : 'h-3 w-3'}`} />
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
  onFileDrop: _onFileDrop,
  onReferenceFile,
  onAvailableFilesChange,
  autoOpenRemotePath,
  surfaceId,
  isMobile,
  showTree: showTreeProp = true,
  showEditor: showEditorProp = true,
  onToggleTree,
  onToggleEditor,
  changedPaths,
  fsWatcherVersion,
}, ref) {
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

  // Bump the file tree when new agent-modified paths appear
  const prevChangedPathsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!changedPaths?.length) {
      prevChangedPathsRef.current = new Set()
      return
    }
    const prevSet = prevChangedPathsRef.current
    const newPaths = changedPaths.filter((p) => !prevSet.has(p))
    prevChangedPathsRef.current = new Set(changedPaths)
    if (newPaths.length === 0) return
    bumpTree()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedPaths])

  // Bump the tree when the server's native file watcher detects external changes
  const prevWatcherVersionRef = useRef(fsWatcherVersion ?? 0)
  useEffect(() => {
    if (fsWatcherVersion == null) return
    if (fsWatcherVersion === prevWatcherVersionRef.current) return
    prevWatcherVersionRef.current = fsWatcherVersion

    // Invalidate cached children for all expanded directories so the next
    // render re-fetches their contents (revealing new/deleted files).
    const invalidateTree = (nodes: LazyNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'dir' && node.children) {
          if (expandedDirs.has(node.path)) {
            node.children = null // force re-fetch on next expand/render
          }
          // Don't recurse into collapsed dirs — they have no cached children anyway
        }
      }
    }
    invalidateTree(lazyTree)

    // Re-expand all currently expanded dirs (which now have null children)
    // by triggering a fresh tree render.
    bumpTree()

    // Re-fetch children for currently expanded directories
    const refetchExpanded = async () => {
      const toRefetch = [...expandedDirs]
      for (const dirPath of toRefetch) {
        // Find the dir node in the lazy tree
        const findDir = (nodes: LazyNode[]): LazyDir | null => {
          for (const n of nodes) {
            if (n.kind === 'dir' && n.path === dirPath) return n
            if (n.kind === 'dir' && n.children) {
              const found = findDir(n.children)
              if (found) return found
            }
          }
          return null
        }
        const dirNode = findDir(lazyTree)
        if (dirNode && dirNode.children === null) {
          const children = dirNode.handle
            ? await scanDir(dirNode.handle, dirNode.path)
            : await remoteScanDir(dirNode.path, surfaceId)
          dirNode.children = children
        }
      }
      bumpTree()
    }
    refetchExpanded().catch(() => { /* best effort */ })

    // Also re-fetch the currently open file in case it was modified externally
    if (activeNativePath && remoteRoot) {
      remoteReadFile(activeNativePath, surfaceId).then(
        (content) => setPreviewContent(content),
      ).catch(() => { /* keep stale content */ })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fsWatcherVersion])

  // ── File watcher: poll the open file's mtime and re-fetch on change ──
  const lastMtimeRef = useRef<string | null>(null)
  useEffect(() => {
    // Reset mtime when the open file changes
    lastMtimeRef.current = null
  }, [activeNativePath])

  useEffect(() => {
    if (!activeNativePath || !remoteRoot) return
    const path = activeNativePath
    const sid = surfaceId
    let cancelled = false

    // Seed the mtime on first open so subsequent polls detect changes
    if (!lastMtimeRef.current) {
      remoteStatFile(path, sid).then((mt) => {
        if (!cancelled && mt) lastMtimeRef.current = mt
      })
    }

    const id = setInterval(async () => {
      if (cancelled) return
      const mt = await remoteStatFile(path, sid)
      if (cancelled || !mt) return
      if (lastMtimeRef.current && mt !== lastMtimeRef.current) {
        // File changed on disk — re-fetch content
        lastMtimeRef.current = mt
        bumpTree()
        try {
          const content = await remoteReadFile(path, sid)
          if (!cancelled) setPreviewContent(content)
        } catch { /* keep stale content */ }
      } else if (!lastMtimeRef.current) {
        lastMtimeRef.current = mt
      }
    }, 2000)

    return () => { cancelled = true; clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNativePath, remoteRoot, surfaceId])

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
      const children = await remoteScanDir(rootPath, surfaceId)
      rootDirHandle.current = null // no local handle in remote mode
      setRemoteRoot(rootPath)
      setLazyTree(children)
      setExpandedDirs(new Set())
      setActiveNativePath(null)
      setPreviewContent(null)
    } catch (err) {
      console.error('Failed to open remote workspace:', err)
    }
  }, [surfaceId])

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
        const content = node.handle ? await readFileHandle(node.handle) : await remoteReadFile(node.path, surfaceId)
        return { id: node.path, name: node.name, path: node.path, content, language: inferLanguage(node.path) }
      } catch { return null }
    }

    // Remote mode fallback: just try reading via API
    if (remoteRoot) {
      try {
        const content = await remoteReadFile(path, surfaceId)
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
  }, [lazyTree, remoteRoot, surfaceId])

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
        : await remoteScanDir(node.path, surfaceId)
      node.children = children
      node.childrenLoading = false
      bumpTree()
    }
    setExpandedDirs((prev) => { const n = new Set(prev); n.add(node.path); return n })
  }, [expandedDirs, bumpTree, surfaceId])

  /* ---- Select native file ---- */
  const handleSelectNativeFile = useCallback(async (node: LazyFile) => {
    onActiveFileChange('')
    setActiveNativePath(node.path)
    setPreviewPath(node.path)
    setPreviewLanguage(inferLanguage(node.path))
    setLoadingFile(true)
    try {
      const content = node.handle ? await readFileHandle(node.handle) : await remoteReadFile(node.path, surfaceId)
      setPreviewContent(content)
    } catch {
      setPreviewContent('// Failed to read file')
    }
    setLoadingFile(false)
  }, [onActiveFileChange, surfaceId])

  /* ---- Context / reference ---- */
  const handleContextNativeFile = useCallback(async (node: LazyFile) => {
    try {
      const content = node.handle ? await readFileHandle(node.handle) : await remoteReadFile(node.path, surfaceId)
      onReferenceFile({ id: node.path, name: node.name, path: node.path, content, language: inferLanguage(node.path) })
    } catch { /* ignore */ }
  }, [onReferenceFile, surfaceId])

  /* ---- Select external file ---- */
  const handleSelectExtFile = useCallback((id: string) => {
    setActiveNativePath(null)
    setPreviewContent(null)
    onActiveFileChange(id)
  }, [onActiveFileChange])

  const hasNativeTree = lazyTree.length > 0
  const hasExtFiles = files.length > 0

  // Mobile: tab-based view (Files vs Editor)
  const [mobileTab, setMobileTab] = useState<'files' | 'editor'>('files')

  // Switch to editor tab when a file is selected on mobile
  const handleSelectNativeFileMobile = useCallback(async (node: LazyFile) => {
    await handleSelectNativeFile(node)
    if (isMobile) setMobileTab('editor')
  }, [handleSelectNativeFile, isMobile])

  const handleSelectExtFileMobile = useCallback((id: string) => {
    handleSelectExtFile(id)
    if (isMobile) setMobileTab('editor')
  }, [handleSelectExtFile, isMobile])

  /* ---- Mobile layout ---- */
  if (isMobile) {
    // Auto-correct tab when its panel is hidden
    const effectiveMobileTab = mobileTab === 'files' && !showTreeProp ? 'editor'
      : mobileTab === 'editor' && !showEditorProp ? 'files'
      : mobileTab

    // Both panels hidden — render nothing (App.tsx should also collapse the section)
    if (!showTreeProp && !showEditorProp) return null

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Tab bar — only show when both tabs are available */}
        {showTreeProp && showEditorProp && (
        <div className="flex items-center h-8 border-b bg-muted/30 shrink-0 px-1 gap-0.5">
          <button
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              effectiveMobileTab === 'files' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => setMobileTab('files')}
          >
            <FolderOpen className="h-3 w-3" />
            Files
          </button>
          <button
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              effectiveMobileTab === 'editor' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => setMobileTab('editor')}
          >
            Editor
            {editorFile && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                — {editorFile.path.split('/').pop()}
              </span>
            )}
          </button>
        </div>
        )}

        {/* Single-pane header when only one tab is visible */}
        {!(showTreeProp && showEditorProp) && (
          <div className="flex items-center justify-between h-8 border-b bg-muted/30 shrink-0 px-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {showTreeProp ? 'Files' : 'Editor'}
            </span>
          </div>
        )}

        {/* Files tab */}
        {effectiveMobileTab === 'files' && showTreeProp && (
          <>
          {/* Hide button header for files */}
          <div className="flex items-center justify-end h-7 px-2 shrink-0 border-b bg-muted/10">
            {onToggleTree && (
              <button
                onClick={onToggleTree}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded px-1.5 py-0.5 hover:bg-muted"
              >
                <EyeOff className="h-3 w-3" />
              </button>
            )}
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
                  onSelectFile={handleSelectNativeFileMobile}
                  onContextFile={handleContextNativeFile}
                  isMobile
                />
              ))}

              {hasExtFiles && (
                <>
                  {hasNativeTree && (
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 pt-3 pb-1 font-medium">
                      Dropped files
                    </div>
                  )}
                  {files.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => handleSelectExtFileMobile(file.id)}
                      className={`group flex items-center gap-1.5 rounded px-1 py-2 cursor-pointer text-sm ${
                        !activeNativePath && activeFileId === file.id ? 'bg-primary/15 text-foreground' : 'hover:bg-muted active:bg-muted'
                      }`}
                      style={{ paddingLeft: 18 }}
                    >
                      <FileIcon filename={file.name} className="h-4 w-4" />
                      <span className="truncate flex-1" title={file.path}>{file.path}</span>
                    </div>
                  ))}
                </>
              )}

              {!hasNativeTree && !hasExtFiles && (
                <div className="text-sm text-muted-foreground p-4 text-center">
                  No files loaded yet. The workspace opens automatically when the agent works with files.
                </div>
              )}
            </div>
          </ScrollArea>
          </>
        )}

        {/* Editor tab */}
        {effectiveMobileTab === 'editor' && showEditorProp && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-1.5 h-7 px-2 border-b bg-muted/20 shrink-0">
              {editorFile && showTreeProp && (
                <button
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setMobileTab('files')}
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
              )}
              {editorFile && (
                <>
                  <FileIcon filename={editorFile.path} className="h-3 w-3" />
                  <span className="text-[11px] text-muted-foreground truncate flex-1">{editorFile.path}</span>
                </>
              )}
              {!editorFile && <span className="text-[11px] text-muted-foreground flex-1">Editor</span>}
              {onToggleEditor && (
                <button
                  onClick={onToggleEditor}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded px-1.5 py-0.5 hover:bg-muted ml-auto"
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {loadingFile ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : editorFile ? (
                <pre className="text-[11px] leading-relaxed p-2 font-mono whitespace-pre overflow-x-auto text-foreground">
                  <code>{editorFile.content}</code>
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
                  Tap a file in the Files tab to view it here.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ---- Desktop layout ---- */
  return (
    <aside className="border-r bg-muted/20 flex min-h-0 shrink-0" style={{ width: !showTreeProp && !showEditorProp ? 0 : !showTreeProp ? Math.max(panel.size - tree.size, 300) : !showEditorProp ? tree.size + 8 : panel.size, maxWidth: '70vw' }}>
      {/* File explorer pane */}
      {showTreeProp && (
      <div
        className={`border-r bg-background transition-colors flex flex-col shrink-0`}
        style={{ width: tree.size }}
      >
        {/* Tree header with hide button */}
        <div className="flex items-center justify-between h-7 px-2 border-b bg-muted/20 shrink-0">
          <span className="text-[11px] font-medium text-muted-foreground">Files</span>
          {onToggleTree && (
            <button
              onClick={onToggleTree}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded px-1 py-0.5 hover:bg-muted"
            >
              <EyeOff className="h-3 w-3" />
              Hide
            </button>
          )}
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
      )}

      {/* Resize handle: tree ↔ editor */}
      {showTreeProp && showEditorProp && (
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={tree.onMouseDown}
      />
      )}

      {/* Editor pane */}
      {showEditorProp && (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Editor header with hide button */}
        <div className="flex items-center justify-between h-7 px-2 border-b bg-muted/20 shrink-0">
          <span className="text-[11px] text-muted-foreground truncate">
            {editorFile ? editorFile.path.split('/').pop() : 'Editor'}
          </span>
          {onToggleEditor && (
            <button
              onClick={onToggleEditor}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded px-1 py-0.5 hover:bg-muted"
            >
              <EyeOff className="h-3 w-3" />
              Hide
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0">
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
      </div>
      )}

      {/* Resize handle: panel ↔ chat (right edge) */}
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={panel.onMouseDown}
      />
    </aside>
  )
})
