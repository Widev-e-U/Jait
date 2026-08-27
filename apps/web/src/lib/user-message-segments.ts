export interface UserReferencedFile {
  path: string
  name: string
  kind?: 'file' | 'dir'
  lineRange?: UserLineRange
}

export interface UserProjectReference {
  path: string
  name: string
}

export interface UserTerminalReference {
  terminalId: string
  name: string
  projectRoot?: string | null
  lineRange?: UserLineRange
  selectedText?: string
}

export interface UserSkillReference {
  id: string
  name: string
}

/** A reference to another chat session, dragged/copied into the composer. */
export interface UserChatReference {
  sessionId: string
  name: string
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

export interface UserFileAttachment {
  name: string
  mimeType: string
  data: string
}

const JAIT_REF_MIME = 'application/x-jait-user-message+json'

export type UserMessageSegment =
  | { type: 'text'; text: string }
  | ({ type: 'file' } & UserReferencedFile)
  | ({ type: 'project' } & UserProjectReference)
  | ({ type: 'terminal' } & UserTerminalReference)
  | ({ type: 'chat' } & UserChatReference)
  | ({ type: 'skill' } & UserSkillReference)
  | ({ type: 'image' } & UserImageAttachment)
  | ({ type: 'attachment' } & UserFileAttachment)

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

    if (segment.type === 'project') {
      if (!segment.path.trim()) continue
      normalized.push({
        type: 'project',
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
        ...(segment.projectRoot ? { projectRoot: segment.projectRoot } : {}),
        ...(normalizeLineRange(segment.lineRange) ? { lineRange: normalizeLineRange(segment.lineRange)! } : {}),
        ...(segment.selectedText ? { selectedText: segment.selectedText } : {}),
      })
      continue
    }

    if (segment.type === 'chat') {
      if (!segment.sessionId.trim()) continue
      normalized.push({
        type: 'chat',
        sessionId: segment.sessionId,
        name: segment.name || segment.sessionId,
      })
      continue
    }

    if (segment.type === 'skill') {
      if (!segment.id.trim()) continue
      normalized.push({
        type: 'skill',
        id: segment.id,
        name: segment.name || segment.id,
      })
      continue
    }

    if (segment.type === 'image') {
      if (!segment.data.trim() || !segment.mimeType.startsWith('image/')) continue
      normalized.push({
        type: 'image',
        name: segment.name || 'Image',
        mimeType: segment.mimeType,
        data: segment.data,
      })
      continue
    }

    if (!segment.data.trim() || segment.mimeType.startsWith('image/')) continue
    normalized.push({
      type: 'attachment',
      name: segment.name || 'Attachment',
      mimeType: segment.mimeType || 'application/octet-stream',
      data: segment.data,
    })
  }

  return normalized
}

export function userMessageTextFromSegments(segments: UserMessageSegment[] | null | undefined): string {
  return normalizeUserMessageSegments(segments)
    .filter((segment): segment is Extract<UserMessageSegment, { type: 'text' | 'skill' }> => segment.type === 'text' || segment.type === 'skill')
    .map((segment) => segment.type === 'text' ? segment.text : `/${segment.id} `)
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

export function userReferencedProjectsFromSegments(segments: UserMessageSegment[] | null | undefined): UserProjectReference[] {
  const projects: UserProjectReference[] = []
  const seen = new Set<string>()

  for (const segment of normalizeUserMessageSegments(segments)) {
    if (segment.type !== 'project' || seen.has(segment.path)) continue
    seen.add(segment.path)
    projects.push({ path: segment.path, name: segment.name })
  }

  return projects
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
      ...(segment.projectRoot ? { projectRoot: segment.projectRoot } : {}),
      ...(segment.lineRange ? { lineRange: segment.lineRange } : {}),
      ...(segment.selectedText ? { selectedText: segment.selectedText } : {}),
    })
  }

  return terminals
}

export function userReferencedChatsFromSegments(segments: UserMessageSegment[] | null | undefined): UserChatReference[] {
  const chats: UserChatReference[] = []
  const seen = new Set<string>()

  for (const segment of normalizeUserMessageSegments(segments)) {
    if (segment.type !== 'chat' || seen.has(segment.sessionId)) continue
    seen.add(segment.sessionId)
    chats.push({ sessionId: segment.sessionId, name: segment.name })
  }

  return chats
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
    if (segment.type === 'image' || segment.type === 'attachment') next.push(segment)
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
    if (segment.type === 'project') return `[project:${segment.path}]`
    if (segment.type === 'terminal') return `[terminal:${segment.terminalId}${formatLineRangeSuffix(segment.lineRange)}]`
    if (segment.type === 'chat') return `[chat:${segment.sessionId}]`
    if (segment.type === 'skill') return `/${segment.id} `
    if (segment.type === 'attachment') return `[attachment:${segment.name}]`
    return `[image:${segment.name}]`
  }).join('')
}

