export interface UserReferencedFile {
  path: string
  name: string
}

export type UserMessageSegment =
  | { type: 'text'; text: string }
  | ({ type: 'file' } & UserReferencedFile)

export function normalizeUserMessageSegments(segments: UserMessageSegment[] | null | undefined): UserMessageSegment[] {
  if (!segments?.length) return []

  const normalized: UserMessageSegment[] = []
  for (const segment of segments) {
    if (segment.type === 'text') {
      if (!segment.text) continue
      const last = normalized[normalized.length - 1]
      if (last?.type === 'text') {
        last.text += segment.text
      } else {
        normalized.push({ type: 'text', text: segment.text })
      }
      continue
    }

    if (!segment.path.trim()) continue
    normalized.push({
      type: 'file',
      path: segment.path,
      name: segment.name || segment.path.split('/').pop() || segment.path,
    })
  }

  return normalized
}

export function userMessageTextFromSegments(segments: UserMessageSegment[] | null | undefined): string {
  return normalizeUserMessageSegments(segments)
    .filter((segment): segment is Extract<UserMessageSegment, { type: 'text' }> => segment.type === 'text')
    .map((segment) => segment.text)
    .join('')
}

export function userReferencedFilesFromSegments(segments: UserMessageSegment[] | null | undefined): UserReferencedFile[] {
  const files: UserReferencedFile[] = []
  const seen = new Set<string>()

  for (const segment of normalizeUserMessageSegments(segments)) {
    if (segment.type !== 'file' || seen.has(segment.path)) continue
    seen.add(segment.path)
    files.push({ path: segment.path, name: segment.name })
  }

  return files
}

export function buildFallbackUserMessageSegments(
  text: string,
  files?: UserReferencedFile[] | null,
): UserMessageSegment[] {
  const segments: UserMessageSegment[] = []
  if (text) segments.push({ type: 'text', text })
  for (const file of files ?? []) {
    segments.push({ type: 'file', path: file.path, name: file.name })
  }
  return segments
}

export function parseLegacyReferencedFilesBlock(content: string): {
  text: string
  files: UserReferencedFile[]
  displaySegments: UserMessageSegment[]
} {
  const marker = '\nReferenced files:\n'
  const idx = content.indexOf(marker)
  if (idx === -1) {
    return {
      text: content,
      files: [],
      displaySegments: buildFallbackUserMessageSegments(content),
    }
  }

  const text = content.slice(0, idx).trimEnd()
  const refBlock = content.slice(idx + marker.length)
  const files: UserReferencedFile[] = []

  for (const line of refBlock.split('\n')) {
    const match = line.match(/^- (.+)$/)
    if (!match) continue
    const path = match[1].trim()
    files.push({ path, name: path.split('/').pop() ?? path })
  }

  return {
    text,
    files,
    displaySegments: buildFallbackUserMessageSegments(text, files),
  }
}

export function parseUserMessageSegments(raw: unknown): UserMessageSegment[] {
  if (!Array.isArray(raw)) return []

  const parsed: UserMessageSegment[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') {
      parsed.push({ type: 'text', text: record.text })
      continue
    }
    if (record.type === 'file' && typeof record.path === 'string') {
      parsed.push({
        type: 'file',
        path: record.path,
        name: typeof record.name === 'string' ? record.name : record.path.split('/').pop() ?? record.path,
      })
    }
  }
  return normalizeUserMessageSegments(parsed)
}
