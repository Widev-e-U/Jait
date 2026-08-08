import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog'
import {
  DEFAULT_HOTKEY_BINDINGS,
  buildHotkeyIndex,
  clearHotkeyOverride,
  findHotkeyConflicts,
  formatChordParts,
  isEditableTarget,
  isMacPlatform,
  readHotkeyOverrides,
  resolveHotkeyBindings,
  resolveHotkeyCommands,
  setHotkeyOverride,
  writeHotkeyOverrides,
  type HotkeyBindings,
  type HotkeyCommandId,
  type HotkeyOverrides,
} from '@/lib/hotkeys'

interface HotkeysContextValue {
  /** Effective chord per command (defaults merged with user overrides). */
  bindings: HotkeyBindings
  /** Only the user's deviations from the defaults. */
  overrides: HotkeyOverrides
  /** Chords claimed by more than one command. */
  conflicts: Map<string, HotkeyCommandId[]>
  isMac: boolean
  setBinding: (id: HotkeyCommandId, chord: string | null) => void
  resetBinding: (id: HotkeyCommandId) => void
  resetAllBindings: () => void
  /** Register a handler; the most recently registered one wins. */
  registerAction: (id: HotkeyCommandId, handler: () => void) => () => void
  /** Invoke a command programmatically. Returns false when nothing handles it. */
  runCommand: (id: HotkeyCommandId) => boolean
  /** True when some mounted component currently handles the command. */
  isCommandAvailable: (id: HotkeyCommandId) => boolean
  shortcutsDialogOpen: boolean
  setShortcutsDialogOpen: (open: boolean) => void
  /** Pause global dispatch (while recording a new binding). Call the result to resume. */
  suspendDispatch: () => () => void
}

const HotkeysContext = createContext<HotkeysContextValue | null>(null)

interface HotkeysProviderProps {
  children: ReactNode
  /** Test seam: skip reading/writing `localStorage`. */
  persist?: boolean
}

/**
 * Owns every keyboard shortcut in the web UI: the effective bindings, the
 * single global `keydown` listener, and the handler registry components attach
 * to with {@link useHotkeyAction}.
 *
 * The listener runs in the capture phase so shortcuts still work inside rich
 * editors that stop propagation, and skips commands not marked `allowInInput`
 * whenever focus sits in a text surface.
 */
export function HotkeysProvider({ children, persist = true }: HotkeysProviderProps) {
  const [isMac] = useState(() => isMacPlatform())
  const [overrides, setOverrides] = useState<HotkeyOverrides>(() => (persist ? readHotkeyOverrides() : {}))
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)

  const bindings = useMemo(() => resolveHotkeyBindings(overrides), [overrides])
  const index = useMemo(() => buildHotkeyIndex(bindings), [bindings])
  const conflicts = useMemo(() => findHotkeyConflicts(bindings), [bindings])

  const indexRef = useRef(index)
  indexRef.current = index

  const handlersRef = useRef(new Map<HotkeyCommandId, Array<() => void>>())
  const suspendCountRef = useRef(0)
  // Bumped whenever handlers change so consumers re-read availability.
  const [handlerVersion, setHandlerVersion] = useState(0)

  const registerAction = useCallback((id: HotkeyCommandId, handler: () => void) => {
    const stack = handlersRef.current.get(id) ?? []
    stack.push(handler)
    handlersRef.current.set(id, stack)
    setHandlerVersion((version) => version + 1)
    return () => {
      const current = handlersRef.current.get(id)
      if (!current) return
      const at = current.lastIndexOf(handler)
      if (at >= 0) current.splice(at, 1)
      if (current.length === 0) handlersRef.current.delete(id)
      setHandlerVersion((version) => version + 1)
    }
  }, [])

  const runCommand = useCallback((id: HotkeyCommandId) => {
    const stack = handlersRef.current.get(id)
    const handler = stack?.[stack.length - 1]
    if (!handler) return false
    handler()
    return true
  }, [])

  const isCommandAvailable = useCallback(
    (id: HotkeyCommandId) => (handlersRef.current.get(id)?.length ?? 0) > 0,
    // handlerVersion is the invalidation signal — the lookup itself reads a ref.
    [handlerVersion],
  )

  const suspendDispatch = useCallback(() => {
    suspendCountRef.current += 1
    let released = false
    return () => {
      if (released) return
      released = true
      suspendCountRef.current = Math.max(0, suspendCountRef.current - 1)
    }
  }, [])

  const setBinding = useCallback((id: HotkeyCommandId, chord: string | null) => {
    setOverrides((current) => {
      const next = setHotkeyOverride(current, id, chord)
      if (next !== current && persist) writeHotkeyOverrides(next)
      return next
    })
  }, [persist])

  const resetBinding = useCallback((id: HotkeyCommandId) => {
    setOverrides((current) => {
      const next = clearHotkeyOverride(current, id)
      if (next !== current && persist) writeHotkeyOverrides(next)
      return next
    })
  }, [persist])

  const resetAllBindings = useCallback(() => {
    setOverrides({})
    if (persist) writeHotkeyOverrides({})
  }, [persist])

  // Keep bindings in sync when another tab customises them.
  useEffect(() => {
    if (!persist || typeof window === 'undefined') return
    const onStorage = () => setOverrides(readHotkeyOverrides())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [persist])

  // The single global dispatcher.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (suspendCountRef.current > 0) return
      if (event.defaultPrevented || event.repeat || event.isComposing) return

      const target = event.composedPath?.()[0] ?? event.target
      const editableTarget = isEditableTarget(target)
      const matches = resolveHotkeyCommands(indexRef.current, event, { editableTarget, mac: isMac })
      if (matches.length === 0) return

      for (const id of matches) {
        const stack = handlersRef.current.get(id)
        const handler = stack?.[stack.length - 1]
        if (!handler) continue
        event.preventDefault()
        event.stopPropagation()
        handler()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isMac])

  // Built-in fallback for the cheat sheet; registered first so an app-level
  // handler for the same command would take precedence.
  useEffect(
    () => registerAction('app.shortcuts', () => setShortcutsDialogOpen((open) => !open)),
    [registerAction],
  )

  const value = useMemo<HotkeysContextValue>(() => ({
    bindings,
    overrides,
    conflicts,
    isMac,
    setBinding,
    resetBinding,
    resetAllBindings,
    registerAction,
    runCommand,
    isCommandAvailable,
    shortcutsDialogOpen,
    setShortcutsDialogOpen,
    suspendDispatch,
  }), [
    bindings, overrides, conflicts, isMac, setBinding, resetBinding, resetAllBindings,
    registerAction, runCommand, isCommandAvailable, shortcutsDialogOpen, suspendDispatch,
  ])

  return (
    <HotkeysContext.Provider value={value}>
      {children}
      <KeyboardShortcutsDialog
        open={shortcutsDialogOpen}
        bindings={bindings}
        isMac={isMac}
        onOpenChange={setShortcutsDialogOpen}
        onCustomize={isCommandAvailable('app.settings')
          ? () => { setShortcutsDialogOpen(false); runCommand('app.settings') }
          : undefined}
      />
    </HotkeysContext.Provider>
  )
}

