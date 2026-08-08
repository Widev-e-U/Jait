/**
 * Event → command resolution, kept DOM-free so it can be unit tested.
 * The React provider supplies real DOM nodes; the logic only duck-types them.
 */

import { getHotkeyCommand, type HotkeyCommandId } from './commands'
import { chordCandidatesFromEvent, isMacPlatform, type HotkeyEventLike } from './keys'

/** The parts of an `EventTarget` we inspect to detect text entry. */
export interface HotkeyTargetLike {
  tagName?: string
  type?: string
  readOnly?: boolean
  isContentEditable?: boolean
  getAttribute?: (name: string) => string | null
  closest?: (selector: string) => unknown
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit',
])

/**
 * True when the event originated inside something the user types into —
 * an input, textarea, select, or a rich contenteditable surface such as the
 * chat composer or the code editor.
 */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false
  const node = target as HotkeyTargetLike
  const tag = node.tagName?.toUpperCase()

  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (node.type ?? 'text').toLowerCase()
    return !NON_TEXT_INPUT_TYPES.has(type)
  }
  if (node.isContentEditable) return true
  if (node.getAttribute?.('contenteditable') === 'true') return true
  // Monaco keeps focus on a hidden textarea, but xterm and some editors put it
  // on a wrapper — treat any element inside an editing surface as editable.
  return Boolean(node.closest?.('[contenteditable="true"], .monaco-editor, .xterm'))
}

/**
 * Every command bound to the chord this event produces, ordered by the index.
 * Commands that may not fire inside text fields are filtered out when the
 * event came from one.
 */
export function resolveHotkeyCommands(
  index: ReadonlyMap<string, HotkeyCommandId[]>,
  event: HotkeyEventLike,
  options: { editableTarget?: boolean; mac?: boolean } = {},
): HotkeyCommandId[] {
  const mac = options.mac ?? isMacPlatform()
  const matched: HotkeyCommandId[] = []
  for (const chord of chordCandidatesFromEvent(event, mac)) {
    for (const id of index.get(chord) ?? []) {
      if (matched.includes(id)) continue
      if (options.editableTarget && !getHotkeyCommand(id)?.allowInInput) continue
      matched.push(id)
    }
  }
  return matched
}
