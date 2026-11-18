/** Emoji dataset row: [glyph, label, group index, search terms]. */
export type EmojiRow = [glyph: string, label: string, group: number, terms: string]

/**
 * Filter emoji rows the way the reaction picker searches: every whitespace
 * separated word must appear in the row's search terms or its label.
 * An empty query returns all rows unchanged. Kept pure so it is unit-testable.
 */
export function filterEmojiRows(rows: EmojiRow[], query: string): EmojiRow[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  const words = needle.split(/\s+/).filter(Boolean)
  return rows.filter(row => words.every(word => row[3].includes(word) || row[1].toLowerCase().includes(word)))
}
