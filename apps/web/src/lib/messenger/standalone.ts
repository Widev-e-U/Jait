import type { MessengerMessage } from './model'

/** WhatsApp renders up to three standalone emoji jumbo; more fall back to text size. */
export const MAX_LARGE_EMOJI = 3

/**
 * Emoji-only bodies: at least one pictograph, and nothing but pictographs,
 * skin-tone modifiers, joiners, variation selectors and whitespace.
 */
const EMOJI_ONLY = /^(?=\s*\p{Extended_Pictographic})(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200d|\ufe0f|\s)+$/u

type GraphemeSegmenter = { segment: (input: string) => Iterable<{ segment: string }> }
type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: 'grapheme' },
) => GraphemeSegmenter

function graphemes(value: string): string[] {
  const Constructor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter
  if (!Constructor) return [...value]
  return [...new Constructor(undefined, { granularity: 'grapheme' }).segment(value)].map(part => part.segment)
}

/**
 * True when the whole body is a short emoji sequence, which is the only case
 * where WhatsApp drops the bubble chrome and shows the emoji big.
 */
export function isStandaloneEmoji(body: string): boolean {
  const text = body.trim()
  if (!text) return false
  if (!EMOJI_ONLY.test(text)) return false
  return graphemes(text).length <= MAX_LARGE_EMOJI
}

/**
 * A photo sent without a caption fills the bubble. `sendAttachment` stores the
 * file name as the body, so a body that is only the file name still counts as
 * "no caption" — anything else is real text and keeps the normal layout.
 */
export function isStandaloneImage(message: MessengerMessage): boolean {
  const attachment = message.attachment
  if (!attachment?.image) return false
  const body = message.body.trim()
  return !body || body === attachment.name.trim()
}

/** The caption of an attachment message, or an empty string when there is none. */
export function messageCaption(message: MessengerMessage): string {
  return isStandaloneImage(message) ? '' : message.body.trim()
}
