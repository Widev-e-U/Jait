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

export function normalizeToolName(name: string): string {
  const idx = name.indexOf('_')
  return idx === -1 ? name : name.slice(0, idx) + '.' + name.slice(idx + 1)
}

export function canRenderEditDiff(tool: string, args: Record<string, unknown>): boolean {
  const normalizedTool = normalizeToolName(tool)

  if (normalizedTool === 'file.write') {
    return args.content != null
  }

  if (normalizedTool === 'file.patch') {
    return args.search != null && args.replace != null
  }

  if (normalizedTool === 'edit') {
    return args.content != null || (args.search != null && args.replace != null)
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
