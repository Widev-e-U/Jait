import { memo, useEffect, useRef, useState } from 'react'
import { Terminal, CheckCircle2, XCircle, Loader2, ChevronRight, FileText, Globe, Monitor, Server, ExternalLink, Search, ListTodo, Bot, Zap } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EditDiffView } from '@/components/chat/edit-diff-view'
import { FileIcon } from '@/components/icons/file-icons'
import { resolveChatImageUrl } from '@/lib/chat-image-url'
import { getMcpToolLabel, getToolCallBodyKind, getToolFilePath, getToolImagePath, normalizeToolArgs, normalizeToolName, summarizeToolArguments } from '@/lib/tool-call-body'
import { getApiUrl } from '@/lib/gateway-url'
import { cn } from '@/lib/utils'

/** Auto-scroll a container to the bottom when content changes */
function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [dep])
  return ref
}

export interface ToolCallInfo {
  callId: string
  tool: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'success' | 'error'
  result?: { ok: boolean; message: string; data?: unknown }
  streamingOutput?: string
  /** Accumulated raw JSON argument string while LLM is still streaming the tool call */
  streamingArgs?: string
  startedAt: number
  completedAt?: number
}

/**
 * OpenAI sends function names like `terminal_run`; internal tools use
 * dotted names like `terminal.run`. Normalize to dotted for all UI logic.
 */
function normalizeTool(name: string): string {
  return normalizeToolName(name)
}

const toolMeta: Record<string, { icon: typeof Terminal; label: string; color: string }> = {
  // ── Core tools ──────────────────────────────────────────
  'read':            { icon: FileText,  label: 'Read',        color: 'text-blue-500' },
  'edit':            { icon: FileText,  label: 'Edit',        color: 'text-blue-500' },
  'execute':         { icon: Terminal,  label: 'Execute',     color: 'text-yellow-500' },
  'search':          { icon: Search,    label: 'Search',      color: 'text-emerald-500' },
  'web':             { icon: Globe,     label: 'Web',         color: 'text-cyan-500' },
  'agent':           { icon: Bot,       label: 'Agent',       color: 'text-purple-500' },
  'todo':            { icon: ListTodo,  label: 'Todo',        color: 'text-orange-500' },
  'jait':            { icon: Zap,       label: 'Jait',        color: 'text-indigo-500' },
  'mcp-tool':        { icon: Server,    label: 'MCP Tool',   color: 'text-purple-500' },
  // ── Legacy / standard tools ─────────────────────────────
  'terminal.run':    { icon: Terminal,  label: 'Terminal',    color: 'text-yellow-500' },
  'terminal.stream': { icon: Terminal,  label: 'Terminal',    color: 'text-yellow-500' },
  'file.read':       { icon: FileText,  label: 'Read File',  color: 'text-blue-500' },
  'file.write':      { icon: FileText,  label: 'Write File', color: 'text-blue-500' },
  'file.patch':      { icon: FileText,  label: 'Patch File', color: 'text-blue-500' },
  'file.list':       { icon: FileText,  label: 'List Files', color: 'text-blue-500' },
  'file.stat':       { icon: FileText,  label: 'File Info',  color: 'text-blue-500' },
  'image.view':      { icon: Globe,     label: 'Image',      color: 'text-cyan-500' },
  'os.query':        { icon: Monitor,   label: 'System',     color: 'text-green-500' },
  'os.install':      { icon: Monitor,   label: 'Install',    color: 'text-green-500' },
  'surfaces.list':   { icon: Server,    label: 'Surfaces',   color: 'text-purple-500' },
  'surfaces.start':  { icon: Server,    label: 'Surfaces',   color: 'text-purple-500' },
  'surfaces.stop':   { icon: Server,    label: 'Surfaces',   color: 'text-purple-500' },
  'memory.save':     { icon: FileText,  label: 'Save Memory', color: 'text-amber-500' },
  'memory.search':   { icon: FileText,  label: 'Search Memory', color: 'text-amber-500' },
  'memory.forget':   { icon: FileText,  label: 'Forget Memory', color: 'text-amber-500' },
  'cron.add':        { icon: Server,    label: 'Add Cron',   color: 'text-violet-500' },
  'cron.list':       { icon: Server,    label: 'List Cron',  color: 'text-violet-500' },
  'cron.update':     { icon: Server,    label: 'Update Cron', color: 'text-violet-500' },
  'cron.remove':     { icon: Server,    label: 'Remove Cron', color: 'text-violet-500' },
  'web.search':      { icon: Globe,     label: 'Search',     color: 'text-cyan-500' },
  'web.fetch':       { icon: Globe,     label: 'Fetch',      color: 'text-cyan-500' },
  'browser.navigate': { icon: Globe,    label: 'Navigate',   color: 'text-cyan-500' },
  'browser.snapshot': { icon: Globe,    label: 'Snapshot',   color: 'text-cyan-500' },
  'browser.click':    { icon: Globe,    label: 'Click',      color: 'text-cyan-500' },
  'browser.type':     { icon: Globe,    label: 'Type',       color: 'text-cyan-500' },
  'browser.scroll':   { icon: Globe,    label: 'Scroll',     color: 'text-cyan-500' },
  'browser.select':   { icon: Globe,    label: 'Select',     color: 'text-cyan-500' },
  'browser.wait':     { icon: Globe,    label: 'Wait',       color: 'text-cyan-500' },
  'browser.screenshot': { icon: Globe,  label: 'Screenshot', color: 'text-cyan-500' },
  'browser.search':   { icon: Globe,    label: 'Search',     color: 'text-cyan-500' },
  'browser.fetch':    { icon: Globe,    label: 'Fetch',      color: 'text-cyan-500' },
  'preview.open':     { icon: Globe,    label: 'Preview',    color: 'text-cyan-500' },
}

function getToolMeta(tool: string) {
  const normalized = normalizeTool(tool)
  return toolMeta[normalized] ?? { icon: Terminal, label: normalized, color: 'text-muted-foreground' }
}

/** Convert an unknown tool arg to a display string, never returning [object Object] */
function displayStr(value: unknown, fallback = ''): string {
  if (value == null) return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} item(s)`
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // Try common string fields that providers might nest
    for (const key of ['text', 'content', 'message', 'name', 'path', 'value', 'description']) {
      if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string
    }
    const keys = Object.keys(obj)
    return keys.length > 0 ? `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}` : fallback
  }
  return fallback
}

function truncate(value: string, max = 64): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function countLines(value: string): number {
  if (!value) return 0
  return value.split('\n').length
}

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/').trim()
  if (!normalized) return ''
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? normalized
}

function getUrlHost(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    return new URL(value).host || null
  } catch {
    return null
  }
}

function summarizeUrlTargets(values: unknown[]): string | null {
  const hosts = values
    .map((value) => getUrlHost(value))
    .filter((host): host is string => Boolean(host))

  if (hosts.length === 0) return null

  const uniqueHosts = Array.from(new Set(hosts))
  if (uniqueHosts.length === 1) return uniqueHosts[0]!
  if (uniqueHosts.length === 2) return `${uniqueHosts[0]} + ${uniqueHosts[1]}`
  return `${uniqueHosts[0]} +${uniqueHosts.length - 1} more`
}

function firstDisplayString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function extractSiteFromText(value: string | null | undefined): string | null {
  if (!value) return null

  const urlMatch = value.match(/https?:\/\/[^\s)`\]]+/i)
  if (urlMatch?.[0]) return getUrlHost(urlMatch[0])

  const domainMatch = value.match(/`([a-z0-9.-]+\.[a-z]{2,})`/i)
  if (domainMatch?.[1]) return domainMatch[1]

  const plainDomainMatch = value.match(/\b([a-z0-9.-]+\.[a-z]{2,})\b/i)
  if (plainDomainMatch?.[1]) return plainDomainMatch[1]

  return null
}

