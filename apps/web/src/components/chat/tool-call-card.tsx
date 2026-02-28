import { useState } from 'react'
import { Terminal, CheckCircle2, XCircle, Loader2, ChevronRight, FileText, Globe, Monitor, Server } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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

function ElapsedLabel({ startedAt, completedAt }: { startedAt: number; completedAt?: number }) {
  const ms = (completedAt ?? Date.now()) - startedAt
  if (ms < 1000) return <span>{ms}ms</span>
  return <span>{(ms / 1000).toFixed(1)}s</span>
}

interface ToolCallCardProps {
  call: ToolCallInfo
}

export function ToolCallCard({ call }: ToolCallCardProps) {
  const [open, setOpen] = useState(call.status === 'running')
  const meta = getToolMeta(call.tool)
  const Icon = meta.icon
  const summary = getCallSummary(call.tool, call.args)
  const finalOutput = formatOutput(call.result)
  const displayOutput = finalOutput || call.streamingOutput || ''
  const isTerminal = call.tool.startsWith('terminal.')

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

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex items-center gap-2 w-full text-left rounded-md px-3 py-2 hover:bg-muted/50 transition-colors">
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
            <code className="text-xs font-mono">{summary}</code>
          ) : (
            <span>{meta.label}: <code className="text-xs font-mono">{summary}</code></span>
          )}
        </span>
        <span className="text-[11px] text-muted-foreground/60 tabular-nums shrink-0">
          <ElapsedLabel startedAt={call.startedAt} completedAt={call.completedAt} />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-[3.25rem] mr-3 mb-2">
          {/* Output area — dark terminal-style block */}
          {displayOutput ? (
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running...
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
}

export function ToolCallGroup({ calls }: ToolCallGroupProps) {
  if (calls.length === 0) return null

  return (
    <div className="rounded-lg border bg-card my-2 divide-y">
      {calls.map((call) => (
        <ToolCallCard key={call.callId} call={call} />
      ))}
    </div>
  )
}
