import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef, type ReactNode } from 'react'
import { ArrowUp, ListPlus, Mic, MicOff, Square, Loader2, Paperclip, X } from 'lucide-react'
import { getIconForFile, getIconForFolder, DEFAULT_FILE, DEFAULT_FOLDER } from 'vscode-icons-js'
import { Button } from '@/components/ui/button'
import { ModeSelector } from '@/components/chat/mode-selector'
import type { ChatMode } from '@/components/chat/mode-selector'
import { StyleSelector } from '@/components/chat/style-selector'
import { SendTargetSelector, type SendTarget } from '@/components/chat/send-target-selector'
import { ProviderModelSelector } from '@/components/chat/provider-model-selector'
import { ProviderRuntimeSelector } from '@/components/chat/provider-runtime-selector'
import type { ProviderId, RuntimeMode } from '@/lib/agents-api'
import type { RepositoryRuntimeInfo } from '@/lib/automation-repositories'
import type { SessionInfo, ChatAttachment } from '@/hooks/useChat'
import { FileIcon, FolderIcon } from '@/components/icons/file-icons'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'
import { JAIT_TERMINAL_REF_MIME, JAIT_WORKSPACE_REF_MIME } from '@/lib/jait-dnd'
import {
  JAIT_REF_MIME,
  formatLineRange,
  normalizeUserMessageSegments,
  parseUserMessageClipboardPayload,
  parseUserMessageMarkdown,
  serializeUserMessageSegmentsForClipboard,
  serializeUserMessageSegmentsToMarkdown,
  type UserMessageSegment,
  type UserTerminalReference,
  type UserWorkspaceReference,
} from '@/lib/user-message-segments'
import { getPromptDraftSignature, shouldSyncComposerDraft } from '@/lib/prompt-input-draft'
import { getRootCaretOffsetAfterChipRemoval, shouldRemovePreviousChipOnBackspace } from './prompt-input-selection'
import type { ResponseStyle } from '@jait/shared'

const ICON_CDN = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@12.9.0/icons/'

/** Stable empty array so the default prop doesn't create a new reference each render. */
const EMPTY_FILES: ReferencedFile[] = []

export interface ReferencedFile {
  path: string
  name: string
  kind?: 'file' | 'dir'
  lineRange?: { startLine: number; endLine: number }
}

type PromptChipReference =
  | ReferencedFile
  | ({ type: 'workspace' } & UserWorkspaceReference)
  | ({ type: 'terminal' } & UserTerminalReference)

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (chipFiles?: ReferencedFile[], attachments?: ChatAttachment[], segments?: UserMessageSegment[]) => void
  onStop?: () => void
  /** Queue a message while the agent is busy. */
  onQueue?: (chipFiles?: ReferencedFile[], attachments?: ChatAttachment[], segments?: UserMessageSegment[]) => void
  isLoading?: boolean
  disabled?: boolean
  controlsDisabled?: boolean
  placeholder?: string
  className?: string
  footerLeadingContent?: ReactNode
  footerTrailingContent?: ReactNode
  onVoiceInput?: () => void
  /** True while mic is actively recording */
  voiceRecording?: boolean
  /** Smoothed waveform values for the live mic preview */
  voiceLevels?: number[]
  /** True while audio is being transcribed */
  voiceTranscribing?: boolean
  /** Called when user clicks "Done" to stop recording */
  onVoiceStop?: () => void
  mode?: ChatMode
  onModeChange?: (mode: ChatMode) => void
  sendTarget?: SendTarget
  onSendTargetChange?: (target: SendTarget) => void
  showSendTargetSelector?: boolean
  provider?: ProviderId
  onProviderChange?: (provider: ProviderId) => void
  responseStyle?: ResponseStyle
  onResponseStyleChange?: (style: ResponseStyle) => void
  providerRuntimeMode?: RuntimeMode
  onProviderRuntimeModeChange?: (mode: RuntimeMode) => void
  /** Model override for CLI providers (codex / claude-code). */
  cliModel?: string | null
  onCliModelChange?: (model: string | null) => void
  /** Scoped runtime info for the selected repo (Manager mode). */
  repoRuntime?: RepositoryRuntimeInfo | null
  /** Called when user wants to move the repo to the gateway. */
  onMoveToGateway?: () => void
  /** Active session info — shows where the current session is running. */
  sessionInfo?: SessionInfo | null
  /** Node ID of the open workspace (scopes CLI providers to that device). */
  workspaceNodeId?: string
  /** All files available for @ mention (pre-loaded from visible tree) */
  availableFiles?: ReferencedFile[]
  /** Ordered text/file segments for restoring an existing draft. */
  segments?: UserMessageSegment[]
  /** Lazy search across the entire workspace directory */
  onSearchFiles?: (query: string, limit: number, signal?: AbortSignal) => Promise<ReferencedFile[]>
  /** Whether a workspace directory is currently open — @ mentions only work when true */
  workspaceOpen?: boolean
  /** Stable key for preserving local attachment draft state across remounts. */
  draftStateKey?: string
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Build a non-editable inline chip DOM node for a file reference. */
function getChipRefKey(ref: PromptChipReference): string {
  const lineRange = 'lineRange' in ref ? ref.lineRange : undefined
  const rangeKey = lineRange ? `:L${lineRange.startLine}-L${lineRange.endLine}` : ''
  if ('type' in ref && ref.type === 'workspace') return `workspace:${ref.path}`
  if ('type' in ref && ref.type === 'terminal') {
    const selectionKey = ref.selectedText ? `:${hashString(ref.selectedText)}` : ''
    return `terminal:${ref.terminalId}${rangeKey}${selectionKey}`
  }
  return `file:${ref.path}${rangeKey}`
}

