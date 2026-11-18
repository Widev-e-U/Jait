/**
 * Lightweight list formatting for the chat composer.
 *
 * The composer is plain text with chips, so a "list" is just a line prefix.
 * Typing `- ` at the start of a line shows a bullet (`• `); a line break on a
 * list line continues the list, and a line break on an empty item ends it.
 * Messages are sent as markdown, so bullets go out as `- ` again.
 */

export const COMPOSER_BULLET = '•'

const BULLET_LINE = /^(\s*)([•\-*]) (.*)$/s
// Three digits at most, so a sentence starting with a year is not a list.
const NUMBERED_LINE = /^(\s*)(\d{1,3})([.)]) (.*)$/s

/** True when the text typed so far on the current line should become a bullet. */
export function shouldAutoBullet(lineBeforeCaret: string): boolean {
  return /^\s*[-*] $/.test(lineBeforeCaret)
}

export type ListLineBreak =
  | { kind: 'continue'; prefix: string }
  | { kind: 'end'; markerLength: number }

/**
 * What a line break should do on the line the caret is on.
 * `null` means the line is not a list item: insert a plain line break.
 */
export function resolveListLineBreak(line: string): ListLineBreak | null {
  const bullet = BULLET_LINE.exec(line)
  if (bullet) {
    const [, indent, marker, rest] = bullet
    const prefix = `${indent}${marker === '-' || marker === '*' ? COMPOSER_BULLET : marker} `
    return rest.trim() ? { kind: 'continue', prefix } : { kind: 'end', markerLength: line.length }
  }
  const numbered = NUMBERED_LINE.exec(line)
  if (numbered) {
    const [, indent, digits, delimiter, rest] = numbered
    return rest.trim()
      ? { kind: 'continue', prefix: `${indent}${Number(digits) + 1}${delimiter} ` }
      : { kind: 'end', markerLength: line.length }
  }
  return null
}

/** Composer bullets are a display affordance; the message itself is markdown. */
export function bulletsToMarkdown(text: string): string {
  return text.includes(COMPOSER_BULLET) ? text.replace(/^(\s*)• /gm, '$1- ') : text
}
