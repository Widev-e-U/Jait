import { useEffect, useMemo, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import { ArrowLeft, Check, ChevronRight, CloudUpload, EyeOff, FolderOpen, GitBranch, Globe, Loader2, RefreshCw, Save, Send, Sparkles, X } from 'lucide-react'
import { gitApi as gitApiImport, type GitStatusResult, type FileDiffEntry, type GitStackedAction } from '@/lib/git-api'
import type { ProviderId } from '@/lib/agents-api'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileIcon, FolderIcon } from '@/components/icons/file-icons'
import { useResolvedTheme } from '@/hooks/use-resolved-theme'
import { resolvePreviewTarget } from '@/components/chat/dev-preview-panel'
import { DiffView } from './diff-view'

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
  /** Persisted editor tab state for this session/workspace */
  savedTabsState?: WorkspaceTabsState | null
  /** Called when open tabs/active tab change (for DB + WS sync) */
  onTabsStateChange?: (state: WorkspaceTabsState | null) => void
  /** Apply a merged review diff result to the backing file. */
  onApplyDiff?: (filePath: string, resultContent: string) => void | Promise<void>
  /** Active chat provider used for AI-powered git actions. */
  provider?: ProviderId
  /** Active provider model override from the chat composer. */
  cliModel?: string | null
  /** Request to open a preview target in the editor. */
  previewRequest?: { target: string; key: number } | null
}

