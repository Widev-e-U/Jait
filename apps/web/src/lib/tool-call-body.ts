export interface ToolCallBodyInput {
  tool: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'success' | 'error'
  displayOutput: string
  snapshotText: string | null
  screenshotPath: string | null
}

export type ToolCallBodyKind =
  | 'pending'
  | 'terminal'
  | 'browserSnapshot'
  | 'browserScreenshot'
  | 'editDiff'
  | 'subagent'
  | 'output'
  | 'runningHint'
  | 'none'

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function firstObject(...values: unknown[]): Record<string, unknown> | undefined {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  }
  return undefined
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore malformed provider payloads
  }
  return undefined
}

function truncate(value: string, max = 80): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function summarizeArgumentValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? truncate(trimmed, 48) : undefined
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`
  }
  if (value && typeof value === 'object') {
    return 'object'
  }
  return undefined
}

function humanizeArgumentKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
}

function extractPathLikeString(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const directPathMatch = trimmed.match(/(?:^|[\s:(['"`])((?:\/|\.\/|\.\.\/)?(?:[\w.@-]+\/)+[\w.@-]+(?:\.[\w-]+)?)/)
  if (directPathMatch?.[1]) return directPathMatch[1]

  const fileOnlyMatch = trimmed.match(/(?:^|[\s:(['"`])((?:\/|\.\/|\.\.\/)?[\w.@-]+(?:\/[\w.@-]+)*\.[\w-]+)/)
  if (fileOnlyMatch?.[1]) return fileOnlyMatch[1]

  return null
}

function isImagePath(value: string): boolean {
  return /\.(?:png|jpe?g|gif|webp)$/i.test(value.trim())
}

function firstPathFromChanges(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const path = firstNonEmptyString(
      (entry as Record<string, unknown>).path,
      (entry as Record<string, unknown>).file_path,
      (entry as Record<string, unknown>).filePath,
      (entry as Record<string, unknown>).file,
      (entry as Record<string, unknown>).filename,
    )
    if (path) return path
  }
  return undefined
}

function getInvocationObject(
  args: Record<string, unknown>,
  resultData?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return firstObject(
    args.action,
    args.input,
    args.arguments,
    parseJsonObject(args.action),
    parseJsonObject(args.input),
    parseJsonObject(args.arguments),
    resultData?.result,
    resultData,
    resultData?.input,
    resultData?.arguments,
    parseJsonObject(resultData?.input),
    parseJsonObject(resultData?.arguments),
    firstObject(resultData?.result)?.input,
    firstObject(resultData?.result)?.arguments,
    parseJsonObject(firstObject(resultData?.result)?.input),
    parseJsonObject(firstObject(resultData?.result)?.arguments),
  )
}

export function summarizeToolArguments(
  args: Record<string, unknown>,
  options?: { excludeKeys?: string[]; maxEntries?: number },
): string | null {
  const exclude = new Set(options?.excludeKeys ?? [])
  const maxEntries = options?.maxEntries ?? 3
  const parts = Object.entries(args)
    .filter(([key, value]) => !exclude.has(key) && value !== undefined && value !== null && value !== '')
    .slice(0, maxEntries)
    .flatMap(([key, value]) => {
      const summary = summarizeArgumentValue(value)
      return summary ? [`${humanizeArgumentKey(key)}: ${summary}`] : []
    })

  return parts.length > 0 ? parts.join(' • ') : null
}

export function getMcpToolLabel(
  args: Record<string, unknown>,
  resultData?: Record<string, unknown>,
): { title: string | null; details: string | null } {
  const nested = getInvocationObject(args, resultData)
  const title = firstNonEmptyString(
    args.recipient_name,
    args.recipientName,
    args.tool,
    args.toolName,
    args.name,
    nested?.recipient_name,
    nested?.recipientName,
    nested?.tool,
    nested?.toolName,
    nested?.name,
  ) ?? null

  const detailsSource = nested ?? args
  const details = summarizeToolArguments(detailsSource, {
    excludeKeys: ['recipient_name', 'recipientName', 'tool', 'toolName', 'name'],
    maxEntries: 4,
  })

  return { title, details }
}

export function getToolFilePath(
  tool: string,
  args: Record<string, unknown>,
  resultData?: Record<string, unknown>,
  resultMessage?: string | null,
): string | null {
  const normalizedTool = normalizeToolName(tool)
  if (normalizedTool !== 'edit' && normalizedTool !== 'file.write' && normalizedTool !== 'file.patch' && normalizedTool !== 'read' && normalizedTool !== 'file.read') {
    return null
  }

  const normalizedArgs = normalizeToolArgs(normalizedTool, args, resultData)
  const directPath = firstNonEmptyString(
    normalizedArgs.path,
    normalizedArgs.file_path,
    normalizedArgs.filePath,
    normalizedArgs.file,
    normalizedArgs.filename,
    normalizedArgs.target_file,
    normalizedArgs.targetFile,
    normalizedArgs.relative_path,
    normalizedArgs.name,
    normalizedArgs.title,
    firstPathFromChanges(normalizedArgs.changes),
  )
  if (directPath) return directPath

  const nested = getInvocationObject(args, resultData)
  const nestedPath = firstNonEmptyString(
    nested?.path,
    nested?.file_path,
    nested?.filePath,
    nested?.file,
    nested?.filename,
    nested?.target_file,
    nested?.targetFile,
    nested?.relative_path,
    nested?.name,
    nested?.title,
    firstPathFromChanges(nested?.changes),
  )
  if (nestedPath) return nestedPath

  return resultMessage ? extractPathLikeString(resultMessage) : null
}

export function getToolImagePath(
  tool: string,
  args: Record<string, unknown>,
  resultData?: Record<string, unknown>,
  resultMessage?: string | null,
): string | null {
  const normalizedTool = normalizeToolName(tool)
  const normalizedArgs = normalizeToolArgs(normalizedTool, args, resultData)
  const nested = getInvocationObject(args, resultData)

  const directPath = firstNonEmptyString(
    resultData?.path,
    firstObject(resultData?.result)?.path,
    normalizedArgs.path,
    normalizedArgs.file_path,
    normalizedArgs.filePath,
    normalizedArgs.file,
    normalizedArgs.filename,
    nested?.path,
    nested?.file_path,
    nested?.filePath,
    nested?.file,
    nested?.filename,
  )
  if (directPath && isImagePath(directPath)) return directPath

  const outputPath = firstNonEmptyString(
    resultData?.output,
    resultData?.content,
    firstObject(resultData?.result)?.output,
    firstObject(resultData?.result)?.content,
  )
  if (outputPath && isImagePath(outputPath)) return outputPath

  const messagePath = resultMessage ? extractPathLikeString(resultMessage) : null
  if (messagePath && isImagePath(messagePath)) return messagePath

  return null
}

export function normalizeToolName(name: string): string {
  const idx = name.indexOf('_')
  return idx === -1 ? name : name.slice(0, idx) + '.' + name.slice(idx + 1)
}

export function normalizeToolArgs(
  tool: string,
  args: Record<string, unknown>,
  resultData?: Record<string, unknown>,
): Record<string, unknown> {
  const normalizedTool = normalizeToolName(tool)
  const merged = { ...args }
  const nested = getInvocationObject(args, resultData)

  if (normalizedTool === 'edit' || normalizedTool === 'file.write' || normalizedTool === 'file.patch' || normalizedTool === 'read' || normalizedTool === 'file.read') {
    merged.path = firstNonEmptyString(
      merged.path,
      merged.file_path,
      merged.filePath,
      merged.file,
      merged.filename,
      merged.target_file,
      merged.targetFile,
      merged.relative_path,
      merged.name,
      merged.title,
      nested?.path,
      nested?.file_path,
      nested?.filePath,
      nested?.file,
      nested?.filename,
      nested?.target_file,
      nested?.targetFile,
      nested?.relative_path,
      nested?.name,
      nested?.title,
    ) ?? merged.path
  }

  if (normalizedTool === 'edit' || normalizedTool === 'file.patch') {
    merged.search = firstNonEmptyString(
      merged.search,
      merged.old_string,
      merged.oldString,
      merged.old_text,
      merged.oldText,
      nested?.search,
      nested?.old_string,
      nested?.oldString,
      nested?.old_text,
      nested?.oldText,
    ) ?? merged.search
    merged.replace = firstNonEmptyString(
      merged.replace,
      merged.new_string,
      merged.newString,
      merged.new_text,
      merged.newText,
      merged.replacement,
      nested?.replace,
      nested?.new_string,
      nested?.newString,
      nested?.new_text,
      nested?.newText,
      nested?.replacement,
    ) ?? merged.replace
    merged.content = firstNonEmptyString(
      merged.content,
      merged.new_file_contents,
      merged.newFileContents,
      merged.writtenContent,
      nested?.content,
      nested?.new_file_contents,
      nested?.newFileContents,
      nested?.writtenContent,
    ) ?? merged.content
  }

  if (normalizedTool === 'web' || normalizedTool === 'web.search' || normalizedTool === 'browser.search' || normalizedTool === 'browser.fetch' || normalizedTool === 'web.fetch') {
    merged.query = firstNonEmptyString(
      merged.query,
      merged.search_query,
      merged.searchQuery,
      merged.q,
      nested?.query,
      nested?.search_query,
      nested?.searchQuery,
      nested?.q,
    ) ?? merged.query
    merged.url = firstNonEmptyString(
      merged.url,
      merged.uri,
      merged.href,
      nested?.url,
      nested?.uri,
      nested?.href,
    ) ?? merged.url
  }

  return merged
}

export function canRenderEditDiff(tool: string, args: Record<string, unknown>): boolean {
  const normalizedTool = normalizeToolName(tool)
  const normalizedArgs = normalizeToolArgs(normalizedTool, args)

  if (normalizedTool === 'file.write') {
    return normalizedArgs.content != null
  }

  if (normalizedTool === 'file.patch') {
    return normalizedArgs.search != null && normalizedArgs.replace != null
  }

  if (normalizedTool === 'edit') {
    return normalizedArgs.content != null || (normalizedArgs.search != null && normalizedArgs.replace != null)
  }

  return false
}

export function getToolCallBodyKind(input: ToolCallBodyInput): ToolCallBodyKind {
  const normalizedTool = normalizeToolName(input.tool)
  const isTerminal = normalizedTool.startsWith('terminal.') || normalizedTool === 'execute'

  if (input.status === 'pending') return 'pending'
  if (isTerminal) return 'terminal'
  if (normalizedTool === 'browser.snapshot' && input.snapshotText) return 'browserSnapshot'
  if (input.screenshotPath) return 'browserScreenshot'
  if (normalizedTool === 'agent') return 'subagent'
  if (input.status === 'success' && canRenderEditDiff(normalizedTool, input.args)) return 'editDiff'
  if (input.displayOutput) return 'output'
  if (input.status === 'running') return 'runningHint'
  return 'none'
}
