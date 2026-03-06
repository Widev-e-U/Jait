import { useEffect, useRef, useState } from 'react'
import { Terminal, CheckCircle2, XCircle, Loader2, ChevronRight, FileText, Globe, Monitor, Server, ExternalLink, Search, ListTodo, Bot, Zap } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EditDiffView } from '@/components/chat/edit-diff-view'
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
  const idx = name.indexOf('_')
  return idx === -1 ? name : name.slice(0, idx) + '.' + name.slice(idx + 1)
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
  // ── Legacy / standard tools ─────────────────────────────
  'terminal.run':    { icon: Terminal,  label: 'Terminal',    color: 'text-yellow-500' },
  'terminal.stream': { icon: Terminal,  label: 'Terminal',    color: 'text-yellow-500' },
  'file.read':       { icon: FileText,  label: 'Read File',  color: 'text-blue-500' },
  'file.write':      { icon: FileText,  label: 'Write File', color: 'text-blue-500' },
  'file.patch':      { icon: FileText,  label: 'Patch File', color: 'text-blue-500' },
  'file.list':       { icon: FileText,  label: 'List Files', color: 'text-blue-500' },
  'file.stat':       { icon: FileText,  label: 'File Info',  color: 'text-blue-500' },
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
}

function getToolMeta(tool: string) {
  const normalized = normalizeTool(tool)
  return toolMeta[normalized] ?? { icon: Terminal, label: normalized, color: 'text-muted-foreground' }
}

function truncate(value: string, max = 64): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

