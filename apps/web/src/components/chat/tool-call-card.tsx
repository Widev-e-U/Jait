import { useEffect, useRef, useState } from 'react'
import { Terminal, CheckCircle2, XCircle, Loader2, ChevronRight, FileText, Globe, Monitor, Server, ExternalLink } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface ToolCallInfo {
  callId: string
  tool: string
  args: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  result?: { ok: boolean; message: string; data?: unknown }
  streamingOutput?: string
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
  if (tool === 'browser.search') return String(args.query ?? '')
  if (tool === 'browser.fetch') return String(args.url ?? '')
  if (tool === 'surfaces.start') return `Start ${args.type ?? 'surface'}`
  if (tool === 'surfaces.stop') return `Stop ${args.surfaceId ?? 'surface'}`
  if (tool === 'surfaces.list') return 'List surfaces'
  return JSON.stringify(args)
}

/** Format the output data from a tool result */
function formatOutput(result: ToolCallInfo['result']): string {
  if (!result) return ''
  const data = result.data as Record<string, unknown> | undefined
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

interface ToolCallCardProps {
  call: ToolCallInfo
  onOpenTerminal?: (terminalId: string | null) => void
}

export function ToolCallCard({ call, onOpenTerminal }: ToolCallCardProps) {
  const [open, setOpen] = useState(call.status === 'running')
  const [now, setNow] = useState(() => Date.now())
  const prevStatusRef = useRef(call.status)
  const meta = getToolMeta(call.tool)
  const Icon = meta.icon
  const summary = getCallSummary(call.tool, call.args)
  const finalOutput = formatOutput(call.result)
  const displayOutput = finalOutput || call.streamingOutput || ''
  const isTerminal = call.tool.startsWith('terminal.')
  const canOpenTerminal = isTerminalCreationCall(call)
  const terminalId = canOpenTerminal ? getTerminalId(call) : null
  const runningHint = getRunningHint(call.tool, call.args)

  const StatusIcon = call.status === 'running'
    ? Loader2
    : call.status === 'success'
      ? CheckCircle2
      : XCircle

  const statusColor = call.status === 'running'
    ? 'text-muted-foreground'
    : call.status === 'success'
      ? 'text-green-500'
      : 'text-red-500'

  useEffect(() => {
    const prevStatus = prevStatusRef.current
    if (prevStatus === 'running' && call.status !== 'running') {
      setOpen(false)
    }
    prevStatusRef.current = call.status
  }, [call.status])

  useEffect(() => {
    if (call.status !== 'running') return
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
            call.status === 'running' && 'animate-spin'
          )} />
          <Icon className={cn('h-4 w-4 shrink-0', meta.color)} />
          <span className="text-sm font-medium text-muted-foreground truncate flex-1">
            {isTerminal ? (
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
          {isTerminal ? (
            <pre className={cn(
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