function isEditLikeTool(tool: string): boolean {
  const normalized = normalizeTool(tool)
  return normalized === 'edit' || normalized === 'file.write' || normalized === 'file.patch'
}

function getEditDiffCountLabel(tool: string, args: Record<string, unknown>): string | null {
  const normalized = normalizeTool(tool)
  const normalizedArgs = normalizeToolArgs(normalized, args)
  const search = typeof normalizedArgs.search === 'string' ? normalizedArgs.search : ''
  const replace = typeof normalizedArgs.replace === 'string' ? normalizedArgs.replace : ''
  const content = typeof normalizedArgs.content === 'string' ? normalizedArgs.content : ''

  if (normalized === 'file.write') {
    const added = countLines(content)
    return added > 0 ? `+${added}` : null
  }

  if (normalized === 'file.patch' || normalized === 'edit') {
    if (search || replace) {
      const removed = countLines(search)
      const added = countLines(replace)
      return `+${added} -${removed}`
    }
    if (content) {
      const added = countLines(content)
      return added > 0 ? `+${added}` : null
    }
  }

  return null
}

/** Format a tool call's primary display text (e.g. the command or file path) */
function getCallSummary(
  tool: string,
  args: Record<string, unknown>,
  resultData?: Record<string, unknown>,
  resultMessage?: string | null,
): string {
  const normalized = normalizeTool(tool)
  const normalizedArgs = normalizeToolArgs(normalized, args)
  // ── Core tools ──────────────────────────────────────────
  if (normalized === 'read') return displayStr(normalizedArgs.path)
  if (normalized === 'edit') {
    const path = displayStr(normalizedArgs.path)
    const fileName = getBaseName(path)
    const diffCount = getEditDiffCountLabel(normalized, normalizedArgs)
    if (normalizedArgs.search) return `${fileName}${diffCount ? ` (${diffCount})` : ' (patch)'}`
    if (diffCount) return `${fileName} (${diffCount})`
    return fileName
  }
  if (normalized === 'execute') return displayStr(normalizedArgs.command ?? args.command)
  if (normalized === 'search') {
    const pattern = displayStr(normalizedArgs.pattern ?? args.pattern)
    const mode = displayStr(normalizedArgs.mode ?? args.mode, 'content')
    return mode === 'files' ? `Find: ${pattern}` : pattern
  }
  if (normalized === 'web') {
    if (normalizedArgs.url) return getUrlHost(normalizedArgs.url) ?? displayStr(normalizedArgs.url)
    if (Array.isArray(normalizedArgs.urls)) {
      return summarizeUrlTargets(normalizedArgs.urls) ?? `${normalizedArgs.urls.length} URLs`
    }
    const resultSite = extractSiteFromText(
      firstDisplayString(
        resultMessage,
        typeof resultData?.url === 'string' ? resultData.url : undefined,
        typeof resultData?.finalUrl === 'string' ? resultData.finalUrl : undefined,
        typeof resultData?.content === 'string' ? resultData.content : undefined,
      ),
    )
    if (resultSite) return resultSite
    return displayStr(normalizedArgs.query)
  }
  if (normalized === 'agent') return truncate(displayStr(args.description ?? args.prompt), 80)
  if (normalized === 'todo') {
    const list = args.todoList as Array<{ title: string; status: string }> | undefined
    if (!list) return 'Track tasks'
    const inProgress = list.filter(t => t.status === 'in-progress')
    if (inProgress.length) return truncate(inProgress[0].title, 60)
    return `${list.length} task(s)`
  }
  if (normalized === 'jait') {
    const action = displayStr(args.action)
    if (action.startsWith('memory.')) return `${action}: ${truncate(displayStr(args.query ?? args.content), 60)}`
    if (action.startsWith('cron.')) return `${action}: ${truncate(displayStr(args.name ?? args.id), 40)}`
    return action || 'jait'
  }
  if (normalized === 'mcp-tool') {
    const mcp = getMcpToolLabel(normalizedArgs)
    if (mcp.title && mcp.details) return `${mcp.title} • ${mcp.details}`
    if (mcp.title) return mcp.title
    if (mcp.details) return mcp.details
  }
  // ── Legacy tools ─────────────────────────────────────────
  if (normalized.startsWith('terminal.')) return displayStr(normalizedArgs.command ?? args.command)
  if (normalized === 'file.write' || normalized === 'file.patch') {
    const path = displayStr(normalizedArgs.path)
    const diffCount = getEditDiffCountLabel(normalized, normalizedArgs)
    return diffCount ? `${path} (${diffCount})` : path
  }
  if (normalized.startsWith('file.')) return displayStr(normalizedArgs.path)
  if (normalized === 'memory.save') {
    const scope = displayStr(args.scope, 'memory')
    const content = displayStr(args.content).trim()
    return content ? `${scope}: ${truncate(content, 80)}` : `scope: ${scope}`
  }
  if (normalized === 'memory.search') return displayStr(args.query)
  if (normalized === 'memory.forget') return displayStr(args.id)
  if (normalized === 'cron.add') {
    const name = displayStr(args.name, 'job')
    const cron = displayStr(args.cron)
    const toolName = displayStr(args.toolName)
    if (cron && toolName) return `${name} (${cron}) -> ${toolName}`
    if (cron) return `${name} (${cron})`
    return name
  }
  if (normalized === 'cron.update') {
    const id = displayStr(args.id, 'job')
    const cron = displayStr(args.cron)
    return cron ? `${id} (${cron})` : id
  }
  if (normalized === 'cron.remove') return displayStr(args.id)
  if (normalized === 'cron.list') return 'List cron jobs'
  if (tool === 'os.query') return displayStr(args.query)
  if (tool === 'os.install') return displayStr(args.package)
  if (normalized === 'browser.navigate') return getUrlHost(normalizedArgs.url) ?? displayStr(normalizedArgs.url)
  if (normalized === 'browser.snapshot') return 'Describe page'
  if (normalized === 'browser.click') return displayStr(args.selector)
  if (normalized === 'browser.type') return `${displayStr(args.selector)} ← ${displayStr(args.text)}`
  if (normalized === 'browser.scroll') return `x:${displayStr(args.x, '0')} y:${displayStr(args.y, '0')}`
  if (normalized === 'browser.select') return `${displayStr(args.selector)} = ${displayStr(args.value)}`
  if (normalized === 'browser.wait') return `${displayStr(args.selector)} (${displayStr(args.timeoutMs, '10000')}ms)`
  if (normalized === 'browser.screenshot') return displayStr(args.path, 'auto path')
  if (normalized === 'browser.search') return displayStr(normalizedArgs.query) || extractSiteFromText(resultMessage) || 'search'
  if (normalized === 'browser.fetch') return getUrlHost(normalizedArgs.url) ?? extractSiteFromText(resultMessage) ?? displayStr(normalizedArgs.url)
  if (normalized === 'preview.open') return displayStr(normalizedArgs.target ?? args.target)
  if (normalized === 'surfaces.start') return `Start ${displayStr(args.type, 'surface')}`
  if (normalized === 'surfaces.stop') return `Stop ${displayStr(args.surfaceId, 'surface')}`
  if (normalized === 'surfaces.list') return 'List surfaces'
  const genericSummary = summarizeToolArguments(normalizedArgs)
  if (genericSummary) return genericSummary
  return `${Object.keys(args ?? {}).length} argument(s)`
}

