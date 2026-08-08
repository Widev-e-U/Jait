/**
 * Persistence and resolution of user hotkey overrides.
 *
 * Bindings are per-device (keyboards and layouts differ per machine), so they
 * live in `localStorage` rather than in the synced account settings. Only
 * deviations from {@link DEFAULT_HOTKEY_BINDINGS} are stored; a `null` override
 * means "the user explicitly unbound this command".
 */

import {
  DEFAULT_HOTKEY_BINDINGS,
  HOTKEY_COMMAND_IDS,
  isHotkeyCommandId,
  type HotkeyBindings,
  type HotkeyCommandId,
} from './commands'
import { normalizeChord } from './keys'

export const HOTKEY_STORAGE_KEY = 'jait.hotkeys.v1'

/** `null` = deliberately unbound, absent key = use the default. */
export type HotkeyOverrides = Partial<Record<HotkeyCommandId, string | null>>

export interface HotkeyStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** The browser's `localStorage`, or `null` when unavailable (SSR, tests). */
export function getHotkeyStorage(): HotkeyStorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    // Private-mode or blocked storage — hotkeys still work, they just won't persist.
    return null
  }
}

/** Parse a persisted payload, dropping unknown ids and unparseable chords. */
export function parseHotkeyOverrides(raw: string | null): HotkeyOverrides {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const overrides: HotkeyOverrides = {}
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isHotkeyCommandId(id)) continue
    if (value === null) {
      overrides[id] = null
      continue
    }
    if (typeof value !== 'string') continue
    const chord = normalizeChord(value)
    if (chord) overrides[id] = chord
  }
  return overrides
}

export function readHotkeyOverrides(storage: HotkeyStorageLike | null = getHotkeyStorage()): HotkeyOverrides {
  if (!storage) return {}
  try {
    return parseHotkeyOverrides(storage.getItem(HOTKEY_STORAGE_KEY))
  } catch {
    return {}
  }
}

export function writeHotkeyOverrides(
  overrides: HotkeyOverrides,
  storage: HotkeyStorageLike | null = getHotkeyStorage(),
): void {
  if (!storage) return
  try {
    if (Object.keys(overrides).length === 0) {
      storage.removeItem(HOTKEY_STORAGE_KEY)
      return
    }
    storage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // Quota or blocked storage — keep the in-memory bindings working.
  }
}

/** Merge overrides onto the defaults to get the effective binding per command. */
export function resolveHotkeyBindings(overrides: HotkeyOverrides): HotkeyBindings {
  const bindings = {} as HotkeyBindings
  for (const id of HOTKEY_COMMAND_IDS) {
    bindings[id] = id in overrides ? (overrides[id] ?? null) : DEFAULT_HOTKEY_BINDINGS[id]
  }
  return bindings
}

/**
 * Apply one change, returning a new override map. Setting a command back to its
 * default drops the override so future default changes keep flowing through.
 */
export function setHotkeyOverride(
  overrides: HotkeyOverrides,
  id: HotkeyCommandId,
  chord: string | null,
): HotkeyOverrides {
  const normalized = chord === null ? null : normalizeChord(chord)
  if (chord !== null && !normalized) return overrides
  const next = { ...overrides }
  if (normalized === DEFAULT_HOTKEY_BINDINGS[id]) delete next[id]
  else next[id] = normalized
  return next
}

/** Drop a single override, restoring the shipped default. */
export function clearHotkeyOverride(overrides: HotkeyOverrides, id: HotkeyCommandId): HotkeyOverrides {
  if (!(id in overrides)) return overrides
  const next = { ...overrides }
  delete next[id]
  return next
}

/** Chord → the commands bound to it, in declaration order. */
export function buildHotkeyIndex(bindings: HotkeyBindings): Map<string, HotkeyCommandId[]> {
  const index = new Map<string, HotkeyCommandId[]>()
  for (const id of HOTKEY_COMMAND_IDS) {
    const chord = bindings[id]
    if (!chord) continue
    const existing = index.get(chord)
    if (existing) existing.push(id)
    else index.set(chord, [id])
  }
  return index
}

/** Only the chords claimed by more than one command. */
export function findHotkeyConflicts(bindings: HotkeyBindings): Map<string, HotkeyCommandId[]> {
  const conflicts = new Map<string, HotkeyCommandId[]>()
  for (const [chord, ids] of buildHotkeyIndex(bindings)) {
    if (ids.length > 1) conflicts.set(chord, ids)
  }
  return conflicts
}

/** The other commands that would clash if `id` were bound to `chord`. */
export function findConflictingCommands(
  bindings: HotkeyBindings,
  id: HotkeyCommandId,
  chord: string | null,
): HotkeyCommandId[] {
  if (!chord) return []
  return HOTKEY_COMMAND_IDS.filter((other) => other !== id && bindings[other] === chord)
}