export function parseUserMessageMarkdown(markdown: string): UserMessageSegment[] {
  if (!markdown.includes('@') && !markdown.includes('[terminal:') && !markdown.includes('[project:') && !markdown.includes('[chat:') && !markdown.includes('/')) return []

  const segments: UserMessageSegment[] = []
  const pattern = /(^|[\s(])(?:@([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)(#L\d+(?:-L\d+)?)?|\[terminal:([A-Za-z0-9._:-]+)(#L\d+(?:-L\d+)?)?\]|\[project:([^\]]+)\]|\[chat:([A-Za-z0-9._:-]+)\])/g
  let lastIndex = 0

  for (const match of markdown.matchAll(pattern)) {
    const index = match.index ?? -1
    if (index < 0) continue
    const full = match[0] ?? ''
    const prefix = match[1] ?? ''
    const path = match[2]?.trim()
    const fileLineRange = parseLineRangeSuffix(match[3])
    const terminalId = match[4]?.trim()
    const terminalLineRange = parseLineRangeSuffix(match[5])
    const projectPath = match[6]?.trim()
    const chatSessionId = match[7]?.trim()
    const pathStart = index + prefix.length
    if (pathStart > lastIndex) {
      segments.push({ type: 'text', text: markdown.slice(lastIndex, pathStart) })
    }
    if (path) {
      segments.push({ type: 'file', path, name: path.split('/').pop() || path, ...(fileLineRange ? { lineRange: fileLineRange } : {}) })
      lastIndex = pathStart + 1 + path.length + (match[3]?.length ?? 0)
    } else if (terminalId) {
      segments.push({ type: 'terminal', terminalId, name: terminalId, ...(terminalLineRange ? { lineRange: terminalLineRange } : {}) })
      lastIndex = index + full.length
    } else if (projectPath) {
      segments.push({ type: 'project', path: projectPath, name: projectPath.split(/[\\/]/).pop() || projectPath })
      lastIndex = index + full.length
    } else if (chatSessionId) {
      segments.push({ type: 'chat', sessionId: chatSessionId, name: chatSessionId })
      lastIndex = index + full.length
    } else {
      segments.push({ type: 'text', text: full })
      lastIndex = index + full.length
    }
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: 'text', text: markdown.slice(lastIndex) })
  }

  const normalized = normalizeUserMessageSegments(segments)
  return normalized.some((segment) => segment.type === 'file' || segment.type === 'project' || segment.type === 'terminal' || segment.type === 'chat') ? normalized : []
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
    if (record.type === 'project' && typeof record.path === 'string') {
      parsed.push({
        type: 'project',
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
        ...(typeof record.projectRoot === 'string' ? { projectRoot: record.projectRoot } : {}),
        ...(parseLineRangeRecord(record) ? { lineRange: parseLineRangeRecord(record)! } : {}),
        ...(typeof record.selectedText === 'string' ? { selectedText: record.selectedText } : {}),
      })
      continue
    }
    if (record.type === 'chat' && typeof record.sessionId === 'string') {
      parsed.push({
        type: 'chat',
        sessionId: record.sessionId,
        name: typeof record.name === 'string' ? record.name : record.sessionId,
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
      continue
    }
    if (
      record.type === 'attachment'
      && typeof record.data === 'string'
      && typeof record.mimeType === 'string'
      && !record.mimeType.startsWith('image/')
    ) {
      parsed.push({
        type: 'attachment',
        data: record.data,
        mimeType: record.mimeType,
        name: typeof record.name === 'string' ? record.name : 'Attachment',
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

function parseLineRangeSuffix(suffix: string | null | undefined): UserLineRange | null {
  if (!suffix) return null
  const match = suffix.match(/^#L(\d+)(?:-L(\d+))?$/)
  if (!match) return null
  const startLine = Number.parseInt(match[1] ?? '', 10)
  const endLine = match[2] ? Number.parseInt(match[2], 10) : startLine
  return normalizeLineRange({ startLine, endLine })
}