/** Pretty formatter for os.query info results */
function formatSystemInfo(data: Record<string, unknown>): string {
  const lines: string[] = []
  const gb = (v: unknown) => `${v} GB`
  const maybe = (label: string, key: string, fmt?: (v: unknown) => string) => {
    if (data[key] != null) lines.push(`${label}: ${fmt ? fmt(data[key]) : data[key]}`)
  }

  maybe('OS', 'osEdition')
  if (!data.osEdition) {
    const parts = [data.type, data.platform, data.release].filter(Boolean)
    if (parts.length) lines.push(`OS: ${parts.join(' ')}`)
  }
  maybe('Host', 'hostname')
  maybe('User', 'user')
  maybe('Arch', 'arch')
  maybe('CPU', 'cpuModel', v => `${v} (${data.cpus ?? '?'} cores)`)
  maybe('Memory', 'totalMemoryGB', v => `${gb(data.freeMemoryGB)} free / ${gb(v)} total`)
  maybe('Disk', 'diskFreeGB', v => `${gb(v)} free / ${gb(+(Number(data.diskUsedGB ?? 0) + Number(v)))} total`)
  maybe('Uptime', 'uptimeHours', v => `${v}h`)
  lines.push('') // spacer
  maybe('CWD', 'cwd')
  maybe('Node', 'nodeVersion')
  maybe('Bun', 'bunVersion')
  maybe('Shell', 'shellVersion')
  maybe('Git', 'gitBranch', v => {
    const dirty = data.gitDirtyFiles
    return dirty ? `${v} (${dirty} dirty)` : String(v)
  })
  return lines.join('\n')
}

function formatSearchResults(data: Record<string, unknown>): string | null {
  const rawResults = data.results
  if (!Array.isArray(rawResults) || rawResults.length === 0) return null

  const lines: string[] = []
  const summary = typeof data.summary === 'string' ? data.summary.trim() : ''
  if (summary) {
    lines.push(summary)
    lines.push('')
  }

  const results = rawResults
    .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
    .slice(0, 5)

  for (let i = 0; i < results.length; i++) {
    const entry = results[i]!
    const title = typeof entry.title === 'string' ? entry.title.trim() : ''
    const url = typeof entry.url === 'string' ? entry.url.trim() : ''
    const snippet = typeof entry.snippet === 'string' ? entry.snippet.trim() : ''
    lines.push(`${i + 1}. ${title || url || 'Result'}`)
    if (url) lines.push(`   ${url}`)
    if (snippet) lines.push(`   ${snippet}`)
    if (i < results.length - 1) lines.push('')
  }

  return lines.join('\n').trim() || null
}

function formatFetchedResults(data: Record<string, unknown>): string | null {
  const rawResults = data.results
  if (!Array.isArray(rawResults) || rawResults.length === 0) return null

  const results = rawResults
    .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
    .slice(0, 5)

  const lines: string[] = []
  for (let i = 0; i < results.length; i++) {
    const entry = results[i]!
    const url = typeof entry.url === 'string' ? entry.url.trim() : ''
    const message = typeof entry.message === 'string' ? entry.message.trim() : ''
    const content = typeof entry.content === 'string' ? entry.content.trim() : ''
    lines.push(`${i + 1}. ${url || `Result ${i + 1}`}`)
    if (message) lines.push(`   ${message}`)
    if (content) lines.push(`   ${truncate(content, 240)}`)
    if (i < results.length - 1) lines.push('')
  }

  return lines.join('\n').trim() || null
}

function formatMemorySaveResult(data: Record<string, unknown>): string | null {
  const id = typeof data.id === 'string' ? data.id : ''
  const scope = typeof data.scope === 'string' ? data.scope : ''
  const content = typeof data.content === 'string' ? data.content : ''
  const source = data.source && typeof data.source === 'object'
    ? data.source as Record<string, unknown>
    : undefined
  const sourceType = typeof source?.type === 'string' ? source.type : ''
  const sourceId = typeof source?.id === 'string' ? source.id : ''
  const sourceSurface = typeof source?.surface === 'string' ? source.surface : ''
  const expiresAt = typeof data.expiresAt === 'string' ? data.expiresAt : ''

  const lines: string[] = []
  if (id) lines.push(`Memory saved: ${id}`)
  if (scope) lines.push(`Scope: ${scope}`)
  if (content) lines.push(`Content: ${truncate(content, 240)}`)
  if (sourceType || sourceId || sourceSurface) {
    const sourceParts = [sourceType, sourceId, sourceSurface].filter(Boolean)
    lines.push(`Source: ${sourceParts.join(' / ')}`)
  }
  if (expiresAt) lines.push(`Expires: ${expiresAt}`)

  return lines.length > 0 ? lines.join('\n') : null
}

function formatCronAddResult(data: Record<string, unknown>): string | null {
  const id = typeof data.id === 'string' ? data.id : ''
  const name = typeof data.name === 'string' ? data.name : ''
  const cron = typeof data.cron === 'string' ? data.cron : ''
  const toolName = typeof data.toolName === 'string' ? data.toolName : ''
  const enabled = typeof data.enabled === 'boolean' ? data.enabled : undefined

  const lines: string[] = []
  if (id) lines.push(`Cron job created: ${id}`)
  if (name) lines.push(`Name: ${name}`)
  if (cron) lines.push(`Schedule: ${cron}`)
  if (toolName) lines.push(`Tool: ${toolName}`)
  if (enabled != null) lines.push(`Enabled: ${enabled ? 'yes' : 'no'}`)

  return lines.length > 0 ? lines.join('\n') : null
}

/** Safely convert any value to a display string, never returning [object Object] */
export function safeStringify(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '(complex value)'
  }
}

export function formatStructuredValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const textBlocks = value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const block = entry as Record<string, unknown>
      return typeof block.text === 'string' ? [block.text] : []
    })
    if (textBlocks.length > 0) return textBlocks.join('\n\n')
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '(complex value)'
  }
}

/** Format the output data from a tool result */
function formatOutput(result: ToolCallInfo['result'], tool?: string): string {
  if (!result) return ''
  const data = result.data as Record<string, unknown> | undefined
  const normalizedTool = normalizeTool(tool ?? '')

  // Rich system info display
  if (normalizedTool === 'os.query' && data && data.platform != null) {
    return formatSystemInfo(data)
  }
  if ((normalizedTool === 'web.search' || normalizedTool === 'browser.search' || (normalizedTool === 'web' && Array.isArray(data?.results) && typeof data?.query === 'string')) && data) {
    const formatted = formatSearchResults(data)
    if (formatted) return formatted
  }
  if (normalizedTool === 'web' && data && Array.isArray(data.results)) {
    const formatted = formatFetchedResults(data)
    if (formatted) return formatted
  }
  if (normalizedTool === 'memory.save' && data) {
    const formatted = formatMemorySaveResult(data)
    if (formatted) return formatted
  }
  if (normalizedTool === 'cron.add' && data) {
    const formatted = formatCronAddResult(data)
    if (formatted) return formatted
  }
  // Agent/subagent: return content for the SubAgentHistoryView to parse from data
  if (normalizedTool === 'agent' && data) {
    const content = typeof data.content === 'string' ? data.content : ''
    if (content) return content
    // Fall through to result.message
  }

  if (data?.output != null) return formatStructuredValue(data.output) ?? ''
  if (data?.content != null) return formatStructuredValue(data.content) ?? ''
  if (data?.entries != null) {
    const raw = data.entries as Array<string | { name: string; isDirectory?: boolean }>
    return raw
      .map(e => {
        if (typeof e === 'string') {
          const isDir = e.endsWith('/')
          return `${isDir ? '📁' : '📄'} ${isDir ? e.slice(0, -1) : e}`
        }
        return `${e.isDirectory ? '📁' : '📄'} ${e.name}`
      })
      .join('\n')
  }
  if (result.message && result.message !== 'Command executed successfully') return result.message
  if (data) return safeStringify(data)
  return result.message
}

