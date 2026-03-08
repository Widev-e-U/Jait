import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { ArrowUp, ChevronDown, ListPlus, Mic, Square } from 'lucide-react'
import { getIconForFile, DEFAULT_FILE } from 'vscode-icons-js'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ModeSelector } from '@/components/chat/mode-selector'
import type { ChatMode } from '@/components/chat/mode-selector'
import { ViewModeSelector } from '@/components/chat/view-mode-selector'
import type { ViewMode } from '@/components/chat/view-mode-selector'
import { ProviderSelector } from '@/components/chat/provider-selector'
import { CliModelSelector } from '@/components/chat/cli-model-selector'
import type { ProviderId } from '@/lib/agents-api'
import { FileIcon } from '@/components/icons/file-icons'
import { cn } from '@/lib/utils'

const ICON_CDN = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@12.9.0/icons/'

/** Stable empty array so the default prop doesn't create a new reference each render. */
const EMPTY_FILES: ReferencedFile[] = []

export interface ReferencedFile {
  path: string
  name: string
}

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (chipFiles?: ReferencedFile[]) => void
  onStop?: () => void
  /** Queue a message while the agent is busy (shown as dropdown option). */
  onQueue?: (chipFiles?: ReferencedFile[]) => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
  onVoiceInput?: () => void
  viewMode?: ViewMode
  onViewModeChange?: (viewMode: ViewMode) => void
  mode?: ChatMode
  onModeChange?: (mode: ChatMode) => void
  provider?: ProviderId
  onProviderChange?: (provider: ProviderId) => void
  /** Model override for CLI providers (codex / claude-code). */
  cliModel?: string | null
  onCliModelChange?: (model: string | null) => void
  /** All files available for @ mention (pre-loaded from visible tree) */
  availableFiles?: ReferencedFile[]
  /** Lazy search across the entire workspace directory */
  onSearchFiles?: (query: string, limit: number, signal?: AbortSignal) => Promise<ReferencedFile[]>
  /** Whether a workspace directory is currently open — @ mentions only work when true */
  workspaceOpen?: boolean
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Build a non-editable inline chip DOM node for a file reference. */
function createChipNode(file: ReferencedFile, onRemove?: (path: string) => void): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.setAttribute('data-file-path', file.path)
  chip.setAttribute('data-file-name', file.name)
  chip.className =
    'inline-flex items-center gap-0.5 align-baseline text-[12px] leading-tight pl-0.5 pr-0 py-[1px] mx-[2px] rounded bg-muted text-foreground select-none cursor-default whitespace-nowrap'

  // File icon (tiny img)
  const icon = document.createElement('span')
  icon.className = 'inline-flex items-center shrink-0'
  icon.innerHTML = `<img src="${ICON_CDN}${getVsIconName(file.name)}" alt="" class="h-3.5 w-3.5" draggable="false" />`
  chip.appendChild(icon)

  // Name label
  const label = document.createElement('span')
  label.className = 'truncate max-w-[140px]'
  label.textContent = file.name
  chip.appendChild(label)

  // Remove button
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'inline-flex items-center p-0.5 rounded hover:bg-foreground/10 transition-colors'
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    chip.remove()
    onRemove?.(file.path)
  })
  chip.appendChild(btn)

  return chip
}

/** Simple extension→icon filename (reuses the CDN approach from file-icons.tsx). */
function getVsIconName(filename: string): string {
  return getIconForFile(filename) ?? DEFAULT_FILE
}

/** Extract plain text from the editable div, ignoring chip nodes. */
function getTextFromEditable(el: HTMLElement): string {
  let text = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
    } else if (node instanceof HTMLElement) {
      if (node.hasAttribute('data-file-path')) {
        // Skip chips — they're represented separately
        continue
      } else if (node.tagName === 'BR') {
        text += '\n'
      } else {
        text += getTextFromEditable(node)
      }
    }
  }
  return text
}

/** Get file paths from all chip nodes in the editable div. */
function getChipPaths(el: HTMLElement): string[] {
  const paths: string[] = []
  el.querySelectorAll('[data-file-path]').forEach((chip) => {
    paths.push(chip.getAttribute('data-file-path')!)
  })
  return paths
}