function hashString(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

function createChipNode(file: PromptChipReference, onRemove?: (refKey: string) => void): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  const refKey = getChipRefKey(file)
  chip.setAttribute('data-chip-ref', refKey)
  if ('type' in file && file.type === 'workspace') {
    chip.setAttribute('data-segment-type', 'workspace')
    chip.setAttribute('data-workspace-path', file.path)
    chip.setAttribute('data-chip-name', file.name)
  } else if ('type' in file && file.type === 'terminal') {
    chip.setAttribute('data-segment-type', 'terminal')
    chip.setAttribute('data-terminal-id', file.terminalId)
    chip.setAttribute('data-chip-name', file.name)
    if (file.workspaceRoot) chip.setAttribute('data-workspace-root', file.workspaceRoot)
    if (file.lineRange) {
      chip.setAttribute('data-line-start', String(file.lineRange.startLine))
      chip.setAttribute('data-line-end', String(file.lineRange.endLine))
    }
    if (file.selectedText) chip.setAttribute('data-selected-text', file.selectedText)
  } else {
    chip.setAttribute('data-segment-type', 'file')
    chip.setAttribute('data-file-path', file.path)
    chip.setAttribute('data-chip-name', file.name)
    if (file.kind) chip.setAttribute('data-kind', file.kind)
    if (file.lineRange) {
      chip.setAttribute('data-line-start', String(file.lineRange.startLine))
      chip.setAttribute('data-line-end', String(file.lineRange.endLine))
    }
  }
  chip.className =
    'inline-flex items-center gap-1.5 align-middle text-xs font-medium leading-none mx-[2px] rounded-md border border-border/70 bg-muted/45 pl-2 pr-1 py-1 text-foreground cursor-default whitespace-nowrap transition-colors'

  // Icon (file or folder)
  const icon = document.createElement('span')
  icon.className = 'inline-flex items-center shrink-0'
  if ('type' in file && file.type === 'workspace') {
    icon.innerHTML = `<img src="${ICON_CDN}${DEFAULT_FOLDER}" alt="" class="h-3.5 w-3.5" draggable="false" />`
  } else if ('type' in file && file.type === 'terminal') {
    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5 text-muted-foreground"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>'
  } else {
    const iconName = file.kind === 'dir' ? getVsFolderIconName(file.name) : getVsIconName(file.name)
    icon.innerHTML = `<img src="${ICON_CDN}${iconName}" alt="" class="h-3.5 w-3.5" draggable="false" />`
  }
  chip.appendChild(icon)

  // Name label
  const label = document.createElement('span')
  label.className = 'truncate max-w-[180px]'
  const lineRangeLabel = 'lineRange' in file ? formatLineRange(file.lineRange) : ''
  label.textContent = lineRangeLabel ? `${file.name}:${lineRangeLabel.replace(/^lines? /, '')}` : file.name
  chip.appendChild(label)

  // Remove button
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'inline-flex items-center p-0.5 rounded hover:bg-foreground/10 transition-colors text-muted-foreground hover:text-foreground'
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    chip.remove()
    onRemove?.(refKey)
  })
  chip.appendChild(btn)

  return chip
}

/** Simple extension→icon filename (reuses the CDN approach from file-icons.tsx). */
function getVsIconName(filename: string): string {
  return getIconForFile(filename) ?? DEFAULT_FILE
}

/** Folder name→icon filename. */
function getVsFolderIconName(foldername: string): string {
  return getIconForFolder(foldername) ?? DEFAULT_FOLDER
}

/** Extract plain text from the editable div, ignoring chip nodes. */
function getTextFromEditable(el: HTMLElement): string {
  let text = ''
  const children = el.childNodes
  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
    } else if (node instanceof HTMLElement) {
      if (node.hasAttribute('data-chip-ref')) {
        // Skip chips — they're represented separately
        continue
      } else if (node.tagName === 'BR') {
        // Ignore trailing <br> that browsers insert in empty/end-of contentEditable
        const isLast = i === children.length - 1
        if (!isLast) text += '\n'
      } else {
        text += getTextFromEditable(node)
      }
    }
  }
  return text
}

/** Strip zero-width and invisible formatting characters. */
function stripInvisible(s: string): string {
  return s.replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
}

/** Check if a text string is empty (ignoring only zero-width chars). */
function isTextEmpty(s: string): boolean {
  return stripInvisible(s).length === 0
}

/** Get file paths from all chip nodes in the editable div. */
function getChipPaths(el: HTMLElement): string[] {
  const paths: string[] = []
  el.querySelectorAll('[data-segment-type="file"][data-file-path]').forEach((chip) => {
    paths.push(chip.getAttribute('data-file-path')!)
  })
  return paths
}

/** Get all chip file references from the editable div. */
function getChipFiles(el: HTMLElement): ReferencedFile[] {
  const files: ReferencedFile[] = []
  el.querySelectorAll('[data-segment-type="file"][data-file-path]').forEach((chip) => {
    const kind = chip.getAttribute('data-kind')
    files.push({
      path: chip.getAttribute('data-file-path')!,
      name: chip.getAttribute('data-chip-name') || chip.getAttribute('data-file-path')!.split(/[\\/]/).pop()!,
      ...(kind === 'file' || kind === 'dir' ? { kind } : {}),
      ...readChipLineRange(chip as HTMLElement),
    })
  })
  return files
}

function getComposerSegments(el: HTMLElement): UserMessageSegment[] {
  const segments: UserMessageSegment[] = []

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) segments.push({ type: 'text', text })
      return
    }

    if (!(node instanceof HTMLElement)) return

    if (node.hasAttribute('data-chip-ref')) {
      const segmentType = node.getAttribute('data-segment-type')
      if (segmentType === 'workspace') {
        const path = node.getAttribute('data-workspace-path')
        if (!path) return
        segments.push({
          type: 'workspace',
          path,
          name: node.getAttribute('data-chip-name') || path.split(/[\\/]/).pop() || path,
        })
        return
      }
      if (segmentType === 'terminal') {
        const terminalId = node.getAttribute('data-terminal-id')
        if (!terminalId) return
        const workspaceRoot = node.getAttribute('data-workspace-root')
        segments.push({
          type: 'terminal',
          terminalId,
          name: node.getAttribute('data-chip-name') || terminalId,
          ...(workspaceRoot ? { workspaceRoot } : {}),
          ...readChipLineRange(node),
          ...(node.getAttribute('data-selected-text') ? { selectedText: node.getAttribute('data-selected-text')! } : {}),
        })
        return
      }
      const path = node.getAttribute('data-file-path')
      if (!path) return
      const kind = node.getAttribute('data-kind')
      segments.push({
        type: 'file',
        path,
        name: node.getAttribute('data-chip-name') || path.split(/[\\/]/).pop() || path,
        ...(kind === 'file' || kind === 'dir' ? { kind } : {}),
        ...readChipLineRange(node),
      })
      return
    }

    if (node.tagName === 'BR') {
      segments.push({ type: 'text', text: '\n' })
      return
    }

    for (const child of node.childNodes) visit(child)
  }

  for (const child of el.childNodes) visit(child)
  return normalizeUserMessageSegments(segments)
}

function readChipLineRange(node: HTMLElement): { lineRange: { startLine: number; endLine: number } } | Record<string, never> {
  const startLine = Number.parseInt(node.getAttribute('data-line-start') ?? '', 10)
  const endLine = Number.parseInt(node.getAttribute('data-line-end') ?? '', 10)
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || startLine < 1 || endLine < startLine) return {}
  return { lineRange: { startLine, endLine } }
}

function hasChipRefs(el: HTMLElement | null): boolean {
  return Boolean(el?.querySelector('[data-chip-ref]'))
}

