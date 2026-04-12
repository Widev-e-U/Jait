export interface UserReferencedFile {
  path: string
  name: string
  kind?: 'file' | 'dir'
  lineRange?: UserLineRange
}

export interface UserWorkspaceReference {
  path: string
  name: string
}

export interface UserTerminalReference {
  terminalId: string
  name: string
  workspaceRoot?: string | null
  lineRange?: UserLineRange
  selectedText?: string
}

export interface UserLineRange {
  startLine: number
  endLine: number
}

export interface UserImageAttachment {
  name: string
  mimeType: string
  data: string
}

const JAIT_REF_MIME = 'application/x-jait-user-message+json'

export type UserMessageSegment =
  | { type: 'text'; text: string }
  | ({ type: 'file' } & UserReferencedFile)
  | ({ type: 'workspace' } & UserWorkspaceReference)
  | ({ type: 'terminal' } & UserTerminalReference)
  | ({ type: 'image' } & UserImageAttachment)

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

    if (segment.type === 'file') {
      if (!segment.path.trim()) continue
      normalized.push({
        type: 'file',
        path: segment.path,
        name: segment.name || segment.path.split(/[\\/]/).pop() || segment.path,
        ...(segment.kind ? { kind: segment.kind } : {}),
        ...(normalizeLineRange(segment.lineRange) ? { lineRange: normalizeLineRange(segment.lineRange)! } : {}),
      })
      continue
    }

    if (segment.type === 'workspace') {
      if (!segment.path.trim()) continue
      normalized.push({
        type: 'workspace',
        path: segment.path,
        name: segment.name || segment.path.split(/[\\/]/).pop() || segment.path,
      })
      continue
    }

    if (segment.type === 'terminal') {
      if (!segment.terminalId.trim()) continue
      normalized.push({
        type: 'terminal',
        terminalId: segment.terminalId,
        name: segment.name || segment.terminalId,
        ...(segment.workspaceRoot ? { workspaceRoot: segment.workspaceRoot } : {}),
        ...(normalizeLineRange(segment.lineRange) ? { lineRange: normalizeLineRange(segment.lineRange)! } : {}),
        ...(segment.selectedText ? { selectedText: segment.selectedText } : {}),
      })
      continue
    }

    if (!segment.data.trim() || !segment.mimeType.startsWith('image/')) continue
    normalized.push({
      type: 'image',
      name: segment.name || 'Image',
      mimeType: segment.mimeType,
      data: segment.data,
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
    const key = segment.type === 'file' ? referenceKey(segment.path, segment.lineRange) : ''
    if (segment.type !== 'file' || seen.has(key)) continue
    seen.add(key)
    files.push({ path: segment.path, name: segment.name, ...(segment.kind ? { kind: segment.kind } : {}), ...(segment.lineRange ? { lineRange: segment.lineRange } : {}) })
  }

  return files
}

export function userReferencedWorkspacesFromSegments(segments: UserMessageSegment[] | null | undefined): UserWorkspaceReference[] {
  const workspaces: UserWorkspaceReference[] = []
  const seen = new Set<string>()

  for (const segment of normalizeUserMessageSegments(segments)) {
    if (segment.type !== 'workspace' || seen.has(segment.path)) continue
    seen.add(segment.path)
    workspaces.push({ path: segment.path, name: segment.name })
  }

  return workspaces
}

export function userReferencedTerminalsFromSegments(segments: UserMessageSegment[] | null | undefined): UserTerminalReference[] {
  const terminals: UserTerminalReference[] = []
  const seen = new Set<string>()

  for (const segment of normalizeUserMessageSegments(segments)) {
    const key = segment.type === 'terminal' ? referenceKey(segment.terminalId, segment.lineRange) : ''
    if (segment.type !== 'terminal' || seen.has(key)) continue
    seen.add(key)
    terminals.push({
      terminalId: segment.terminalId,
      name: segment.name,
      ...(segment.workspaceRoot ? { workspaceRoot: segment.workspaceRoot } : {}),
      ...(segment.lineRange ? { lineRange: segment.lineRange } : {}),
      ...(segment.selectedText ? { selectedText: segment.selectedText } : {}),
    })
  }

  return terminals
}

export function buildFallbackUserMessageSegments(
  text: string,
  files?: UserReferencedFile[] | null,
): UserMessageSegment[] {
  const segments: UserMessageSegment[] = []
  if (text) segments.push({ type: 'text', text })
  for (const file of files ?? []) {
    segments.push({ type: 'file', path: file.path, name: file.name, ...(file.kind ? { kind: file.kind } : {}), ...(file.lineRange ? { lineRange: file.lineRange } : {}) })
  }
  return segments
}

export function buildEditedUserMessageSegments(
  text: string,
  previousSegments?: UserMessageSegment[] | null,
): UserMessageSegment[] {
  const next = buildFallbackUserMessageSegments(text, userReferencedFilesFromSegments(previousSegments))
  for (const segment of normalizeUserMessageSegments(previousSegments)) {
    if (segment.type === 'image') next.push(segment)
  }
  return next
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
    files.push({ path, name: path.split(/[\\/]/).pop() ?? path })
  }

  return {
    text,
    files,
    displaySegments: buildFallbackUserMessageSegments(text, files),
  }
}