/** Get all chip file references from the editable div. */
function getChipFiles(el: HTMLElement): ReferencedFile[] {
  const files: ReferencedFile[] = []
  el.querySelectorAll('[data-file-path]').forEach((chip) => {
    files.push({
      path: chip.getAttribute('data-file-path')!,
      name: chip.getAttribute('data-file-name') || chip.getAttribute('data-file-path')!.split('/').pop()!,
    })
  })
  return files
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

export interface PromptInputHandle {
  /** Insert a file chip into the input (used by workspace Send button). */
  insertChip: (file: ReferencedFile) => void
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
  placeholder = 'Ask anything...',
  className,
  onVoiceInput,
  viewMode,
  onViewModeChange,
  mode,
  onModeChange,
  provider,
  onProviderChange,
  cliModel,
  onCliModelChange,
  availableFiles = EMPTY_FILES,
  onSearchFiles,
  workspaceOpen = false,
}: PromptInputProps, ref) {
  const editableRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [dragging, setDragging] = useState(false)
  const dragCounter = useRef(0)
  const [isEmpty, setIsEmpty] = useState(!value)

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

  // Async search results for @ mention
  const [searchResults, setSearchResults] = useState<ReferencedFile[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchAbort = useRef<AbortController | null>(null)

  // Track whether we're doing a controlled sync to avoid loops
  const isSyncing = useRef(false)

  /** Remove a chip from the editable DOM and update isEmpty. */
  const handleRemoveChip = useCallback((path: string) => {
    const el = editableRef.current
    if (!el) return
    el.querySelector(`[data-file-path="${CSS.escape(path)}"]`)?.remove()
    isSyncing.current = true
    onChangeRef.current(getTextFromEditable(el))
    isSyncing.current = false
    setIsEmpty(!getTextFromEditable(el).trim() && !el.querySelector('[data-file-path]'))
  }, [])

  /** Expose imperative methods for parent components. */
  useImperativeHandle(ref, () => ({
    insertChip: (file: ReferencedFile) => {
      const el = editableRef.current
      if (!el) return
      // Don't add duplicate
      if (el.querySelector(`[data-file-path="${CSS.escape(file.path)}"]`)) return
      const chip = createChipNode(file, handleRemoveChip)
      el.appendChild(chip)
      el.appendChild(document.createTextNode(' '))
      moveCursorToEnd(el)
      isSyncing.current = true
      onChangeRef.current(getTextFromEditable(el))
      isSyncing.current = false
      setIsEmpty(false)
    },
  }), [handleRemoveChip])

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

    const currentText = getTextFromEditable(el)
    if (currentText !== value) {
      // Value was changed externally (cleared on submit, suggestion, etc.)
      // Re-render: put text nodes + chip nodes
      isSyncing.current = true
      el.innerHTML = ''
      if (value) {
        el.appendChild(document.createTextNode(value))
      }
      setIsEmpty(!value && !editableRef.current?.querySelector('[data-file-path]'))
      isSyncing.current = false
    }
  }, [value])

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
          if (textNode.nextSibling) {
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
    isSyncing.current = true
    onChange(getTextFromEditable(el))
    isSyncing.current = false
  }, [onChange])

  /** Handle input events on the contentEditable — uses a native listener
   *  because React's synthetic onInput doesn't fire reliably for contentEditable. */
  useEffect(() => {
    const el = editableRef.current
    if (!el) return

    const handleNativeInput = () => {
      isSyncing.current = true
      const text = getTextFromEditable(el)
      onChangeRef.current(text)
      setIsEmpty(!text.trim() && !el.querySelector('[data-file-path]'))
      isSyncing.current = false

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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const el = editableRef.current
      const text = el ? getTextFromEditable(el).trim() : value.trim()
      const chips = el ? getChipFiles(el) : []
      if ((text || chips.length > 0) && !isLoading) onSubmit(chips)
    }
  }, [mentionOpen, searchResults, mentionIndex, insertMention, value, isLoading, onSubmit])

  // Prevent pasting HTML — paste as plain text only
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }, [])

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

    // Handle workspace tree file drop
    const jaitFile = e.dataTransfer.getData('text/jait-file')
    if (jaitFile) {
      try {
        const file = JSON.parse(jaitFile) as ReferencedFile
        // Don't add if already present
        if (!el.querySelector(`[data-file-path="${CSS.escape(file.path)}"]`)) {
          const chip = createChipNode(file, handleRemoveChip)
          el.appendChild(chip)
          el.appendChild(document.createTextNode(' '))
          moveCursorToEnd(el)
          // Sync text
          isSyncing.current = true
          onChange(getTextFromEditable(el))
          isSyncing.current = false
          setIsEmpty(false)
        }
      } catch { /* invalid JSON */ }
      return
    }

    // Handle external OS file drop — create chips (content lazy-loaded at submit)
    if (e.dataTransfer.files?.length) {
      for (const file of Array.from(e.dataTransfer.files)) {
        const name = file.name
        const path = file.webkitRelativePath || file.name
        if (!el.querySelector(`[data-file-path="${CSS.escape(path)}"]`)) {
          const chip = createChipNode({ path, name }, handleRemoveChip)
          chip.setAttribute('data-external', 'true')
          el.appendChild(chip)
          el.appendChild(document.createTextNode(' '))
        }
      }
      moveCursorToEnd(el)
      isSyncing.current = true
      onChange(getTextFromEditable(el))
      isSyncing.current = false
      setIsEmpty(false)
    }
  }, [onChange])

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border bg-background shadow-sm transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20',
        dragging && 'ring-2 ring-primary/30 border-primary/40',
        className,
      )}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Editable area with inline file chips */}
      <div className="relative px-3 pt-3 pb-1.5">
        {isEmpty && (
          <div className="absolute top-5 left-5 pointer-events-none text-muted-foreground text-base leading-relaxed select-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editableRef}
          contentEditable={!disabled}
          role="textbox"
          aria-multiline
          suppressContentEditableWarning
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={cn(
            'min-h-[40px] max-h-[200px] overflow-y-auto text-base leading-relaxed outline-none py-2 px-2',
            'whitespace-pre-wrap break-words',
            disabled && 'cursor-not-allowed opacity-50',
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
              <FileIcon filename={file.name} className="h-3.5 w-3.5 shrink-0" />
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
            <div className="text-xs text-muted-foreground px-2 py-1.5">No matching files</div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-3 pb-2.5 pt-0.5">
        <div className="flex items-center gap-1">
          {viewMode && onViewModeChange && (
            <ViewModeSelector mode={viewMode} onChange={onViewModeChange} disabled={disabled || isLoading} />
          )}
          {provider && onProviderChange && (
            <ProviderSelector provider={provider} onChange={onProviderChange} disabled={disabled || isLoading} />
          )}
          {provider && provider !== 'jait' && onCliModelChange && (
            <CliModelSelector provider={provider} model={cliModel ?? null} onChange={onCliModelChange} disabled={disabled || isLoading} />
          )}
          {mode && onModeChange && (!provider || provider === 'jait') && viewMode !== 'manager' && (
            <ModeSelector mode={mode} onChange={onModeChange} disabled={disabled || isLoading} />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onVoiceInput && !isLoading && (
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
          {isLoading && (
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
          {/* Split send button: primary action + dropdown with Send / Queue */}
          {isLoading && onQueue ? (
            <div className="flex items-center">
              <Button
                type="button"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg rounded-r-none border-r-0"
                disabled={isEmpty || disabled}
                title="Queue message"
                onClick={() => {
                  const el = editableRef.current
                  const chips = el ? getChipFiles(el) : []
                  onQueue(chips)
                }}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    className="h-8 w-5 shrink-0 rounded-lg rounded-l-none px-0"
                    disabled={isEmpty || disabled}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="min-w-[160px]">
                  <DropdownMenuItem
                    disabled={isEmpty || disabled}
                    onSelect={() => {
                      const el = editableRef.current
                      const chips = el ? getChipFiles(el) : []
                      onSubmit(chips)
                    }}
                  >
                    <ArrowUp className="h-3.5 w-3.5 mr-2" />
                    Send now
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isEmpty || disabled}
                    onSelect={() => {
                      const el = editableRef.current
                      const chips = el ? getChipFiles(el) : []
                      onQueue(chips)
                    }}
                  >
                    <ListPlus className="h-3.5 w-3.5 mr-2" />
                    Add to queue
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : !isLoading ? (
            <Button
              type="button"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-lg"
              disabled={isEmpty || disabled}
              onClick={() => {
                const el = editableRef.current
                const chips = el ? getChipFiles(el) : []
                onSubmit(chips)
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