function restoreCaretAfterChipRemoval(root: HTMLElement, nextSibling: Node | null, childIndex: number) {
  const selection = window.getSelection()
  if (!selection) return

  const nextRange = document.createRange()
  if (nextSibling?.nodeType === Node.TEXT_NODE) {
    nextRange.setStart(nextSibling, 0)
  } else if (nextSibling?.parentNode === root) {
    nextRange.setStart(root, Array.from(root.childNodes).indexOf(nextSibling as ChildNode))
  } else {
    nextRange.setStart(root, getRootCaretOffsetAfterChipRemoval(childIndex, root.childNodes.length))
  }
  nextRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(nextRange)
}

function restoreCaretAfterChipRemovalStable(root: HTMLElement, nextSibling: Node | null, childIndex: number) {
  restoreCaretAfterChipRemoval(root, nextSibling, childIndex)
  requestAnimationFrame(() => {
    if (!root.isConnected) return
    restoreCaretAfterChipRemoval(root, nextSibling, childIndex)
  })
}

function buildEditableContent(
  el: HTMLElement,
  segments: UserMessageSegment[] | undefined,
  fallbackValue: string,
  onRemove: (refKey: string) => void,
) {
  el.innerHTML = ''

  const normalized = normalizeUserMessageSegments(segments)
  if (normalized.length === 0) {
    if (fallbackValue) el.appendChild(document.createTextNode(fallbackValue))
    return
  }

  for (const segment of normalized) {
    appendSegmentNode(el, segment, onRemove)
  }
}

function appendSegmentNode(
  parent: Node,
  segment: UserMessageSegment,
  onRemove: (refKey: string) => void,
) {
  if (segment.type === 'text') {
    parent.appendChild(document.createTextNode(segment.text))
    return
  }
  if (segment.type === 'file' || segment.type === 'workspace' || segment.type === 'terminal') {
    parent.appendChild(createChipNode(segment, onRemove))
    return
  }
  parent.appendChild(document.createTextNode(`[image:${segment.name}]`))
}

function insertSegmentsAtCursor(
  el: HTMLElement,
  segments: UserMessageSegment[],
  onRemove: (refKey: string) => void,
) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    for (const segment of segments) {
      appendSegmentNode(el, segment, onRemove)
    }
    moveCursorToEnd(el)
    return
  }

  const range = selection.getRangeAt(0)
  range.deleteContents()

  const fragment = document.createDocumentFragment()
  for (const segment of segments) {
    appendSegmentNode(fragment, segment, onRemove)
  }

  const lastNode = fragment.lastChild
  range.insertNode(fragment)

  if (!lastNode) return

  const nextRange = document.createRange()
  if (lastNode.nodeType === Node.TEXT_NODE) {
    nextRange.setStart(lastNode, lastNode.textContent?.length ?? 0)
  } else {
    nextRange.setStartAfter(lastNode)
  }
  nextRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(nextRange)
}

