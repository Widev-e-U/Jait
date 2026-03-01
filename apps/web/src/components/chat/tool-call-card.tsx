import { useEffect, useRef, useState } from 'react'
import { Terminal, CheckCircle2, XCircle, Loader2, ChevronRight, FileText, Globe, Monitor, Server, ExternalLink } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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

const toolMeta: Record<string, { icon: typeof Terminal; label: string; color: string }> = {
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
  return toolMeta[tool] ?? { icon: Terminal, label: tool, color: 'text-muted-foreground' }
}

/** Format a tool call's primary display text (e.g. the command or file path) */
function getCallSummary(tool: string, args: Record<string, unknown>): string {
  if (tool.startsWith('terminal.')) return String(args.command ?? '')
  if (tool.startsWith('file.')) return String(args.path ?? '')
  if (tool === 'os.query') return String(args.query ?? '')
  if (tool === 'os.install') return String(args.package ?? '')
  if (tool === 'browser.navigate') return String(args.url ?? '')
  if (tool === 'browser.snapshot') return 'Describe page'
  if (tool === 'browser.click') return String(args.selector ?? '')
  if (tool === 'browser.type') return `${String(args.selector ?? '')} ← ${String(args.text ?? '')}`
  if (tool === 'browser.scroll') return `x:${String(args.x ?? 0)} y:${String(args.y ?? 0)}`
  if (tool === 'browser.select') return `${String(args.selector ?? '')} = ${String(args.value ?? '')}`
  if (tool === 'browser.wait') return `${String(args.selector ?? '')} (${String(args.timeoutMs ?? 10000)}ms)`
  if (tool === 'browser.screenshot') return String(args.path ?? 'auto path')
  if (tool === 'browser.search') return String(args.query ?? '')
  if (tool === 'browser.fetch') return String(args.url ?? '')
  if (tool === 'surfaces.start') return `Start ${args.type ?? 'surface'}`
  if (tool === 'surfaces.stop') return `Stop ${args.surfaceId ?? 'surface'}`
  if (tool === 'surfaces.list') return 'List surfaces'
  return JSON.stringify(args)
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

/** Format the output data from a tool result */
function formatOutput(result: ToolCallInfo['result'], tool?: string): string {
  if (!result) return ''
  const data = result.data as Record<string, unknown> | undefined

  // Rich system info display
  if (tool === 'os.query' && data && data.platform != null) {
    return formatSystemInfo(data)
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
  if (!call.tool.startsWith('terminal.')) return null
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
  if (call.tool.startsWith('terminal.')) return true
  if (call.tool !== 'surfaces.start') return false

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

/**
 * OpenAI requires function names as `terminal_run` (underscore) while our
 * toolMeta uses `terminal.run` (dotted).  During the pending phase the name
 * arrives in OpenAI format — normalise it so lookups and startsWith checks
 * work.
 */
function normalizeTool(name: string): string {
  const idx = name.indexOf('_')
  return idx === -1 ? name : name.slice(0, idx) + '.' + name.slice(idx + 1)
}

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
  const meta = getToolMeta(call.tool)
  const Icon = meta.icon
  const summary = getCallSummary(call.tool, call.args)
  const finalOutput = formatOutput(call.result, call.tool)
  const displayOutput = finalOutput || call.streamingOutput || ''
  const resultData = call.result?.data && typeof call.result.data === 'object'
    ? call.result.data as Record<string, unknown>
    : undefined
  const snapshotText = typeof resultData?.snapshot === 'string' ? resultData.snapshot : null
  const screenshotPath = call.tool === 'browser.screenshot' && resultData?.result && typeof resultData.result === 'object'
    ? String((resultData.result as Record<string, unknown>).path ?? '')
    : null
  const isTerminal = call.tool.startsWith('terminal.')
  const terminalOutcomeBadge = getTerminalOutcomeBadge(call)
  const canOpenTerminal = isTerminalCreationCall(call)
  const terminalId = canOpenTerminal ? getTerminalId(call) : null
  const runningHint = getRunningHint(call.tool, call.args)
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
          ) : snapshotText && call.tool === 'browser.snapshot' ? (
            <BrowserSnapshotView snapshot={snapshotText} />
          ) : screenshotPath ? (
            <BrowserScreenshotView path={screenshotPath} />
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
