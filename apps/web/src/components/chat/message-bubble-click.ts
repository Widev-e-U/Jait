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

function hasClosest(target: unknown): target is ClosestTarget {
  return !!target && typeof (target as { closest?: unknown }).closest === 'function'
}

/** True when the click landed on (or inside) an interactive child of the bubble. */
export function isInteractiveBubbleTarget(target: unknown): boolean {
  if (!hasClosest(target)) return false
  return target.closest(USER_BUBBLE_INTERACTIVE_SELECTOR) !== null
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
 */
export function shouldStartUserMessageEdit(
  event: { target?: unknown } | null | undefined,
  selectionText: string | null | undefined,
  state: UserBubbleClickState,
): boolean {
  if (!state.canEdit || state.isEditing) return false
  if (isInteractiveBubbleTarget(event?.target)) return false
  if (selectionText && selectionText.trim().length > 0) return false
  return true
}