function ElapsedLabel({ startedAt, completedAt, now }: { startedAt: number; completedAt?: number; now?: number }) {
  const ms = (completedAt ?? now ?? Date.now()) - startedAt
  if (ms < 1000) return <span>{ms}ms</span>
  return <span>{(ms / 1000).toFixed(1)}s</span>
}

function getRunningHint(tool: string, args: Record<string, unknown>): string {
  const normalized = normalizeTool(tool)
  if (normalized === 'memory.save') return 'Saving memory entry...'
  if (normalized === 'cron.add') return 'Creating cron job...'
  if (tool === 'browser.navigate' || tool === 'web.fetch' || tool === 'browser.fetch') {
    const target = String(args.url ?? '').trim()
    return target ? `Connecting to ${target}...` : 'Connecting...'
  }
  if (tool === 'web.search' || tool === 'browser.search') {
    const query = String(args.query ?? '').trim()
    return query ? `Searching for "${query}"...` : 'Searching...'
  }
  if (normalized === 'agent') return 'Sub-agent is working...'
  if (tool.startsWith('terminal.') || tool === 'execute') return 'Command is still running...'
  return 'Tool is still running...'
}

function isTerminalTool(tool: string): boolean {
  const n = normalizeTool(tool)
  return n.startsWith('terminal.') || n === 'execute'
}

function getTerminalOutcomeBadge(call: ToolCallInfo): { label: string; className: string } | null {
  if (!isTerminalTool(call.tool)) return null
  if (call.status === 'running' || call.status === 'pending') return null

  const data = call.result?.data && typeof call.result.data === 'object'
    ? call.result.data as Record<string, unknown>
    : undefined

  const timedOut = data?.timedOut === true || /timed out/i.test(call.result?.message ?? '')
  if (timedOut) {
    return {
      label: 'timeout',
      className: 'border-red-500/40 bg-red-500/10 text-red-500',
    }
  }

  const exitCodeRaw = data?.exitCode
  if (typeof exitCodeRaw === 'number') {
    const isOk = exitCodeRaw === 0
    return {
      label: `exit ${exitCodeRaw}`,
      className: isOk
        ? 'border-green-500/40 bg-green-500/10 text-green-500'
        : 'border-red-500/40 bg-red-500/10 text-red-500',
    }
  }

  const msg = call.result?.message ?? ''
  const exitMatch = msg.match(/exit code\s+(-?\d+)/i)
  if (exitMatch) {
    const code = Number.parseInt(exitMatch[1] ?? '', 10)
    if (Number.isFinite(code)) {
      const isOk = code === 0
      return {
        label: `exit ${code}`,
        className: isOk
          ? 'border-green-500/40 bg-green-500/10 text-green-500'
          : 'border-red-500/40 bg-red-500/10 text-red-500',
      }
    }
  }

  return null
}

interface SubAgentToolCall {
  callId?: string
  tool: string
  args?: unknown
  ok: boolean
  message: string
  data?: unknown
  startedAt?: number
  completedAt?: number
}

function SubAgentHistoryView({ data, message, status }: { data: Record<string, unknown>; message?: string; status?: 'pending' | 'running' | 'success' | 'error' }) {
  const toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls as SubAgentToolCall[] : []
  const content = typeof data.content === 'string' ? data.content.trim() : ''
  const rounds = typeof data.rounds === 'number' ? data.rounds : null
  const durationMs = typeof data.durationMs === 'number' ? data.durationMs : null
  const isRunning = status === 'running'

  const nestedCalls: ToolCallInfo[] = toolCalls.map((tc, i) => ({
    callId: tc.callId ?? `sub-${i}`,
    tool: tc.tool,
    args: (tc.args && typeof tc.args === 'object' && !Array.isArray(tc.args))
      ? tc.args as Record<string, unknown>
      : {},
    status: tc.ok ? 'success' : 'error',
    result: { ok: tc.ok, message: tc.message, data: tc.data },
    startedAt: tc.startedAt ?? 0,
    completedAt: tc.completedAt,
  }))

  return (
    <div className="rounded-lg border border-purple-500/20 bg-purple-500/[0.03] text-xs">
      {(isRunning || rounds != null || toolCalls.length > 0 || durationMs != null) && (
        <div className="flex items-center justify-end gap-2 border-b border-purple-500/15 px-3 py-2 text-[11px] text-muted-foreground">
          {isRunning && <Loader2 className="h-3 w-3 animate-spin text-purple-500" />}
          {rounds != null && <span>{rounds} round{rounds !== 1 ? 's' : ''}</span>}
          {toolCalls.length > 0 && <span>{toolCalls.length} tool{toolCalls.length !== 1 ? 's' : ''}</span>}
          {durationMs != null && (
            <span>{durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}</span>
          )}
        </div>
      )}

      {/* Running indicator when no nested calls yet */}
      {isRunning && nestedCalls.length === 0 && !content && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground">
          Agent is working...
        </div>
      )}

      {/* Nested tool calls rendered as full ToolCallCards */}
      {nestedCalls.length > 0 && (
        <div className="divide-y divide-border/30">
          {nestedCalls.map((call) => (
            <ToolCallCard key={call.callId} call={call} />
          ))}
        </div>
      )}

      {/* Final output */}
      {content && (
        <div className="border-t border-purple-500/15 px-3 py-2">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">Result</div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 font-mono text-[11px] leading-5">
            {content}
          </pre>
        </div>
      )}

      {/* Fallback to message if no content */}
      {!content && message && (
        <div className="border-t border-purple-500/15 px-3 py-2">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">Result</div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 font-mono text-[11px] leading-5">
            {message}
          </pre>
        </div>
      )}
    </div>
  )
}

function BrowserSnapshotView({ snapshot }: { snapshot: string }) {
  const lines = snapshot.split('\n')
  const url = lines.find((line) => line.startsWith('URL: '))?.replace('URL: ', '').trim()
  const title = lines.find((line) => line.startsWith('Title: '))?.replace('Title: ', '').trim()
  const splitIndex = lines.findIndex((line) => line.trim() === 'Interactive elements:')
  const textSection = splitIndex >= 0
    ? lines.slice(0, splitIndex)
    : lines
  const textStart = textSection.findIndex((line) => line.trim() === 'Text:')
  const textContent = textStart >= 0
    ? textSection.slice(textStart + 1).join('\n').trim()
    : ''
  const elements = splitIndex >= 0
    ? lines.slice(splitIndex + 1).map((line) => line.trim()).filter(Boolean)
    : []

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
      <div>
        <div className="font-semibold text-foreground/90">Browser snapshot</div>
        {title ? <div className="text-muted-foreground">{title}</div> : null}
        {url ? <div className="font-mono text-[11px] break-all">{url}</div> : null}
      </div>
      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Text</div>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] leading-5">
          {textContent || '(no textual content)'}
        </pre>
      </div>
      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Interactive elements</div>
        {elements.length ? (
          <ul className="max-h-40 space-y-1 overflow-auto rounded bg-background p-2 font-mono text-[11px]">
            {elements.map((elementLine, index) => (
              <li key={`${elementLine}-${index}`} className="break-all">{elementLine}</li>
            ))}
          </ul>
        ) : (
          <div className="rounded bg-background p-2 text-muted-foreground">No interactive elements found.</div>
        )}
      </div>
    </div>
  )
}