/** Move cursor to the end of a contentEditable element. */
function moveCursorToEnd(el: HTMLElement) {
  const sel = window.getSelection()
  if (sel) {
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

/** Remove empty text nodes and stale <br> tags so chips aren't offset. */
function cleanEmptyNodes(el: HTMLElement) {
  for (let i = el.childNodes.length - 1; i >= 0; i--) {
    const child = el.childNodes[i]
    if (child instanceof HTMLElement && child.tagName === 'BR') {
      child.remove()
    } else if (child.nodeType === Node.TEXT_NODE && !child.textContent) {
      child.remove()
    }
  }
}

function sanitizeEditableContent(el: HTMLElement) {
  for (let i = el.childNodes.length - 1; i >= 0; i--) {
    const child = el.childNodes[i]
    if (child.nodeType === Node.TEXT_NODE) continue
    if (!(child instanceof HTMLElement)) {
      child.remove()
      continue
    }
    if (child.hasAttribute('data-chip-ref') || child.tagName === 'BR') continue
    if (child.matches('button, a, input, textarea, select, svg, [role="button"]')
      || child.querySelector('button, a, input, textarea, select, svg, [role="button"]')) {
      child.remove()
      continue
    }
    child.replaceWith(document.createTextNode(child.textContent ?? ''))
  }
}

function appendSegmentNodes(
  el: HTMLElement,
  segments: UserMessageSegment[],
  onRemoveChip?: (refKey: string) => void,
) {
  cleanEmptyNodes(el)
  for (const segment of normalizeUserMessageSegments(segments)) {
    if (segment.type === 'text') {
      if (segment.text) el.appendChild(document.createTextNode(segment.text))
      continue
    }
    if (segment.type === 'image') continue
    if (el.querySelector(`[data-chip-ref="${CSS.escape(getChipRefKey(segment))}"]`)) continue
    el.appendChild(createChipNode(segment, onRemoveChip))
    el.appendChild(document.createTextNode(' '))
  }
}

export interface PromptInputHandle {
  /** Insert a file chip into the input (used by workspace Send button). */
  insertChip: (file: ReferencedFile) => void
  /** Insert text and/or structured references into the composer. */
  insertSegments: (segments: UserMessageSegment[]) => void
  /** Read the current ordered text/file segments from the composer. */
  getSegments: () => UserMessageSegment[]
  /** Focus the editor and move the caret to the end. */
  focus: () => void
  /** Append a file attachment (binary/text) directly to the attachments list. */
  addAttachment: (attachment: import('@/hooks/useChat').ChatAttachment) => void
}

const attachmentDraftStore = new Map<string, ChatAttachment[]>()
const COMPACT_FOOTER_CONTROLS_WIDTH = 560

function VoiceLevelMeter({ levels = [], compact = false }: { levels?: number[]; compact?: boolean }) {
  const bars = levels.length > 0 ? levels : Array.from({ length: 28 }, () => 0.05)
  const visibleBars = compact ? bars.slice(-16) : bars
  const meterHeight = compact ? 24 : 30

  return (
    <span
      className={cn(
        'flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-full border border-black/10 bg-gradient-to-b from-black/5 via-black/10 to-black/5 px-3 py-1 dark:border-white/10 dark:from-white/5 dark:via-white/10 dark:to-white/5',
        compact ? 'h-8 max-w-[210px]' : 'h-10 max-w-[320px]',
      )}
    >
      {visibleBars.map((level, index) => (
        <span
          key={index}
          className={cn(
            'block shrink-0 rounded-full bg-black/75 transition-[height,opacity,transform] duration-300 ease-out dark:bg-white/80',
            compact ? 'w-[2px]' : 'w-[3px]',
          )}
          style={{
            height: `${6 + level * meterHeight}px`,
            opacity: 0.18 + level * 0.82,
            transform: `translateY(${(1 - level) * 1.5}px)`,
          }}
        />
      ))}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export const PromptInput = forwardRef<PromptInputHandle, PromptInputProps>(function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  onQueue,
  isLoading,
  disabled,
  controlsDisabled,
  placeholder = 'Ask anything...',
  className,
  footerLeadingContent,
  footerTrailingContent,
  onVoiceInput,
  voiceRecording,
  voiceLevels,
  voiceTranscribing,
  onVoiceStop,
  mode,
  onModeChange,
  sendTarget,
  onSendTargetChange,
  showSendTargetSelector = true,
  provider,
  onProviderChange,
  responseStyle,
  onResponseStyleChange,
  providerRuntimeMode,
  onProviderRuntimeModeChange,
  cliModel,
  onCliModelChange,
  repoRuntime,
  onMoveToGateway,
  sessionInfo,
  workspaceNodeId,
  availableFiles = EMPTY_FILES,
  segments,
  onSearchFiles,
  workspaceOpen = false,
  draftStateKey,
}: PromptInputProps, ref) {
  const rootRef = useRef<HTMLDivElement>(null)
  const editableRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const [compactFooterControls, setCompactFooterControls] = useState(false)

  const [dragging, setDragging] = useState(false)
  const dragCounter = useRef(0)
  const [isEmpty, setIsEmpty] = useState(isTextEmpty(value))
  const [attachments, setAttachments] = useState<ChatAttachment[]>(
    () => (draftStateKey ? attachmentDraftStore.get(draftStateKey) ?? [] : []),
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftSegmentsRef = useRef<UserMessageSegment[]>(normalizeUserMessageSegments(segments))
  const lastAppliedDraftSignatureRef = useRef<string | null>(null)

  // Undo/redo stack for the composer (prevents browser native undo corruption)
  const undoStackRef = useRef<UserMessageSegment[][]>([])
  const redoStackRef = useRef<UserMessageSegment[][]>([])
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // @ mention state
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)

  // Keep a ref in sync so the onInput handler always reads the latest value
  const mentionOpenRef = useRef(false)
  useEffect(() => { mentionOpenRef.current = mentionOpen }, [mentionOpen])
  const availableFilesRef = useRef(availableFiles)
  useEffect(() => { availableFilesRef.current = availableFiles }, [availableFiles])
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  const onSearchFilesRef = useRef(onSearchFiles)
  useEffect(() => { onSearchFilesRef.current = onSearchFiles }, [onSearchFiles])
  const workspaceOpenRef = useRef(workspaceOpen)
  useEffect(() => { workspaceOpenRef.current = workspaceOpen }, [workspaceOpen])
  const pushUndoRef = useRef<(immediate?: boolean) => void>(() => {})

  // Async search results for @ mention
  const [searchResults, setSearchResults] = useState<ReferencedFile[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchAbort = useRef<AbortController | null>(null)
  const composerDisabled = Boolean(disabled)
  const controlsLocked = Boolean(controlsDisabled ?? disabled ?? false)
  const selectorsDisabled = controlsLocked
  const showProviderModelSelector = Boolean(provider && onProviderChange && onCliModelChange)
  const showResponseStyleSelector = Boolean(responseStyle && onResponseStyleChange)
  const showProviderRuntimeSelector = Boolean(provider && providerRuntimeMode && onProviderRuntimeModeChange)
  const showModeSelector = Boolean(mode && onModeChange && sendTarget !== 'thread' && (!provider || provider === 'jait'))
  const shouldShowSendTargetSelector = showSendTargetSelector && Boolean(sendTarget && onSendTargetChange)
  const hasFooterControls = shouldShowSendTargetSelector || showProviderModelSelector || showResponseStyleSelector || showProviderRuntimeSelector || showModeSelector || Boolean(footerLeadingContent)

  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      setCompactFooterControls(false)
      return
    }

    const updateCompact = () => {
      setCompactFooterControls(el.clientWidth < COMPACT_FOOTER_CONTROLS_WIDTH)
    }

    updateCompact()
    const observer = new ResizeObserver(() => updateCompact())
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Track whether we're doing a controlled sync to avoid loops
  const isSyncing = useRef(false)

  useEffect(() => {
    if (!draftStateKey) return
    setAttachments(attachmentDraftStore.get(draftStateKey) ?? [])
  }, [draftStateKey])

  useEffect(() => {
    if (!draftStateKey) return
    if (attachments.length === 0) {
      attachmentDraftStore.delete(draftStateKey)
      return
    }
    attachmentDraftStore.set(draftStateKey, attachments)
  }, [draftStateKey, attachments])

  /** Remove a chip from the editable DOM and update isEmpty. */
  const handleRemoveChip = useCallback((refKey: string) => {
    const el = editableRef.current
    if (!el) return
    pushUndoRef.current(true)
    el.querySelector(`[data-chip-ref="${CSS.escape(refKey)}"]`)?.remove()
    draftSegmentsRef.current = getComposerSegments(el)
    isSyncing.current = true
    onChangeRef.current(getTextFromEditable(el))
    isSyncing.current = false
    setIsEmpty(isTextEmpty(getTextFromEditable(el)) && !hasChipRefs(el))
  }, [])

  const resetComposer = useCallback(() => {
    const el = editableRef.current
    if (!el) return
    buildEditableContent(el, [], '', handleRemoveChip)
    draftSegmentsRef.current = []
    lastAppliedDraftSignatureRef.current = getPromptDraftSignature('', [])
    isSyncing.current = true
    onChangeRef.current('')
    isSyncing.current = false
    setIsEmpty(true)
    undoStackRef.current = []
    redoStackRef.current = []
  }, [handleRemoveChip])

  /** Push a snapshot onto the undo stack (debounced for typing). */
  const pushUndoSnapshot = useCallback((immediate?: boolean) => {
    const push = () => {
      const snap = [...draftSegmentsRef.current]
      const stack = undoStackRef.current
      // Avoid duplicate consecutive snapshots
      if (stack.length > 0 && JSON.stringify(stack[stack.length - 1]) === JSON.stringify(snap)) return
      stack.push(snap)
      if (stack.length > 100) stack.shift()
      redoStackRef.current = []
    }
    if (immediate) {
      if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null }
      push()
    } else {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      undoTimerRef.current = setTimeout(push, 300)
    }
  }, [])

  useEffect(() => { pushUndoRef.current = pushUndoSnapshot }, [pushUndoSnapshot])

  /** Restore a segments snapshot into the editable. */
  const restoreSnapshot = useCallback((snap: UserMessageSegment[]) => {
    const el = editableRef.current
    if (!el) return
    isSyncing.current = true
    buildEditableContent(el, snap, '', handleRemoveChip)
    draftSegmentsRef.current = getComposerSegments(el)
    const text = getTextFromEditable(el)
    onChangeRef.current(text)
    setIsEmpty(isTextEmpty(text) && !hasChipRefs(el))
    isSyncing.current = false
    moveCursorToEnd(el)
  }, [handleRemoveChip])

  /** Expose imperative methods for parent components. */
  useImperativeHandle(ref, () => ({
    insertChip: (file: ReferencedFile) => {
      const el = editableRef.current
      if (!el) return
      // Don't add duplicate
      if (el.querySelector(`[data-chip-ref="${CSS.escape(getChipRefKey(file))}"]`)) return
      pushUndoRef.current(true)
      cleanEmptyNodes(el)
      const chip = createChipNode(file, handleRemoveChip)
      el.appendChild(chip)
      el.appendChild(document.createTextNode(' '))
      draftSegmentsRef.current = getComposerSegments(el)
      moveCursorToEnd(el)
      isSyncing.current = true
      onChangeRef.current(getTextFromEditable(el))
      isSyncing.current = false
      setIsEmpty(false)
    },
    insertSegments: (nextSegments: UserMessageSegment[]) => {
      const el = editableRef.current
      if (!el) return
      const normalized = normalizeUserMessageSegments(nextSegments)
      if (!normalized.length) return
      pushUndoRef.current(true)
      appendSegmentNodes(el, normalized, handleRemoveChip)
      draftSegmentsRef.current = getComposerSegments(el)
      moveCursorToEnd(el)
      isSyncing.current = true
      onChangeRef.current(getTextFromEditable(el))
      isSyncing.current = false
      setIsEmpty(false)
    },
    getSegments: () => {
      const el = editableRef.current
      return el ? getComposerSegments(el) : normalizeUserMessageSegments(segments)
    },
    focus: () => {
      const el = editableRef.current
      if (!el) return
      el.focus()
      moveCursorToEnd(el)
    },
    addAttachment: (attachment) => {
      setAttachments(prev => [...prev, attachment])
      setIsEmpty(false)
    },
  }), [handleRemoveChip, segments])

  // Debounced search when mention query changes
  useEffect(() => {
    if (!mentionOpen) {
      // Functional updater: skip re-render when already empty
      setSearchResults(prev => prev.length === 0 ? prev : EMPTY_FILES)
      return
    }

    // Cancel any in-flight search
    searchAbort.current?.abort()

    const alreadyReferenced = new Set(
      editableRef.current ? getChipPaths(editableRef.current) : []
    )

    // Read from ref so availableFiles isn't in the deps array
    const currentFiles = availableFilesRef.current

    // For empty query, show pre-loaded files (top-level from tree)
    if (!mentionQuery) {
      const quick = currentFiles
        .filter((f) => !alreadyReferenced.has(f.path))
        .slice(0, 15)
      setSearchResults(quick)
      setSearchLoading(false)
      return
    }

    // First show instant results from already-loaded list
    const instant = currentFiles
      .filter((f) => {
        if (alreadyReferenced.has(f.path)) return false
        const q = mentionQuery.toLowerCase()
        return f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
      })
      .slice(0, 10)
    setSearchResults(instant)

    // Then do a lazy FS search if onSearchFiles is provided
    const searchFn = onSearchFilesRef.current
    if (!searchFn) {
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    const controller = new AbortController()
    searchAbort.current = controller

    const timer = setTimeout(async () => {
      try {
        const results = await searchFn(mentionQuery, 15, controller.signal)
        if (controller.signal.aborted) return
        // Merge: FS results first, deduped, excluding already-referenced
        const seen = new Set<string>()
        const merged: ReferencedFile[] = []
        for (const r of results) {
          if (alreadyReferenced.has(r.path) || seen.has(r.path)) continue
          seen.add(r.path)
          merged.push(r)
        }
        // Add any from instant that weren't in FS results
        for (const r of instant) {
          if (!seen.has(r.path)) {
            seen.add(r.path)
            merged.push(r)
          }
        }
        setSearchResults(merged.slice(0, 15))
      } catch {
        // search cancelled or error — keep instant results
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, 150) // 150ms debounce

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionOpen, mentionQuery])

  // Sync external value → contentEditable (only when value changes externally, e.g. cleared on submit)
  useEffect(() => {
    const el = editableRef.current
    if (!el || isSyncing.current) return

    const hasRenderedContent = el.childNodes.length > 0
      && (((el.textContent ?? '').length > 0) || hasChipRefs(el))

    if (hasRenderedContent && !shouldSyncComposerDraft(lastAppliedDraftSignatureRef.current, value, segments, draftSegmentsRef.current)) {
      lastAppliedDraftSignatureRef.current = getPromptDraftSignature(value, segments)
      return
    }

    isSyncing.current = true
    buildEditableContent(el, segments, value, handleRemoveChip)
    draftSegmentsRef.current = getComposerSegments(el)
    setIsEmpty(isTextEmpty(value) && !hasChipRefs(editableRef.current))
    isSyncing.current = false
    lastAppliedDraftSignatureRef.current = getPromptDraftSignature(value, segments)
  }, [value, segments, handleRemoveChip])

  // Close menu on outside click
  useEffect(() => {
    if (!mentionOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMentionOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mentionOpen])

  useEffect(() => {
    setMentionIndex(0)
  }, [mentionQuery])

  /** Insert a file chip at the current cursor position and close the menu. */
  const insertMention = useCallback((file: ReferencedFile) => {
    const el = editableRef.current
    if (!el) return
    pushUndoSnapshot(true)

    // Remove the @query text
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      // Walk backwards to find and remove the @query
      const textNode = range.startContainer
      if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
        const text = textNode.textContent
        const cursor = range.startOffset
        const atIdx = text.lastIndexOf('@', cursor - 1)
        if (atIdx >= 0) {
          textNode.textContent = text.slice(0, atIdx) + text.slice(cursor)
          // Insert chip at atIdx position
          const before = textNode.textContent.slice(0, atIdx)
          const after = textNode.textContent.slice(atIdx)
          textNode.textContent = before

          const chip = createChipNode(file, handleRemoveChip)
          const afterNode = document.createTextNode(after || ' ')

          const parent = textNode.parentNode!

          // Remove the text node if it's now empty to avoid phantom whitespace
          if (!before) {
            const ref = textNode.nextSibling
            parent.removeChild(textNode)
            if (ref) {
              parent.insertBefore(afterNode, ref)
              parent.insertBefore(chip, afterNode)
            } else {
              parent.appendChild(chip)
              parent.appendChild(afterNode)
            }
          } else if (textNode.nextSibling) {
            parent.insertBefore(afterNode, textNode.nextSibling)
            parent.insertBefore(chip, afterNode)
          } else {
            parent.appendChild(chip)
            parent.appendChild(afterNode)
          }

          // Move cursor after the space
          const newRange = document.createRange()
          newRange.setStart(afterNode, after ? 0 : 1)
          newRange.collapse(true)
          sel.removeAllRanges()
          sel.addRange(newRange)
        }
      }
    }

    setMentionOpen(false)
    setMentionQuery('')

    // Sync text value
    draftSegmentsRef.current = getComposerSegments(el)
    isSyncing.current = true
    onChange(getTextFromEditable(el))
    isSyncing.current = false
  }, [onChange, pushUndoSnapshot])

  /** Handle input events on the contentEditable — uses a native listener
   *  because React's synthetic onInput doesn't fire reliably for contentEditable. */
  useEffect(() => {
    const el = editableRef.current
    if (!el) return

    const handleNativeInput = () => {
      isSyncing.current = true
      sanitizeEditableContent(el)
      const text = getTextFromEditable(el)
      draftSegmentsRef.current = getComposerSegments(el)
      onChangeRef.current(text)
      setIsEmpty(isTextEmpty(text) && !hasChipRefs(el))
      isSyncing.current = false
      pushUndoRef.current()

      // Detect @ trigger — resolve cursor into a text node
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      let node: Node = range.startContainer
      let cursor = range.startOffset

      // If the cursor is in an element node, resolve to the nearest text node
      if (node.nodeType !== Node.TEXT_NODE) {
        const childAtCursor = node.childNodes[cursor - 1] ?? node.childNodes[cursor]
        if (childAtCursor?.nodeType === Node.TEXT_NODE) {
          node = childAtCursor
          cursor = (childAtCursor as Text).length
        } else if (cursor > 0 && node.childNodes[cursor - 1]) {
          let walk: Node | null = node.childNodes[cursor - 1]!
          while (walk && walk.nodeType !== Node.TEXT_NODE && walk.lastChild) {
            walk = walk.lastChild
          }
          if (walk?.nodeType === Node.TEXT_NODE) {
            node = walk
            cursor = (walk as Text).length
          } else {
            return
          }
        } else {
          return
        }
      }

      const textContent = node.textContent ?? ''
      const isOpen = mentionOpenRef.current

      if (isOpen) {
        const atIdx = textContent.lastIndexOf('@', cursor - 1)
        if (atIdx < 0 || cursor <= atIdx) {
          setMentionOpen(false)
          return
        }
        const query = textContent.slice(atIdx + 1, cursor)
        if (query.includes(' ') || query.includes('\n')) {
          setMentionOpen(false)
        } else {
          setMentionQuery(query)
        }
      } else {
        if (cursor > 0 && textContent[cursor - 1] === '@') {
          const charBefore = cursor > 1 ? textContent[cursor - 2] : ' '
          if (charBefore === ' ' || charBefore === '\n' || charBefore === '\u00a0' || cursor === 1) {
            if (workspaceOpenRef.current) {
              setMentionQuery('')
              setMentionOpen(true)
            }
          }
        }
      }
    }

    el.addEventListener('input', handleNativeInput)
    return () => el.removeEventListener('input', handleNativeInput)
  }, []) // stable — reads everything from refs

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Intercept undo/redo to prevent browser native undo corruption
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const stack = undoStackRef.current
        if (stack.length === 0) return
        redoStackRef.current.push([...draftSegmentsRef.current])
        const snap = stack.pop()!
        restoreSnapshot(snap)
        return
      }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        const stack = redoStackRef.current
        if (stack.length === 0) return
        undoStackRef.current.push([...draftSegmentsRef.current])
        const snap = stack.pop()!
        restoreSnapshot(snap)
        return
      }
    }

    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => Math.min(i + 1, searchResults.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (searchResults[mentionIndex]) insertMention(searchResults[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionOpen(false)
        return
      }
    }
    if (e.key === 'Backspace') {
      const el = editableRef.current
      if (!el) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      if (!range.collapsed) return

      const { startContainer, startOffset } = range

      // Case 1: cursor is at the root, or at the start of a direct child after a chip
      if (startContainer === el || startContainer.parentNode === el) {
        const childIndex = startContainer === el ? startOffset : Array.from(el.childNodes).indexOf(startContainer as ChildNode)
        const shouldRemove = shouldRemovePreviousChipOnBackspace({
          startContainerIsRoot: startContainer === el,
          startContainerIsText: startContainer.nodeType === Node.TEXT_NODE,
          startOffset,
          childIndex,
        })
        if (shouldRemove) {
          const prev = el.childNodes[childIndex - 1]
          if (prev instanceof HTMLElement && prev.hasAttribute('data-chip-ref')) {
            e.preventDefault()
            const nextSibling = prev.nextSibling
            prev.remove()
            restoreCaretAfterChipRemovalStable(el, nextSibling, childIndex)
            draftSegmentsRef.current = getComposerSegments(el)
            isSyncing.current = true
            onChangeRef.current(getTextFromEditable(el))
            isSyncing.current = false
            setIsEmpty(isTextEmpty(getTextFromEditable(el)) && !hasChipRefs(el))
            return
          }
        }
      }

      // Case 2: cursor is at offset 0 of a text node — check if previous sibling is a chip
      if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
        const prev = startContainer.previousSibling
        if (prev instanceof HTMLElement && prev.hasAttribute('data-chip-ref')) {
          e.preventDefault()
          const nextSibling = prev.nextSibling
          prev.remove()
          restoreCaretAfterChipRemovalStable(el, nextSibling, Array.from(el.childNodes).indexOf(startContainer as ChildNode) + 1)
          draftSegmentsRef.current = getComposerSegments(el)
          isSyncing.current = true
          onChangeRef.current(getTextFromEditable(el))
          isSyncing.current = false
          setIsEmpty(isTextEmpty(getTextFromEditable(el)) && !hasChipRefs(el))
          return
        }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const el = editableRef.current
      const text = el ? getTextFromEditable(el).trim() : value.trim()
      const chips = el ? getChipFiles(el) : []
      const nextSegments = el ? getComposerSegments(el) : normalizeUserMessageSegments(segments)
      const hasStructuredRefs = nextSegments.some((segment) => segment.type !== 'text' && segment.type !== 'image')
      if (!(text || chips.length > 0 || hasStructuredRefs || attachments.length > 0)) return
      if (isLoading && onQueue) {
        onQueue(chips, attachments, nextSegments)
        setAttachments([])
        resetComposer()
        return
      }
      if (!isLoading) {
        onSubmit(chips, attachments, nextSegments)
        setAttachments([])
        resetComposer()
      }
    }
  }, [mentionOpen, searchResults, mentionIndex, insertMention, value, isLoading, onQueue, onSubmit, attachments, segments, resetComposer, restoreSnapshot])

  const readFileAsAttachment = useCallback((file: File): Promise<ChatAttachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1] ?? ''
        const isImage = file.type.startsWith('image/')
        resolve({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: base64,
          preview: isImage ? result : undefined,
        })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  const addFilesAsAttachments = useCallback(async (files: FileList | File[]) => {
    const results = await Promise.all(Array.from(files).map(readFileAsAttachment))
    setAttachments((prev) => {
      const names = new Set(prev.map((a) => a.name))
      return [...prev, ...results.filter((r) => !names.has(r.name))]
    })
    setIsEmpty(false)
  }, [readFileAsAttachment])

  const removeAttachment = useCallback((name: string) => {
    setAttachments((prev) => {
      const next = prev.filter((a) => a.name !== name)
      const el = editableRef.current
      if (next.length === 0 && el && isTextEmpty(getTextFromEditable(el)) && !hasChipRefs(el)) {
        setIsEmpty(true)
      }
      return next
    })
  }, [])

  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    const el = editableRef.current
    if (!el) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return

    // Build segments from the selected content
    const range = sel.getRangeAt(0)
    const fragment = range.cloneContents()
    const tempDiv = document.createElement('div')
    tempDiv.appendChild(fragment)

    // Serialize selected content: chips become @path, text stays as text
    const segments: UserMessageSegment[] = []
    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        if (text) segments.push({ type: 'text', text })
        return
      }
      if (!(node instanceof HTMLElement)) return
      if (node.hasAttribute('data-chip-ref')) {
        const segmentType = node.getAttribute('data-segment-type')
        if (segmentType === 'workspace') {
          const path = node.getAttribute('data-workspace-path')!
          segments.push({ type: 'workspace', path, name: node.getAttribute('data-chip-name') || path.split('/').pop() || path })
          return
        }
        if (segmentType === 'terminal') {
          const terminalId = node.getAttribute('data-terminal-id')!
          const workspaceRoot = node.getAttribute('data-workspace-root')
          segments.push({
            type: 'terminal',
            terminalId,
            name: node.getAttribute('data-chip-name') || terminalId,
            ...(workspaceRoot ? { workspaceRoot } : {}),
            ...readChipLineRange(node),
            ...(node.getAttribute('data-selected-text') ? { selectedText: node.getAttribute('data-selected-text')! } : {}),
          })
          return
        }
        const path = node.getAttribute('data-file-path')!
        const kind = node.getAttribute('data-kind')
        segments.push({
          type: 'file',
          path,
          name: node.getAttribute('data-chip-name') || path.split(/[\\/]/).pop() || path,
          ...(kind === 'file' || kind === 'dir' ? { kind } : {}),
          ...readChipLineRange(node),
        })
        return
      }
      if (node.tagName === 'BR') {
        segments.push({ type: 'text', text: '\n' })
        return
      }
      for (const child of node.childNodes) visit(child)
    }
    for (const child of tempDiv.childNodes) visit(child)

    if (segments.some(s => s.type === 'file' || s.type === 'workspace' || s.type === 'terminal')) {
      e.preventDefault()
      e.clipboardData.setData('text/plain', serializeUserMessageSegmentsToMarkdown(segments))
      const structured = serializeUserMessageSegmentsForClipboard(segments)
      if (structured) e.clipboardData.setData(JAIT_REF_MIME, structured)
    }
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const el = editableRef.current
    const items = e.clipboardData.items
    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i]?.type.startsWith('image/')) {
        const file = items[i]?.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      void addFilesAsAttachments(imageFiles)
      return
    }
    if (!el) return
    const structured = parseUserMessageClipboardPayload(e.clipboardData.getData(JAIT_REF_MIME))
    const markdownSegments = structured.length > 0 ? structured : parseUserMessageMarkdown(e.clipboardData.getData('text/plain'))
    if (markdownSegments.length > 0) {
      e.preventDefault()
      insertSegmentsAtCursor(el, markdownSegments, handleRemoveChip)
      draftSegmentsRef.current = getComposerSegments(el)
      isSyncing.current = true
      onChange(getTextFromEditable(el))
      isSyncing.current = false
      setIsEmpty(isTextEmpty(getTextFromEditable(el)) && !hasChipRefs(el))
      return
    }
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }, [addFilesAsAttachments, handleRemoveChip, onChange])

  // Drag-and-drop handlers
  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (dragCounter.current === 1) setDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setDragging(false)

    const el = editableRef.current
    if (!el) return

    const appendChip = (ref: PromptChipReference) => {
      if (el.querySelector(`[data-chip-ref="${CSS.escape(getChipRefKey(ref))}"]`)) return false
      const segment: UserMessageSegment = 'type' in ref
        ? ref
        : { type: 'file', path: ref.path, name: ref.name, ...(ref.kind ? { kind: ref.kind } : {}) }
      appendSegmentNodes(el, [segment], handleRemoveChip)
      draftSegmentsRef.current = getComposerSegments(el)
      moveCursorToEnd(el)
      isSyncing.current = true
      onChange(getTextFromEditable(el))
      isSyncing.current = false
      setIsEmpty(false)
      return true
    }

    // Handle workspace tree file/folder drop
    const jaitFile = e.dataTransfer.getData('text/jait-file')
    if (jaitFile) {
      try {
        const file = JSON.parse(jaitFile) as ReferencedFile
        appendChip(file)
      } catch { /* invalid JSON */ }
      return
    }

    const jaitWorkspace = e.dataTransfer.getData(JAIT_WORKSPACE_REF_MIME)
    if (jaitWorkspace) {
      try {
        const workspace = JSON.parse(jaitWorkspace) as UserWorkspaceReference
        appendChip({ type: 'workspace', ...workspace })
      } catch { /* invalid JSON */ }
      return
    }

    const jaitTerminal = e.dataTransfer.getData(JAIT_TERMINAL_REF_MIME)
    if (jaitTerminal) {
      try {
        const terminal = JSON.parse(jaitTerminal) as UserTerminalReference
        appendChip({ type: 'terminal', ...terminal })
      } catch { /* invalid JSON */ }
      return
    }

    // Handle native file/folder drops (e.g. from OS file explorer)
    // In Electron 32+, File.path is no longer available with contextIsolation.
    // Use webUtils.getPathForFile() exposed via preload instead.
    const getPath = window.jaitDesktop?.getPathForFile
    if (e.dataTransfer.files?.length && getPath) {
      const nativeFiles = Array.from(e.dataTransfer.files)
      const items = e.dataTransfer.items
      let added = false
      cleanEmptyNodes(el)
      for (let i = 0; i < nativeFiles.length; i++) {
        const f = nativeFiles[i]
        if (!f) continue
        const filePath = getPath(f)
        if (!filePath) continue
        const name = filePath.split(/[\\/]/).pop() ?? filePath
        const entry = items?.[i]?.webkitGetAsEntry?.()
        const kind: 'file' | 'dir' = entry?.isDirectory ? 'dir' : (f.type === '' && f.size === 0) ? 'dir' : 'file'
        added = appendChip({ path: filePath, name, kind }) || added
      }
      if (added) {
        pushUndoRef.current(true)
      }
    } else if (e.dataTransfer.files?.length) {
      // Web browser: read files as binary attachments
      void addFilesAsAttachments(e.dataTransfer.files)
    }
  }, [onChange, handleRemoveChip, addFilesAsAttachments])

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative z-10 flex flex-col rounded-2xl border bg-background dark:bg-card focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20',
        dragging && 'ring-2 ring-primary/30 border-primary/40',
        className,
      )}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((att) => (
            <div key={att.name} className="group relative flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2 py-1.5 text-xs">
              {att.preview ? (
                <img src={att.preview} alt={att.name} className="h-8 w-8 rounded object-cover" />
              ) : (
                <FileIcon filename={att.name} className="h-4 w-4 shrink-0" />
              )}
              <span className="max-w-[120px] truncate">{att.name}</span>
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={() => removeAttachment(att.name)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.txt,.md,.ts,.tsx,.js,.jsx,.py,.json,.yaml,.yml,.toml,.css,.html,.xml,.csv,.log,.sh,.bat,.rs,.go,.java,.c,.cpp,.h,.hpp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            void addFilesAsAttachments(e.target.files)
            e.target.value = ''
          }
        }}
      />
      {/* Editable area with inline file chips */}
      <div className="relative px-3 pt-3 pb-1.5">
        {isEmpty && (
          <div className="absolute top-5 left-5 pointer-events-none text-muted-foreground text-base leading-relaxed select-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editableRef}
          contentEditable={!composerDisabled}
          role="textbox"
          aria-multiline
          suppressContentEditableWarning
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCopy={handleCopy}
          onDrop={(e) => { e.preventDefault() }}
          onDragStart={(e) => { e.preventDefault() }}
          onBeforeInput={(e) => {
            const inputType = (e.nativeEvent as InputEvent).inputType
            if (inputType === 'insertFromDrop' || inputType === 'insertHTML') e.preventDefault()
          }}
          className={cn(
            'min-h-[40px] max-h-[200px] overflow-y-auto text-base leading-relaxed outline-none py-2 px-2 text-foreground',
            'whitespace-pre-wrap break-words',
            composerDisabled && 'cursor-not-allowed opacity-50',
          )}
          style={{ wordBreak: 'break-word' }}
        />
      </div>

      {/* @ mention popup */}
      {mentionOpen && (searchResults.length > 0 || searchLoading) && (
        <div
          ref={menuRef}
          className="absolute left-3 bottom-full mb-1 w-72 max-h-52 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg z-50"
        >
          {searchResults.map((file, i) => (
            <button
              key={file.path}
              type="button"
              className={cn(
                'flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors',
                i === mentionIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                insertMention(file)
              }}
              onMouseEnter={() => setMentionIndex(i)}
            >
              {file.kind === 'dir'
                ? <FolderIcon name={file.name} className="h-3.5 w-3.5 shrink-0" />
                : <FileIcon filename={file.name} className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{file.path}</span>
            </button>
          ))}
          {searchLoading && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Searching...
            </div>
          )}
          {!searchLoading && searchResults.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-1.5">No matching files or folders</div>
          )}
        </div>
      )}

      <div className="flex min-w-0 items-center gap-2 px-3 pb-2.5 pt-0.5">
        {hasFooterControls && (
          <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
            <div className="flex min-w-max items-center gap-1 pr-1">
              {footerLeadingContent}
              {shouldShowSendTargetSelector && (
                <SendTargetSelector
                  target={sendTarget!}
                  onChange={onSendTargetChange!}
                  disabled={selectorsDisabled}
                  compact={compactFooterControls}
                />
              )}
              {showResponseStyleSelector && (
                <StyleSelector
                  value={responseStyle!}
                  onChange={onResponseStyleChange!}
                  disabled={selectorsDisabled}
                  compact={compactFooterControls}
                />
              )}
              {showProviderModelSelector && (
                <ProviderModelSelector
                  provider={provider!}
                  model={cliModel ?? null}
                  onProviderChange={onProviderChange!}
                  onModelChange={onCliModelChange!}
                  disabled={selectorsDisabled}
                  compact={compactFooterControls}
                  repoRuntime={repoRuntime}
                  onMoveToGateway={onMoveToGateway}
                  sessionInfo={sessionInfo}
                  workspaceNodeId={workspaceNodeId}
                />
              )}
              {showProviderRuntimeSelector && (
                <ProviderRuntimeSelector
                  provider={provider!}
                  value={providerRuntimeMode!}
                  onChange={onProviderRuntimeModeChange!}
                  disabled={selectorsDisabled}
                  compact={compactFooterControls}
                />
              )}
              {showModeSelector && (
                <ModeSelector mode={mode!} onChange={onModeChange!} disabled={selectorsDisabled} compact={compactFooterControls} />
              )}
            </div>
          </div>
        )}
        <div className={cn('flex shrink-0 items-center gap-1.5', hasFooterControls ? 'pl-1' : 'ml-auto')}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 rounded-lg"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          {onVoiceInput && !voiceRecording && !voiceTranscribing && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 rounded-lg"
              onClick={onVoiceInput}
              title="Voice input"
            >
              <Mic className="h-4 w-4" />
            </Button>
          )}
          {voiceRecording && onVoiceStop && (
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground/80">
                <span className="h-2 w-2 rounded-full bg-foreground/70 animate-pulse" />
                {!isMobile && 'Listening...'}
              </span>
              <VoiceLevelMeter levels={voiceLevels} compact={isMobile} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn('h-7 shrink-0 rounded-lg text-xs', isMobile ? 'px-2' : 'px-2.5')}
                onClick={onVoiceStop}
              >
                <MicOff className={cn('h-3.5 w-3.5', !isMobile && 'mr-1')} />
                {!isMobile && 'Done'}
              </Button>
            </div>
          )}
          {voiceTranscribing && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Transcribing...
            </div>
          )}
          {footerTrailingContent}
          {isLoading && sendTarget !== 'thread' && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 shrink-0 rounded-lg"
              onClick={onStop}
              title="Stop generating"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          )}
          {isLoading && sendTarget !== 'thread' && onQueue ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-8 w-8 shrink-0 rounded-lg"
              disabled={(isEmpty && attachments.length === 0) || composerDisabled}
              title="Add to queue"
              onClick={() => {
                const el = editableRef.current
                const chips = el ? getChipFiles(el) : []
                const nextSegments = el ? getComposerSegments(el) : normalizeUserMessageSegments(segments)
                onQueue(chips, attachments, nextSegments)
                setAttachments([])
                resetComposer()
              }}
            >
              <ListPlus className="h-4 w-4" />
            </Button>
          ) : !isLoading || sendTarget === 'thread' ? (
            <Button
              type="button"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-lg"
              disabled={(isEmpty && attachments.length === 0) || composerDisabled}
              onClick={() => {
                const el = editableRef.current
                const chips = el ? getChipFiles(el) : []
                const nextSegments = el ? getComposerSegments(el) : normalizeUserMessageSegments(segments)
                onSubmit(chips, attachments, nextSegments)
                setAttachments([])
                resetComposer()
              }}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
})
