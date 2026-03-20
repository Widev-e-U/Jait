export interface ReviewHunk {
  index: number
  originalStartLineNumber: number
  originalEndLineNumber: number
  modifiedStartLineNumber: number
  modifiedEndLineNumber: number
  state: 'undecided' | 'accepted' | 'rejected'
}

interface RawHunk {
  originalStartLineNumber: number
  originalEndLineNumber: number
  modifiedStartLineNumber: number
  modifiedEndLineNumber: number
}

function splitLines(content: string): string[] {
  return content.split('\n')
}

function buildLcsTable(originalLines: string[], modifiedLines: string[]): number[][] {
  const rows = originalLines.length + 1
  const cols = modifiedLines.length + 1
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let i = originalLines.length - 1; i >= 0; i -= 1) {
    for (let j = modifiedLines.length - 1; j >= 0; j -= 1) {
      if (originalLines[i] === modifiedLines[j]) {
        table[i]![j] = (table[i + 1]![j + 1] ?? 0) + 1
      } else {
        table[i]![j] = Math.max(table[i + 1]![j] ?? 0, table[i]![j + 1] ?? 0)
      }
    }
  }

  return table
}

export function buildReviewHunks(originalContent: string, modifiedContent: string): ReviewHunk[] {
  const originalLines = splitLines(originalContent)
  const modifiedLines = splitLines(modifiedContent)
  const lcs = buildLcsTable(originalLines, modifiedLines)
  const hunks: RawHunk[] = []

  let i = 0
  let j = 0

  while (i < originalLines.length || j < modifiedLines.length) {
    if (i < originalLines.length && j < modifiedLines.length && originalLines[i] === modifiedLines[j]) {
      i += 1
      j += 1
      continue
    }

    const originalStart = i
    const modifiedStart = j

    while (i < originalLines.length || j < modifiedLines.length) {
      if (i < originalLines.length && j < modifiedLines.length && originalLines[i] === modifiedLines[j]) {
        break
      }

      const down = i < originalLines.length ? (lcs[i + 1]?.[j] ?? 0) : -1
      const right = j < modifiedLines.length ? (lcs[i]?.[j + 1] ?? 0) : -1

      if (j >= modifiedLines.length || (i < originalLines.length && down >= right)) {
        i += 1
      } else {
        j += 1
      }
    }

    hunks.push({
      originalStartLineNumber: originalStart < i ? originalStart + 1 : i,
      originalEndLineNumber: originalStart < i ? i : 0,
      modifiedStartLineNumber: modifiedStart < j ? modifiedStart + 1 : j,
      modifiedEndLineNumber: modifiedStart < j ? j : 0,
    })
  }

  return hunks.map((hunk, index) => ({ ...hunk, index, state: 'undecided' as const }))
}

export function computeMergedContent(
  originalLines: string[],
  modifiedLines: string[],
  hunks: ReviewHunk[],
): string {
  const result = [...originalLines]

  for (let i = hunks.length - 1; i >= 0; i -= 1) {
    const h = hunks[i]
    if (!h || h.state === 'rejected') continue

    const newLines = h.modifiedEndLineNumber === 0
      ? []
      : modifiedLines.slice(h.modifiedStartLineNumber - 1, h.modifiedEndLineNumber)

    if (h.originalEndLineNumber === 0) {
      result.splice(h.originalStartLineNumber, 0, ...newLines)
    } else {
      const start = h.originalStartLineNumber - 1
      const count = h.originalEndLineNumber - h.originalStartLineNumber + 1
      result.splice(start, count, ...newLines)
    }
  }

  return result.join('\n')
}

export function getReviewAnchorLine(hunk: Pick<ReviewHunk, 'modifiedStartLineNumber' | 'modifiedEndLineNumber' | 'originalStartLineNumber'>): number {
  if (hunk.modifiedStartLineNumber > 0) return hunk.modifiedStartLineNumber
  if (hunk.modifiedEndLineNumber > 0) return hunk.modifiedEndLineNumber
  return Math.max(1, hunk.originalStartLineNumber)
}