function BrowserScreenshotView({ path }: { path: string }) {
  const [coords, setCoords] = useState<{ x: number; y: number; xp: number; yp: number } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const trimmedPath = path.trim()
  const src = resolveChatImageUrl(trimmedPath) ?? `${getApiUrl()}/api/browser/screenshot?path=${encodeURIComponent(trimmedPath)}`

  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 text-xs">
      <div className="text-[11px] text-muted-foreground">Screenshot path: <span className="font-mono break-all">{trimmedPath}</span></div>
      <div className="overflow-hidden rounded-md bg-background/90 ring-1 ring-inset ring-border/35">
        <img
          src={src}
          alt="Browser screenshot"
          className="max-h-80 w-full cursor-crosshair object-contain"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const x = event.clientX - rect.left
            const y = event.clientY - rect.top
            setCoords({
              x: Math.round(x),
              y: Math.round(y),
              xp: Math.round((x / rect.width) * 100),
              yp: Math.round((y / rect.height) * 100),
            })
          }}
        />
      </div>
      {!loaded && (
        <div className="rounded bg-background p-2 text-muted-foreground">
          Preview unavailable in browser. Open the screenshot path directly from the host environment.
        </div>
      )}
      {coords ? (
        <div className="rounded bg-background p-2 font-mono text-[11px]">
          click: x={coords.x}px y={coords.y}px ({coords.xp}%, {coords.yp}%)
        </div>
      ) : null}
    </div>
  )
}

function getStructuredTerminalId(call: ToolCallInfo): string | null {
  const argTerminalId = typeof call.args.terminalId === 'string' ? call.args.terminalId : null
  if (argTerminalId) return argTerminalId

  const data = call.result?.data
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    const dataTerminalId = typeof record.terminalId === 'string' ? record.terminalId : null
    if (dataTerminalId) return dataTerminalId
    const dataId = typeof record.id === 'string' ? record.id : null
    if (dataId) return dataId
    const dataSurfaceId = typeof record.surfaceId === 'string' ? record.surfaceId : null
    if (dataSurfaceId) return dataSurfaceId
  }

  return null
}

function isTerminalCreationCall(call: ToolCallInfo): boolean {
  const normalizedTool = normalizeTool(call.tool)
  if (normalizedTool === 'surfaces.start') {
    if (call.args.type === 'terminal') return getStructuredTerminalId(call) !== null

    const data = call.result?.data
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>
      if (record.type === 'terminal') return getStructuredTerminalId(call) !== null
    }
    return false
  }

  if (normalizedTool === 'execute' || normalizedTool.startsWith('terminal.')) {
    return getStructuredTerminalId(call) !== null
  }

  return false
}

// ── Pending tool call components ─────────────────────────────────

