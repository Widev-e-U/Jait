import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import Editor from '@monaco-editor/react'
import { ArrowLeft, Boxes, Check, ChevronRight, CloudUpload, Copy, Download, Edit3, EyeOff, FilePlus, FolderOpen, FolderPlus, GitBranch, Globe, Loader2, Minus, MoreVertical, Plus, RefreshCw, Save, Search, Send, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { gitApi as gitApiImport, type GitStatusResult, type FileDiffEntry, type GitStackedAction } from '@/lib/git-api'
import type { ProviderId } from '@/lib/agents-api'
import { ArchitecturePanel } from './architecture-panel'
import { Button } from '@/components/ui/button'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { FileIcon, FolderIcon } from '@/components/icons/file-icons'
import { useResolvedTheme } from '@/hooks/use-resolved-theme'
import { resolvePreviewTarget } from '@/components/chat/dev-preview-panel'
import { DiffView } from './diff-view'
import { ReadOnlyDiffView } from '@/components/diff/read-only-diff-view'
import { ReviewableEditor } from './reviewable-editor'

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
  /** Notifies the app shell when a workspace preview tab is opened or closed. */
  onPreviewOpenChange?: (state: { open: boolean; target: string | null }) => void
  /** Mermaid source for the architecture tab. */
  architectureDiagram?: string | null
  /** Whether architecture generation is currently running. */
  architectureGenerating?: boolean
  /** Request to open the architecture tab in the editor. */
  architectureRequest?: { key: number } | null
  /** Notifies the app shell when the architecture tab is opened or closed. */
  onArchitectureOpenChange?: (open: boolean) => void
  /** Trigger architecture generation. */
  onGenerateArchitecture?: () => void
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
  /** Close the current workspace preview tab, if any. */
  closePreviewTarget: () => void
  /** Refresh the current workspace preview tab, if any. */
  refreshPreviewTarget: () => void
  /** Open the architecture tab. */
  openArchitectureTab: () => void
  /** Close the architecture tab, if any. */
  closeArchitectureTab: () => void
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

type GitAutoFetchMode = false | true | 'all'

const GIT_AUTO_FETCH_KEY = 'jait.git.autofetch'
const GIT_AUTO_FETCH_PERIOD_KEY = 'jait.git.autofetchPeriod'
const DEFAULT_GIT_AUTO_FETCH_PERIOD_SECONDS = 180

function readGitAutoFetchMode(): GitAutoFetchMode {
  if (typeof window === 'undefined') return false
  const raw = window.localStorage.getItem(GIT_AUTO_FETCH_KEY)
  if (raw === 'true') return true
  if (raw === 'all') return 'all'
  return false
}

function readGitAutoFetchPeriodSeconds(): number {
  if (typeof window === 'undefined') return DEFAULT_GIT_AUTO_FETCH_PERIOD_SECONDS
  const raw = window.localStorage.getItem(GIT_AUTO_FETCH_PERIOD_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(parsed) || parsed < 10) return DEFAULT_GIT_AUTO_FETCH_PERIOD_SECONDS
  return parsed
}

function describeGitAutoFetchMode(mode: GitAutoFetchMode): string {
  if (mode === 'all') return 'Auto-fetch: all remotes'
  if (mode === true) return 'Auto-fetch: default remote'
  return 'Auto-fetch: off'
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

function isDescendantPath(parentPath: string, candidatePath: string): boolean {
  const normalizedParent = normalizePath(parentPath)
  const normalizedCandidate = normalizePath(candidatePath)
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`)
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

async function remoteReadBackup(filePath: string, surfaceId?: string | null): Promise<string | null> {
  let url = `${API_URL}/api/workspace/backup?path=${encodeURIComponent(filePath)}`
  if (surfaceId) url += `&surfaceId=${encodeURIComponent(surfaceId)}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json() as { originalContent: string | null }
  return data.originalContent
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

interface SourceControlEntry {
  path: string
  status?: string
  insertions: number
  deletions: number
}

interface SourceControlFileNode {
  kind: 'file'
  name: string
  path: string
  entry: SourceControlEntry
}

interface SourceControlDirectoryNode {
  kind: 'dir'
  name: string
  path: string
  children: SourceControlTreeNode[]
}

type SourceControlTreeNode = SourceControlFileNode | SourceControlDirectoryNode

function buildSourceControlTree(files: SourceControlEntry[]): SourceControlTreeNode[] {
  const root: SourceControlDirectoryNode = {
    kind: 'dir',
    name: '',
    path: '',
    children: [],
  }

  for (const entry of files) {
    const normalized = entry.path.replace(/\\/g, '/')
    const parts = normalized.split('/').filter(Boolean)
    if (parts.length === 0) continue

    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      const currentPath = parts.slice(0, i + 1).join('/')
      const isLeaf = i === parts.length - 1

      if (isLeaf) {
        current.children.push({
          kind: 'file',
          name: part,
          path: normalized,
          entry,
        })
        continue
      }

      let next = current.children.find(
        (child): child is SourceControlDirectoryNode => child.kind === 'dir' && child.path === currentPath,
      )
      if (!next) {
        next = {
          kind: 'dir',
          name: part,
          path: currentPath,
          children: [],
        }
        current.children.push(next)
      }
      current = next
    }
  }

  const sortNodes = (nodes: SourceControlTreeNode[]): SourceControlTreeNode[] => (
    [...nodes]
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map((node) => node.kind === 'dir'
        ? { ...node, children: sortNodes(node.children) }
        : node)
  )

  return sortNodes(root.children)
}

const gitApi = gitApiImport

function isEditableWorkspaceTab(tab: EditorTab | null): boolean {
  return Boolean(tab && tab.type === 'file' && tab.id.startsWith('file:'))
}

function getEditorTabTitle(tab: EditorTab): string {
  if (tab.type === 'architecture') return tab.label || 'Architecture'
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
  type: 'file' | 'diff' | 'preview' | 'architecture'
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

interface MobileTreeDragState {
  node: LazyNode
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  ready: boolean
  active: boolean
  dropDir: string | null
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
  const [isDragging, setIsDragging] = useState(false)
  const frameRef = useRef<number | null>(null)
  const pendingSizeRef = useRef<number | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      dragging.current = true
      setIsDragging(true)
      const pointerId = e.pointerId
      const target = e.currentTarget
      cleanupRef.current?.()
      target.setPointerCapture?.(pointerId)
      const startPos = direction === 'horizontal' ? e.clientX : e.clientY
      const startSize = size

      const onMove = (ev: PointerEvent) => {
        if (!dragging.current) return
        const pos = direction === 'horizontal' ? ev.clientX : ev.clientY
        const delta = pos - startPos
        pendingSizeRef.current = Math.min(max, Math.max(min, startSize + delta))
        if (frameRef.current !== null) return
        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null
          const nextSize = pendingSizeRef.current
          if (nextSize !== null) {
            setSize(nextSize)
          }
        })
      }
      const cleanup = () => {
        dragging.current = false
        setIsDragging(false)
        if (target.hasPointerCapture?.(pointerId)) {
          target.releasePointerCapture?.(pointerId)
        }
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current)
          frameRef.current = null
        }
        if (pendingSizeRef.current !== null) {
          setSize(pendingSizeRef.current)
          pendingSizeRef.current = null
        }
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        document.removeEventListener('pointercancel', onUp)
        target.removeEventListener('lostpointercapture', onLostPointerCapture)
        window.removeEventListener('blur', onWindowBlur)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        cleanupRef.current = null
      }
      const onUp = () => {
        cleanup()
      }
      const onLostPointerCapture = () => {
        cleanup()
      }
      const onWindowBlur = () => {
        cleanup()
      }
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      cleanupRef.current = cleanup
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onUp)
      target.addEventListener('lostpointercapture', onLostPointerCapture)
      window.addEventListener('blur', onWindowBlur)
    },
    [size, min, max, direction],
  )

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, String(size))
  }, [size, storageKey])

  return { size, onPointerDown, isDragging } as const
}