export function serializeUserMessageSegmentsToMarkdown(segments: UserMessageSegment[] | null | undefined): string {
  return normalizeUserMessageSegments(segments).map((segment) => {
    if (segment.type === 'text') return segment.text
    if (segment.type === 'file') return `@${segment.path}${formatLineRangeSuffix(segment.lineRange)}`
    if (segment.type === 'workspace') return `[workspace:${segment.path}]`
    if (segment.type === 'terminal') return `[terminal:${segment.terminalId}${formatLineRangeSuffix(segment.lineRange)}]`
    return `[image:${segment.name}]`
  }).join('')
}

export function parseUserMessageMarkdown(markdown: string): UserMessageSegment[] {
  if (!markdown.includes('@')) return []

  const segments: UserMessageSegment[] = []
  const pattern = /(^|[\s(])@([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)(?=$|[\s),:;!?])/g
  let lastIndex = 0

  for (const match of markdown.matchAll(pattern)) {
    const index = match.index ?? -1
    if (index < 0) continue
    const full = match[0] ?? ''
    const prefix = match[1] ?? ''
    const path = match[2]?.trim()
    const pathStart = index + prefix.length
    if (pathStart > lastIndex) {
      segments.push({ type: 'text', text: markdown.slice(lastIndex, pathStart) })
    }
    if (path) {
      segments.push({ type: 'file', path, name: path.split('/').pop() || path })
      lastIndex = pathStart + 1 + path.length
    } else {
      segments.push({ type: 'text', text: full })
      lastIndex = index + full.length
    }
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: 'text', text: markdown.slice(lastIndex) })
  }

  const normalized = normalizeUserMessageSegments(segments)
  return normalized.some((segment) => segment.type === 'file') ? normalized : []
}

export function serializeUserMessageSegmentsForClipboard(segments: UserMessageSegment[] | null | undefined): string | null {
  const normalized = normalizeUserMessageSegments(segments)
  return normalized.length > 0 ? JSON.stringify({ version: 1, segments: normalized }) : null
}

export function parseUserMessageClipboardPayload(raw: string): UserMessageSegment[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { version?: number; segments?: unknown }
    if (parsed.version !== 1) return []
    return parseUserMessageSegments(parsed.segments)
  } catch {
    return []
  }
}

export { JAIT_REF_MIME }

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
        name: typeof record.name === 'string' ? record.name : record.path.split(/[\\/]/).pop() ?? record.path,
        ...(record.kind === 'file' || record.kind === 'dir' ? { kind: record.kind } : {}),
        ...(parseLineRangeRecord(record) ? { lineRange: parseLineRangeRecord(record)! } : {}),
      })
      continue
    }
    if (record.type === 'workspace' && typeof record.path === 'string') {
      parsed.push({
        type: 'workspace',
        path: record.path,
        name: typeof record.name === 'string' ? record.name : record.path.split(/[\\/]/).pop() ?? record.path,
      })
      continue
    }
    if (record.type === 'terminal' && typeof record.terminalId === 'string') {
      parsed.push({
        type: 'terminal',
        terminalId: record.terminalId,
        name: typeof record.name === 'string' ? record.name : record.terminalId,
        ...(typeof record.workspaceRoot === 'string' ? { workspaceRoot: record.workspaceRoot } : {}),
        ...(parseLineRangeRecord(record) ? { lineRange: parseLineRangeRecord(record)! } : {}),
        ...(typeof record.selectedText === 'string' ? { selectedText: record.selectedText } : {}),
      })
      continue
    }
    if (
      record.type === 'image'
      && typeof record.data === 'string'
      && typeof record.mimeType === 'string'
      && record.mimeType.startsWith('image/')
    ) {
      parsed.push({
        type: 'image',
        data: record.data,
        mimeType: record.mimeType,
        name: typeof record.name === 'string' ? record.name : 'Image',
      })
    }
  }
  return normalizeUserMessageSegments(parsed)
}

export function normalizeLineRange(range: UserLineRange | null | undefined): UserLineRange | null {
  if (!range) return null
  const startLine = Number.isFinite(range.startLine) ? Math.max(1, Math.floor(range.startLine)) : 0
  const endLine = Number.isFinite(range.endLine) ? Math.max(startLine, Math.floor(range.endLine)) : 0
  return startLine > 0 && endLine >= startLine ? { startLine, endLine } : null
}

export function formatLineRange(range: UserLineRange | null | undefined): string {
  const normalized = normalizeLineRange(range)
  if (!normalized) return ''
  return normalized.startLine === normalized.endLine
    ? `line ${normalized.startLine}`
    : `lines ${normalized.startLine}-${normalized.endLine}`
}

function formatLineRangeSuffix(range: UserLineRange | null | undefined): string {
  const normalized = normalizeLineRange(range)
  if (!normalized) return ''
  return normalized.startLine === normalized.endLine
    ? `#L${normalized.startLine}`
    : `#L${normalized.startLine}-L${normalized.endLine}`
}

function referenceKey(id: string, range: UserLineRange | null | undefined): string {
  const normalized = normalizeLineRange(range)
  return normalized ? `${id}:L${normalized.startLine}-L${normalized.endLine}` : id
}

function parseLineRangeRecord(record: Record<string, unknown>): UserLineRange | null {
  const candidate = record.lineRange
  if (!candidate || typeof candidate !== 'object') return null
  const range = candidate as Record<string, unknown>
  return normalizeLineRange({
    startLine: typeof range.startLine === 'number' ? range.startLine : Number.NaN,
    endLine: typeof range.endLine === 'number' ? range.endLine : Number.NaN,
  })
}