/** Try to extract the command being built from partial JSON args */
function extractStreamingCommand(streamingArgs: string | undefined): string | null {
  if (!streamingArgs) return null
  // The LLM streams JSON like: {"command":"echo hello...
  // Try to pull out the value after "command":"
  const m = streamingArgs.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)/)
  if (m) {
    // Un-escape common JSON escapes for display
    return m[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return null
}

function extractStreamingStringField(streamingArgs: string | undefined, key: string): string | null {
  if (!streamingArgs) return null
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`"${escapedKey}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`)
  const match = streamingArgs.match(pattern)
  if (!match) return null
  return match[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function extractStreamingWebTarget(streamingArgs: string | undefined): string | null {
  if (!streamingArgs) return null
  const direct = extractStreamingStringField(streamingArgs, 'url')
    ?? extractStreamingStringField(streamingArgs, 'uri')
    ?? extractStreamingStringField(streamingArgs, 'href')
    ?? extractStreamingStringField(streamingArgs, 'query')
    ?? extractStreamingStringField(streamingArgs, 'q')

  if (direct) return getUrlHost(direct) ?? direct

  const type = extractStreamingStringField(streamingArgs, 'type')
  const action = extractStreamingStringField(streamingArgs, 'action')
  if (type === 'webSearch' || action === 'webSearch') return 'web search'
  if (type === 'fetch' || action === 'fetch') return 'website'
  return null
}

/** Header label shown while the tool call is being streamed (pending state) */
function PendingToolLabel({ tool, streamingArgs }: { tool: string; streamingArgs?: string }) {
  // Normalise OpenAI name (terminal_run → terminal.run) for meta lookup
  const normalized = normalizeTool(tool)
  const meta = toolMeta[normalized]
  const isTerminalTool = normalized.startsWith('terminal.')
  const command = isTerminalTool ? extractStreamingCommand(streamingArgs) : null
  const isWebTool = normalized === 'web' || normalized === 'web.search' || normalized === 'web.fetch' || normalized === 'browser.search' || normalized === 'browser.fetch'
  const webTarget = isWebTool ? extractStreamingWebTarget(streamingArgs) : null

  if (meta && isTerminalTool && command) {
    // Terminal with partial command — show like the running state
    return (
      <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-foreground">
        <span className="shrink-0 text-xs text-emerald-500 dark:text-emerald-400 font-mono">$</span>
        <code className="min-w-0 truncate text-xs font-mono">{command}</code>
        <span className="inline-block w-1 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
      </span>
    )
  }

  if (meta && isWebTool && webTarget) {
    return (
      <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-foreground">
        <span>{meta.label}:</span>
        <code className="min-w-0 truncate text-xs font-mono">{webTarget}</code>
        <span className="inline-block w-1 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
      </span>
    )
  }

  if (meta) {
    // Known tool, name fully streamed — show its label
    return (
      <span className="text-blue-400">
        {meta.label}
        <span className="inline-block w-1 h-3 bg-blue-400 animate-pulse ml-1 align-text-bottom" />
      </span>
    )
  }

  // Still streaming the tool name character by character
  if (!tool) return <span className="text-muted-foreground">Preparing...</span>
  return (
    <span className="text-blue-400">
      <code className="text-xs font-mono">{tool}</code>
      <span className="inline-block w-1 h-3 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
    </span>
  )
}

/** Body content shown while the tool call is being streamed (pending state) */
function PendingToolBody({ tool, streamingArgs, scrollRef }: { tool: string; streamingArgs?: string; scrollRef: React.RefObject<HTMLPreElement | null> }) {
  const normalized = normalizeTool(tool)
  const isTerminalTool = normalized.startsWith('terminal.')
  const command = isTerminalTool ? extractStreamingCommand(streamingArgs) : null
  const isWebTool = normalized === 'web' || normalized === 'web.search' || normalized === 'web.fetch' || normalized === 'browser.search' || normalized === 'browser.fetch'
  const webTarget = isWebTool ? extractStreamingWebTarget(streamingArgs) : null

  // Terminal with partial command — show the command being built (no raw JSON)
  if (isTerminalTool && command) {
    return (
      <pre ref={scrollRef} className={cn(
        'text-xs font-mono leading-5 rounded-md px-3 py-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all',
        'bg-muted/40 text-foreground',
      )}>
        <span className="text-emerald-400">$ </span>
        {command}
        <span className="inline-block w-1.5 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
      </pre>
    )
  }

  if (isWebTool && webTarget) {
    const verb = normalized === 'web.search' || normalized === 'browser.search' ? 'Searching' : 'Fetching'
    return (
      <div className={cn(
        'rounded-md border px-3 py-2 text-xs',
        'bg-muted/40 text-foreground',
      )}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
          <span>{verb} {webTarget}...</span>
        </div>
      </div>
    )
  }

  if (normalized === 'memory.save') {
    const scope = extractStreamingStringField(streamingArgs, 'scope') ?? 'memory'
    const content = extractStreamingStringField(streamingArgs, 'content')
    return (
      <div className={cn(
        'rounded-md border px-3 py-2 text-xs',
        'bg-muted/40 text-foreground',
      )}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
          <span>Saving memory ({scope})...</span>
        </div>
        {content ? <div className="mt-1 opacity-80">"{truncate(content, 120)}"</div> : null}
      </div>
    )
  }

  if (normalized === 'cron.add') {
    const name = extractStreamingStringField(streamingArgs, 'name')
    const cron = extractStreamingStringField(streamingArgs, 'cron')
    const toolName = extractStreamingStringField(streamingArgs, 'toolName')
    return (
      <div className={cn(
        'rounded-md border px-3 py-2 text-xs',
        'bg-muted/40 text-foreground',
      )}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
          <span>Creating cron job{ name ? `: ${name}` : '...' }</span>
        </div>
        {(cron || toolName) && (
          <div className="mt-1 opacity-80">
            {cron ? `schedule ${cron}` : ''}
            {cron && toolName ? ' • ' : ''}
            {toolName ? `tool ${toolName}` : ''}
          </div>
        )}
      </div>
    )
  }

  // Non-terminal with streaming args — show abbreviated JSON preview
  if (streamingArgs) {
    return (
      <pre ref={scrollRef} className={cn(
        'text-xs font-mono leading-5 rounded-md px-3 py-2 overflow-x-auto max-h-36 overflow-y-auto whitespace-pre-wrap break-all',
        'bg-muted/40 text-muted-foreground',
      )}>
        {streamingArgs}
        <span className="inline-block w-1.5 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
      </pre>
    )
  }

  // Nothing to show yet
  return (
    <div className={cn(
      'rounded-md border px-3 py-2 text-xs',
      'bg-muted/40 text-foreground',
    )}>
      <div className="flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
        <span>Preparing...</span>
      </div>
    </div>
  )
}

interface ToolCallCardProps {
  call: ToolCallInfo
  onOpenTerminal?: (terminalId: string | null) => void
  onOpenDiff?: (filePath: string) => void
}

function FileSummaryButton({
  path,
  onOpenDiff,
  disabled,
}: {
  path: string
  onOpenDiff?: (filePath: string) => void
  disabled?: boolean
}) {
  const fileName = getBaseName(path)
  const interactive = !!onOpenDiff && !disabled
  const content = (
    <>
      <FileIcon filename={fileName} className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[220px] truncate">{fileName}</span>
    </>
  )

  if (!interactive) {
    return (
      <span
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/45 px-2 py-1 text-[12px] font-medium leading-none text-foreground"
        title={path}
      >
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/45 px-2 py-1 text-[12px] font-medium leading-none text-foreground transition-colors hover:bg-muted"
      title={`Open diff for ${path}`}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpenDiff(path)
      }}
    >
      {content}
    </button>
  )
}

function ToolCallCardInner({ call, onOpenTerminal, onOpenDiff }: ToolCallCardProps) {
  const [open, setOpen] = useState(call.status === 'running' || call.status === 'pending')
  const [now, setNow] = useState(() => Date.now())
  const prevStatusRef = useRef(call.status)
  const normalizedTool = normalizeTool(call.tool)
  const resultData = call.result?.data && typeof call.result.data === 'object'
    ? call.result.data as Record<string, unknown>
    : undefined
  const normalizedArgs = normalizeToolArgs(normalizedTool, call.args, resultData)
  const mcpLabel = normalizedTool === 'mcp-tool' ? getMcpToolLabel(normalizedArgs, resultData) : null
  const meta = getToolMeta(normalizedTool)
  const Icon = meta.icon
  const summary = getCallSummary(normalizedTool, normalizedArgs, resultData, call.result?.message)
  const editDiffCount = getEditDiffCountLabel(normalizedTool, normalizedArgs)
  const finalOutput = formatOutput(call.result, normalizedTool)
  const displayOutput = finalOutput || call.streamingOutput || ''
  const snapshotText = typeof resultData?.snapshot === 'string' ? resultData.snapshot : null
  const screenshotPath = getToolImagePath(normalizedTool, normalizedArgs, resultData, call.result?.message)
  const isTerminal = normalizedTool.startsWith('terminal.') || normalizedTool === 'execute'
  const terminalOutcomeBadge = getTerminalOutcomeBadge(call)
  const canOpenTerminal = isTerminalCreationCall(call)
  const terminalId = canOpenTerminal ? getStructuredTerminalId(call) : null
  const runningHint = getRunningHint(normalizedTool, normalizedArgs)
  const isPending = call.status === 'pending'
  const filePath = getToolFilePath(normalizedTool, normalizedArgs, resultData, call.result?.message)?.trim() ?? ''
  const showFileSummary = !!filePath && isEditLikeTool(normalizedTool)
  const terminalScrollRef = useAutoScroll(displayOutput)
  const argsScrollRef = useAutoScroll(call.streamingArgs)
  const bodyKind = getToolCallBodyKind({
    tool: normalizedTool,
    args: normalizedArgs,
    status: call.status,
    displayOutput,
    snapshotText,
    screenshotPath,
  })
  const hasExpandableContent = bodyKind === 'terminal'
    ? true
    : bodyKind !== 'none'

  const StatusIcon = call.status === 'pending'
    ? Loader2
    : call.status === 'running'
      ? Loader2
      : call.status === 'success'
        ? CheckCircle2
        : XCircle

  const statusColor = call.status === 'pending'
    ? 'text-blue-400'
    : call.status === 'running'
      ? 'text-muted-foreground'
      : call.status === 'success'
        ? 'text-green-500'
        : 'text-red-500'

  useEffect(() => {
    const prevStatus = prevStatusRef.current
    if ((prevStatus === 'running' || prevStatus === 'pending') && call.status !== 'running' && call.status !== 'pending') {
      setOpen(false)
    }
    if (call.status === 'pending' || call.status === 'running') {
      setOpen(true)
    }
    prevStatusRef.current = call.status
  }, [call.status])

  useEffect(() => {
    if (
      normalizedTool !== 'web'
      && normalizedTool !== 'web.search'
      && normalizedTool !== 'web.fetch'
      && normalizedTool !== 'browser.search'
      && normalizedTool !== 'browser.fetch'
    ) {
      return
    }

    console.debug('[tool-call-card:web]', {
      tool: call.tool,
      normalizedTool,
      callId: call.callId,
      status: call.status,
      rawArgs: call.args,
      normalizedArgs,
      resultMessage: call.result?.message,
      resultData,
      streamingArgs: call.streamingArgs,
    })
  }, [
    call.args,
    call.callId,
    call.result?.message,
    call.status,
    call.streamingArgs,
    call.tool,
    normalizedArgs,
    normalizedTool,
    resultData,
  ])

  useEffect(() => {
    if (call.status !== 'running' && call.status !== 'pending') return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [call.status])

  const headerContent = (
    <>
      <StatusIcon className={cn(
        'h-4 w-4 shrink-0',
        statusColor,
        (call.status === 'running' || call.status === 'pending') && 'animate-spin'
      )} />
      <Icon className={cn('h-4 w-4 shrink-0', meta.color)} />
      <span className="text-sm font-medium text-muted-foreground truncate flex-1">
        {isPending ? (
          <PendingToolLabel tool={call.tool} streamingArgs={call.streamingArgs} />
        ) : isTerminal ? (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-foreground">
            <span className="shrink-0 text-xs text-emerald-500 dark:text-emerald-400 font-mono">$</span>
            <code className="min-w-0 truncate text-xs font-mono" title={summary}>{summary}</code>
          </span>
        ) : showFileSummary ? (
          <span className="inline-flex min-w-0 max-w-full items-center gap-2">
            <span>{meta.label}:</span>
            <FileSummaryButton
              path={filePath}
              onOpenDiff={onOpenDiff}
              disabled={call.status !== 'success'}
            />
          </span>
        ) : mcpLabel && (mcpLabel.title || mcpLabel.details) ? (
          <span className="inline-flex min-w-0 max-w-full items-center gap-2">
            <span>{meta.label}:</span>
            <span className="min-w-0 truncate">
              {mcpLabel.title ? <code className="text-xs font-mono">{mcpLabel.title}</code> : null}
              {mcpLabel.title && mcpLabel.details ? <span className="text-muted-foreground"> • </span> : null}
              {mcpLabel.details ? <span className="text-xs text-muted-foreground">{mcpLabel.details}</span> : null}
            </span>
          </span>
        ) : (
          <span>{meta.label}: <code className="text-xs font-mono">{summary}</code></span>
        )}
      </span>
      <span className="text-[11px] text-muted-foreground/60 tabular-nums shrink-0">
        <ElapsedLabel startedAt={call.startedAt} completedAt={call.completedAt} now={now} />
      </span>
      {editDiffCount && (
        <span className="rounded border border-blue-500/25 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-blue-500 shrink-0">
          {editDiffCount}
        </span>
      )}
      {terminalOutcomeBadge && (
        <span
          className={cn(
            'rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0',
            terminalOutcomeBadge.className,
          )}
        >
          {terminalOutcomeBadge.label}
        </span>
      )}
    </>
  )

  const bodyContent = bodyKind === 'pending' ? (
    <PendingToolBody tool={call.tool} streamingArgs={call.streamingArgs} scrollRef={argsScrollRef} />
  ) : bodyKind === 'terminal' ? (
    <pre ref={terminalScrollRef} className={cn(
      'text-xs font-mono leading-5 rounded-md px-3 py-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all',
      'bg-muted/40 text-foreground',
      call.result && !call.result.ok && 'text-red-500 dark:text-red-400'
    )}>
      {!displayOutput && call.status !== 'running' && (
        <span className="text-muted-foreground"><span className="text-emerald-500 dark:text-emerald-400">$ </span>{summary}</span>
      )}
      {displayOutput}
      {call.status === 'running' && !displayOutput && (
        <span className="text-muted-foreground">Running...</span>
      )}
      {call.status === 'running' && (
        <span className="inline-block w-1.5 h-3.5 bg-foreground animate-pulse ml-0.5 align-text-bottom" />
      )}
    </pre>
  ) : bodyKind === 'browserSnapshot' ? (
    <BrowserSnapshotView snapshot={snapshotText!} />
  ) : bodyKind === 'browserScreenshot' ? (
    <BrowserScreenshotView path={screenshotPath!} />
  ) : bodyKind === 'subagent' ? (
    <SubAgentHistoryView
      data={resultData ?? {}}
      message={call.result?.message}
      status={call.status}
    />
  ) : bodyKind === 'editDiff' ? (
     <EditDiffView
      filePath={String(normalizedArgs.path ?? '')}
      oldText={normalizedTool === 'file.patch' || (normalizedTool === 'edit' && normalizedArgs.search != null) ? String(normalizedArgs.search ?? '') : undefined}
      newText={normalizedTool === 'file.patch' || (normalizedTool === 'edit' && normalizedArgs.replace != null) ? String(normalizedArgs.replace ?? '') : undefined}
      writtenContent={normalizedTool === 'file.write' || (normalizedTool === 'edit' && normalizedArgs.content != null) ? String(normalizedArgs.content ?? '') : undefined}
      isNewFile={normalizedTool === 'file.write'}
    />
  ) : bodyKind === 'output' ? (
    <pre className={cn(
      'text-xs font-mono leading-5 rounded-md px-3 py-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all',
      'bg-muted/40 text-foreground',
      call.result && !call.result.ok && 'text-red-500 dark:text-red-400'
    )}>
      {displayOutput}
      {call.status === 'running' && (
        <span className="inline-block w-1.5 h-3.5 bg-foreground animate-pulse ml-0.5 align-text-bottom" />
      )}
    </pre>
  ) : bodyKind === 'runningHint' ? (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        'bg-muted/40 text-foreground',
      )}
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>{runningHint}</span>
      </div>
      <div className="mt-1 text-[11px] opacity-75">
        Elapsed: <ElapsedLabel startedAt={call.startedAt} completedAt={call.completedAt} now={now} />
      </div>
    </div>
  ) : null

  return (
    <Collapsible open={hasExpandableContent ? open : false} onOpenChange={setOpen}>
      <div className="group flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors">
        {hasExpandableContent ? (
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ChevronRight className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-90'
            )} />
            {headerContent}
          </CollapsibleTrigger>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className="h-3.5 w-3.5 shrink-0" />
            {headerContent}
          </div>
        )}
        {canOpenTerminal && onOpenTerminal && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onOpenTerminal(terminalId)
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Open terminal</TooltipContent>
          </Tooltip>
        )}
        {bodyKind === 'editDiff' && onOpenDiff && call.status === 'success' && filePath && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onOpenDiff(filePath)
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Open diff in editor</TooltipContent>
          </Tooltip>
        )}
      </div>

      {hasExpandableContent && (
        <CollapsibleContent>
          <div className="ml-[3.25rem] mr-3 mb-2">
            {bodyContent}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export const ToolCallCard = memo(ToolCallCardInner)
ToolCallCard.displayName = 'ToolCallCard'

/**
 * Minimum number of completed calls before a collapsible group auto-collapses.
 */
const MIN_CALLS_TO_COLLAPSE = 3

/** Group of tool call cards rendered between message content */
interface ToolCallGroupProps {
  calls: ToolCallInfo[]
  /** When true and all calls are completed with >= MIN_CALLS_TO_COLLAPSE, the entire group collapses into a summary row */
  collapsible?: boolean
  onOpenTerminal?: (terminalId: string | null) => void
  onOpenDiff?: (filePath: string) => void
}

/**
 * Maximum number of completed tool calls to render individually.
 * Older completed calls are collapsed into a summary row to keep the DOM light.
 */
const MAX_VISIBLE_COMPLETED = 6

export function shouldInitiallyCollapseToolCallGroup(calls: ToolCallInfo[], collapsible?: boolean): boolean {
  if (!collapsible) return false
  const completedCalls = calls.filter(c => c.status !== 'running' && c.status !== 'pending')
  return completedCalls.length >= MIN_CALLS_TO_COLLAPSE && completedCalls.length === calls.length
}

function ToolCallGroupInner({ calls, collapsible, onOpenTerminal, onOpenDiff }: ToolCallGroupProps) {
  const [showAll, setShowAll] = useState(false)
  const [groupOpen, setGroupOpen] = useState(() => !shouldInitiallyCollapseToolCallGroup(calls, collapsible))
  const prevAllDoneRef = useRef(false)

  const activeCalls = calls.filter(c => c.status === 'running' || c.status === 'pending')
  const completedCalls = calls.filter(c => c.status !== 'running' && c.status !== 'pending')
  const allDone = activeCalls.length === 0 && completedCalls.length > 0
  const shouldCollapseGroup = collapsible && allDone && completedCalls.length >= MIN_CALLS_TO_COLLAPSE

  useEffect(() => {
    if (shouldCollapseGroup && !prevAllDoneRef.current) {
      setGroupOpen(false)
    }
    prevAllDoneRef.current = allDone
  }, [allDone, shouldCollapseGroup])

  if (calls.length === 0) return null

  const totalSuccessCount = completedCalls.filter(c => c.status === 'success').length
  const totalErrorCount = completedCalls.filter(c => c.status === 'error').length

  if (shouldCollapseGroup && !groupOpen) {
    return (
      <div className="my-2 overflow-hidden rounded-xl border border-border/40 bg-muted/[0.18]">
        <button
          type="button"
          onClick={() => setGroupOpen(true)}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <Zap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium">
            {completedCalls.length} tool call{completedCalls.length !== 1 ? 's' : ''}
          </span>
          {totalSuccessCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-green-500">
              <CheckCircle2 className="h-3 w-3" /> {totalSuccessCount}
            </span>
          )}
          {totalErrorCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-red-500">
              <XCircle className="h-3 w-3" /> {totalErrorCount}
            </span>
          )}
        </button>
      </div>
    )
  }

  const needsCollapse = !showAll && completedCalls.length > MAX_VISIBLE_COMPLETED
  const hiddenCount = needsCollapse ? completedCalls.length - MAX_VISIBLE_COMPLETED : 0
  const visibleCompleted = needsCollapse ? completedCalls.slice(-MAX_VISIBLE_COMPLETED) : completedCalls
  const successCount = needsCollapse ? completedCalls.slice(0, hiddenCount).filter(c => c.status === 'success').length : 0
  const errorCount = hiddenCount - successCount

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/40 bg-muted/[0.18] divide-y divide-border/30">
      {shouldCollapseGroup && (
        <button
          type="button"
          onClick={() => setGroupOpen(false)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <ChevronRight className="h-3 w-3 rotate-90 transition-transform" />
          <span>Collapse tool calls</span>
        </button>
      )}
      {needsCollapse && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <ChevronRight className="h-3 w-3" />
          <span>
            {hiddenCount} earlier tool call{hiddenCount !== 1 ? 's' : ''}
            {successCount > 0 && <span className="text-green-500 ml-1">({successCount} passed)</span>}
            {errorCount > 0 && <span className="text-red-500 ml-1">({errorCount} failed)</span>}
          </span>
        </button>
      )}
      {showAll && completedCalls.slice(0, hiddenCount).map((call) => (
        <ToolCallCard key={call.callId} call={call} onOpenTerminal={onOpenTerminal} onOpenDiff={onOpenDiff} />
      ))}
      {visibleCompleted.map((call) => (
        <ToolCallCard key={call.callId} call={call} onOpenTerminal={onOpenTerminal} onOpenDiff={onOpenDiff} />
      ))}
      {activeCalls.map((call) => (
        <ToolCallCard key={call.callId} call={call} onOpenTerminal={onOpenTerminal} onOpenDiff={onOpenDiff} />
      ))}
    </div>
  )
}

