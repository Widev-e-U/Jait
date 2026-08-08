/**
 * Chord parsing, normalization and rendering for the central hotkey system.
 *
 * A *chord* is the canonical, storable representation of a shortcut, e.g.
 * `mod+shift+o`, `alt+1`, `shift+escape`. `mod` is the primary accelerator:
 * ⌘ on macOS, Ctrl everywhere else. Modifiers are always emitted in a fixed
 * order so two spellings of the same shortcut compare equal as strings.
 *
 * Everything here is DOM-free on purpose — it takes {@link HotkeyEventLike}
 * rather than a real `KeyboardEvent` so it stays unit-testable under Node.
 */

/** The subset of `KeyboardEvent` needed to derive a chord. */
export interface HotkeyEventLike {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export type HotkeyModifier = 'mod' | 'ctrl' | 'meta' | 'alt' | 'shift'

/** Canonical modifier order — chords are always serialized in this sequence. */
const MODIFIER_ORDER: readonly HotkeyModifier[] = ['mod', 'ctrl', 'meta', 'alt', 'shift']

const MODIFIER_ALIASES: Record<string, HotkeyModifier> = {
  mod: 'mod',
  ctrl: 'ctrl',
  control: 'ctrl',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  super: 'meta',
  win: 'meta',
  os: 'meta',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
}

/** Key names that only ever act as modifiers — never valid as a chord's key. */
const MODIFIER_KEY_NAMES = new Set([
  'control', 'ctrl', 'shift', 'alt', 'option', 'meta', 'cmd', 'command', 'os', 'super', 'win',
  'altgraph', 'capslock', 'fn', 'fnlock', 'hyper', 'numlock', 'scrolllock', 'symbol', 'dead',
])

/** `event.key` (and human) spellings → canonical key token. */
const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  space: 'space',
  spacebar: 'space',
  esc: 'escape',
  escape: 'escape',
  enter: 'enter',
  return: 'enter',
  tab: 'tab',
  backspace: 'backspace',
  del: 'delete',
  delete: 'delete',
  ins: 'insert',
  insert: 'insert',
  home: 'home',
  end: 'end',
  pageup: 'pageup',
  pgup: 'pageup',
  pagedown: 'pagedown',
  pgdn: 'pagedown',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  plus: '+',
  comma: ',',
  period: '.',
  dot: '.',
  slash: '/',
  backslash: '\\',
  backquote: '`',
  graveaccent: '`',
  minus: '-',
  dash: '-',
  equal: '=',
  equals: '=',
  semicolon: ';',
  quote: '\'',
  bracketleft: '[',
  bracketright: ']',
}

/** `event.code` (physical key) → canonical key token. */
const CODE_ALIASES: Record<string, string> = {
  Space: 'space',
  Escape: 'escape',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  Insert: 'insert',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Semicolon: ';',
  Quote: '\'',
  BracketLeft: '[',
  BracketRight: ']',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
  NumpadDecimal: '.',
}

const FUNCTION_KEY_PATTERN = /^f([1-9]|1[0-9]|2[0-4])$/

/** True when running on an Apple platform, where `mod` maps to ⌘. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? navigator.platform
    ?? ''
  return /mac|iphone|ipad|ipod/i.test(`${platform} ${navigator.userAgent ?? ''}`)
}

/** Normalize a single non-modifier key token, or `null` when it isn't one. */
export function normalizeKeyToken(raw: string): string | null {
  const token = raw.trim().toLowerCase()
  if (!token) return null
  if (MODIFIER_KEY_NAMES.has(token)) return null
  const alias = KEY_ALIASES[token]
  if (alias) return alias
  if (FUNCTION_KEY_PATTERN.test(token)) return token
  // Single printable character (Array.from keeps astral chars intact).
  return Array.from(token).length === 1 ? token : null
}

function normalizeModifierToken(raw: string): HotkeyModifier | null {
  return MODIFIER_ALIASES[raw.trim().toLowerCase()] ?? null
}

/**
 * Parse any human spelling of a shortcut into its canonical chord string.
 * Returns `null` when the input has no key, has two keys, or is unparseable.
 */
export function normalizeChord(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null

  // `+` is both the separator and a legal key: "mod++" / "+" mean the plus key.
  let key: string | null = null
  let source = trimmed
  if (source === '+') {
    key = '+'
    source = ''
  } else if (source.endsWith('++')) {
    key = '+'
    source = source.slice(0, -2)
  }

  const modifiers = new Set<HotkeyModifier>()
  for (const token of source.split('+').map((part) => part.trim()).filter(Boolean)) {
    const modifier = normalizeModifierToken(token)
    if (modifier) {
      modifiers.add(modifier)
      continue
    }
    const parsed = normalizeKeyToken(token)
    if (!parsed) return null
    if (key && key !== parsed) return null
    key = parsed
  }

  if (!key) return null
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join('+')
}

