/**
 * Mobile-only layout helpers for the new-chat (empty state) column.
 *
 * On phones the empty state stacks the greeting, the suggestions, the composer
 * and the composer control row inside one vertically centered column. As soon
 * as the soft keyboard opens the column is taller than the space left above the
 * mobile nav bar, so the composer used to be clipped behind that nav bar.
 *
 * The helpers below make that column scrollable on mobile and let the composer
 * be nudged up by exactly the amount that is still hidden, so the input always
 * stays fully visible. Desktop keeps its centered, clipped layout.
 */

/** Breathing room kept between the composer and the bottom edge after a reveal. */
export const NEW_CHAT_COMPOSER_REVEAL_MARGIN_PX = 8

/**
 * Smallest viewport coverage treated as "the keyboard covers this". Browser
 * toolbars and pinch zoom produce much smaller deltas.
 */
export const KEYBOARD_BOTTOM_INSET_MIN_PX = 80

/**
 * Column classes for the empty state. Mobile scrolls (so nothing is clipped);
 * desktop stays a fixed, centered column.
 */
export function getNewChatColumnClassName(isMobile: boolean, horizontalPadding: boolean): string {
  const parts = ['relative flex-1 min-w-0 flex flex-col items-center']
  // Mobile: scroll instead of clip so the composer stays reachable when the
  // viewport shrinks. Centering comes from the stack's auto margins, because
  // `justify-center` on a scroll container hides the top of overflowing content.
  parts.push(isMobile ? 'min-h-0 overflow-y-auto overscroll-contain pt-12' : 'justify-center overflow-hidden')
  if (horizontalPadding) parts.push('px-4')
  return parts.join(' ')
}

/**
 * Inner stack classes. Auto margins center the content while it fits and
 * collapse to 0 as soon as it overflows, which keeps the top reachable.
 */
export function getNewChatStackClassName(isMobile: boolean): string {
  return isMobile ? 'w-full max-w-4xl space-y-8 my-auto' : 'w-full max-w-4xl space-y-8'
}

/**
 * Part of the layout viewport that is still covered after the resize. Android
 * and Capacitor resize the layout viewport with the keyboard (`innerHeight`
 * shrinks, so this is 0); iOS Safari does not, and this returns the keyboard
 * height so the column can pad around it.
 */
export function getKeyboardBottomInset(
  innerHeight: number,
  viewport: Pick<VisualViewport, 'height' | 'offsetTop'> | null | undefined,
  minInset = KEYBOARD_BOTTOM_INSET_MIN_PX,
): number {
  if (!viewport || !(viewport.height > 0) || !(innerHeight > 0)) return 0
  const covered = innerHeight - (viewport.height + (viewport.offsetTop || 0))
  if (!Number.isFinite(covered) || covered < minInset) return 0
  // A bogus measurement should never eat the whole screen.
  return Math.round(Math.min(covered, innerHeight * 0.7))
}

/**
 * Bottom edge, in layout-viewport coordinates, of the region the user can
 * actually see. Only `visualViewport` knows about the soft keyboard, so a
 * reveal must never assume that a scroller's own box is fully on screen: the
 * keyboard (and the panning it causes on iOS) can cover part of it.
 */
export function getVisibleViewportBottom(
  viewport: Pick<VisualViewport, 'height' | 'offsetTop'> | null | undefined,
  innerHeight: number,
): number {
  const layoutBottom = Number.isFinite(innerHeight) && innerHeight > 0 ? innerHeight : 0
  if (!viewport || !(viewport.height > 0)) return layoutBottom
  const visualBottom = viewport.height + (viewport.offsetTop || 0)
  if (!Number.isFinite(visualBottom)) return layoutBottom
  return layoutBottom > 0 ? Math.min(layoutBottom, visualBottom) : visualBottom
}

/**
 * Where the composer control row (History / New chat / mode pickers) renders
 * relative to the composer card in the empty state.
 *
 * Normally it sits below the composer. When a mobile soft keyboard opens the
 * stack's last element must be the composer card itself, so the reveal can dock
 * the card just above the keyboard; leaving the row below it pushes the input
 * up toward the header and wedges ~50px of chrome between input and keyboard.
 * Desktop (and mobile without a keyboard) keeps the row below the card.
 */
export function shouldPlaceControlRowAboveComposer(isMobile: boolean, keyboardInset: number): boolean {
  return isMobile && Number.isFinite(keyboardInset) && keyboardInset > 0
}

/**
 * Pixels to scroll down so `composerBottom` sits inside the visible band
 * (`visibleTop` + `visibleHeight`). Returns 0 when the composer already fits,
 * which keeps the column from jumping when there is nothing to reveal.
 */
/**
 * Caps a reveal so the composer top stays below the header. Scrolling down
 * moves the composer up, and on a short visible band (keyboard plus browser
 * chrome) the nudge could otherwise tuck it under the header — the exact bug
 * the reveal exists to prevent. A negative or non-finite delta stays 0; a
 * non-finite geometry leaves the delta untouched.
 */
export function clampRevealDeltaToHeader(
  delta: number,
  composerTop: number,
  headerBottom: number,
  margin = NEW_CHAT_COMPOSER_REVEAL_MARGIN_PX,
): number {
  if (!Number.isFinite(delta) || delta <= 0) return 0
  if (!Number.isFinite(composerTop) || !Number.isFinite(headerBottom)) return delta
  const maxDelta = composerTop - (headerBottom + Math.max(0, margin))
  return Math.min(delta, Math.max(0, maxDelta))
}

export function getComposerRevealDelta(
  composerBottom: number,
  visibleTop: number,
  visibleHeight: number,
  margin = NEW_CHAT_COMPOSER_REVEAL_MARGIN_PX,
): number {
  if (!Number.isFinite(composerBottom) || !Number.isFinite(visibleTop) || !(visibleHeight > 0)) return 0
  const overhang = composerBottom + Math.max(0, margin) - (visibleTop + visibleHeight)
  return overhang > 0 ? Math.ceil(overhang) : 0
}
