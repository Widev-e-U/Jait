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
  const nested = firstObject(
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
  if (input.status === 'success' && canRenderEditDiff(normalizedTool, input.args)) return 'editDiff'
  if (input.displayOutput) return 'output'
  if (input.status === 'running') return 'runningHint'
  return 'none'
}