/** Split a canonical chord back into its modifiers and key. */
export function parseChord(chord: string): { modifiers: HotkeyModifier[]; key: string } | null {
  const normalized = normalizeChord(chord)
  if (!normalized) return null
  const parts = normalized === '+' ? ['+'] : normalized.endsWith('++')
    ? [...normalized.slice(0, -2).split('+').filter(Boolean), '+']
    : normalized.split('+')
  const key = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1).filter((part): part is HotkeyModifier =>
    MODIFIER_ORDER.includes(part as HotkeyModifier))
  return { modifiers, key }
}

/** True when the pressed key is a bare modifier (nothing to bind yet). */
export function isModifierOnlyEvent(event: HotkeyEventLike): boolean {
  return MODIFIER_KEY_NAMES.has(event.key.toLowerCase())
}

function eventModifiers(event: HotkeyEventLike, mac: boolean): HotkeyModifier[] {
  const active = new Set<HotkeyModifier>()
  if (mac ? event.metaKey : event.ctrlKey) active.add('mod')
  if (mac && event.ctrlKey) active.add('ctrl')
  if (!mac && event.metaKey) active.add('meta')
  if (event.altKey) active.add('alt')
  if (event.shiftKey) active.add('shift')
  return MODIFIER_ORDER.filter((modifier) => active.has(modifier))
}

function keyTokenFromCode(code: string | undefined): string | null {
  if (!code) return null
  if (CODE_ALIASES[code]) return CODE_ALIASES[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code.toLowerCase()
  return null
}

/**
 * The chord a user *sees* when pressing this combination — derived from
 * `event.key`, so it reflects the actual keyboard layout.
 */
export function chordFromEvent(event: HotkeyEventLike, mac = isMacPlatform()): string | null {
  if (isModifierOnlyEvent(event)) return null
  const key = normalizeKeyToken(event.key) ?? keyTokenFromCode(event.code)
  if (!key) return null
  return [...eventModifiers(event, mac), key].join('+')
}

/**
 * Every chord this event could reasonably mean: the layout-dependent one from
 * `event.key` plus the physical one from `event.code`. Matching against both
 * keeps `mod+/` working on layouts where `/` sits behind another modifier.
 */
export function chordCandidatesFromEvent(event: HotkeyEventLike, mac = isMacPlatform()): string[] {
  if (isModifierOnlyEvent(event)) return []
  const modifiers = eventModifiers(event, mac)
  const candidates: string[] = []
  for (const key of [normalizeKeyToken(event.key), keyTokenFromCode(event.code)]) {
    if (!key) continue
    const chord = [...modifiers, key].join('+')
    if (!candidates.includes(chord)) candidates.push(chord)
  }
  return candidates
}

/** True when `event` triggers the given canonical chord. */
export function chordMatchesEvent(chord: string, event: HotkeyEventLike, mac = isMacPlatform()): boolean {
  return chordCandidatesFromEvent(event, mac).includes(chord)
}

const MAC_MODIFIER_SYMBOLS: Record<HotkeyModifier, string> = {
  mod: '⌘',
  ctrl: '⌃',
  meta: '⌘',
  alt: '⌥',
  shift: '⇧',
}

const OTHER_MODIFIER_LABELS: Record<HotkeyModifier, string> = {
  mod: 'Ctrl',
  ctrl: 'Ctrl',
  meta: 'Win',
  alt: 'Alt',
  shift: 'Shift',
}

const KEY_LABELS: Record<string, string> = {
  space: 'Space',
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  backspace: '⌫',
  delete: 'Del',
  insert: 'Ins',
  home: 'Home',
  end: 'End',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

/**
 * Render a chord as display tokens, e.g. `['⌘', '⇧', 'O']` on macOS or
 * `['Ctrl', 'Shift', 'O']` elsewhere. Returns `[]` for an unbound chord.
 */
export function formatChordParts(chord: string | null | undefined, mac = isMacPlatform()): string[] {
  const parsed = chord ? parseChord(chord) : null
  if (!parsed) return []
  const modifierLabels = mac ? MAC_MODIFIER_SYMBOLS : OTHER_MODIFIER_LABELS
  const keyLabel = KEY_LABELS[parsed.key] ?? parsed.key.toUpperCase()
  return [...parsed.modifiers.map((modifier) => modifierLabels[modifier]), keyLabel]
}

/**
 * Display tokens for just the modifiers currently held down — used to preview
 * a shortcut while the user is still mid-chord in the recorder.
 */
export function formatEventModifierParts(event: HotkeyEventLike, mac = isMacPlatform()): string[] {
  const modifierLabels = mac ? MAC_MODIFIER_SYMBOLS : OTHER_MODIFIER_LABELS
  return eventModifiers(event, mac).map((modifier) => modifierLabels[modifier])
}

/** Render a chord as a single human string (`⌘⇧O` on macOS, `Ctrl+Shift+O`). */
export function formatChord(chord: string | null | undefined, mac = isMacPlatform()): string {
  const parts = formatChordParts(chord, mac)
  if (parts.length === 0) return ''
  return parts.join(mac ? '' : '+')
}