function areToolCallListsEqual(prevCalls: ToolCallInfo[], nextCalls: ToolCallInfo[]): boolean {
  if (prevCalls === nextCalls) return true
  if (prevCalls.length !== nextCalls.length) return false
  for (let i = 0; i < prevCalls.length; i++) {
    if (prevCalls[i] !== nextCalls[i]) return false
  }
  return true
}

export const ToolCallGroup = memo(
  ToolCallGroupInner,
  (prevProps, nextProps) =>
    prevProps.onOpenTerminal === nextProps.onOpenTerminal &&
    prevProps.onOpenDiff === nextProps.onOpenDiff &&
    prevProps.collapsible === nextProps.collapsible &&
    areToolCallListsEqual(prevProps.calls, nextProps.calls),
)
ToolCallGroup.displayName = 'ToolCallGroup'

/* ─── Agent Tool Call Wrapper ──────────────────────────────────────────────── */

const AGENT_PROVIDER_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  opencode: 'OpenCode',
  copilot: 'Copilot',
}

interface AgentToolCallWrapperProps {
  provider: string
  calls: ToolCallInfo[]
  isStreaming?: boolean
  onOpenTerminal?: (terminalId: string | null) => void
  onOpenDiff?: (filePath: string) => void
}

function AgentToolCallWrapperInner({ provider, calls, isStreaming, onOpenTerminal, onOpenDiff }: AgentToolCallWrapperProps) {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const prevActiveRef = useRef(true)

  const isActive = !!isStreaming || calls.some(c => c.status === 'running' || c.status === 'pending')
  const label = AGENT_PROVIDER_LABELS[provider] ?? provider
  const successCount = calls.filter(c => c.status === 'success').length
  const errorCount = calls.filter(c => c.status === 'error').length
  const startedAt = calls.length > 0 ? Math.min(...calls.map(c => c.startedAt)) : Date.now()
  const completedAt = !isActive && calls.length > 0
    ? Math.max(...calls.map(c => c.completedAt ?? c.startedAt))
    : undefined

  // Split into active and completed for inner collapsing
  const activeCalls = calls.filter(c => c.status === 'running' || c.status === 'pending')
  const completedCalls = calls.filter(c => c.status !== 'running' && c.status !== 'pending')
  const needsInnerCollapse = !showAll && completedCalls.length > MAX_VISIBLE_COMPLETED
  const hiddenCount = needsInnerCollapse ? completedCalls.length - MAX_VISIBLE_COMPLETED : 0
  const visibleCompleted = needsInnerCollapse ? completedCalls.slice(-MAX_VISIBLE_COMPLETED) : completedCalls
  const hiddenSuccessCount = needsInnerCollapse ? completedCalls.slice(0, hiddenCount).filter(c => c.status === 'success').length : 0
  const hiddenErrorCount = hiddenCount - hiddenSuccessCount

  // Auto-collapse when the agent finishes
  useEffect(() => {
    if (prevActiveRef.current && !isActive && calls.length > 0) {
      setOpen(false)
    }
    prevActiveRef.current = isActive
  }, [isActive, calls.length])

  // Tick the elapsed timer while active
  useEffect(() => {
    if (!isActive) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [isActive])

  if (calls.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="my-2 overflow-hidden rounded-xl border border-border/40 bg-muted/[0.18]">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors">
          <ChevronRight className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-90',
          )} />
          {isActive
            ? <Loader2 className="h-4 w-4 shrink-0 text-muted-foreground animate-spin" />
            : <Bot className="h-4 w-4 shrink-0 text-purple-500" />
          }
          <span className="text-sm font-medium text-foreground truncate">{label}</span>
          <div className="flex items-center gap-2 ml-auto text-[11px] text-muted-foreground tabular-nums shrink-0">
            {calls.length > 0 && (
              <span>{calls.length} tool{calls.length !== 1 ? 's' : ''}</span>
            )}
            {!isActive && errorCount > 0 && (
              <span className="text-red-500">{errorCount} failed</span>
            )}
            <ElapsedLabel startedAt={startedAt} completedAt={completedAt} now={now} />
          </div>
          {!isActive && errorCount === 0 && successCount > 0 && (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
          )}
          {!isActive && errorCount > 0 && (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="divide-y divide-border/30 border-t border-border/30">
            {needsInnerCollapse && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <ChevronRight className="h-3 w-3" />
                <span>
                  {hiddenCount} earlier tool call{hiddenCount !== 1 ? 's' : ''}
                  {hiddenSuccessCount > 0 && <span className="text-green-500 ml-1">({hiddenSuccessCount} passed)</span>}
                  {hiddenErrorCount > 0 && <span className="text-red-500 ml-1">({hiddenErrorCount} failed)</span>}
                </span>
              </button>
            )}
            {showAll && completedCalls.slice(0, hiddenCount).map((call) => (
              <ToolCallCard key={call.callId} call={call} onOpenTerminal={onOpenTerminal} onOpenDiff={onOpenDiff} />
            ))}
            {visibleCompleted.map((call) => (
              <ToolCallCard key={call.callId} call={call} onOpenTerminal={onOpenTerminal} onOpenDiff={onOpenDiff} />
            ))}
            {activeCalls.map((call) => (
              <ToolCallCard key={call.callId} call={call} onOpenTerminal={onOpenTerminal} onOpenDiff={onOpenDiff} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export const AgentToolCallWrapper = memo(
  AgentToolCallWrapperInner,
  (prevProps, nextProps) =>
    prevProps.provider === nextProps.provider &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.onOpenTerminal === nextProps.onOpenTerminal &&
    prevProps.onOpenDiff === nextProps.onOpenDiff &&
    areToolCallListsEqual(prevProps.calls, nextProps.calls),
)
AgentToolCallWrapper.displayName = 'AgentToolCallWrapper'