/* ------------------------------------------------------------------ */
/*  Search result highlight helper                                     */
/* ------------------------------------------------------------------ */

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const parts: React.ReactNode[] = []
  let cursor = 0
  let idx = lower.indexOf(q, cursor)
  while (idx !== -1) {
    if (idx > cursor) parts.push(text.slice(cursor, idx))
    parts.push(
      <span key={idx} className="bg-yellow-300/40 dark:bg-yellow-500/30 text-foreground rounded-sm px-px">
        {text.slice(idx, idx + query.length)}
      </span>,
    )
    cursor = idx + query.length
    idx = lower.indexOf(q, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
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
  onTreeContextMenu,
  onMoveNode,
  onMobilePointerStart,
  isMobile,
  gitStatusMap,
  dirChangesSet,
  mobileDragTargetPath,
}: {
  node: LazyNode
  depth: number
  activeFilePath: string | null
  expandedDirs: Set<string>
  onToggleDir: (node: LazyDir) => void
  onSelectFile: (node: LazyFile) => void
  onContextFile: (node: LazyFile) => void
  onTreeContextMenu: (node: LazyNode, x: number, y: number) => void
  onMoveNode: (srcPath: string, destDir: string) => void
  onMobilePointerStart?: (node: LazyNode, event: React.PointerEvent<HTMLDivElement>) => void
  isMobile?: boolean
  gitStatusMap?: Map<string, string>
  dirChangesSet?: Set<string>
  mobileDragTargetPath?: string | null
}) {
  const paddingLeft = isMobile ? 6 + depth * 12 : 8 + depth * 14
  const [dragOver, setDragOver] = useState(false)

  if (node.kind === 'dir') {
    const expanded = expandedDirs.has(node.path)
    const loading = node.childrenLoading
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
          } ${(dragOver || mobileDragTargetPath === node.path) ? 'bg-primary/15 ring-1 ring-primary/40' : ''}`}
          style={{ paddingLeft }}
          data-tree-drop-dir={node.path}
          onClick={() => onToggleDir(node)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onTreeContextMenu(node, e.clientX, e.clientY) }}
          onPointerDown={(e) => onMobilePointerStart?.(node, e)}
          onDragOver={(e) => {
            const hasFile = e.dataTransfer.types.includes('text/jait-tree-node')
            if (!hasFile) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDragOver(true)
          }}
          onDragEnter={(e) => {
            if (e.dataTransfer.types.includes('text/jait-tree-node')) {
              e.preventDefault()
              setDragOver(true)
            }
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            setDragOver(false)
            const raw = e.dataTransfer.getData('text/jait-tree-node')
            if (!raw) return
            e.preventDefault()
            e.stopPropagation()
            const data = JSON.parse(raw) as { path: string; name: string; kind: string }
            if (data.path !== node.path) {
              onMoveNode(data.path, node.path)
            }
          }}
          draggable={!isMobile}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/jait-tree-node', JSON.stringify({ path: node.path, name: node.name, kind: 'dir' }))
            e.dataTransfer.effectAllowed = 'move'
          }}
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
          {isMobile && (
            <button
              type="button"
              className="rounded p-1.5 hover:bg-background"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                onTreeContextMenu(node, rect.right - 8, rect.bottom + 4)
              }}
              title="More actions"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
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
            onTreeContextMenu={onTreeContextMenu}
            onMoveNode={onMoveNode}
            onMobilePointerStart={onMobilePointerStart}
            isMobile={isMobile}
            gitStatusMap={gitStatusMap}
            dirChangesSet={dirChangesSet}
            mobileDragTargetPath={mobileDragTargetPath}
          />
        ))}
      </>
    )
  }

  const isActive = activeFilePath === node.path
  const fileGitStatus = gitStatusMap?.get(node.name) ?? gitStatusMap?.get(node.path)
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
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onTreeContextMenu(node, e.clientX, e.clientY) }}
      onPointerDown={(e) => onMobilePointerStart?.(node, e)}
      draggable={!isMobile}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/jait-file', JSON.stringify({ path: node.path, name: node.name }))
        e.dataTransfer.setData('text/jait-tree-node', JSON.stringify({ path: node.path, name: node.name, kind: 'file' }))
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
    >
      <FileIcon filename={node.name} className={`${isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'}`} />
      <span className={`truncate flex-1 ${matchedStatus === 'D' ? 'line-through text-muted-foreground' : ''}`} title={node.path}>{node.name}</span>
      {matchedStatus && <GitStatusBadge status={matchedStatus} />}
      {isMobile ? (
        <button
          type="button"
          className="rounded p-1.5 hover:bg-background"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            onTreeContextMenu(node, rect.right - 8, rect.bottom + 4)
          }}
          title="More actions"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-background"
          onClick={(e) => { e.stopPropagation(); onContextFile(node) }}
          title="Add to chat"
        >
          <Send className="h-3 w-3" />
        </button>
      )}
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
  onPreviewOpenChange,
  architectureDiagram,
  architectureGenerating,
  architectureRequest,
  onArchitectureOpenChange,
  onGenerateArchitecture,
}, ref) {
  const confirm = useConfirmDialog()
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
  const disablePreviewPointerEvents = tree.isDragging || panel.isDragging

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
    if (!gitStatus) return new Map<string, string>()
    const m = new Map<string, string>()
    for (const f of gitStatus.index.files) {
      m.set(f.path, (f as { status?: string }).status ?? 'M')
    }
    for (const f of gitStatus.workingTree.files) {
      m.set(f.path, (f as { status?: string }).status ?? 'M')
    }
    return m
  }, [gitStatus])
  /** Set of directory prefixes (relative) that contain changed files */
  const dirChangesSet = useMemo(() => buildDirChangesSet(gitStatusMap), [gitStatusMap])
  /** Tree pane active tab */
  const [treeTab, setTreeTab] = useState<'files' | 'git'>('files')
  const [sourceControlView, setSourceControlView] = useState<'list' | 'tree'>('list')
  const [collapsedSourceControlDirs, setCollapsedSourceControlDirs] = useState<Set<string>>(new Set())
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
  const [gitAutoFetchMode, setGitAutoFetchMode] = useState<GitAutoFetchMode>(() => readGitAutoFetchMode())
  const [gitAutoFetchPeriodSeconds] = useState<number>(() => readGitAutoFetchPeriodSeconds())
  const gitActionBusyRef = useRef(gitActionBusy)
  const gitStatusLoadingRef = useRef(gitStatusLoading)

  // ── Editor tabs state ──
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const activeTab = useMemo(() => openTabs.find(t => t.id === activeTabId) ?? null, [openTabs, activeTabId])
  const activeTabEditable = isEditableWorkspaceTab(activeTab)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [tabContextMenu, setTabContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const [fileContextMenu, setFileContextMenu] = useState<{ node: LazyNode; x: number; y: number } | null>(null)
  const [fileContextMenuPosition, setFileContextMenuPosition] = useState<{ left: number; top: number } | null>(null)
  const fileContextMenuRef = useRef<HTMLDivElement | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string; kind: 'file' | 'dir' } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newItemTarget, setNewItemTarget] = useState<{ parentDir: string; kind: 'file' | 'dir' } | null>(null)
  const [newItemValue, setNewItemValue] = useState('')
  const [discardConfirm, setDiscardConfirm] = useState<{ kind: 'all' } | { kind: 'file'; path: string } | null>(null)
  const [mobileTreeDrag, setMobileTreeDrag] = useState<MobileTreeDragState | null>(null)
  const mobileTreeDragRef = useRef<MobileTreeDragState | null>(null)
  const mobileTreeDragTimerRef = useRef<number | null>(null)
  const suppressTreeClickRef = useRef(false)
  const consumeSuppressedTreeClick = useCallback(() => {
    if (!suppressTreeClickRef.current) return false
    suppressTreeClickRef.current = false
    return true
  }, [])

  // ── File search state ──
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [fileSearchMode, setFileSearchMode] = useState<'files' | 'content'>('files')
  const [fileSearchResults, setFileSearchResults] = useState<{ files?: { path: string; name: string }[]; matches?: { file: string; line: number; content: string }[] } | null>(null)
  const [fileSearchLoading, setFileSearchLoading] = useState(false)
  const fileSearchAbortRef = useRef<AbortController | null>(null)

  const restoredTabsRootRef = useRef<string | null>(null)
  const lastPersistedTabsRef = useRef<string>('')
  const handledPreviewRequestKeyRef = useRef<number | null>(null)
  const handledArchitectureRequestKeyRef = useRef<number | null>(null)

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

  useEffect(() => {
    if (!onPreviewOpenChange) return
    const previewTab = openTabs.find((tab) => tab.type === 'preview') ?? null
    onPreviewOpenChange({
      open: previewTab !== null,
      target: previewTab?.previewTarget ?? previewTab?.path ?? null,
    })
  }, [openTabs, onPreviewOpenChange])

  useEffect(() => {
    if (!onArchitectureOpenChange) return
    onArchitectureOpenChange(openTabs.some((tab) => tab.type === 'architecture'))
  }, [openTabs, onArchitectureOpenChange])

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

  const persistGitAutoFetchMode = useCallback((mode: GitAutoFetchMode) => {
    setGitAutoFetchMode(mode)
    if (typeof window === 'undefined') return
    window.localStorage.setItem(GIT_AUTO_FETCH_KEY, mode === false ? 'false' : mode === 'all' ? 'all' : 'true')
  }, [])

  const handleGitAutoFetchModeChange = useCallback((value: string) => {
    const nextMode: GitAutoFetchMode = value === 'all' ? 'all' : value === 'true' ? true : false
    persistGitAutoFetchMode(nextMode)
  }, [persistGitAutoFetchMode])

  useEffect(() => {
    gitActionBusyRef.current = gitActionBusy
  }, [gitActionBusy])

  useEffect(() => {
    gitStatusLoadingRef.current = gitStatusLoading
  }, [gitStatusLoading])

  // Fetch git status when workspace opens and on fs changes
  useEffect(() => {
    if (remoteRoot) fetchGitStatus()
  }, [remoteRoot, fsWatcherVersion, fetchGitStatus])

  useEffect(() => {
    if (!remoteRoot || gitAutoFetchMode === false) return

    let cancelled = false
    let timer: number | null = null

    const waitForIdleAndFocus = async () => {
      while (!cancelled) {
        const pageFocused = typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()
        if (!gitActionBusyRef.current && !gitStatusLoadingRef.current && pageFocused) return true
        await new Promise((resolve) => { timer = window.setTimeout(resolve, 1000) })
      }
      return false
    }

    const run = async () => {
      while (!cancelled) {
        const ready = await waitForIdleAndFocus()
        if (!ready || cancelled) return

        try {
          await gitApi.fetch(remoteRoot, gitAutoFetchMode === 'all')
          await fetchGitStatus()
        } catch {
          // Keep the loop alive; auth or remote issues should not break the panel.
        }

        if (cancelled) return
        await new Promise((resolve) => { timer = window.setTimeout(resolve, gitAutoFetchPeriodSeconds * 1000) })
      }
    }

    void run()

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [remoteRoot, gitAutoFetchMode, gitAutoFetchPeriodSeconds, fetchGitStatus])

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
    for (const path of newPaths) {
      const openTab = openTabs.find((tab) => tab.type === 'file' && normalizePath(tab.path) === normalizePath(path))
      if (openTab) void loadTabReviewBaseline(openTab.id, openTab.path)
    }
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
        ? { ...tab, content, modifiedContent: content, savedContent: content, isDirty: false, isSaving: false, saveError: null }
        : tab
    )))
  }, [])

  const setTabOriginalContent = useCallback((tabId: string, originalContent: string | null) => {
    setOpenTabs((prev) => prev.map((tab) => (
      tab.id === tabId
        ? { ...tab, originalContent, modifiedContent: tab.content ?? tab.modifiedContent ?? null }
        : tab
    )))
  }, [])

  const loadTabReviewBaseline = useCallback(async (tabId: string, filePath: string) => {
    if (!surfaceId) return
    const backup = await remoteReadBackup(filePath, surfaceId).catch(() => null)
    setTabOriginalContent(tabId, backup)
  }, [setTabOriginalContent, surfaceId])

  const handleTabContentChange = useCallback((tabId: string, nextContent: string | undefined) => {
    setOpenTabs((prev) => prev.map((tab) => {
      if (tab.id !== tabId || !isEditableWorkspaceTab(tab)) return tab
      const content = nextContent ?? ''
      const savedContent = tab.savedContent ?? ''
      return {
        ...tab,
        content,
        modifiedContent: content,
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
      void loadTabReviewBaseline(tabId, fileNode.path)
    } catch {
      setPreviewContent('// Failed to read file')
      setTabLoadedContent(tabId, '// Failed to read file')
    }
    setLoadingFile(false)
    return true
  }, [bumpTree, lazyTree, loadTabReviewBaseline, onActiveFileChange, remoteRoot, setTabLoadedContent, surfaceId])

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

  const handleToggleDirFromTree = useCallback((node: LazyDir) => {
    if (consumeSuppressedTreeClick()) return
    void handleToggleDir(node)
  }, [consumeSuppressedTreeClick, handleToggleDir])

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
      void loadTabReviewBaseline(tabId, node.path)
    } catch {
      setPreviewContent('// Failed to read file')
      setTabLoadedContent(tabId, '// Failed to read file')
    }
    setLoadingFile(false)
  }, [loadTabReviewBaseline, onActiveFileChange, setTabLoadedContent, surfaceId])

  const handleSelectNativeFileFromTree = useCallback((node: LazyFile) => {
    if (consumeSuppressedTreeClick()) return
    void handleSelectNativeFile(node)
  }, [consumeSuppressedTreeClick, handleSelectNativeFile])

  /* ---- Context / reference ---- */
  const handleContextNativeFile = useCallback(async (node: LazyFile) => {
    try {
      const content = node.handle ? await readFileHandle(node.handle) : await remoteReadFile(node.path, surfaceId)
      onReferenceFile({ id: node.path, name: node.name, path: node.path, content, language: inferLanguage(node.path) })
    } catch { /* ignore */ }
  }, [onReferenceFile, surfaceId])

  /* ---- File tree context menu ---- */
  const handleTreeContextMenu = useCallback((node: LazyNode, x: number, y: number) => {
    setFileContextMenuPosition(null)
    setFileContextMenu({ node, x, y })
  }, [])

  useLayoutEffect(() => {
    if (!fileContextMenu) {
      setFileContextMenuPosition(null)
      return
    }

    const updatePosition = () => {
      const menu = fileContextMenuRef.current
      if (!menu) return
      const rect = menu.getBoundingClientRect()
      const margin = 8
      const left = Math.max(margin, Math.min(fileContextMenu.x, window.innerWidth - rect.width - margin))
      const top = Math.max(margin, Math.min(fileContextMenu.y, window.innerHeight - rect.height - margin))
      setFileContextMenuPosition((current) => (
        current && current.left === left && current.top === top ? current : { left, top }
      ))
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [fileContextMenu])

  // Close file context menu on outside click
  useEffect(() => {
    if (!fileContextMenu) return
    const onPointerDown = () => setFileContextMenu(null)
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [fileContextMenu])

  const handleMoveTreeNode = useCallback(async (srcPath: string, destDir: string) => {
    if (!remoteRoot) return
    const normalizedSrc = normalizePath(srcPath)
    const normalizedDest = normalizePath(destDir)
    const normalizedRoot = normalizePath(remoteRoot)
    if (!normalizedSrc || !normalizedDest || normalizedSrc === normalizedDest) return
    if (isDescendantPath(normalizedSrc, normalizedDest)) return

    try {
      const res = await fetch(`${API_URL}/api/workspace/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srcPath: normalizedSrc, destDir: normalizedDest, surfaceId }),
      })
      if (!res.ok) throw new Error('Move failed')

      const findDirByPath = (nodes: LazyNode[], path: string): LazyDir | null => {
        for (const entry of nodes) {
          if (entry.kind === 'dir' && entry.path === path) return entry
          if (entry.kind === 'dir' && entry.children) {
            const found = findDirByPath(entry.children, path)
            if (found) return found
          }
        }
        return null
      }

      const targetDir = normalizedDest === normalizedRoot ? null : findDirByPath(lazyTree, normalizedDest)
      if (targetDir) {
        targetDir.children = null
        if (expandedDirs.has(targetDir.path)) {
          targetDir.children = await remoteScanDir(targetDir.path, surfaceId)
        }
      }

      const srcDirPath = normalizedSrc.includes('/') ? normalizedSrc.slice(0, normalizedSrc.lastIndexOf('/')) : normalizedRoot
      const srcDir = srcDirPath === normalizedRoot ? null : findDirByPath(lazyTree, srcDirPath)
      if (srcDir) {
        srcDir.children = null
        if (expandedDirs.has(srcDir.path)) {
          srcDir.children = await remoteScanDir(srcDir.path, surfaceId)
        }
      }

      if (srcDirPath === normalizedRoot || normalizedDest === normalizedRoot) {
        setLazyTree(await remoteScanDir(remoteRoot, surfaceId))
      }
      bumpTree()
      void fetchGitStatus()
    } catch {
      /* ignore */
    }
  }, [remoteRoot, surfaceId, lazyTree, expandedDirs, bumpTree, fetchGitStatus])

  const handleMobileTreePointerStart = useCallback((node: LazyNode, event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile || !remoteRoot || event.pointerType === 'mouse') return
    const target = event.target as HTMLElement | null
    if (target?.closest('button')) return
    if (mobileTreeDragTimerRef.current !== null) {
      window.clearTimeout(mobileTreeDragTimerRef.current)
      mobileTreeDragTimerRef.current = null
    }
    const nextDragState: MobileTreeDragState = {
      node,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      ready: false,
      active: false,
      dropDir: null,
    }
    mobileTreeDragRef.current = nextDragState
    setMobileTreeDrag(nextDragState)
    mobileTreeDragTimerRef.current = window.setTimeout(() => {
      setMobileTreeDrag((current) => {
        if (!current || current.pointerId !== event.pointerId) return current
        const readyState = { ...current, ready: true }
        mobileTreeDragRef.current = readyState
        return readyState
      })
      mobileTreeDragTimerRef.current = null
    }, 180)
  }, [isMobile, remoteRoot])

  useEffect(() => {
    if (!mobileTreeDrag || !remoteRoot) return

    const updateDropTarget = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
      const dropTarget = element?.closest<HTMLElement>('[data-tree-drop-dir], [data-tree-drop-root]')
      let dropDir: string | null = null
      if (dropTarget?.dataset.treeDropRoot === 'true') {
        dropDir = remoteRoot
      } else if (dropTarget?.dataset.treeDropDir) {
        dropDir = dropTarget.dataset.treeDropDir
      }
      if (dropDir && isDescendantPath(mobileTreeDragRef.current?.node.path ?? '', dropDir)) {
        dropDir = null
      }
      return dropDir
    }

    const onPointerMove = (event: PointerEvent) => {
      const current = mobileTreeDragRef.current
      if (!current || event.pointerId !== current.pointerId) return
      const deltaX = event.clientX - current.startX
      const deltaY = event.clientY - current.startY
      const distance = Math.hypot(deltaX, deltaY)
      if (!current.ready) {
        if (distance > 6) {
          if (mobileTreeDragTimerRef.current !== null) {
            window.clearTimeout(mobileTreeDragTimerRef.current)
            mobileTreeDragTimerRef.current = null
          }
          mobileTreeDragRef.current = null
          setMobileTreeDrag(null)
        }
        return
      }
      const active = current.active || distance >= 4
      const dropDir = active ? updateDropTarget(event.clientX, event.clientY) : null
      if (active && event.cancelable) event.preventDefault()
      const nextDragState = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        active,
        dropDir,
      }
      mobileTreeDragRef.current = nextDragState
      setMobileTreeDrag(nextDragState)
    }

    const finishDrag = (pointerId: number) => {
      const current = mobileTreeDragRef.current
      if (!current || current.pointerId !== pointerId) return
      if (mobileTreeDragTimerRef.current !== null) {
        window.clearTimeout(mobileTreeDragTimerRef.current)
        mobileTreeDragTimerRef.current = null
      }
      if (current.active) {
        suppressTreeClickRef.current = true
        if (current.dropDir) void handleMoveTreeNode(current.node.path, current.dropDir)
      }
      mobileTreeDragRef.current = null
      setMobileTreeDrag(null)
    }

    const onPointerUp = (event: PointerEvent) => finishDrag(event.pointerId)
    const onPointerCancel = (event: PointerEvent) => finishDrag(event.pointerId)

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    return () => {
      if (mobileTreeDragTimerRef.current !== null) {
        window.clearTimeout(mobileTreeDragTimerRef.current)
        mobileTreeDragTimerRef.current = null
      }
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [mobileTreeDrag, remoteRoot, handleMoveTreeNode])

  /* ---- File management actions ---- */
  const handleDeleteNode = useCallback(async (node: LazyNode) => {
    if (!remoteRoot) return
    const confirmed = await confirm({
      title: node.kind === 'dir' ? 'Delete folder' : 'Delete file',
      description: `Delete "${node.name}"${node.kind === 'dir' ? ' and all its contents' : ''}?`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await fetch(`${API_URL}/api/workspace/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: node.path, isDirectory: node.kind === 'dir', surfaceId }),
      })
      // Close tab if the deleted file was open
      if (node.kind === 'file') {
        const tabId = `file:${node.path}`
        setOpenTabs(prev => prev.filter(t => t.id !== tabId))
      }
      bumpTree()
      // Invalidate parent directory
      const parentPath = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : remoteRoot
      const invalidateParent = (nodes: LazyNode[]) => {
        for (const n of nodes) {
          if (n.kind === 'dir' && n.path === parentPath) { n.children = null; return true }
          if (n.kind === 'dir' && n.children && invalidateParent(n.children)) return true
        }
        return false
      }
      if (!invalidateParent(lazyTree)) {
        // Parent is root
        setLazyTree(await remoteScanDir(remoteRoot, surfaceId))
      }
      bumpTree()
      void fetchGitStatus()
    } catch { /* ignore */ }
  }, [confirm, remoteRoot, surfaceId, bumpTree, lazyTree, fetchGitStatus])

  const handleRenameConfirm = useCallback(async () => {
    if (!remoteRoot || !renameTarget || !renameValue.trim()) { setRenameTarget(null); return }
    const newName = renameValue.trim()
    if (newName === renameTarget.name) { setRenameTarget(null); return }
    try {
      const res = await fetch(`${API_URL}/api/workspace/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: renameTarget.path, newName, surfaceId }),
      })
      if (!res.ok) throw new Error('Rename failed')
      // Close old tab, open with new path
      const oldTabId = `file:${renameTarget.path}`
      setOpenTabs(prev => prev.filter(t => t.id !== oldTabId))
      // Invalidate parent directory
      const parentPath = renameTarget.path.includes('/') ? renameTarget.path.slice(0, renameTarget.path.lastIndexOf('/')) : remoteRoot
      const invalidateParent = (nodes: LazyNode[]) => {
        for (const n of nodes) {
          if (n.kind === 'dir' && n.path === parentPath) { n.children = null; return true }
          if (n.kind === 'dir' && n.children && invalidateParent(n.children)) return true
        }
        return false
      }
      if (!invalidateParent(lazyTree)) {
        setLazyTree(await remoteScanDir(remoteRoot, surfaceId))
      }
      bumpTree()
      void fetchGitStatus()
    } catch { /* ignore */ }
    setRenameTarget(null)
  }, [remoteRoot, renameTarget, renameValue, surfaceId, bumpTree, lazyTree, fetchGitStatus])

  const handleNewItemConfirm = useCallback(async () => {
    if (!remoteRoot || !newItemTarget || !newItemValue.trim()) { setNewItemTarget(null); return }
    const name = newItemValue.trim()
    const fullPath = `${newItemTarget.parentDir}/${name}`
    try {
      const endpoint = newItemTarget.kind === 'dir' ? 'create-directory' : 'create-file'
      const res = await fetch(`${API_URL}/api/workspace/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath, surfaceId }),
      })
      if (!res.ok) throw new Error('Create failed')
      // Invalidate parent directory
      const parentPath = newItemTarget.parentDir
      const invalidateParent = (nodes: LazyNode[]) => {
        for (const n of nodes) {
          if (n.kind === 'dir' && n.path === parentPath) { n.children = null; return true }
          if (n.kind === 'dir' && n.children && invalidateParent(n.children)) return true
        }
        return false
      }
      if (!invalidateParent(lazyTree)) {
        setLazyTree(await remoteScanDir(remoteRoot, surfaceId))
      }
      bumpTree()
      // Auto-expand the parent dir
      setExpandedDirs(prev => { const n = new Set(prev); n.add(parentPath); return n })
      void fetchGitStatus()
    } catch { /* ignore */ }
    setNewItemTarget(null)
  }, [remoteRoot, newItemTarget, newItemValue, surfaceId, bumpTree, lazyTree, fetchGitStatus])

  /* ---- File search across workspace ---- */
  const handleFileSearch = useCallback(async (query: string, mode: 'files' | 'content') => {
    // Cancel any in-flight search
    fileSearchAbortRef.current?.abort()
    if (!query.trim()) {
      setFileSearchResults(null)
      setFileSearchLoading(false)
      return
    }

    if (remoteRoot) {
      // Server-backed search via REST endpoint
      const controller = new AbortController()
      fileSearchAbortRef.current = controller
      setFileSearchLoading(true)
      try {
        let url = `${API_URL}/api/workspace/search?query=${encodeURIComponent(query)}&mode=${mode}&limit=50`
        if (surfaceId) url += `&surfaceId=${encodeURIComponent(surfaceId)}`
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error('Search failed')
        const data = await res.json()
        if (!controller.signal.aborted) {
          setFileSearchResults(data)
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          setFileSearchResults(mode === 'content' ? { matches: [] } : { files: [] })
        }
      } finally {
        if (!controller.signal.aborted) setFileSearchLoading(false)
      }
    } else {
      // Local-only: use the existing handleSearchFiles for filename matching
      if (mode === 'files') {
        setFileSearchLoading(true)
        const controller = new AbortController()
        fileSearchAbortRef.current = controller
        try {
          const results = await handleSearchFiles(query, 50, controller.signal)
          if (!controller.signal.aborted) {
            setFileSearchResults({ files: results })
          }
        } catch { /* ignore */ }
        if (!controller.signal.aborted) setFileSearchLoading(false)
      } else {
        // Content search not available locally
        setFileSearchResults({ matches: [] })
      }
    }
  }, [remoteRoot, surfaceId, handleSearchFiles])

  // Debounced search effect
  const fileSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (fileSearchTimerRef.current) clearTimeout(fileSearchTimerRef.current)
    fileSearchTimerRef.current = setTimeout(() => {
      void handleFileSearch(fileSearchQuery, fileSearchMode)
    }, 250)
    return () => { if (fileSearchTimerRef.current) clearTimeout(fileSearchTimerRef.current) }
  }, [fileSearchQuery, fileSearchMode, handleFileSearch])

  const handleCopyPath = useCallback((node: LazyNode) => {
    void navigator.clipboard.writeText(node.path)
  }, [])

  const handleCopyRelativePath = useCallback((node: LazyNode) => {
    if (!remoteRoot) return void navigator.clipboard.writeText(node.path)
    const rel = node.path.replace(/\\/g, '/').replace(remoteRoot.replace(/\\/g, '/'), '').replace(/^\/+/, '')
    void navigator.clipboard.writeText(rel)
  }, [remoteRoot])

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

  const handleOpenArchitectureTab = useCallback(() => {
    const tabId = 'architecture'
    const nextTab: EditorTab = {
      id: tabId,
      type: 'architecture',
      path: '__architecture__',
      label: 'Architecture',
    }

    setOpenTabs((prev) => {
      const existing = prev.find((tab) => tab.id === tabId)
      if (existing) {
        return prev.map((tab) => (tab.id === tabId ? { ...tab, ...nextTab } : tab))
      }
      return [...prev, nextTab]
    })
    setActiveTabId(tabId)
    setScDiffFile(null)
    setActiveNativePath(null)
    setPreviewContent(null)
    setPreviewPath('__architecture__')
    setPreviewLanguage('plaintext')
    onActiveFileChange('')
  }, [onActiveFileChange])

  const handleCloseArchitectureTab = useCallback(() => {
    setOpenTabs((prev) => {
      const architectureIndex = prev.findIndex((tab) => tab.type === 'architecture')
      if (architectureIndex < 0) return prev
      const architectureTab = prev[architectureIndex]
      const next = prev.filter((tab) => tab.id !== architectureTab?.id)
      if (architectureTab?.id === activeTabId) {
        const neighbor = next[Math.min(architectureIndex, next.length - 1)]
        const newActiveId = neighbor?.id ?? null
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
          } else if (neighbor?.type === 'architecture') {
            setActiveNativePath(null)
            setPreviewContent(null)
            setPreviewLanguage('plaintext')
            setPreviewPath('__architecture__')
            setScDiffFile(null)
          } else if (neighbor?.type === 'diff') {
            setScDiffFile(neighbor.diffMode === 'git' ? (neighbor.diffEntry ?? null) : null)
          }
        }, 0)
      }
      return next
    })
  }, [activeTabId])

  const handleClosePreviewTarget = useCallback(() => {
    setOpenTabs((prev) => {
      const previewIndex = prev.findIndex((tab) => tab.type === 'preview')
      if (previewIndex < 0) return prev
      const previewTab = prev[previewIndex]
      const next = prev.filter((tab) => tab.id !== previewTab?.id)
      if (previewTab?.id === activeTabId) {
        const neighbor = next[Math.min(previewIndex, next.length - 1)]
        const newActiveId = neighbor?.id ?? null
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
          } else if (neighbor?.type === 'architecture') {
            setActiveNativePath(null)
            setPreviewContent(null)
            setPreviewLanguage('plaintext')
            setPreviewPath('__architecture__')
            setScDiffFile(null)
          } else if (neighbor?.type === 'diff') {
            setScDiffFile(neighbor.diffMode === 'git' ? (neighbor.diffEntry ?? null) : null)
          }
        }, 0)
      }
      return next
    })
  }, [activeTabId])

  const handleRefreshPreviewTarget = useCallback(() => {
    setOpenTabs((prev) => prev.map((tab) => (
      tab.type === 'preview'
        ? { ...tab, version: (tab.version ?? 0) + 1 }
        : tab
    )))
  }, [])

  useImperativeHandle(ref, () => ({
    openDirectory: handleOpenDirectory,
    openRemoteWorkspace: handleOpenRemoteWorkspace,
    openFileByPath: handleOpenFileByPath,
    readFileByPath: handleReadFileByPath,
    openReviewDiff: handleOpenReviewDiff,
    openPreviewTarget: handleOpenPreviewTarget,
    closePreviewTarget: handleClosePreviewTarget,
    refreshPreviewTarget: handleRefreshPreviewTarget,
    openArchitectureTab: handleOpenArchitectureTab,
    closeArchitectureTab: handleCloseArchitectureTab,
    searchFiles: handleSearchFiles,
  }), [handleOpenDirectory, handleOpenRemoteWorkspace, handleOpenFileByPath, handleReadFileByPath, handleOpenReviewDiff, handleOpenPreviewTarget, handleClosePreviewTarget, handleRefreshPreviewTarget, handleOpenArchitectureTab, handleCloseArchitectureTab, handleSearchFiles])

  useEffect(() => {
    if (!previewRequest) return
    if (handledPreviewRequestKeyRef.current === previewRequest.key) return
    handledPreviewRequestKeyRef.current = previewRequest.key
    handleOpenPreviewTarget(previewRequest.target)
  }, [previewRequest, handleOpenPreviewTarget])

  useEffect(() => {
    if (!architectureRequest) return
    if (handledArchitectureRequestKeyRef.current === architectureRequest.key) return
    handledArchitectureRequestKeyRef.current = architectureRequest.key
    handleOpenArchitectureTab()
  }, [architectureRequest, handleOpenArchitectureTab])

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

  const changedFileCount = useMemo(() => {
    const paths = new Set<string>()
    for (const file of gitStatus?.index.files ?? []) paths.add(file.path)
    for (const file of gitStatus?.workingTree.files ?? []) paths.add(file.path)
    return paths.size
  }, [gitStatus])

  /* ---- Generate commit message via AI ---- */
  const handleGenerateCommitMessage = useCallback(async () => {
    if (!remoteRoot || changedFileCount === 0 || commitMsgGenerating || gitActionBusy) return
    setCommitMsgGenerating(true)
    setGitActionError(null)
    try {
      const { message } = await gitApi.generateCommitMessage(remoteRoot, provider, cliModel)
      if (message) setCommitMessage(message)
    } catch (err) {
      setGitActionError(err instanceof Error ? err.message : 'Failed to generate commit message')
    }
    setCommitMsgGenerating(false)
  }, [remoteRoot, changedFileCount, commitMsgGenerating, gitActionBusy, provider, cliModel])

  /* ---- Git pull ---- */
  const handleGitPull = useCallback(async () => {
    if (!remoteRoot || gitActionBusy) return
    setGitActionBusy(true)
    setGitActionError(null)
    try {
      await gitApi.pull(remoteRoot)
      await fetchGitStatus()
      bumpTree()
    } catch (err) {
      setGitActionError(err instanceof Error ? err.message : 'Pull failed')
    }
    setGitActionBusy(false)
  }, [remoteRoot, gitActionBusy, fetchGitStatus, bumpTree])

  /* ---- Discard all changes ---- */
  const handleDiscardAll = useCallback(async () => {
    const count = new Set([
      ...(gitStatus?.index.files.map((file) => file.path) ?? []),
      ...(gitStatus?.workingTree.files.map((file) => file.path) ?? []),
    ]).size
    if (!remoteRoot || gitActionBusy || count === 0) return
    setGitActionBusy(true)
    setGitActionError(null)
    try {
      await gitApi.discard(remoteRoot)
      setDiscardConfirm(null)
      setScDiffFile(null)
      setOpenTabs(prev => prev.filter(t => t.type !== 'diff'))
      await fetchGitStatus()
      bumpTree()
    } catch (err) {
      setGitActionError(err instanceof Error ? err.message : 'Discard failed')
    }
    setGitActionBusy(false)
  }, [remoteRoot, gitActionBusy, gitStatus, fetchGitStatus, bumpTree])

  /* ---- Discard single file ---- */
  const handleDiscardFile = useCallback(async (filePath: string) => {
    if (!remoteRoot || gitActionBusy) return
    setGitActionBusy(true)
    setGitActionError(null)
    try {
      await gitApi.discard(remoteRoot, [filePath])
      setDiscardConfirm(null)
      // Close diff tab for this file if open
      const tabId = `git-diff:${filePath}`
      setOpenTabs(prev => prev.filter(t => t.id !== tabId))
      if (scDiffFile?.path === filePath) setScDiffFile(null)
      await fetchGitStatus()
      bumpTree()
    } catch (err) {
      setGitActionError(err instanceof Error ? err.message : 'Discard failed')
    }
    setGitActionBusy(false)
  }, [remoteRoot, gitActionBusy, scDiffFile, fetchGitStatus, bumpTree])

  /* ---- Stage file ---- */
  const handleStageFile = useCallback(async (filePath: string) => {
    if (!remoteRoot || gitActionBusy) return
    try {
      await gitApi.stage(remoteRoot, [filePath])
      await fetchGitStatus()
    } catch { /* ignore */ }
  }, [remoteRoot, gitActionBusy, fetchGitStatus])

  /* ---- Unstage file ---- */
  const handleUnstageFile = useCallback(async (filePath: string) => {
    if (!remoteRoot || gitActionBusy) return
    try {
      await gitApi.unstage(remoteRoot, [filePath])
      await fetchGitStatus()
    } catch { /* ignore */ }
  }, [remoteRoot, gitActionBusy, fetchGitStatus])

  /* ---- Stage all files ---- */
  const handleStageAll = useCallback(async () => {
    if (!remoteRoot || gitActionBusy || (gitStatus?.workingTree.files.length ?? 0) === 0) return
    try {
      await gitApi.stage(remoteRoot)
      await fetchGitStatus()
    } catch { /* ignore */ }
  }, [remoteRoot, gitActionBusy, gitStatus, fetchGitStatus])

  /* ---- Unstage all files ---- */
  const handleUnstageAll = useCallback(async () => {
    if (!remoteRoot || gitActionBusy || (gitStatus?.index.files.length ?? 0) === 0) return
    try {
      await gitApi.unstage(remoteRoot)
      await fetchGitStatus()
    } catch { /* ignore */ }
  }, [remoteRoot, gitActionBusy, gitStatus, fetchGitStatus])

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
    } else if (tab.type === 'architecture') {
      setActiveNativePath(null)
      setPreviewContent(null)
      setPreviewLanguage('plaintext')
      setPreviewPath('__architecture__')
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
  const stagedFiles = gitStatus?.index.files ?? []
  const workingTreeFiles = gitStatus?.workingTree.files ?? []
  const stagedTree = useMemo(
    () => buildSourceControlTree(stagedFiles.map((file) => ({
      path: file.path,
      status: (file as { status?: string }).status,
      insertions: file.insertions,
      deletions: file.deletions,
    }))),
    [stagedFiles],
  )
  const workingTree = useMemo(
    () => buildSourceControlTree(workingTreeFiles.map((file) => ({
      path: file.path,
      status: (file as { status?: string }).status,
      insertions: file.insertions,
      deletions: file.deletions,
    }))),
    [workingTreeFiles],
  )
  const canGenerateCommitMessage = changedFileCount > 0 && !commitMsgGenerating && !gitActionBusy
  const contextTabIndex = tabContextMenu ? openTabs.findIndex((t) => t.id === tabContextMenu.tabId) : -1

  const toggleSourceControlDir = useCallback((path: string) => {
    setCollapsedSourceControlDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  useEffect(() => {
    mobileTreeDragRef.current = mobileTreeDrag
  }, [mobileTreeDrag])

  const renderSourceControlFileActions = useCallback((
    filePath: string,
    actions: 'stage' | 'unstage',
    mobile = false,
  ) => (
    <span
      className={`flex shrink-0 items-center justify-end gap-0.5 ${
        mobile ? 'opacity-100' : 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
      }`}
    >
      {actions === 'stage' ? (
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
          onClick={(e) => { e.stopPropagation(); void handleStageFile(filePath) }}
          title="Stage file (git add)"
        >
          <Plus className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
          onClick={(e) => { e.stopPropagation(); void handleUnstageFile(filePath) }}
          title="Unstage file"
        >
          <Minus className="h-3 w-3" />
        </button>
      )}
      <button
        type="button"
        className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-red-500"
        onClick={(e) => {
          e.stopPropagation()
          setDiscardConfirm((prev) => prev?.kind === 'file' && prev.path === filePath ? null : { kind: 'file', path: filePath })
        }}
        title="Discard changes"
      >
        <Undo2 className="h-3 w-3" />
      </button>
    </span>
  ), [handleStageFile, handleUnstageFile])

  const renderSourceControlTreeNodes = useCallback((
    nodes: SourceControlTreeNode[],
    actions: 'stage' | 'unstage',
    mobile = false,
    depth = 0,
  ): React.ReactNode => nodes.map((node) => {
    if (node.kind === 'dir') {
      const expanded = !collapsedSourceControlDirs.has(node.path)
      return (
        <div key={`${actions}:dir:${node.path}`}>
          <button
            type="button"
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left ${
              mobile ? 'text-sm' : 'text-xs hover:bg-muted'
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => toggleSourceControlDir(node.path)}
          >
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
            <FolderIcon name={node.name} open={expanded} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
          </button>
          {expanded ? renderSourceControlTreeNodes(node.children, actions, mobile, depth + 1) : null}
        </div>
      )
    }

    const fileStatus = node.entry.status ?? 'M'
    const fileName = node.name
    const dirPath = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''
    const isActiveDiff = scDiffFile?.path === node.path
    return (
      <div key={`${actions}:file:${node.path}`}>
        <button
          type="button"
          className={`group grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 rounded px-2 py-1.5 text-left ${
            mobile ? 'text-sm' : 'text-xs'
          } ${isActiveDiff ? 'bg-primary/15 text-foreground' : 'hover:bg-muted'}`}
          style={{ paddingLeft: 22 + depth * 14 }}
          onClick={() => {
            handleScOpenDiff(node.path)
            if (mobile) setMobileTab('editor')
          }}
          title={`${node.path} — ${STATUS_LABELS[fileStatus] ?? fileStatus}`}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <GitStatusBadge status={fileStatus} className={mobile ? 'text-[10px]' : undefined} />
            <FileIcon filename={fileName} className={`${mobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} shrink-0`} />
          </div>
          <div className="flex min-w-0 items-baseline gap-1.5 overflow-hidden">
            <span className={`truncate ${fileStatus === 'D' ? 'line-through text-muted-foreground' : ''}`}>{fileName}</span>
            {dirPath ? <span className="truncate text-[10px] text-muted-foreground">{dirPath}</span> : null}
          </div>
          <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
            {node.entry.insertions > 0 && <span className="text-green-500">+{node.entry.insertions}</span>}
            {node.entry.deletions > 0 && <span className="ml-0.5 text-red-500">-{node.entry.deletions}</span>}
          </span>
          {renderSourceControlFileActions(node.path, actions, mobile)}
        </button>
        {discardConfirm?.kind === 'file' && discardConfirm.path === node.path && (
          <div className="ml-6 mt-1 flex items-center gap-1 rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-[10px]">
            <span className="flex-1 text-red-500">Discard changes in {fileName}?</span>
            <Button size="sm" variant="destructive" className="h-5 px-1.5 text-[10px]" onClick={() => void handleDiscardFile(node.path)} disabled={gitActionBusy}>Discard</Button>
            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => setDiscardConfirm(null)} disabled={gitActionBusy}>Cancel</Button>
          </div>
        )}
      </div>
    )
  }), [collapsedSourceControlDirs, discardConfirm, gitActionBusy, handleDiscardFile, handleScOpenDiff, renderSourceControlFileActions, toggleSourceControlDir, scDiffFile?.path])

  const renderSourceControlSection = useCallback((
    title: string,
    files: typeof stagedFiles,
    treeNodes: SourceControlTreeNode[],
    totals: { insertions: number; deletions: number },
    actions: 'stage' | 'unstage',
    mobile = false,
  ) => {
    if (files.length === 0) return null

    return (
      <div className="mt-1">
        <div className="flex items-center justify-between gap-2 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <div>
            {title} ({files.length})
            <span className="ml-1 normal-case tracking-normal">
              <span className="text-green-500">+{totals.insertions}</span>
              {' '}
              <span className="text-red-500">-{totals.deletions}</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            {actions === 'stage' ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 w-6 rounded-md p-0"
                onClick={() => void handleStageAll()}
                disabled={gitActionBusy || files.length === 0}
                title="Stage all changes"
                aria-label="Stage all changes"
              >
                <Plus className="h-3 w-3" />
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 w-6 rounded-md p-0"
                  onClick={() => void handleUnstageAll()}
                  disabled={gitActionBusy || files.length === 0}
                  title="Unstage all files"
                  aria-label="Unstage all files"
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 w-6 rounded-md p-0 text-red-600 hover:text-red-700 dark:text-red-400"
                  onClick={() => setDiscardConfirm({ kind: 'all' })}
                  disabled={gitActionBusy || changedFileCount === 0}
                  title="Discard all changes"
                  aria-label="Discard all changes"
                >
                  <Undo2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
        {actions === 'unstage' && discardConfirm?.kind === 'all' && changedFileCount > 0 && (
          <div className="mx-2 mb-1 flex items-center gap-1 rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-[10px]">
            <span className="flex-1 text-red-500">Discard all changes?</span>
            <Button size="sm" variant="destructive" className="h-5 px-1.5 text-[10px]" onClick={() => void handleDiscardAll()} disabled={gitActionBusy}>Discard</Button>
            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => setDiscardConfirm(null)} disabled={gitActionBusy}>Cancel</Button>
          </div>
        )}
        <div className="mt-1 space-y-1">
          {sourceControlView === 'tree'
            ? renderSourceControlTreeNodes(treeNodes, actions, mobile)
            : files.map((f) => {
              const fileStatus = (f as { status?: string }).status ?? 'M'
              const fileName = f.path.split('/').pop() ?? f.path
              const dirPath = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
              const isActiveDiff = scDiffFile?.path === f.path
              return (
                <div key={`${actions}:${f.path}`}>
                  <div
                    className={`group grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 rounded px-2 py-1.5 text-left ${
                      mobile ? 'text-sm' : 'text-xs'
                    } ${isActiveDiff ? 'bg-primary/15 text-foreground' : 'hover:bg-muted'}`}
                    draggable={!mobile}
                    onClick={() => {
                      handleScOpenDiff(f.path)
                      if (mobile) setMobileTab('editor')
                    }}
                    onDragStart={(e) => {
                      if (mobile) return
                      e.dataTransfer.effectAllowed = 'copy'
                      e.dataTransfer.setData('text/jait-file', JSON.stringify({ path: f.path, name: fileName }))
                    }}
                    title={`${f.path} — ${STATUS_LABELS[fileStatus] ?? fileStatus}`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <GitStatusBadge status={fileStatus} className={mobile ? 'text-[10px]' : undefined} />
                      <FileIcon filename={fileName} className={`${mobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} shrink-0`} />
                    </div>
                    <div className="flex min-w-0 items-baseline gap-1.5 overflow-hidden">
                      <span className={`truncate ${fileStatus === 'D' ? 'line-through text-muted-foreground' : ''}`}>
                        {fileName}
                      </span>
                      {dirPath ? <span className="truncate text-[10px] text-muted-foreground">{dirPath}</span> : null}
                    </div>
                    <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
                      {f.insertions > 0 && <span className="text-green-500">+{f.insertions}</span>}
                      {f.deletions > 0 && <span className="ml-0.5 text-red-500">-{f.deletions}</span>}
                    </span>
                    {renderSourceControlFileActions(f.path, actions, mobile)}
                  </div>
                  {discardConfirm?.kind === 'file' && discardConfirm.path === f.path && (
                    <div className="ml-6 mt-1 flex items-center gap-1 rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-[10px]">
                      <span className="flex-1 text-red-500">Discard changes in {fileName}?</span>
                      <Button size="sm" variant="destructive" className="h-5 px-1.5 text-[10px]" onClick={() => void handleDiscardFile(f.path)} disabled={gitActionBusy}>Discard</Button>
                      <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => setDiscardConfirm(null)} disabled={gitActionBusy}>Cancel</Button>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    )
  }, [changedFileCount, discardConfirm?.kind, discardConfirm?.kind === 'file' ? discardConfirm.path : null, gitActionBusy, handleDiscardAll, handleDiscardFile, handleScOpenDiff, handleStageAll, handleUnstageAll, renderSourceControlFileActions, renderSourceControlTreeNodes, scDiffFile?.path, sourceControlView])

  // Switch to editor tab when a file is selected on mobile
  const handleSelectNativeFileMobile = useCallback(async (node: LazyFile) => {
    if (consumeSuppressedTreeClick()) return
    await handleSelectNativeFile(node)
    if (isMobile) setMobileTab('editor')
  }, [consumeSuppressedTreeClick, handleSelectNativeFile, isMobile])

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
          {/* Mobile search bar */}
          <div className="flex items-center gap-1 px-1.5 py-1 border-b shrink-0">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder={fileSearchMode === 'content' ? 'Search in files…' : 'Search file names…'}
              value={fileSearchQuery}
              onChange={(e) => setFileSearchQuery(e.target.value)}
              className="flex-1 h-7 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {fileSearchQuery && (
              <button onClick={() => { setFileSearchQuery(''); setFileSearchResults(null) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setFileSearchMode(m => m === 'files' ? 'content' : 'files')}
              className={`px-1.5 h-6 rounded text-[10px] font-medium shrink-0 ${fileSearchMode === 'content' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
              title={fileSearchMode === 'files' ? 'Switch to content search' : 'Switch to filename search'}
            >
              {fileSearchMode === 'files' ? 'Name' : 'Content'}
            </button>
          </div>

          {/* Mobile search results or file tree */}
          {fileSearchQuery.trim() ? (
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-1">
              {fileSearchLoading && (
                <div className="flex items-center gap-1.5 px-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </div>
              )}
              {!fileSearchLoading && fileSearchResults?.files && fileSearchResults.files.length > 0 && (
                fileSearchResults.files.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center gap-1.5 rounded px-1 py-2 cursor-pointer text-sm hover:bg-muted active:bg-muted"
                    style={{ paddingLeft: 8 }}
                    onClick={() => {
                      const fullPath = remoteRoot ? `${remoteRoot.replace(/\\/g, '/')}/${f.path}` : f.path
                      void handleOpenFileByPath(fullPath)
                      if (isMobile) setMobileTab('editor')
                      setFileSearchQuery('')
                      setFileSearchResults(null)
                    }}
                  >
                    <FileIcon filename={f.name} className="h-4 w-4 shrink-0" />
                    <span className="truncate flex-1" title={f.path}><HighlightMatch text={f.path} query={fileSearchQuery} /></span>
                  </div>
                ))
              )}
              {!fileSearchLoading && fileSearchResults?.matches && fileSearchResults.matches.length > 0 && (
                fileSearchResults.matches.map((m, i) => (
                  <div
                    key={`${m.file}:${m.line}:${i}`}
                    className="flex flex-col gap-0 rounded px-1 py-2 cursor-pointer text-sm hover:bg-muted active:bg-muted"
                    style={{ paddingLeft: 8 }}
                    onClick={() => {
                      const fullPath = remoteRoot ? `${remoteRoot.replace(/\\/g, '/')}/${m.file}` : m.file
                      void handleOpenFileByPath(fullPath)
                      if (isMobile) setMobileTab('editor')
                      setFileSearchQuery('')
                      setFileSearchResults(null)
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <FileIcon filename={m.file.split('/').pop() || m.file} className="h-4 w-4 shrink-0" />
                      <span className="truncate text-foreground" title={m.file}><HighlightMatch text={m.file} query={fileSearchQuery} /></span>
                      <span className="text-muted-foreground shrink-0">:{m.line}</span>
                    </div>
                    <span className="truncate text-muted-foreground pl-6"><HighlightMatch text={m.content} query={fileSearchQuery} /></span>
                  </div>
                ))
              )}
              {!fileSearchLoading && fileSearchResults && !fileSearchResults.files?.length && !fileSearchResults.matches?.length && (
                <div className="text-sm text-muted-foreground px-2 py-2">No results found.</div>
              )}
            </div>
          </ScrollArea>
          ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-1">
              {remoteRoot && (
                <div
                  className={`mb-1 flex items-center gap-1.5 rounded px-2 py-2 text-sm text-muted-foreground ${
                    mobileTreeDrag?.dropDir === remoteRoot ? 'bg-primary/15 ring-1 ring-primary/40 text-foreground' : 'bg-muted/30'
                  }`}
                  data-tree-drop-root="true"
                >
                  <FolderOpen className="h-4 w-4 shrink-0" />
                  <span className="truncate">Workspace root</span>
                </div>
              )}
              {hasNativeTree && lazyTree.map((node) => (
                <TreeNodeRow
                  key={node.path}
                  node={node}
                  depth={0}
                  activeFilePath={activeNativePath}
                  expandedDirs={expandedDirs}
                  onToggleDir={handleToggleDirFromTree}
                  onSelectFile={handleSelectNativeFileMobile}
                  onContextFile={handleContextNativeFile}
                  onTreeContextMenu={handleTreeContextMenu}
                  onMoveNode={handleMoveTreeNode}
                  onMobilePointerStart={handleMobileTreePointerStart}
                  isMobile
                  gitStatusMap={gitStatusMap}
                  dirChangesSet={dirChangesSet}
                  mobileDragTargetPath={mobileTreeDrag?.dropDir ?? null}
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
          )}
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
              {remoteRoot && (
                <select
                  className="h-6 rounded border bg-background px-1.5 text-[10px] text-muted-foreground"
                  value={String(gitAutoFetchMode)}
                  onChange={(e) => handleGitAutoFetchModeChange(e.target.value)}
                  title={`${describeGitAutoFetchMode(gitAutoFetchMode)}. Interval: ${gitAutoFetchPeriodSeconds}s`}
                >
                  <option value="false">Auto-fetch off</option>
                  <option value="true">Auto-fetch origin</option>
                  <option value="all">Auto-fetch all</option>
                </select>
              )}
              <button
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                onClick={fetchGitStatus}
                disabled={gitStatusLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${gitStatusLoading ? 'animate-spin' : ''}`} />
              </button>
              {gitStatus?.behindCount ? (
                <button
                  className="relative p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  onClick={handleGitPull}
                  disabled={gitActionBusy}
                  title={`Pull ${gitStatus.behindCount} commit${gitStatus.behindCount > 1 ? 's' : ''}`}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-primary px-1 text-[9px] font-semibold leading-[14px] text-primary-foreground">
                    {gitStatus.behindCount}
                  </span>
                </button>
              ) : null}
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
                <select
                  className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground shadow-sm"
                  value={sourceControlView}
                  onChange={(e) => setSourceControlView(e.target.value as 'list' | 'tree')}
                  title="Source control view"
                >
                  <option value="list">List</option>
                  <option value="tree">Tree</option>
                </select>
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
                    Source Control ({changedFileCount})
                    <span className="ml-1">
                      <span className="text-green-500">+{gitStatus.index.insertions + gitStatus.workingTree.insertions}</span>
                      {' '}
                      <span className="text-red-500">-{gitStatus.index.deletions + gitStatus.workingTree.deletions}</span>
                    </span>
                  </div>
                  {renderSourceControlSection('Staged', stagedFiles, stagedTree, gitStatus.index, 'unstage', true)}
                  {renderSourceControlSection('Changes', workingTreeFiles, workingTree, gitStatus.workingTree, 'stage', true)}
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
                    ) : tab.type === 'architecture' ? (
                      <Boxes className="h-3.5 w-3.5 shrink-0" />
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
              {activeTab?.type === 'preview' && (
                <button
                  onClick={handleRefreshPreviewTarget}
                  className="flex items-center text-[11px] text-muted-foreground hover:text-foreground px-1.5 shrink-0"
                  title="Refresh preview"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              )}
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
                <ReadOnlyDiffView
                  key={activeTab.id}
                  className="h-full"
                  editorClassName="h-full"
                  original={activeTab.originalContent ?? activeTab.diffEntry?.original ?? ''}
                  modified={activeTab.modifiedContent ?? activeTab.diffEntry?.modified ?? ''}
                  language={activeTab.language ?? 'plaintext'}
                  renderSideBySide={false}
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                  }}
                />
              ) : activeTab?.type === 'preview' ? (
                activeTab.previewSrc ? (
                  <iframe
                    key={`${activeTab.id}:${activeTab.version ?? 0}`}
                    src={activeTab.previewSrc}
                    title={activeTab.label || 'Workspace preview'}
                    className="h-full w-full bg-white"
                    style={disablePreviewPointerEvents ? { pointerEvents: 'none' } : undefined}
                    sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
                    Preview target is not available.
                  </div>
                )
              ) : activeTab?.type === 'architecture' ? (
                <ArchitecturePanel
                  diagram={architectureDiagram ?? null}
                  isGenerating={architectureGenerating}
                  onGenerate={onGenerateArchitecture}
                  onRegenerate={onGenerateArchitecture}
                  theme={resolvedTheme}
                />
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
        <>
        {/* Search bar */}
        <div className="flex items-center gap-1 px-1.5 py-1 border-b shrink-0">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder={fileSearchMode === 'content' ? 'Search in files…' : 'Search file names…'}
            value={fileSearchQuery}
            onChange={(e) => setFileSearchQuery(e.target.value)}
            className="flex-1 h-6 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          />
          {fileSearchQuery && (
            <button onClick={() => { setFileSearchQuery(''); setFileSearchResults(null) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => setFileSearchMode(m => m === 'files' ? 'content' : 'files')}
            className={`px-1.5 h-5 rounded text-[9px] font-medium shrink-0 ${fileSearchMode === 'content' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
            title={fileSearchMode === 'files' ? 'Switch to content search' : 'Switch to filename search'}
          >
            {fileSearchMode === 'files' ? 'Name' : 'Content'}
          </button>
        </div>

        {/* Search results or file tree */}
        {fileSearchQuery.trim() ? (
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-1">
              {fileSearchLoading && (
                <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                </div>
              )}

              {/* Filename search results */}
              {!fileSearchLoading && fileSearchResults?.files && fileSearchResults.files.length > 0 && (
                fileSearchResults.files.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center gap-1 rounded px-1 py-1 cursor-pointer text-xs hover:bg-muted"
                    style={{ paddingLeft: 8 }}
                    onClick={() => {
                      const fullPath = remoteRoot ? `${remoteRoot.replace(/\\/g, '/')}/${f.path}` : f.path
                      void handleOpenFileByPath(fullPath)
                      setFileSearchQuery('')
                      setFileSearchResults(null)
                    }}
                  >
                    <FileIcon filename={f.name} className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate flex-1" title={f.path}><HighlightMatch text={f.path} query={fileSearchQuery} /></span>
                  </div>
                ))
              )}

              {/* Content search results */}
              {!fileSearchLoading && fileSearchResults?.matches && fileSearchResults.matches.length > 0 && (
                fileSearchResults.matches.map((m, i) => (
                  <div
                    key={`${m.file}:${m.line}:${i}`}
                    className="flex flex-col gap-0 rounded px-1 py-1 cursor-pointer text-xs hover:bg-muted"
                    style={{ paddingLeft: 8 }}
                    onClick={() => {
                      const fullPath = remoteRoot ? `${remoteRoot.replace(/\\/g, '/')}/${m.file}` : m.file
                      void handleOpenFileByPath(fullPath)
                      setFileSearchQuery('')
                      setFileSearchResults(null)
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <FileIcon filename={m.file.split('/').pop() || m.file} className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate text-foreground" title={m.file}><HighlightMatch text={m.file} query={fileSearchQuery} /></span>
                      <span className="text-muted-foreground shrink-0">:{m.line}</span>
                    </div>
                    <span className="truncate text-muted-foreground pl-5"><HighlightMatch text={m.content} query={fileSearchQuery} /></span>
                  </div>
                ))
              )}

              {/* Empty state */}
              {!fileSearchLoading && fileSearchResults && !fileSearchResults.files?.length && !fileSearchResults.matches?.length && (
                <div className="text-xs text-muted-foreground px-2 py-2">No results found.</div>
              )}
            </div>
          </ScrollArea>
        ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-1">
            {remoteRoot && (
              <div
                className="mb-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground bg-muted/30"
                data-tree-drop-root="true"
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('text/jait-tree-node')) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => {
                  const raw = e.dataTransfer.getData('text/jait-tree-node')
                  if (!raw) return
                  e.preventDefault()
                  const data = JSON.parse(raw) as { path: string }
                  handleMoveTreeNode(data.path, remoteRoot)
                }}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Workspace root</span>
              </div>
            )}
            {hasNativeTree && lazyTree.map((node) => (
              <TreeNodeRow
                key={node.path}
                node={node}
                depth={0}
                activeFilePath={activeNativePath}
                expandedDirs={expandedDirs}
                onToggleDir={handleToggleDirFromTree}
                onSelectFile={handleSelectNativeFileFromTree}
                onContextFile={handleContextNativeFile}
                onTreeContextMenu={handleTreeContextMenu}
                onMoveNode={handleMoveTreeNode}
                gitStatusMap={gitStatusMap}
                dirChangesSet={dirChangesSet}
                mobileDragTargetPath={mobileTreeDrag?.dropDir ?? null}
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
        </>
        )}

        {/* Source Control tab */}
        {treeTab === 'git' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Branch + refresh header */}
          <div className="flex h-[35px] items-center gap-1.5 px-2 border-b bg-muted/10 shrink-0">
            {gitStatus?.branch && (
              <span className="ui-caption truncate flex-1" title={gitStatus.branch}>
                <GitBranch className="h-3 w-3 inline mr-0.5 -mt-px" />
                {gitStatus.branch}
              </span>
            )}
            {!gitStatus?.branch && <span className="ui-caption flex-1">No repo</span>}
            {remoteRoot && (
              <select
                className="h-7 rounded-md border border-input bg-background/90 px-2 text-xs text-muted-foreground shadow-sm"
                value={String(gitAutoFetchMode)}
                onChange={(e) => handleGitAutoFetchModeChange(e.target.value)}
                title={`${describeGitAutoFetchMode(gitAutoFetchMode)}. Interval: ${gitAutoFetchPeriodSeconds}s`}
              >
                <option value="false">Auto-fetch off</option>
                <option value="true">Auto-fetch origin</option>
                <option value="all">Auto-fetch all</option>
              </select>
            )}
            <button
              className="ui-inline-action p-1"
              onClick={fetchGitStatus}
              disabled={gitStatusLoading}
              title="Refresh git status"
            >
              <RefreshCw className={`h-3 w-3 ${gitStatusLoading ? 'animate-spin' : ''}`} />
            </button>
            {gitStatus?.behindCount ? (
              <button
                className="relative ui-inline-action p-1"
                onClick={handleGitPull}
                disabled={gitActionBusy}
                title={`Pull ${gitStatus.behindCount} commit${gitStatus.behindCount > 1 ? 's' : ''}`}
              >
                <Download className="h-3 w-3" />
                <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-primary px-1 text-[9px] font-semibold leading-[14px] text-primary-foreground">
                  {gitStatus.behindCount}
                </span>
              </button>
            ) : null}
          </div>

          {/* Commit message + actions */}
          {remoteRoot && gitStatus && (
          <div className="px-2 py-1.5 border-b bg-muted/5 shrink-0 space-y-1.5">
            <div className="relative">
              <Textarea
                className="min-h-[68px] resize-none pr-9 text-sm"
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
                className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
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
              <Button
                size="sm"
                className="h-8 rounded-md px-2 text-xs"
                onClick={() => handleGitAction('commit')}
                disabled={gitActionBusy || changedFileCount === 0}
                title="Commit all changes (Ctrl+Enter)"
              >
                {gitActionBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Commit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 rounded-md px-2 text-xs"
                onClick={() => handleGitAction('commit_push')}
                disabled={gitActionBusy || changedFileCount === 0}
                title="Commit and push"
              >
                <CloudUpload className="h-3 w-3" />
                Commit & Push
              </Button>
              {(gitStatus.aheadCount > 0) && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-md px-2 text-xs"
                  onClick={() => handleGitAction('commit_push')}
                  disabled={gitActionBusy}
                  title={`Push ${gitStatus.aheadCount} committed commit${gitStatus.aheadCount > 1 ? 's' : ''}`}
                >
                  <CloudUpload className="h-3 w-3" />
                  Push ({gitStatus.aheadCount})
                </Button>
              )}
              <select
                className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground shadow-sm"
                value={sourceControlView}
                onChange={(e) => setSourceControlView(e.target.value as 'list' | 'tree')}
                title="Source control view"
              >
                <option value="list">List</option>
                <option value="tree">Tree</option>
              </select>
            </div>
            {gitActionError && (
              <div className="ui-caption px-0.5 text-red-500">{gitActionError}</div>
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
                <div className="ui-eyebrow px-2 py-1">
                  Source Control ({changedFileCount})
                  <span className="normal-case tracking-normal ml-1">
                    <span className="text-green-500">+{gitStatus.index.insertions + gitStatus.workingTree.insertions}</span>
                    {' '}
                    <span className="text-red-500">-{gitStatus.index.deletions + gitStatus.workingTree.deletions}</span>
                  </span>
                </div>
                {renderSourceControlSection('Staged', stagedFiles, stagedTree, gitStatus.index, 'unstage')}
                {renderSourceControlSection('Changes', workingTreeFiles, workingTree, gitStatus.workingTree, 'stage')}
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
        className="relative w-2 -mx-0.5 shrink-0 cursor-col-resize group touch-none"
        onPointerDown={tree.onPointerDown}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/60 transition-colors group-hover:bg-primary/40 group-active:bg-primary/50" />
      </div>
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
                  ) : tab.type === 'architecture' ? (
                    <Boxes className="h-3.5 w-3.5 shrink-0" />
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
          {(activeTabEditable || activeTab?.type === 'preview' || onToggleEditor) && (
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
              {activeTab?.type === 'preview' && (
                <button
                  onClick={handleRefreshPreviewTarget}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded px-1.5 py-0.5 hover:bg-muted shrink-0"
                  title="Refresh preview"
                >
                  <RefreshCw className="h-3 w-3" />
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
          <ReadOnlyDiffView
            key={activeTab.id}
            className="h-full"
            editorClassName="h-full"
            original={activeTab.originalContent ?? activeTab.diffEntry?.original ?? ''}
            modified={activeTab.modifiedContent ?? activeTab.diffEntry?.modified ?? ''}
            language={activeTab.language ?? inferLanguage(activeTab.path)}
            renderSideBySide={!isMobile}
            options={{
              minimap: { enabled: false },
            }}
          />
        ) : activeTab?.type === 'preview' ? (
          activeTab.previewSrc ? (
            <iframe
              key={`${activeTab.id}:${activeTab.version ?? 0}`}
              src={activeTab.previewSrc}
              title={activeTab.label || 'Workspace preview'}
              className="h-full w-full bg-white"
              style={disablePreviewPointerEvents ? { pointerEvents: 'none' } : undefined}
              sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Preview target is not available.
            </div>
          )
        ) : activeTab?.type === 'architecture' ? (
          <ArchitecturePanel
            diagram={architectureDiagram ?? null}
            isGenerating={architectureGenerating}
            onGenerate={onGenerateArchitecture}
            onRegenerate={onGenerateArchitecture}
            theme={resolvedTheme}
          />
        ) : loadingFile && activeTab?.id === activeTabId ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : activeTab?.type === 'file' ? (
          <ReviewableEditor
            key={activeTab.id}
            path={activeTab.path}
            language={activeTab.language ?? 'plaintext'}
            value={activeTab.content ?? ''}
            originalContent={activeTab.originalContent}
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
            readOnly={!isEditableWorkspaceTab(activeTab)}
            onChange={(value) => handleTabContentChange(activeTab.id, value)}
            onApplyReview={async (resultContent) => {
              await onApplyDiff?.(activeTab.path, resultContent)
              setOpenTabs((prev) => prev.map((tab) => (
                tab.id === activeTab.id
                  ? { ...tab, content: resultContent, modifiedContent: resultContent, savedContent: resultContent, originalContent: null, isDirty: false }
                  : tab
              )))
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

      {mobileTreeDrag?.active && (
      <div
        className="pointer-events-none fixed z-50 rounded-md border bg-background/95 px-2 py-1 text-xs shadow-lg"
        style={{ left: mobileTreeDrag.x + 12, top: mobileTreeDrag.y + 12 }}
      >
        Move {mobileTreeDrag.node.name}
      </div>
      )}

      {tabContextMenu && (
      <div
        className="ui-panel-surface fixed z-50 min-w-[170px] py-1"
        style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="ui-menu-item"
          onClick={() => handleCloseTab(tabContextMenu.tabId)}
        >
          Close
        </button>
        <button
          className="ui-menu-item"
          disabled={openTabs.length <= 1}
          onClick={() => handleCloseOtherTabs(tabContextMenu.tabId)}
        >
          Close Others
        </button>
        <button
          className="ui-menu-item"
          disabled={contextTabIndex < 0 || contextTabIndex >= openTabs.length - 1}
          onClick={() => handleCloseTabsToRight(tabContextMenu.tabId)}
        >
          Close to the Right
        </button>
        <div className="my-1 h-px bg-border" />
        <button
          className="ui-menu-item"
          disabled={openTabs.length === 0}
          onClick={handleCloseAllTabs}
        >
          Close All
        </button>
      </div>
      )}

      {/* File tree context menu */}
      {fileContextMenu && (
      <div
        ref={fileContextMenuRef}
        className="ui-panel-surface fixed z-50 min-w-[180px] py-1"
        style={{
          left: fileContextMenuPosition?.left ?? fileContextMenu.x,
          top: fileContextMenuPosition?.top ?? fileContextMenu.y,
          visibility: fileContextMenuPosition ? 'visible' : 'hidden',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {fileContextMenu.node.kind === 'file' && (
          <button
            className="ui-menu-item"
            onClick={() => {
              const node = fileContextMenu.node as LazyFile
              handleSelectNativeFile(node)
              setFileContextMenu(null)
            }}
          >
            Open
          </button>
        )}
        {fileContextMenu.node.kind === 'file' && (
          <button
            className="ui-menu-item"
            onClick={() => {
              const node = fileContextMenu.node as LazyFile
              void handleContextNativeFile(node)
              setFileContextMenu(null)
            }}
          >
            <Send className="h-3 w-3" />
            Add to Chat
          </button>
        )}
        <div className="my-1 h-px bg-border" />
        {/* New File / New Folder */}
        <button
          className="ui-menu-item"
          onClick={() => {
            const parentDir = fileContextMenu.node.kind === 'dir'
              ? fileContextMenu.node.path
              : fileContextMenu.node.path.includes('/') ? fileContextMenu.node.path.slice(0, fileContextMenu.node.path.lastIndexOf('/')) : remoteRoot ?? ''
            setNewItemTarget({ parentDir, kind: 'file' })
            setNewItemValue('')
            setFileContextMenu(null)
          }}
        >
          <FilePlus className="h-3 w-3" />
          New File
        </button>
        <button
          className="ui-menu-item"
          onClick={() => {
            const parentDir = fileContextMenu.node.kind === 'dir'
              ? fileContextMenu.node.path
              : fileContextMenu.node.path.includes('/') ? fileContextMenu.node.path.slice(0, fileContextMenu.node.path.lastIndexOf('/')) : remoteRoot ?? ''
            setNewItemTarget({ parentDir, kind: 'dir' })
            setNewItemValue('')
            setFileContextMenu(null)
          }}
        >
          <FolderPlus className="h-3 w-3" />
          New Folder
        </button>
        <div className="my-1 h-px bg-border" />
        {/* Rename */}
        <button
          className="ui-menu-item"
          onClick={() => {
            setRenameTarget({ path: fileContextMenu.node.path, name: fileContextMenu.node.name, kind: fileContextMenu.node.kind === 'dir' ? 'dir' : 'file' })
            setRenameValue(fileContextMenu.node.name)
            setFileContextMenu(null)
          }}
        >
          <Edit3 className="h-3 w-3" />
          Rename
        </button>
        {/* Delete */}
        <button
          className="ui-menu-item text-red-500 hover:text-red-600"
          onClick={() => {
            void handleDeleteNode(fileContextMenu.node)
            setFileContextMenu(null)
          }}
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
        <div className="my-1 h-px bg-border" />
        {/* Copy Path */}
        <button
          className="ui-menu-item"
          onClick={() => {
            handleCopyPath(fileContextMenu.node)
            setFileContextMenu(null)
          }}
        >
          <Copy className="h-3 w-3" />
          Copy Path
        </button>
        <button
          className="ui-menu-item"
          onClick={() => {
            handleCopyRelativePath(fileContextMenu.node)
            setFileContextMenu(null)
          }}
        >
          <Copy className="h-3 w-3" />
          Copy Relative Path
        </button>
      </div>
      )}

      {/* Inline rename input */}
      {renameTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onPointerDown={() => setRenameTarget(null)}>
        <div className="ui-panel-surface min-w-[320px] p-4" onPointerDown={(e) => e.stopPropagation()}>
          <div className="mb-2 text-sm font-medium">Rename "{renameTarget.name}"</div>
          <Input
            className="h-10 text-sm"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleRenameConfirm()
              if (e.key === 'Escape') setRenameTarget(null)
            }}
          />
          <div className="mt-3 flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button size="sm" className="h-8 rounded-md px-3 text-xs" onClick={() => void handleRenameConfirm()}>Rename</Button>
          </div>
        </div>
      </div>
      )}

      {/* New file/folder input */}
      {newItemTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onPointerDown={() => setNewItemTarget(null)}>
        <div className="ui-panel-surface min-w-[320px] p-4" onPointerDown={(e) => e.stopPropagation()}>
          <div className="mb-2 text-sm font-medium">New {newItemTarget.kind === 'dir' ? 'Folder' : 'File'}</div>
          <Input
            className="h-10 text-sm"
            autoFocus
            placeholder={newItemTarget.kind === 'dir' ? 'folder-name' : 'filename.ext'}
            value={newItemValue}
            onChange={(e) => setNewItemValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleNewItemConfirm()
              if (e.key === 'Escape') setNewItemTarget(null)
            }}
          />
          <div className="mt-3 flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={() => setNewItemTarget(null)}>Cancel</Button>
            <Button size="sm" className="h-8 rounded-md px-3 text-xs" onClick={() => void handleNewItemConfirm()}>Create</Button>
          </div>
        </div>
      </div>
      )}

      {/* Resize handle: panel ↔ chat (right edge) */}
      <div
        className="relative w-2 -mx-0.5 shrink-0 cursor-col-resize group touch-none"
        onPointerDown={panel.onPointerDown}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/60 transition-colors group-hover:bg-primary/40 group-active:bg-primary/50" />
      </div>
    </aside>
  )
})
