/**
 * Detection + tracking of the mobile "soft" keyboard so an accessory key bar
 * can appear with it (and disappear when it closes).
 *
 * The soft keyboard can only ever shrink the visual viewport, so in a mobile
 * browser "viewport shrank by more than a keyboard height" ≈ keyboard opened,
 * "viewport grew back to the largest size we have seen" ≈ keyboard closed.
 * Small deltas (browser toolbars, pinch zoom) are ignored.
 */

type KeyboardCapableWindow = Window & {
  visualViewport?: VisualViewport
}

/** Viewport shrink attributed to the soft keyboard (not toolbars, etc.). */
const KEYBOARD_MIN_SHRINK_PX = 120

export function subscribeViewportKeyboard(
  win: KeyboardCapableWindow,
  onChange: (open: boolean) => void,
): () => void {
  const viewport = win.visualViewport
  if (!viewport) return () => undefined

  // The keyboard can only shrink the viewport, so the largest height seen is
  // the "keyboard closed" baseline.
  let baseline = win.innerHeight || viewport.height
  let open = false
  const handleResize = () => {
    const height = viewport.height
    if (height > baseline) {
      // Viewport grew — keyboard closed (or rotation); recalibrate.
      baseline = height
      if (open) {
        open = false
        onChange(false)
      }
      return
    }
    const shrankBy = baseline - height
    if (shrankBy >= KEYBOARD_MIN_SHRINK_PX) {
      if (!open) {
        open = true
        onChange(true)
      }
    } else if (open && shrankBy < KEYBOARD_MIN_SHRINK_PX * 0.5) {
      // Height came back to (almost) the baseline — keyboard closed.
      baseline = height
      open = false
      onChange(false)
    }
  }
  viewport.addEventListener('resize', handleResize)
  return () => viewport.removeEventListener('resize', handleResize)
}

/**
 * Subscribe to soft-keyboard visibility. Returns a cleanup function.
 * Falls back to a stable "open" (bar stays visible) when visualViewport is
 * unavailable, so the bar never silently disappears.
 */
export function subscribeSoftKeyboardOpen(
  onChange: (open: boolean) => void,
  win: Window = window,
): () => void {
  if (!win.visualViewport) {
    onChange(true)
    return () => undefined
  }
  return subscribeViewportKeyboard(win as KeyboardCapableWindow, onChange)
}

export type TerminalKeyAction =
  | 'esc' | 'tab' | 'ctlc' | 'ctld' | 'ctlz' | 'ctll' | 'ctla' | 'ctle'
  | 'ctlr' | 'ctlw'
  | 'left' | 'right' | 'up' | 'down'
  | 'home' | 'end' | 'pgup' | 'pgdn'
  | 'copy' | 'paste'

/** Control sequences for the accessory key bar (xterm.js-compatible). */
const TERMINAL_KEY_SEQUENCES: Record<Exclude<TerminalKeyAction, 'copy' | 'paste'>, string> = {
  esc: '\x1b',
  tab: '\t',
  ctlc: '\x03',
  ctld: '\x04',
  ctlz: '\x1a',
  ctll: '\x0c',
  ctlr: '\x12',
  ctlw: '\x17',
  ctla: '\x01',
  ctle: '\x05',
  left: '\x1b[D',
  right: '\x1b[C',
  up: '\x1b[A',
  down: '\x1b[B',
  home: '\x1b[H',
  end: '\x1b[F',
  pgup: '\x1b[5~',
  pgdn: '\x1b[6~',
}

/**
 * Translate an accessory-bar action into the byte sequence xterm-style
 * terminals expect. `copy`/`paste` are UI actions and return null.
 */
export function encodeTerminalKeyAction(action: TerminalKeyAction): string | null {
  if (action === 'copy' || action === 'paste') return null
  return TERMINAL_KEY_SEQUENCES[action]
}

/** True when the action moves terminal scrollback instead of sending input. */
export function isTerminalScrollKey(action: TerminalKeyAction): boolean {
  return action === 'pgup' || action === 'pgdn'
}