/** Format a tool call's primary display text (e.g. the command or file path) */
function getCallSummary(tool: string, args: Record<string, unknown>): string {
  const normalized = normalizeTool(tool)
  // ── Core tools ──────────────────────────────────────────
  if (normalized === 'read') return String(args.path ?? '')
  if (normalized === 'edit') {
    const path = String(args.path ?? '')
    if (args.search) return `${path} (patch)`
    return path
  }
  if (normalized === 'execute') return String(args.command ?? '')
  if (normalized === 'search') {
    const pattern = String(args.pattern ?? '')
    const mode = String(args.mode ?? 'content')
    return mode === 'files' ? `Find: ${pattern}` : pattern
  }
  if (normalized === 'web') {
    if (args.url) return String(args.url)
    if (args.urls) return `${(args.urls as string[]).length} URLs`
    return String(args.query ?? '')
  }
  if (normalized === 'agent') return truncate(String(args.description ?? args.prompt ?? ''), 80)
  if (normalized === 'todo') {
    const list = args.todoList as Array<{ title: string; status: string }> | undefined
    if (!list) return 'Track tasks'
    const inProgress = list.filter(t => t.status === 'in-progress')
    if (inProgress.length) return truncate(inProgress[0].title, 60)
    return `${list.length} task(s)`
  }
  if (normalized === 'jait') {
    const action = String(args.action ?? '')
    if (action.startsWith('memory.')) return `${action}: ${truncate(String(args.query ?? args.content ?? ''), 60)}`
    if (action.startsWith('cron.')) return `${action}: ${truncate(String(args.name ?? args.id ?? ''), 40)}`
    return action || 'jait'
  }
  // ── Legacy tools ─────────────────────────────────────────
  if (normalized.startsWith('terminal.')) return String(args.command ?? '')
  if (normalized.startsWith('file.')) return String(args.path ?? '')
  if (normalized === 'memory.save') {
    const scope = String(args.scope ?? 'memory')
    const content = String(args.content ?? '').trim()
    return content ? `${scope}: ${truncate(content, 80)}` : `scope: ${scope}`
  }
  if (normalized === 'memory.search') return String(args.query ?? '')
  if (normalized === 'memory.forget') return String(args.id ?? '')
  if (normalized === 'cron.add') {
    const name = String(args.name ?? 'job')
    const cron = String(args.cron ?? '')
    const toolName = String(args.toolName ?? '')
    if (cron && toolName) return `${name} (${cron}) -> ${toolName}`
    if (cron) return `${name} (${cron})`
    return name
  }
  if (normalized === 'cron.update') {
    const id = String(args.id ?? 'job')
    const cron = String(args.cron ?? '')
    return cron ? `${id} (${cron})` : id
  }
  if (normalized === 'cron.remove') return String(args.id ?? '')
  if (normalized === 'cron.list') return 'List cron jobs'
  if (tool === 'os.query') return String(args.query ?? '')
  if (tool === 'os.install') return String(args.package ?? '')
  if (normalized === 'browser.navigate') return String(args.url ?? '')
  if (normalized === 'browser.snapshot') return 'Describe page'
  if (normalized === 'browser.click') return String(args.selector ?? '')
  if (normalized === 'browser.type') return `${String(args.selector ?? '')} ← ${String(args.text ?? '')}`
  if (normalized === 'browser.scroll') return `x:${String(args.x ?? 0)} y:${String(args.y ?? 0)}`
  if (normalized === 'browser.select') return `${String(args.selector ?? '')} = ${String(args.value ?? '')}`
  if (normalized === 'browser.wait') return `${String(args.selector ?? '')} (${String(args.timeoutMs ?? 10000)}ms)`
  if (normalized === 'browser.screenshot') return String(args.path ?? 'auto path')
  if (normalized === 'browser.search') return String(args.query ?? '')
  if (normalized === 'browser.fetch') return String(args.url ?? '')
  if (normalized === 'surfaces.start') return `Start ${args.type ?? 'surface'}`
  if (normalized === 'surfaces.stop') return `Stop ${args.surfaceId ?? 'surface'}`
  if (normalized === 'surfaces.list') return 'List surfaces'
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

/** Format the output data from a tool result */
function formatOutput(result: ToolCallInfo['result'], tool?: string): string {
  if (!result) return ''
  const data = result.data as Record<string, unknown> | undefined
  const normalizedTool = normalizeTool(tool ?? '')

  // Rich system info display
  if (normalizedTool === 'os.query' && data && data.platform != null) {
    return formatSystemInfo(data)
  }
  if ((normalizedTool === 'web.search' || normalizedTool === 'browser.search') && data) {
    const formatted = formatSearchResults(data)
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

  if (data?.output != null) return String(data.output)
  if (data?.content != null) return String(data.content)
  if (data?.entries != null) {
    const entries = data.entries as Array<{ name: string; isDirectory: boolean }>
    return entries
      .map(e => `${e.isDirectory ? '📁' : '📄'} ${e.name}`)
      .join('\n')
  }
  if (result.message && result.message !== 'Command executed successfully') return result.message
  if (data) return JSON.stringify(data, null, 2)
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
  if (tool.startsWith('terminal.')) return 'Command is still running...'
  return 'Tool is still running...'
}

function getTerminalOutcomeBadge(call: ToolCallInfo): { label: string; className: string } | null {
  if (!normalizeTool(call.tool).startsWith('terminal.')) return null
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
  const src = /^https?:\/\//.test(trimmedPath) ? trimmedPath : trimmedPath

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
      <div className="text-[11px] text-muted-foreground">Screenshot path: <span className="font-mono break-all">{trimmedPath}</span></div>
      <div className="overflow-hidden rounded border bg-background">
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

function isTerminalCreationCall(call: ToolCallInfo): boolean {
  const normalizedTool = normalizeTool(call.tool)
  if (normalizedTool === 'execute') return true
  if (normalizedTool.startsWith('terminal.')) return true
  if (normalizedTool !== 'surfaces.start') return false

  if (call.args.type === 'terminal') return true

  const data = call.result?.data
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (record.type === 'terminal') return true
  }

  return false
}

function getTerminalId(call: ToolCallInfo): string | null {
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

    const output = record.output
    if (typeof output === 'string') {
      try {
        const parsed = JSON.parse(output) as Record<string, unknown>
        if (typeof parsed.terminalId === 'string') return parsed.terminalId
        if (typeof parsed.id === 'string') return parsed.id
        if (typeof parsed.surfaceId === 'string') return parsed.surfaceId
      } catch {
        // output is plain text, not JSON
      }

      const outputMatch = output.match(/\b(?:term|terminal)-[A-Za-z0-9-]+\b/)
      if (outputMatch) return outputMatch[0]
    }
  }

  const messageMatch = call.result?.message?.match(/\b(?:term|terminal)-[A-Za-z0-9-]+\b/)
  return messageMatch ? messageMatch[0] : null
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

/** Header label shown while the tool call is being streamed (pending state) */
function PendingToolLabel({ tool, streamingArgs }: { tool: string; streamingArgs?: string }) {
  // Normalise OpenAI name (terminal_run → terminal.run) for meta lookup
  const normalized = normalizeTool(tool)
  const meta = toolMeta[normalized]
  const isTerminalTool = normalized.startsWith('terminal.')
  const command = isTerminalTool ? extractStreamingCommand(streamingArgs) : null

  if (meta && isTerminalTool && command) {
    // Terminal with partial command — show like the running state
    return (
      <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border border-blue-500/30 bg-[#0b0f14] px-2 py-0.5 text-[#c9d1d9]">
        <span className="shrink-0 text-[10px] text-emerald-400">$</span>
        <code className="min-w-0 truncate text-xs font-mono">{command}</code>
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

  // Terminal with partial command — show the command being built (no raw JSON)
  if (isTerminalTool && command) {
    return (
      <pre ref={scrollRef} className={cn(
        'text-xs font-mono leading-5 rounded-md px-3 py-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all',
        'bg-[#1e1e1e] text-[#cccccc] dark:bg-[#0d1117] dark:text-[#c9d1d9]',
      )}>
        <span className="text-emerald-400">$ </span>
        {command}
        <span className="inline-block w-1.5 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
      </pre>
    )
  }

  if (normalized === 'memory.save') {
    const scope = extractStreamingStringField(streamingArgs, 'scope') ?? 'memory'
    const content = extractStreamingStringField(streamingArgs, 'content')
    return (
      <div className={cn(
        'rounded-md border px-3 py-2 text-xs',
        'bg-[#1e1e1e] text-[#cccccc] dark:bg-[#0d1117] dark:text-[#c9d1d9]',
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
        'bg-[#1e1e1e] text-[#cccccc] dark:bg-[#0d1117] dark:text-[#c9d1d9]',
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
        'bg-[#1e1e1e] text-[#8b949e] dark:bg-[#0d1117] dark:text-[#8b949e]',
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
      'bg-[#1e1e1e] text-[#cccccc] dark:bg-[#0d1117] dark:text-[#c9d1d9]',
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
}

export function ToolCallCard({ call, onOpenTerminal }: ToolCallCardProps) {
  const [open, setOpen] = useState(call.status === 'running' || call.status === 'pending')
  const [now, setNow] = useState(() => Date.now())
  const prevStatusRef = useRef(call.status)
  const normalizedTool = normalizeTool(call.tool)
  const meta = getToolMeta(normalizedTool)
  const Icon = meta.icon
  const summary = getCallSummary(normalizedTool, call.args)
  const finalOutput = formatOutput(call.result, normalizedTool)
  const displayOutput = finalOutput || call.streamingOutput || ''
  const resultData = call.result?.data && typeof call.result.data === 'object'
    ? call.result.data as Record<string, unknown>
    : undefined
  const snapshotText = typeof resultData?.snapshot === 'string' ? resultData.snapshot : null
  const screenshotPath = normalizedTool === 'browser.screenshot' && resultData?.result && typeof resultData.result === 'object'
    ? String((resultData.result as Record<string, unknown>).path ?? '')
    : null
  const isTerminal = normalizedTool.startsWith('terminal.')
  const isFileEdit = normalizedTool === 'file.write' || normalizedTool === 'file.patch'
  const terminalOutcomeBadge = getTerminalOutcomeBadge(call)
  const canOpenTerminal = isTerminalCreationCall(call)
  const terminalId = canOpenTerminal ? getTerminalId(call) : null
  const runningHint = getRunningHint(normalizedTool, call.args)
  const isPending = call.status === 'pending'
  const terminalScrollRef = useAutoScroll(displayOutput)
  const argsScrollRef = useAutoScroll(call.streamingArgs)

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
    if (call.status !== 'running' && call.status !== 'pending') return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [call.status])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-90'
          )} />
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
              <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border border-zinc-700/60 bg-[#0b0f14] px-2 py-0.5 text-[#c9d1d9]">
                <span className="shrink-0 text-[10px] text-emerald-400">$</span>
                <code className="min-w-0 truncate text-xs font-mono" title={summary}>{summary}</code>
              </span>
            ) : (
              <span>{meta.label}: <code className="text-xs font-mono">{summary}</code></span>
            )}
          </span>
          <span className="text-[11px] text-muted-foreground/60 tabular-nums shrink-0">
            <ElapsedLabel startedAt={call.startedAt} completedAt={call.completedAt} now={now} />
          </span>
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
        </CollapsibleTrigger>
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
      </div>

      <CollapsibleContent>
        <div className="ml-[3.25rem] mr-3 mb-2">
          {isPending ? (
            <PendingToolBody tool={call.tool} streamingArgs={call.streamingArgs} scrollRef={argsScrollRef} />
          ) : isTerminal ? (
            <pre ref={terminalScrollRef} className={cn(
              'text-xs font-mono leading-5 rounded-md px-3 py-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all',
              'bg-[#1e1e1e] text-[#cccccc] dark:bg-[#0d1117] dark:text-[#c9d1d9]',
              call.result && !call.result.ok && 'text-red-400 dark:text-red-400'
            )}>
              <span className="text-emerald-400">$ </span>
              {summary}
              {(displayOutput || call.status === 'running') && '\n'}
              {displayOutput}
              {call.status === 'running' && (
                <span className="inline-block w-1.5 h-3.5 bg-[#cccccc] dark:bg-[#c9d1d9] animate-pulse ml-0.5 align-text-bottom" />
              )}
            </pre>
          ) : snapshotText && normalizedTool === 'browser.snapshot' ? (
            <BrowserSnapshotView snapshot={snapshotText} />
          ) : screenshotPath ? (
            <BrowserScreenshotView path={screenshotPath} />
          ) : isFileEdit && call.status === 'success' ? (
            <EditDiffView
              filePath={String(call.args.path ?? '')}
              oldText={normalizedTool === 'file.patch' ? String(call.args.search ?? '') : undefined}
              newText={normalizedTool === 'file.patch' ? String(call.args.replace ?? '') : undefined}
              writtenContent={normalizedTool === 'file.write' ? String(call.args.content ?? '') : undefined}
              isNewFile={normalizedTool === 'file.write'}
            />
          ) : displayOutput ? (
            <pre className={cn(
              'text-xs font-mono leading-5 rounded-md px-3 py-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all',
              'bg-[#1e1e1e] text-[#cccccc] dark:bg-[#0d1117] dark:text-[#c9d1d9]',
              call.result && !call.result.ok && 'text-red-400 dark:text-red-400'
            )}>
              {displayOutput}
              {call.status === 'running' && (
                <span className="inline-block w-1.5 h-3.5 bg-[#cccccc] dark:bg-[#c9d1d9] animate-pulse ml-0.5 align-text-bottom" />
              )}
            </pre>
          ) : call.status === 'running' ? (
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-xs',
                'bg-[#1e1e1e] text-[#cccccc] dark:bg-[#0d1117] dark:text-[#c9d1d9]',
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
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Group of tool call cards rendered between message content */
interface ToolCallGroupProps {
  calls: ToolCallInfo[]
  onOpenTerminal?: (terminalId: string | null) => void
}

export function ToolCallGroup({ calls, onOpenTerminal }: ToolCallGroupProps) {
  if (calls.length === 0) return null

  return (
    <div className="rounded-lg border bg-card my-2 divide-y">
      {calls.map((call) => (
        <ToolCallCard key={call.callId} call={call} onOpenTerminal={onOpenTerminal} />
      ))}
    </div>
  )
}