const noop = () => {}

/** Inert stand-in so components render fine outside the provider (e.g. in tests). */
const FALLBACK_CONTEXT: HotkeysContextValue = {
  bindings: DEFAULT_HOTKEY_BINDINGS,
  overrides: {},
  conflicts: new Map(),
  isMac: false,
  setBinding: noop,
  resetBinding: noop,
  resetAllBindings: noop,
  registerAction: () => noop,
  runCommand: () => false,
  isCommandAvailable: () => false,
  shortcutsDialogOpen: false,
  setShortcutsDialogOpen: noop,
  suspendDispatch: () => noop,
}

/** Access the hotkey registry. */
export function useHotkeys(): HotkeysContextValue {
  return useContext(HotkeysContext) ?? FALLBACK_CONTEXT
}

/**
 * Bind one command to a handler for as long as the component is mounted.
 * Nested registrations win, so a focused panel can shadow an app-level default.
 */
export function useHotkeyAction(
  id: HotkeyCommandId,
  handler: (() => void) | null | undefined,
  options: { enabled?: boolean } = {},
): void {
  const { registerAction } = useHotkeys()
  const enabled = options.enabled !== false && Boolean(handler)
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return
    return registerAction(id, () => handlerRef.current?.())
  }, [enabled, id, registerAction])
}

/** Bind many commands at once — the usual way `App` wires its shortcuts. */
export function useHotkeyActions(
  handlers: Partial<Record<HotkeyCommandId, (() => void) | null | undefined>>,
): void {
  const { registerAction } = useHotkeys()
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const activeIds = Object.keys(handlers)
    .filter((id) => Boolean(handlers[id as HotkeyCommandId]))
    .sort()
    .join('|')

  useEffect(() => {
    const cleanups = activeIds
      .split('|')
      .filter(Boolean)
      .map((id) => registerAction(id as HotkeyCommandId, () => {
        handlersRef.current[id as HotkeyCommandId]?.()
      }))
    return () => { for (const cleanup of cleanups) cleanup() }
  }, [activeIds, registerAction])
}

/** The current chord for a command, ready to render in a tooltip or menu. */
export function useHotkeyBinding(id: HotkeyCommandId): { chord: string | null; parts: string[] } {
  const { bindings, isMac } = useHotkeys()
  const chord = bindings[id] ?? null
  return useMemo(() => ({ chord, parts: formatChordParts(chord, isMac) }), [chord, isMac])
}