export interface WorkspacePanelHandle {
  /** Scan a local directory. If a handle is provided, use it directly; otherwise prompt the user. */
  openDirectory: (handle?: FileSystemDirectoryHandle) => Promise<void>
  /** Open a remote (server-side) workspace by root path. Uses /api/workspace/* endpoints. */
  openRemoteWorkspace: (rootPath: string) => Promise<void>
  /** Expand ancestor folders and open a file directly from the tree. */
  openFileByPath: (path: string) => Promise<boolean>
  /** Read a file from the lazy tree by path and return a WorkspaceFile, or null. */
  readFileByPath: (path: string) => Promise<WorkspaceFile | null>
  /** Open a review diff tab with original/modified content. */
  openReviewDiff: (input: { path: string; originalContent: string; modifiedContent: string; language?: string }) => Promise<boolean>
  /** Open a preview target inside the workspace editor. */
  openPreviewTarget: (target: string) => boolean
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
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

async function remoteWriteFile(filePath: string, content: string, surfaceId?: string | null): Promise<void> {
  const res = await fetch(`${API_URL}/api/workspace/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content, surfaceId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(data.message || `Failed to write file: ${res.statusText}`)
  }
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
/*  Git status badge                                                   */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  A: 'text-green-500',
  M: 'text-yellow-500',
  D: 'text-red-500',
  R: 'text-blue-500',
  '?': 'text-green-400',
}

const STATUS_LABELS: Record<string, string> = {
  A: 'Added',
  M: 'Modified',
  D: 'Deleted',
  R: 'Renamed',
  '?': 'Untracked',
}

function GitStatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const label = status === '?' ? 'U' : status
  return (
    <span
      className={`text-[9px] font-bold leading-none shrink-0 ${STATUS_COLORS[status] ?? 'text-muted-foreground'} ${className}`}
      title={STATUS_LABELS[status] ?? status}
    >
      {label}
    </span>
  )
}

/** Build a set of directory prefixes that contain changed files */
function buildDirChangesSet(gitStatusMap: Map<string, string>): Set<string> {
  const dirs = new Set<string>()
  for (const filePath of gitStatusMap.keys()) {
    const parts = filePath.replace(/\\/g, '/').split('/')
    // Walk up every parent directory segment
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'))
    }
  }
  return dirs
}

const gitApi = gitApiImport

function isEditableWorkspaceTab(tab: EditorTab | null): boolean {
  return Boolean(tab && tab.type === 'file' && tab.id.startsWith('file:'))
}

function getEditorTabTitle(tab: EditorTab): string {
  if (tab.type === 'preview') return tab.label || 'Preview'
  if (tab.type !== 'diff') return tab.label
  const baseLabel = tab.label || (tab.path.split(/[\\/]/).pop() ?? tab.path)
  return `${baseLabel} <-> ${baseLabel}`
}

/* ------------------------------------------------------------------ */
/*  Editor tab model                                                   */
/* ------------------------------------------------------------------ */

interface EditorTab {
  id: string
  type: 'file' | 'diff' | 'preview'
  path: string
  label: string
  version?: number
  content?: string | null
  language?: string
  diffMode?: 'git' | 'review'
  diffEntry?: FileDiffEntry | null
  originalContent?: string | null
  modifiedContent?: string | null
  /** Preview tabs are italic and get replaced on next open */
  isPreview?: boolean
  savedContent?: string | null
  isDirty?: boolean
  isSaving?: boolean
  saveError?: string | null
  previewTarget?: string
  previewSrc?: string | null
}

export interface WorkspaceTabsState {
  remoteRoot: string
  tabs: Array<{ path: string; label: string }>
  activePath: string | null
}

/* ------------------------------------------------------------------ */
/*  Drag resize hook                                                   */
/* ------------------------------------------------------------------ */

function useDragResize(
  initial: number,
  min: number,
  max: number,
  direction: 'horizontal' | 'vertical' = 'horizontal',
  storageKey?: string,
) {
  const [size, setSize] = useState(() => {
    if (!storageKey || typeof window === 'undefined') return initial
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
    if (!Number.isFinite(parsed)) return initial
    return Math.min(max, Math.max(min, parsed))
  })
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

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, String(size))
  }, [size, storageKey])

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
  gitStatusMap,
  dirChangesSet,
}: {
  node: LazyNode
  depth: number
  activeFilePath: string | null
  expandedDirs: Set<string>
  onToggleDir: (node: LazyDir) => void
  onSelectFile: (node: LazyFile) => void
  onContextFile: (node: LazyFile) => void
  isMobile?: boolean
  gitStatusMap?: Map<string, string>
  dirChangesSet?: Set<string>
}) {
  const paddingLeft = isMobile ? 6 + depth * 12 : 8 + depth * 14

  if (node.kind === 'dir') {
    const expanded = expandedDirs.has(node.path)
    const loading = node.childrenLoading
    // Check if this folder (by relative path) contains any changed files
    const dirRel = node.path.replace(/\\/g, '/')
    const folderHasChanges = dirChangesSet ? (() => {
      for (const d of dirChangesSet) {
        if (dirRel.endsWith('/' + d) || dirRel === d) return true
      }
      return false
    })() : false
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
          <span className={`truncate flex-1 ${folderHasChanges ? 'text-yellow-600 dark:text-yellow-400' : ''}`}>{node.name}</span>
          {folderHasChanges && (
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0" title="Contains modified files" />
          )}
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
            gitStatusMap={gitStatusMap}
            dirChangesSet={dirChangesSet}
          />
        ))}
      </>
    )
  }

  const isActive = activeFilePath === node.path
  const fileGitStatus = gitStatusMap?.get(node.name) ?? gitStatusMap?.get(node.path)
  // Try matching against relative path from workspace root
  const relPath = node.path.replace(/\\/g, '/')
  const matchedStatus = fileGitStatus ?? (() => {
    if (!gitStatusMap) return undefined
    for (const [k, v] of gitStatusMap) {
      if (relPath.endsWith('/' + k) || relPath === k) return v
    }
    return undefined
  })()
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
      <span className={`truncate flex-1 ${matchedStatus === 'D' ? 'line-through text-muted-foreground' : ''}`} title={node.path}>{node.name}</span>
      {matchedStatus && <GitStatusBadge status={matchedStatus} />}
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
  savedTabsState,
  onTabsStateChange,
  onApplyDiff,
  provider,
  cliModel,
  previewRequest,
}, ref) {
  const resolvedTheme = useResolvedTheme()
  const rootDirHandle = useRef<FileSystemDirectoryHandle | null>(null)
  /** When non-null, we're in remote (server-backed) mode */
  const [remoteRoot, setRemoteRoot] = useState<string | null>(null)
  /** Ref to the desktop tab scroll container — used to auto-reveal the active tab */
  const tabScrollRef = useRef<HTMLDivElement | null>(null)

  // Resizable: file tree width + total panel width
  // Target a 4:2 (workspace:chat) ratio of the space after the sidebar (~224px)
  const tree = useDragResize(260, 180, 500, 'horizontal', 'workspaceTreePaneWidth')
  const initialPanel = Math.round((window.innerWidth - 224) * (4 / 6))
  const panel = useDragResize(initialPanel, 400, 1800, 'horizontal', 'workspacePanelWidth')

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

  // ── Git status state ──
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null)
  const [gitStatusLoading, setGitStatusLoading] = useState(false)
  const gitStatusRequestSeqRef = useRef(0)
  /** Map of relative file path → status code (A/M/D/R/?) */
  const gitStatusMap = useMemo(() => {
    if (!gitStatus?.workingTree.files.length) return new Map<string, string>()
    const m = new Map<string, string>()
    for (const f of gitStatus.workingTree.files) {
      m.set(f.path, (f as { status?: string }).status ?? 'M')
    }
    return m
  }, [gitStatus])
  /** Set of directory prefixes (relative) that contain changed files */
  const dirChangesSet = useMemo(() => buildDirChangesSet(gitStatusMap), [gitStatusMap])
  /** Tree pane active tab */
  const [treeTab, setTreeTab] = useState<'files' | 'git'>('files')
  /** Currently viewing diff for a file in the source control tab */
  const [scDiffFile, setScDiffFile] = useState<FileDiffEntry | null>(null)
  const [scDiffLoading, setScDiffLoading] = useState(false)
  /** Commit message input */
  const [commitMessage, setCommitMessage] = useState('')
  /** Whether AI is generating a commit message */
  const [commitMsgGenerating, setCommitMsgGenerating] = useState(false)
  /** Whether a git action (commit/push) is in progress */
  const [gitActionBusy, setGitActionBusy] = useState(false)
  const [gitActionError, setGitActionError] = useState<string | null>(null)

  // ── Editor tabs state ──
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const activeTab = useMemo(() => openTabs.find(t => t.id === activeTabId) ?? null, [openTabs, activeTabId])
  const activeTabEditable = isEditableWorkspaceTab(activeTab)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [tabContextMenu, setTabContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const restoredTabsRootRef = useRef<string | null>(null)
  const lastPersistedTabsRef = useRef<string>('')
  const handledPreviewRequestKeyRef = useRef<number | null>(null)

  // Auto-scroll active tab into view (VS Code behaviour)
  useEffect(() => {
    if (!activeTabId) return
    const container = tabScrollRef.current
    if (!container) return
    const tabEl = container.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeTabId)}"]`)
    if (!tabEl) return
    const { scrollLeft, clientWidth } = container
    const tabLeft = tabEl.offsetLeft
    const tabRight = tabLeft + tabEl.offsetWidth
    if (tabLeft < scrollLeft) {
      container.scrollLeft = tabLeft
    } else if (tabRight > scrollLeft + clientWidth) {
      container.scrollLeft = tabRight - clientWidth
    }
  }, [activeTabId, openTabs.length])

  // Restore saved file tabs for the current remote workspace once per root.
  useEffect(() => {
    if (!remoteRoot || !savedTabsState || savedTabsState.remoteRoot !== remoteRoot) return
    if (restoredTabsRootRef.current === remoteRoot) return
    restoredTabsRootRef.current = remoteRoot
    if (savedTabsState.tabs.length === 0) return

    let cancelled = false
    const restore = async () => {
      const restored: EditorTab[] = []
      for (const t of savedTabsState.tabs) {
        try {
          const content = await remoteReadFile(t.path, surfaceId)
          if (cancelled) return
          restored.push({
            id: `file:${t.path}`,
            type: 'file',
            path: t.path,
            label: t.label || (t.path.split('/').pop() ?? t.path),
            content,
            savedContent: content,
            language: inferLanguage(t.path),
          })
        } catch {
          // Skip files that no longer exist or can't be read.
        }
      }
      if (cancelled || restored.length === 0) return

      setOpenTabs((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        const add = restored.filter((tab) => !seen.has(tab.id))
        return add.length > 0 ? [...prev, ...add] : prev
      })

      const preferred = savedTabsState.activePath ? `file:${savedTabsState.activePath}` : null
      const active = preferred && restored.some((t) => t.id === preferred)
        ? preferred
        : restored[restored.length - 1]?.id ?? null

      if (active) {
        const activeFile = restored.find((t) => t.id === active)
        setActiveTabId(active)
        if (activeFile) {
          setActiveNativePath(activeFile.path)
          setPreviewPath(activeFile.path)
          setPreviewLanguage(activeFile.language ?? 'plaintext')
          setPreviewContent(activeFile.content ?? null)
          onActiveFileChange('')
        }
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [remoteRoot, savedTabsState, surfaceId, onActiveFileChange])

  // Persist only regular workspace file tabs (exclude diff/ext tabs).
  useEffect(() => {
    if (!onTabsStateChange) return
    if (!remoteRoot) {
      if (lastPersistedTabsRef.current !== '') {
        lastPersistedTabsRef.current = ''
        onTabsStateChange(null)
      }
      return
    }

    const fileTabs = openTabs
      .filter((t) => t.type === 'file' && t.id.startsWith('file:'))
      .map((t) => ({ path: t.path, label: t.label }))
    const activePath = activeTab && activeTab.type === 'file' && activeTab.id.startsWith('file:')
      ? activeTab.path
      : null
    const nextState: WorkspaceTabsState = { remoteRoot, tabs: fileTabs, activePath }
    const serialized = JSON.stringify(nextState)
    if (serialized === lastPersistedTabsRef.current) return
    lastPersistedTabsRef.current = serialized
    onTabsStateChange(nextState)
  }, [openTabs, activeTab, remoteRoot, onTabsStateChange])

  // Close tab context menu on outside click.
  useEffect(() => {
    if (!tabContextMenu) return
    const onPointerDown = () => setTabContextMenu(null)
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [tabContextMenu])

  const fetchGitStatus = useCallback(async () => {
    if (!remoteRoot) return
    const requestSeq = ++gitStatusRequestSeqRef.current
    setGitStatusLoading(true)
    try {
      const status = await gitApi.status(remoteRoot)
      if (requestSeq === gitStatusRequestSeqRef.current) {
        setGitStatus(status)
      }
    } catch {
      if (requestSeq === gitStatusRequestSeqRef.current) {
        setGitStatus(null)
      }
    } finally {
      if (requestSeq === gitStatusRequestSeqRef.current) {
        setGitStatusLoading(false)
      }
    }
  }, [remoteRoot])

  // Fetch git status when workspace opens and on fs changes
  useEffect(() => {
    if (remoteRoot) fetchGitStatus()
  }, [remoteRoot, fsWatcherVersion, fetchGitStatus])

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
    if (remoteRoot) void fetchGitStatus()
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
        (content) => {
          setPreviewContent(content)
          setOpenTabs(prev => prev.map(t => {
            if (t.id !== `file:${activeNativePath}` || t.isDirty) return t
            return { ...t, content, savedContent: content, saveError: null }
          }))
        },
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
          if (!cancelled) {
            setPreviewContent(content)
            // Also update the matching open tab
            setOpenTabs(prev => prev.map(t => {
              if (t.id !== `file:${path}` || t.isDirty) return t
              return { ...t, content, savedContent: content, saveError: null }
            }))
          }
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

  const findLazyFileNode = useCallback((path: string): LazyFile | null => {
    const walk = (nodes: LazyNode[]): LazyFile | null => {
      for (const node of nodes) {
        if (node.kind === 'file' && node.path === path) return node
        if (node.kind === 'dir' && node.children) {
          const found = walk(node.children)
          if (found) return found
        }
      }
      return null
    }
    return walk(lazyTree)
  }, [lazyTree])

  const setTabLoadedContent = useCallback((tabId: string, content: string) => {
    setOpenTabs((prev) => prev.map((tab) => (
      tab.id === tabId
        ? { ...tab, content, savedContent: content, isDirty: false, isSaving: false, saveError: null }
        : tab
    )))
  }, [])

  const handleTabContentChange = useCallback((tabId: string, nextContent: string | undefined) => {
    setOpenTabs((prev) => prev.map((tab) => {
      if (tab.id !== tabId || !isEditableWorkspaceTab(tab)) return tab
      const content = nextContent ?? ''
      const savedContent = tab.savedContent ?? ''
      return {
        ...tab,
        content,
        isDirty: content !== savedContent,
        saveError: null,
      }
    }))
    if (activeTabId === tabId && activeNativePath) {
      setPreviewContent(nextContent ?? '')
    }
  }, [activeNativePath, activeTabId])

  const handleSaveTab = useCallback(async (tabId: string) => {
    const tab = openTabs.find((entry) => entry.id === tabId)
    if (!tab || !isEditableWorkspaceTab(tab)) return
    const nextContent = tab.content ?? ''

    setOpenTabs((prev) => prev.map((entry) => (
      entry.id === tabId ? { ...entry, isSaving: true, saveError: null } : entry
    )))

    try {
      if (remoteRoot) {
        await remoteWriteFile(tab.path, nextContent, surfaceId)
      } else {
        const node = findLazyFileNode(tab.path)
        if (!node?.handle) throw new Error('Local file handle is unavailable')
        const writable = await node.handle.createWritable()
        await writable.write(nextContent)
        await writable.close()
      }

      setOpenTabs((prev) => prev.map((entry) => (
        entry.id === tabId
          ? { ...entry, content: nextContent, savedContent: nextContent, isDirty: false, isSaving: false, saveError: null }
          : entry
      )))
      if (activeTabId === tabId) {
        setPreviewContent(nextContent)
      }
      bumpTree()
      if (remoteRoot) void fetchGitStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file'
      setOpenTabs((prev) => prev.map((entry) => (
        entry.id === tabId ? { ...entry, isSaving: false, saveError: message } : entry
      )))
    }
  }, [activeTabId, bumpTree, fetchGitStatus, findLazyFileNode, openTabs, remoteRoot, surfaceId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      if (!activeTabEditable || !activeTabId) return
      event.preventDefault()
      void handleSaveTab(activeTabId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTabEditable, activeTabId, handleSaveTab])

  const editorFile = activeTab?.type === 'file'
    ? { path: activeTab.path, language: activeTab.language ?? 'plaintext', content: activeTab.content ?? '' }
    : activeNativePath
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

  const handleOpenFileByPath = useCallback(async (path: string): Promise<boolean> => {
    const targetPath = normalizePath(path)
    const rootPath = remoteRoot ? normalizePath(remoteRoot) : null
    const parts = rootPath && (targetPath === rootPath || targetPath.startsWith(`${rootPath}/`))
      ? targetPath.slice(rootPath.length).replace(/^\/+/, '').split('/').filter(Boolean)
      : targetPath.split('/').filter(Boolean)

    if (parts.length === 0) return false

    let currentNodes = lazyTree
    let currentPath = rootPath ?? ''
    const dirsToExpand: string[] = []

    for (const part of parts.slice(0, -1)) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const dirNode = currentNodes.find((node): node is LazyDir =>
        node.kind === 'dir' && normalizePath(node.path) === currentPath,
      )
      if (!dirNode) return false
      if (dirNode.children === null) {
        dirNode.childrenLoading = true
        bumpTree()
        dirNode.children = dirNode.handle
          ? await scanDir(dirNode.handle, dirNode.path)
          : await remoteScanDir(dirNode.path, surfaceId)
        dirNode.childrenLoading = false
        bumpTree()
      }
      dirsToExpand.push(currentPath)
      currentNodes = dirNode.children ?? []
    }

    if (dirsToExpand.length > 0) {
      setExpandedDirs((prev) => {
        const next = new Set(prev)
        for (const dirPath of dirsToExpand) next.add(dirPath)
        return next
      })
    }

    const fileNode = currentNodes.find((node): node is LazyFile =>
      node.kind === 'file' && normalizePath(node.path) === targetPath,
    )
    if (!fileNode) return false

    const tabId = `file:${fileNode.path}`
    setOpenTabs((prev) => {
      const existing = prev.find((t) => t.id === tabId)
      if (existing) return prev
      const newTab: EditorTab = {
        id: tabId,
        type: 'file',
        path: fileNode.path,
        label: fileNode.name,
        content: null,
        savedContent: null,
        language: inferLanguage(fileNode.path),
      }
      return [...prev, newTab]
    })
    setActiveTabId(tabId)
    onActiveFileChange('')
    setActiveNativePath(fileNode.path)
    setPreviewPath(fileNode.path)
    setPreviewLanguage(inferLanguage(fileNode.path))
    setLoadingFile(true)
    try {
      const content = fileNode.handle ? await readFileHandle(fileNode.handle) : await remoteReadFile(fileNode.path, surfaceId)
      setPreviewContent(content)
      setTabLoadedContent(tabId, content)
    } catch {
      setPreviewContent('// Failed to read file')
      setTabLoadedContent(tabId, '// Failed to read file')
    }
    setLoadingFile(false)
    return true
  }, [bumpTree, lazyTree, onActiveFileChange, remoteRoot, setTabLoadedContent, surfaceId])

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
    const tabId = `file:${node.path}`
    // If tab already open, just activate it
    setOpenTabs(prev => {
      const existing = prev.find(t => t.id === tabId)
      if (existing) return prev // will activate below
      const newTab: EditorTab = {
        id: tabId,
        type: 'file',
        path: node.path,
        label: node.name,
        content: null,
        savedContent: null,
        language: inferLanguage(node.path),
      }
      return [...prev, newTab]
    })
    setActiveTabId(tabId)
    onActiveFileChange('')
    setActiveNativePath(node.path)
    setPreviewPath(node.path)
    setPreviewLanguage(inferLanguage(node.path))
    setLoadingFile(true)
    try {
      const content = node.handle ? await readFileHandle(node.handle) : await remoteReadFile(node.path, surfaceId)
      setPreviewContent(content)
      // Update tab content
      setTabLoadedContent(tabId, content)
    } catch {
      setPreviewContent('// Failed to read file')
      setTabLoadedContent(tabId, '// Failed to read file')
    }
    setLoadingFile(false)
  }, [onActiveFileChange, setTabLoadedContent, surfaceId])

  /* ---- Context / reference ---- */
  const handleContextNativeFile = useCallback(async (node: LazyFile) => {
    try {
      const content = node.handle ? await readFileHandle(node.handle) : await remoteReadFile(node.path, surfaceId)
      onReferenceFile({ id: node.path, name: node.name, path: node.path, content, language: inferLanguage(node.path) })
    } catch { /* ignore */ }
  }, [onReferenceFile, surfaceId])

  /* ---- Open diff from source control ---- */
  const handleScOpenDiff = useCallback(async (filePath: string) => {
    if (!remoteRoot) return
    const tabId = `git-diff:${filePath}`
    // If diff tab already open, just activate it
    const existingTab = openTabs.find(t => t.id === tabId)
    if (existingTab) {
      setActiveTabId(tabId)
      setScDiffFile(existingTab.diffEntry ?? null)
      return
    }
    setScDiffLoading(true)
    try {
      const diffs = await gitApi.fileDiffs(remoteRoot)
      const normalizedFilePath = normalizePath(filePath)
      const normalizedRoot = normalizePath(remoteRoot)
      const relativeFilePath = normalizedFilePath === normalizedRoot
        ? ''
        : normalizedFilePath.startsWith(`${normalizedRoot}/`)
          ? normalizedFilePath.slice(normalizedRoot.length + 1)
          : normalizedFilePath

      const entry = diffs.find((diff) => {
        const normalizedDiffPath = normalizePath(diff.path)
        return normalizedDiffPath === normalizedFilePath
          || normalizedDiffPath === relativeFilePath
          || normalizedFilePath.endsWith(`/${normalizedDiffPath}`)
          || normalizedDiffPath.endsWith(`/${relativeFilePath}`)
      })
      if (entry) {
        setScDiffFile(entry)
        const fileName = filePath.split('/').pop() ?? filePath
        const newTab: EditorTab = {
          id: tabId,
          type: 'diff',
          path: filePath,
          label: fileName,
          diffMode: 'git',
          language: inferLanguage(filePath),
          originalContent: entry.original,
          modifiedContent: entry.modified,
          diffEntry: entry,
        }
        setOpenTabs(prev => [...prev, newTab])
        setActiveTabId(tabId)
      } else {
        // Fallback so source-control clicks still open a comparable view even
        // if the diff API returns the path in an unexpected form.
        const absolutePath = relativeFilePath ? `${normalizedRoot}/${relativeFilePath}` : normalizedFilePath
        let content = ''
        try {
          content = await remoteReadFile(absolutePath, surfaceId)
        } catch {
          try {
            content = await remoteReadFile(normalizedFilePath, surfaceId)
          } catch {
            content = ''
          }
        }
        const fileName = filePath.split('/').pop() ?? filePath
        const newTab: EditorTab = {
          id: tabId,
          type: 'diff',
          path: absolutePath,
          label: fileName,
          diffMode: 'review',
          language: inferLanguage(filePath),
          originalContent: content,
          modifiedContent: content,
        }
        setOpenTabs(prev => [...prev, newTab])
        setActiveTabId(tabId)
      }
    } catch { /* ignore */ }
    setScDiffLoading(false)
  }, [remoteRoot, openTabs, surfaceId])

  const handleOpenReviewDiff = useCallback(async ({
    path,
    originalContent,
    modifiedContent,
    language,
  }: {
    path: string
    originalContent: string
    modifiedContent: string
    language?: string
  }): Promise<boolean> => {
    const tabId = `review-diff:${path}`
    const label = path.split(/[\\/]/).pop() ?? path
    const nextTab: EditorTab = {
      id: tabId,
      type: 'diff',
      path,
      label,
      version: 1,
      diffMode: 'review',
      language: language ?? inferLanguage(path),
      originalContent,
      modifiedContent,
    }
    setOpenTabs((prev) => {
      const existing = prev.find((t) => t.id === tabId)
      if (existing) {
        return prev.map((t) => t.id === tabId
          ? { ...t, ...nextTab, version: (t.version ?? 0) + 1 }
          : t)
      }
      return [...prev, nextTab]
    })
    setActiveTabId(tabId)
    setScDiffFile(null)
    setActiveNativePath(null)
    setPreviewContent(null)
    setPreviewPath(path)
    setPreviewLanguage(language ?? inferLanguage(path))
    return true
  }, [])

  const handleOpenPreviewTarget = useCallback((target: string): boolean => {
    const trimmed = target.trim()
    if (!trimmed) return false
    const resolved = resolvePreviewTarget(trimmed)
    if (!resolved) return false

    const tabId = `preview:${trimmed}`
    const nextTab: EditorTab = {
      id: tabId,
      type: 'preview',
      path: trimmed,
      label: resolved.label,
      previewTarget: trimmed,
      previewSrc: resolved.iframeSrc,
    }

    setOpenTabs((prev) => {
      const existing = prev.find((tab) => tab.id === tabId)
      if (existing) {
        return prev.map((tab) => (tab.id === tabId ? { ...tab, ...nextTab } : tab))
      }
      const previewIndex = prev.findIndex((tab) => tab.type === 'preview')
      if (previewIndex >= 0) {
        const next = [...prev]
        next[previewIndex] = nextTab
        return next
      }
      return [...prev, nextTab]
    })
    setActiveTabId(tabId)
    setScDiffFile(null)
    setActiveNativePath(null)
    setPreviewContent(null)
    setPreviewPath(trimmed)
    setPreviewLanguage('plaintext')
    onActiveFileChange('')
    return true
  }, [onActiveFileChange])

  useImperativeHandle(ref, () => ({
    openDirectory: handleOpenDirectory,
    openRemoteWorkspace: handleOpenRemoteWorkspace,
    openFileByPath: handleOpenFileByPath,
    readFileByPath: handleReadFileByPath,
    openReviewDiff: handleOpenReviewDiff,
    openPreviewTarget: handleOpenPreviewTarget,
    searchFiles: handleSearchFiles,
  }), [handleOpenDirectory, handleOpenRemoteWorkspace, handleOpenFileByPath, handleReadFileByPath, handleOpenReviewDiff, handleOpenPreviewTarget, handleSearchFiles])

  useEffect(() => {
    if (!previewRequest) return
    if (handledPreviewRequestKeyRef.current === previewRequest.key) return
    handledPreviewRequestKeyRef.current = previewRequest.key
    handleOpenPreviewTarget(previewRequest.target)
  }, [previewRequest, handleOpenPreviewTarget])

  /* ---- Git commit / push actions ---- */
  const handleGitAction = useCallback(async (action: GitStackedAction) => {
    if (!remoteRoot || gitActionBusy) return
    setGitActionBusy(true)
    setGitActionError(null)
    try {
      await gitApi.runStackedAction(remoteRoot, action, {
        commitMessage: commitMessage.trim() || undefined,
      })
      setCommitMessage('')
      setScDiffFile(null)
      // Close all diff tabs (diffs are stale after commit)
      setOpenTabs(prev => {
        const cleaned = prev.filter(t => t.type !== 'diff')
        return cleaned
      })
      setActiveTabId(prev => {
        const tabs = openTabs.filter(t => t.type !== 'diff')
        if (prev && tabs.some(t => t.id === prev)) return prev
        return tabs[tabs.length - 1]?.id ?? null
      })
      // Refresh status after action
      await fetchGitStatus()
    } catch (err) {
      setGitActionError(err instanceof Error ? err.message : 'Git action failed')
    }
    setGitActionBusy(false)
  }, [remoteRoot, gitActionBusy, commitMessage, fetchGitStatus, openTabs])

  /* ---- Generate commit message via AI ---- */
  const handleGenerateCommitMessage = useCallback(async () => {
    if (!remoteRoot || !gitStatus?.workingTree.files.length || commitMsgGenerating || gitActionBusy) return
    setCommitMsgGenerating(true)
    try {
      const { message } = await gitApi.generateCommitMessage(remoteRoot, provider, cliModel)
      if (message) setCommitMessage(message)
    } catch {
      // fail silently — user can type manually
    }
    setCommitMsgGenerating(false)
  }, [remoteRoot, gitStatus, commitMsgGenerating, gitActionBusy, provider, cliModel])

  /* ---- Select external file ---- */
  const handleSelectExtFile = useCallback((id: string) => {
    const extFile = files.find(f => f.id === id)
    if (!extFile) return
    const tabId = `ext:${id}`
    setOpenTabs(prev => {
      const existing = prev.find(t => t.id === tabId)
      if (existing) return prev
      const newTab: EditorTab = {
        id: tabId,
        type: 'file',
        path: extFile.path,
        label: extFile.name,
        content: extFile.content,
        savedContent: extFile.content,
        language: extFile.language,
      }
      return [...prev, newTab]
    })
    setActiveTabId(tabId)
    setActiveNativePath(null)
    setPreviewContent(null)
    onActiveFileChange(id)
  }, [onActiveFileChange, files])

  /* ---- Tab management ---- */
  const handleCloseTab = useCallback((tabId: string) => {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      if (idx < 0) return prev
      const next = prev.filter(t => t.id !== tabId)
      // If closing the active tab, activate the nearest neighbor
      if (tabId === activeTabId) {
        const neighbor = next[Math.min(idx, next.length - 1)]
        const newActiveId = neighbor?.id ?? null
        // Use setTimeout to avoid setActiveTabId during render
        setTimeout(() => {
          setActiveTabId(newActiveId)
          if (!newActiveId) {
            setActiveNativePath(null)
            setPreviewContent(null)
            setScDiffFile(null)
          } else if (neighbor?.type === 'file') {
            setActiveNativePath(neighbor.path)
            setPreviewContent(neighbor.content ?? null)
            setPreviewLanguage(neighbor.language ?? 'plaintext')
            setPreviewPath(neighbor.path)
            setScDiffFile(null)
          } else if (neighbor?.type === 'preview') {
            setActiveNativePath(null)
            setPreviewContent(null)
            setPreviewLanguage('plaintext')
            setPreviewPath(neighbor.previewTarget ?? neighbor.path)
            setScDiffFile(null)
          } else if (neighbor?.type === 'diff') {
            setScDiffFile(neighbor.diffMode === 'git' ? (neighbor.diffEntry ?? null) : null)
          }
        }, 0)
      }
      return next
    })
  }, [activeTabId])

  const handleSwitchTab = useCallback((tabId: string) => {
    const tab = openTabs.find(t => t.id === tabId)
    if (!tab) return
    setActiveTabId(tabId)
    if (tab.type === 'file') {
      setActiveNativePath(tab.path)
      setPreviewContent(tab.content ?? null)
      setPreviewLanguage(tab.language ?? 'plaintext')
      setPreviewPath(tab.path)
      setScDiffFile(null)
      onActiveFileChange(tab.id.startsWith('ext:') ? tab.id.slice(4) : '')
    } else if (tab.type === 'preview') {
      setActiveNativePath(null)
      setPreviewContent(null)
      setPreviewLanguage('plaintext')
      setPreviewPath(tab.previewTarget ?? tab.path)
      setScDiffFile(null)
      onActiveFileChange('')
    } else if (tab.type === 'diff') {
      setScDiffFile(tab.diffMode === 'git' ? (tab.diffEntry ?? null) : null)
    }
  }, [openTabs, onActiveFileChange])

  const handleCloseAllTabs = useCallback(() => {
    setOpenTabs([])
    setActiveTabId(null)
    setActiveNativePath(null)
    setPreviewContent(null)
    setScDiffFile(null)
    setTabContextMenu(null)
  }, [])

  const handleCloseOtherTabs = useCallback((tabId: string) => {
    setOpenTabs((prev) => prev.filter((t) => t.id === tabId))
    setActiveTabId(tabId)
    setTabContextMenu(null)
  }, [])

  const handleCloseTabsToRight = useCallback((tabId: string) => {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId)
      if (idx < 0) return prev
      return prev.slice(0, idx + 1)
    })
    setTabContextMenu(null)
  }, [])

  const handleReorderTabs = useCallback((dragId: string, targetId: string) => {
    if (dragId === targetId) return
    setOpenTabs((prev) => {
      const from = prev.findIndex((t) => t.id === dragId)
      const to = prev.findIndex((t) => t.id === targetId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const hasNativeTree = lazyTree.length > 0
  const hasExtFiles = files.length > 0

  // Mobile: tab-based view (Files vs Git vs Editor)
  const [mobileTab, setMobileTab] = useState<'files' | 'git' | 'editor'>('files')
  const changedFileCount = gitStatus?.workingTree.files.length ?? 0
  const canGenerateCommitMessage = changedFileCount > 0 && !commitMsgGenerating && !gitActionBusy
  const contextTabIndex = tabContextMenu ? openTabs.findIndex((t) => t.id === tabContextMenu.tabId) : -1

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
    const effectiveMobileTab = (mobileTab === 'files' || mobileTab === 'git') && !showTreeProp ? 'editor'
      : mobileTab === 'editor' && !showEditorProp ? 'files'
      : mobileTab

    // Both panels hidden — render nothing (App.tsx should also collapse the section)
    if (!showTreeProp && !showEditorProp) return null

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Tab bar — keep Files/Changes available whenever the tree pane exists */}
        {showTreeProp && (
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
              effectiveMobileTab === 'git' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => setMobileTab('git')}
          >
            <GitBranch className="h-3 w-3" />
            Changes
            {changedFileCount > 0 && (
              <span className="text-[9px] bg-primary/20 text-primary rounded-full px-1.5 leading-tight font-bold">
                {changedFileCount}
              </span>
            )}
          </button>
          {showEditorProp && (
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
          )}
        </div>
        )}

        {/* Single-pane header when only the editor pane is visible */}
        {!showTreeProp && showEditorProp && (
          <div className="flex items-center justify-between h-8 border-b bg-muted/30 shrink-0 px-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              Editor
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
                  gitStatusMap={gitStatusMap}
                  dirChangesSet={dirChangesSet}
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

        {/* Git Changes tab (mobile) */}
        {effectiveMobileTab === 'git' && showTreeProp && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-1.5 h-7 px-2 border-b bg-muted/10 shrink-0">
              {gitStatus?.branch && (
                <span className="text-[11px] text-muted-foreground truncate flex-1">
                  <GitBranch className="h-3 w-3 inline mr-0.5 -mt-px" />
                  {gitStatus.branch}
                </span>
              )}
              <button
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                onClick={fetchGitStatus}
                disabled={gitStatusLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${gitStatusLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {/* Commit message + actions (mobile) */}
            {remoteRoot && gitStatus && (
            <div className="px-2 py-2 border-b bg-muted/5 shrink-0 space-y-2">
              <div className="relative">
                <textarea
                  className="w-full text-sm bg-background border rounded px-2 py-1.5 pr-8 resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  rows={2}
                  placeholder="Commit message"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  disabled={gitActionBusy || commitMsgGenerating}
                />
                <button
                  className="absolute top-1.5 right-1.5 p-0.5 rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={handleGenerateCommitMessage}
                  disabled={!canGenerateCommitMessage}
                  title="Generate commit message with AI"
                >
                  {commitMsgGenerating
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Sparkles className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => handleGitAction('commit')}
                  disabled={gitActionBusy || changedFileCount === 0}
                >
                  {gitActionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Commit
                </button>
                <button
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => handleGitAction('commit_push')}
                  disabled={gitActionBusy || changedFileCount === 0}
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  Commit & Push
                </button>
                {(gitStatus.aheadCount > 0) && (
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleGitAction('commit_push')}
                    disabled={gitActionBusy}
                    title={`Push ${gitStatus.aheadCount} committed commit${gitStatus.aheadCount > 1 ? 's' : ''}`}
                  >
                    <CloudUpload className="h-3.5 w-3.5" />
                    Push ({gitStatus.aheadCount})
                  </button>
                )}
              </div>
              {gitActionError && (
                <div className="text-xs text-red-500">{gitActionError}</div>
              )}
            </div>
            )}
            <ScrollArea className="flex-1 min-h-0">
              {gitStatusLoading && !gitStatus && (
                <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              )}
              {gitStatus && changedFileCount === 0 && (
                <div className="p-4 text-sm text-muted-foreground text-center">No changes detected.</div>
              )}
              {gitStatus && changedFileCount > 0 && (
                <div className="p-1">
                  <div className="text-[11px] text-muted-foreground px-2 py-1.5 font-medium">
                    Changes ({changedFileCount})
                    <span className="ml-1">
                      <span className="text-green-500">+{gitStatus.workingTree.insertions}</span>
                      {' '}
                      <span className="text-red-500">-{gitStatus.workingTree.deletions}</span>
                    </span>
                  </div>
                  <div className="mt-1">
                  {gitStatus.workingTree.files.map((f) => {
                    const fileStatus = (f as { status?: string }).status ?? 'M'
                    const fileName = f.path.split('/').pop() ?? f.path
                    return (
                      <button
                        type="button"
                        key={f.path}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          handleScOpenDiff(f.path)
                          setMobileTab('editor')
                        }}
                      >
                        <GitStatusBadge status={fileStatus} className="text-[10px]" />
                        <FileIcon filename={fileName} className="h-4 w-4 shrink-0" />
                        <span className={`truncate flex-1 ${fileStatus === 'D' ? 'line-through text-muted-foreground' : ''}`}>
                          {fileName}
                        </span>
                      </button>
                    )
                  })}
                  </div>
                </div>
              )}
              {!remoteRoot && (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  Open a workspace to see git changes.
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* Editor tab */}
        {effectiveMobileTab === 'editor' && showEditorProp && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Mobile tab bar */}
            {openTabs.length > 0 && (
            <div className="flex items-center h-8 bg-muted/30 border-b shrink-0 overflow-x-auto overflow-y-hidden">
              {showTreeProp && (
                <button
                  className="flex items-center px-2 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => { setMobileTab(scDiffFile ? 'git' : 'files') }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              )}
              {openTabs.map((tab) => {
                const isActive = tab.id === activeTabId
                return (
                  <div
                    key={tab.id}
                    className={`group relative flex items-center gap-1 h-8 px-2.5 border-r border-border/40 cursor-pointer shrink-0 text-xs ${
                      isActive ? 'bg-background text-foreground' : 'text-muted-foreground'
                    }`}
                    onClick={() => handleSwitchTab(tab.id)}
                  >
                    {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
                    {tab.type === 'diff' && tab.diffMode === 'git' && tab.diffEntry ? (
                      <GitStatusBadge status={tab.diffEntry.status} className="text-[9px]" />
                    ) : tab.type === 'preview' ? (
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <FileIcon filename={tab.path} className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate max-w-[140px]">{getEditorTabTitle(tab)}</span>
                    <button
                      className="p-0.5 rounded-sm hover:bg-foreground/10 shrink-0 opacity-60"
                      onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
              <div className="flex-1" />
              {onToggleEditor && (
                <button
                  onClick={onToggleEditor}
                  className="flex items-center text-[11px] text-muted-foreground hover:text-foreground px-1.5 shrink-0"
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              )}
            </div>
            )}
            {/* Fallback header when no tabs */}
            {openTabs.length === 0 && (
            <div className="flex items-center gap-1.5 h-7 px-2 border-b bg-muted/20 shrink-0">
              {showTreeProp && (
                <button
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setMobileTab('files')}
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
              )}
              <span className="text-[11px] text-muted-foreground flex-1">Editor</span>
              {onToggleEditor && (
                <button
                  onClick={onToggleEditor}
                  className="flex items-center text-[11px] text-muted-foreground hover:text-foreground px-1.5"
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              )}
            </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto">
              {scDiffLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading diff...
                </div>
              ) : activeTab?.type === 'diff' && activeTab.diffMode === 'review' ? (
                <DiffView
                  key={`${activeTab.id}:${activeTab.version ?? 0}`}
                  filePath={activeTab.path}
                  originalContent={activeTab.originalContent ?? ''}
                  modifiedContent={activeTab.modifiedContent ?? ''}
                  language={activeTab.language ?? 'plaintext'}
                  onClose={() => handleCloseTab(activeTab.id)}
                  onApply={(result) => { void onApplyDiff?.(activeTab.path, result) }}
                />
              ) : activeTab?.type === 'diff' && activeTab.diffMode === 'git' ? (
                <DiffEditor
                  key={activeTab.id}
                  original={activeTab.originalContent ?? activeTab.diffEntry?.original ?? ''}
                  modified={activeTab.modifiedContent ?? activeTab.diffEntry?.modified ?? ''}
                  language={activeTab.language ?? 'plaintext'}
                  theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
                  options={{
                    readOnly: true,
                    renderSideBySide: false,
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                  }}
                />
              ) : activeTab?.type === 'preview' ? (
                activeTab.previewSrc ? (
                  <iframe
                    key={activeTab.id}
                    src={activeTab.previewSrc}
                    title={activeTab.label || 'Workspace preview'}
                    className="h-full w-full bg-white"
                    sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
                    Preview target is not available.
                  </div>
                )
              ) : loadingFile ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : activeTab?.type === 'file' && activeTab.content ? (
                <pre className="text-[11px] leading-relaxed p-2 font-mono whitespace-pre overflow-x-auto text-foreground">
                  <code>{activeTab.content}</code>
                </pre>
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
        {/* Tab bar: Files | Source Control */}
        <div className="flex items-center h-[35px] border-b bg-muted/20 shrink-0 px-1 gap-0.5">
          <button
            className={`flex h-7 items-center gap-1 px-2 rounded text-[11px] font-medium transition-colors ${
              treeTab === 'files' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => { setTreeTab('files'); setScDiffFile(null) }}
          >
            <FolderOpen className="h-3 w-3" />
            Files
          </button>
          <button
            className={`flex h-7 items-center gap-1 px-2 rounded text-[11px] font-medium transition-colors ${
              treeTab === 'git' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => { setTreeTab('git'); setScDiffFile(null) }}
          >
            <GitBranch className="h-3 w-3" />
            Source Control
            {changedFileCount > 0 && (
              <span className="ml-0.5 text-[9px] bg-primary/20 text-primary rounded-full px-1.5 leading-tight font-bold">
                {changedFileCount}
              </span>
            )}
          </button>
          <div className="flex-1" />
          {onToggleTree && (
            <button
              onClick={onToggleTree}
              className="flex h-7 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded px-1 hover:bg-muted"
            >
              <EyeOff className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Files tab */}
        {treeTab === 'files' && (
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
                gitStatusMap={gitStatusMap}
                dirChangesSet={dirChangesSet}
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
        )}

        {/* Source Control tab */}
        {treeTab === 'git' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Branch + refresh header */}
          <div className="flex h-[35px] items-center gap-1.5 px-2 border-b bg-muted/10 shrink-0">
            {gitStatus?.branch && (
              <span className="text-[10px] text-muted-foreground truncate flex-1" title={gitStatus.branch}>
                <GitBranch className="h-3 w-3 inline mr-0.5 -mt-px" />
                {gitStatus.branch}
              </span>
            )}
            {!gitStatus?.branch && <span className="text-[10px] text-muted-foreground flex-1">No repo</span>}
            <button
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              onClick={fetchGitStatus}
              disabled={gitStatusLoading}
              title="Refresh git status"
            >
              <RefreshCw className={`h-3 w-3 ${gitStatusLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Commit message + actions */}
          {remoteRoot && gitStatus && (
          <div className="px-2 py-1.5 border-b bg-muted/5 shrink-0 space-y-1.5">
            <div className="relative">
              <textarea
                className="w-full text-xs bg-background border rounded px-2 py-1.5 pr-7 resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                rows={2}
                placeholder="Commit message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    if (changedFileCount > 0) handleGitAction('commit')
                  }
                }}
                disabled={gitActionBusy || commitMsgGenerating}
              />
              <button
                className="absolute top-1 right-1 p-0.5 rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleGenerateCommitMessage}
                disabled={!canGenerateCommitMessage}
                title="Generate commit message with AI"
              >
                {commitMsgGenerating
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Sparkles className="h-3 w-3" />}
              </button>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onClick={() => handleGitAction('commit')}
                disabled={gitActionBusy || changedFileCount === 0}
                title="Commit all changes (Ctrl+Enter)"
              >
                {gitActionBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Commit
              </button>
              <button
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-muted hover:bg-muted/80 text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onClick={() => handleGitAction('commit_push')}
                disabled={gitActionBusy || changedFileCount === 0}
                title="Commit and push"
              >
                <CloudUpload className="h-3 w-3" />
                Commit & Push
              </button>
              {(gitStatus.aheadCount > 0) && (
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-muted hover:bg-muted/80 text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  onClick={() => handleGitAction('commit_push')}
                  disabled={gitActionBusy}
                  title={`Push ${gitStatus.aheadCount} committed commit${gitStatus.aheadCount > 1 ? 's' : ''}`}
                >
                  <CloudUpload className="h-3 w-3" />
                  Push ({gitStatus.aheadCount})
                </button>
              )}
            </div>
            {gitActionError && (
              <div className="text-[10px] text-red-500 px-0.5">{gitActionError}</div>
            )}
          </div>
          )}

          {/* Changed files list */}
          <ScrollArea className="flex-1 min-h-0">
            {gitStatusLoading && !gitStatus && (
              <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </div>
            )}
            {gitStatus && changedFileCount === 0 && (
              <div className="p-3 text-xs text-muted-foreground text-center">
                No changes detected.
              </div>
            )}
            {gitStatus && changedFileCount > 0 && (
              <div className="p-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-medium">
                  Changes ({changedFileCount})
                  <span className="normal-case tracking-normal ml-1">
                    <span className="text-green-500">+{gitStatus.workingTree.insertions}</span>
                    {' '}
                    <span className="text-red-500">-{gitStatus.workingTree.deletions}</span>
                  </span>
                </div>
                <div className="mt-1">
                {gitStatus.workingTree.files.map((f) => {
                  const fileStatus = (f as { status?: string }).status ?? 'M'
                  const fileName = f.path.split('/').pop() ?? f.path
                  const dirPath = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
                  const isActiveDiff = scDiffFile?.path === f.path
                  return (
                    <button
                      type="button"
                      key={f.path}
                      className={`group flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs ${
                        isActiveDiff ? 'bg-primary/15 text-foreground' : 'hover:bg-muted'
                      }`}
                      style={{ paddingLeft: 8 }}
                      onClick={() => handleScOpenDiff(f.path)}
                      title={`${f.path} — ${STATUS_LABELS[fileStatus] ?? fileStatus}`}
                    >
                      <GitStatusBadge status={fileStatus} />
                      <FileIcon filename={fileName} className="h-3.5 w-3.5 shrink-0" />
                      <span className={`truncate ${fileStatus === 'D' ? 'line-through text-muted-foreground' : ''}`}>
                        {fileName}
                      </span>
                      {dirPath && (
                        <span className="text-[10px] text-muted-foreground truncate ml-auto shrink-0 max-w-[40%]">
                          {dirPath}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                        {f.insertions > 0 && <span className="text-green-500">+{f.insertions}</span>}
                        {f.deletions > 0 && <span className="text-red-500 ml-0.5">-{f.deletions}</span>}
                      </span>
                    </button>
                  )
                })}
                </div>
              </div>
            )}
            {!remoteRoot && (
              <div className="p-3 text-xs text-muted-foreground text-center">
                Open a workspace to see git changes.
              </div>
            )}
          </ScrollArea>
        </div>
        )}

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
        {/* Tab bar — VS Code style */}
        <div className="flex items-center h-[35px] bg-[var(--tab-bg,hsl(var(--muted)/0.3))] border-b shrink-0 min-w-0">
          <div
            ref={tabScrollRef}
            className="flex items-center flex-1 min-w-0 overflow-x-auto overflow-y-hidden scrollbar-none"
            onWheel={(e) => {
              if (e.deltaY === 0) return
              e.preventDefault()
              if (tabScrollRef.current) tabScrollRef.current.scrollLeft += e.deltaY
            }}
          >
            {openTabs.map((tab) => {
              const isActive = tab.id === activeTabId
              const gitStatus4tab = tab.type === 'diff' && tab.diffMode === 'git' && tab.diffEntry ? tab.diffEntry.status : undefined
              return (
                <div
                  key={tab.id}
                  data-tab-id={tab.id}
                  className={`group relative flex items-center gap-1.5 h-[35px] px-3 border-r border-border/40 cursor-pointer shrink-0 text-xs select-none transition-colors ${
                    isActive
                      ? 'bg-background text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                  onClick={() => handleSwitchTab(tab.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setTabContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
                  }}
                  onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); handleCloseTab(tab.id) } }}
                  draggable
                  onDragStart={(e) => {
                    setDraggingTabId(tab.id)
                    e.dataTransfer.effectAllowed = tab.type === 'file' ? 'copyMove' : 'move'
                    e.dataTransfer.setData('text/jait-tab', tab.id)
                    if (tab.type === 'file') {
                      e.dataTransfer.setData('text/jait-file', JSON.stringify({ path: tab.path, name: tab.label }))
                    }
                  }}
                  onDragEnd={() => setDraggingTabId(null)}
                  onDragOver={(e) => {
                    if (!draggingTabId || draggingTabId === tab.id) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const dragId = e.dataTransfer.getData('text/jait-tab') || draggingTabId
                    if (!dragId) return
                    handleReorderTabs(dragId, tab.id)
                    setDraggingTabId(null)
                  }}
                  onDragEnter={(e) => {
                    if (!draggingTabId || draggingTabId === tab.id) return
                    e.preventDefault()
                    handleReorderTabs(draggingTabId, tab.id)
                  }}
                  title={tab.path}
                >
                  {/* Active tab bottom highlight */}
                  {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
                  {draggingTabId === tab.id && (
                    <div className="absolute inset-0 border border-primary/60 pointer-events-none" />
                  )}
                  {gitStatus4tab ? (
                    <GitStatusBadge status={gitStatus4tab} className="text-[9px]" />
                  ) : tab.type === 'preview' ? (
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <FileIcon filename={tab.path} className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {tab.isDirty && <span className="shrink-0 text-[10px] leading-none text-primary">*</span>}
                  <span className="truncate max-w-[220px]">
                    {getEditorTabTitle(tab)}
                  </span>
                  <button
                    className={`p-0.5 rounded-sm hover:bg-foreground/10 shrink-0 transition-opacity ${
                      isActive ? 'opacity-50 hover:opacity-100' : 'opacity-0 group-hover:opacity-50 hover:!opacity-100'
                    }`}
                    onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}
                    title="Close (Middle-click)"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
          {(activeTabEditable || onToggleEditor) && (
            <div className="flex items-center shrink-0">
              {activeTabEditable && (
                <button
                  onClick={() => { if (activeTabId) void handleSaveTab(activeTabId) }}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded px-1.5 py-0.5 hover:bg-muted shrink-0"
                  title={activeTab?.isSaving ? 'Saving...' : 'Save file (Ctrl/Cmd+S)'}
                  disabled={activeTab?.isSaving}
                >
                  <Save className={`h-3 w-3 ${activeTab?.isSaving ? 'animate-pulse' : ''}`} />
                </button>
              )}
              {onToggleEditor && (
                <button
                  onClick={onToggleEditor}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded px-1.5 py-0.5 hover:bg-muted shrink-0 mx-1"
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
        {activeTabEditable && activeTab?.saveError && (
          <div className="border-b bg-destructive/5 px-3 py-1 text-[11px] text-destructive shrink-0">
            {activeTab.saveError}
          </div>
        )}
        {/* Editor content area */}
        <div className="flex-1 min-h-0">
        {scDiffLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading diff...
          </div>
        ) : activeTab?.type === 'diff' && activeTab.diffMode === 'review' ? (
          <DiffView
            key={`${activeTab.id}:${activeTab.version ?? 0}`}
            filePath={activeTab.path}
            originalContent={activeTab.originalContent ?? ''}
            modifiedContent={activeTab.modifiedContent ?? ''}
            language={activeTab.language ?? 'plaintext'}
            onClose={() => handleCloseTab(activeTab.id)}
            onApply={(result) => { void onApplyDiff?.(activeTab.path, result) }}
          />
        ) : activeTab?.type === 'diff' && activeTab.diffMode === 'git' ? (
          <DiffEditor
            key={activeTab.id}
            height="100%"
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
            original={activeTab.originalContent ?? activeTab.diffEntry?.original ?? ''}
            modified={activeTab.modifiedContent ?? activeTab.diffEntry?.modified ?? ''}
            language={activeTab.language ?? inferLanguage(activeTab.path)}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              automaticLayout: true,
              renderSideBySide: !isMobile,
            }}
          />
        ) : activeTab?.type === 'preview' ? (
          activeTab.previewSrc ? (
            <iframe
              key={activeTab.id}
              src={activeTab.previewSrc}
              title={activeTab.label || 'Workspace preview'}
              className="h-full w-full bg-white"
              sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Preview target is not available.
            </div>
          )
        ) : loadingFile && activeTab?.id === activeTabId ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : activeTab?.type === 'file' ? (
          <Editor
            key={activeTab.id}
            height="100%"
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
            path={activeTab.path}
            language={activeTab.language ?? 'plaintext'}
            value={activeTab.content ?? ''}
            onChange={(value) => handleTabContentChange(activeTab.id, value)}
            options={{
              readOnly: !isEditableWorkspaceTab(activeTab),
              minimap: { enabled: false },
              fontSize: 13,
              automaticLayout: true,
            }}
          />
        ) : editorFile ? (
          <Editor
            height="100%"
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
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

      {tabContextMenu && (
      <div
        className="fixed z-50 min-w-[170px] rounded-md border bg-popover text-popover-foreground shadow-lg py-1"
        style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted"
          onClick={() => handleCloseTab(tabContextMenu.tabId)}
        >
          Close
        </button>
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
          disabled={openTabs.length <= 1}
          onClick={() => handleCloseOtherTabs(tabContextMenu.tabId)}
        >
          Close Others
        </button>
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
          disabled={contextTabIndex < 0 || contextTabIndex >= openTabs.length - 1}
          onClick={() => handleCloseTabsToRight(tabContextMenu.tabId)}
        >
          Close to the Right
        </button>
        <div className="my-1 h-px bg-border" />
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
          disabled={openTabs.length === 0}
          onClick={handleCloseAllTabs}
        >
          Close All
        </button>
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
