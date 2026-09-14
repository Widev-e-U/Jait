/**
 * Selector matching elements nested inside a user message bubble that own their
 * own click behaviour (image expand dialog, links, form controls). Clicking one
 * of these must not fall through to the bubble's "click to edit" handler.
 */
export const USER_BUBBLE_INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
  '[data-no-message-edit]',
].join(', ')

type ClosestTarget = { closest: (selector: string) => Element | null }
type ContainsTarget = { contains: (node: unknown) => boolean }

function hasClosest(target: unknown): target is ClosestTarget {
  return !!target && typeof (target as { closest?: unknown }).closest === 'function'
}

function hasContains(target: unknown): target is ContainsTarget {
  return !!target && typeof (target as { contains?: unknown }).contains === 'function'
}

/**
 * True when the click landed on (or inside) an interactive child of the bubble.
 *
 * When `boundary` (the bubble element itself, i.e. the event's currentTarget) is
 * supplied, only matches nested *inside* it count — an interactive ancestor of
 * the bubble (e.g. a clickable message row) must not disable editing entirely.
 */
export function isInteractiveBubbleTarget(target: unknown, boundary?: unknown): boolean {
  if (!hasClosest(target)) return false
  const match = target.closest(USER_BUBBLE_INTERACTIVE_SELECTOR)
  if (!match) return false
  return hasContains(boundary) ? boundary.contains(match) : true
}

export interface UserBubbleClickState {
  /** Whether the message can enter edit mode at all. */
  canEdit: boolean
  /** Whether the message is already in edit mode. */
  isEditing: boolean
}

/**
 * Decides whether a click on a user message bubble should start editing.
 *
 * Clicks that originate from an interactive child — most importantly the image
 * "Click to expand" button, which is nested inside the bubble — or that follow
 * a text selection are ignored, so expanding an image never also opens the
 * message editor.
 *
 * `bubble` is the bubble element itself (the event's `currentTarget`); when it
 * is provided, only interactive descendants of it are treated as interactive.
 */
export function shouldStartUserMessageEdit(
  event: { target?: unknown; currentTarget?: unknown } | null | undefined,
  selectionText: string | null | undefined,
  state: UserBubbleClickState,
  bubble?: unknown,
): boolean {
  if (!state.canEdit || state.isEditing) return false
  if (isInteractiveBubbleTarget(event?.target, bubble ?? event?.currentTarget)) return false
  if (selectionText && selectionText.trim().length > 0) return false
  return true
}
