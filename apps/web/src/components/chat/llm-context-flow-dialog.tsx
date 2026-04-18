import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, Copy, MessageSquare, Wrench } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LlmContextFlow, LlmContextFlowRound } from '@/hooks/useChat'

type TraceRow =
  | { id: string; kind: 'round'; round: LlmContextFlowRound; messageCount: number; toolCount: number }
  | { id: string; kind: 'message'; roundNumber: number; index: number; role: string; content: string; raw: unknown; toolCalls: ToolTraceCall[] }
  | { id: string; kind: 'tools'; roundNumber: number; tools: ToolSchemaSummary[] }
  | { id: string; kind: 'response'; content: string }

interface ToolTraceCall {
  id: string
  name: string
  args: string
}

interface ToolSchemaSummary {
  name: string
  description?: string
  raw: unknown
}

interface LlmContextFlowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contextFlow?: LlmContextFlow
  responseContent?: string
}

function roleClassName(role: string): string {
  switch (role) {
    case 'system':
      return 'border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300'
    case 'user':
      return 'border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300'
    case 'assistant':
      return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'tool':
      return 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

function stringifyExact(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractMessageContent(message: Record<string, unknown>): string {
  if ('content' in message) return stringifyExact(message.content)
  return stringifyExact(message)
}

function extractToolCalls(message: Record<string, unknown>): ToolTraceCall[] {
  const rawCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls
    : Array.isArray(message.toolCalls)
      ? message.toolCalls
      : []

  return rawCalls.map((raw, index) => {
    const call = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const fn = call.function && typeof call.function === 'object' ? call.function as Record<string, unknown> : {}
    return {
      id: stringifyExact(call.id || call.call_id || call.tool_call_id || `tool-call-${index + 1}`),
      name: stringifyExact(fn.name || call.name || call.tool || 'tool'),
      args: stringifyExact(fn.arguments || call.arguments || call.args || {}),
    }
  })
}

function summarizeToolSchema(raw: unknown, index: number): ToolSchemaSummary {
  const schema = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const fn = schema.function && typeof schema.function === 'object' ? schema.function as Record<string, unknown> : {}
  return {
    name: stringifyExact(fn.name || schema.name || `tool_${index + 1}`),
    description: typeof fn.description === 'string' ? fn.description : typeof schema.description === 'string' ? schema.description : undefined,
    raw,
  }
}

function buildRows(contextFlow?: LlmContextFlow, responseContent?: string): TraceRow[] {
  const rows: TraceRow[] = []

  if (!contextFlow) return responseContent ? [{ id: 'assistant-response', kind: 'response', content: responseContent }] : rows

  for (const round of contextFlow.rounds) {
    const messages = Array.isArray(round.messages) ? round.messages : []
    const tools = Array.isArray(round.tools) ? round.tools.map(summarizeToolSchema) : []
    rows.push({
      id: `round-${round.round}`,
      kind: 'round',
      round,
      messageCount: messages.length,
      toolCount: tools.length,
    })

    messages.forEach((raw, index) => {
      const message = raw && typeof raw === 'object' ? raw as Record<string, unknown> : { content: raw }
      rows.push({
        id: `round-${round.round}-message-${index}`,
        kind: 'message',
        roundNumber: round.round,
        index,
        role: stringifyExact(message.role || 'message'),
        content: extractMessageContent(message),
        raw,
        toolCalls: extractToolCalls(message),
      })
    })

    if (tools.length > 0) {
      rows.push({
        id: `round-${round.round}-tools`,
        kind: 'tools',
        roundNumber: round.round,
        tools,
      })
    }
  }

  if (responseContent) rows.push({ id: 'assistant-response', kind: 'response', content: responseContent })
  return rows
}

function TraceRowView({ row }: { row: TraceRow }) {
  if (row.kind === 'round') {
    return (
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-foreground px-2 py-1 text-xs font-semibold text-background">
            Round {row.round.round}
          </span>
          <span className="text-xs text-muted-foreground">{row.round.model}</span>
          <span className="text-xs text-muted-foreground">{new Date(row.round.createdAt).toLocaleString()}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{row.messageCount} messages sent</span>
          <span>{row.toolCount} tool schemas available</span>
          {row.round.tool_choice ? <span>tool_choice: {row.round.tool_choice}</span> : null}
        </div>
      </div>
    )
  }

  if (row.kind === 'tools') {
    return (
      <div className="relative ml-4 border-l border-border pl-4">
        <div className="absolute -left-1.5 top-3 h-3 w-3 rounded-full border border-border bg-background" />
        <div className="rounded-md border border-border/80 bg-muted/25 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
            <Wrench className="h-3.5 w-3.5" />
            Tools offered to model in round {row.roundNumber}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {row.tools.map((tool) => (
              <details key={tool.name} className="rounded-md border border-border/70 bg-background/70 p-2">
                <summary className="cursor-pointer text-xs font-medium text-foreground">{tool.name}</summary>
                {tool.description ? (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
                ) : null}
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-xs leading-5">
                  {stringifyExact(tool.raw)}
                </pre>
              </details>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (row.kind === 'response') {
    return (
      <div className="relative ml-4 border-l border-border pl-4">
        <div className="absolute -left-1.5 top-3 h-3 w-3 rounded-full border border-emerald-500/40 bg-background" />
        <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={cn('rounded-md border px-2 py-0.5 text-xs font-semibold', roleClassName('assistant'))}>
              assistant response
            </span>
            <span className="text-xs text-muted-foreground">rendered chat answer</span>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/70 p-3 font-mono text-xs leading-5 text-foreground [overflow-wrap:anywhere]">
            {row.content || '(empty response)'}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="relative ml-4 border-l border-border pl-4">
      <div className="absolute -left-1.5 top-3 h-3 w-3 rounded-full border border-border bg-background" />
      <div className="rounded-md border border-border/80 bg-background p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={cn('rounded-md border px-2 py-0.5 text-xs font-semibold', roleClassName(row.role))}>
            {row.role}
          </span>
          <span className="text-xs text-muted-foreground">round {row.roundNumber} / message {row.index + 1}</span>
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/35 p-3 font-mono text-xs leading-5 text-foreground [overflow-wrap:anywhere]">
          {row.content || '(empty content)'}
        </pre>
        {row.toolCalls.length > 0 ? (
          <div className="mt-3 space-y-2">
            {row.toolCalls.map((call) => (
              <details key={call.id} className="rounded-md border border-amber-500/25 bg-amber-500/10 p-2">
                <summary className="cursor-pointer text-xs font-medium text-amber-800 dark:text-amber-200">
                  Tool call: {call.name} <span className="font-normal text-muted-foreground">({call.id})</span>
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-background/70 p-2 font-mono text-xs leading-5">
                  {call.args || '{}'}
                </pre>
              </details>
            ))}
          </div>
        ) : null}
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">Raw message JSON</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/35 p-2 font-mono text-xs leading-5">
            {stringifyExact(row.raw)}
          </pre>
        </details>
      </div>
    </div>
  )
}

export function LlmContextFlowDialog({ open, onOpenChange, contextFlow, responseContent }: LlmContextFlowDialogProps) {
  const [mode, setMode] = useState<'trace' | 'raw'>('trace')
  const [copied, setCopied] = useState(false)
  const parentRef = useRef<HTMLDivElement | null>(null)
  const rows = useMemo(() => buildRows(contextFlow, responseContent), [contextFlow, responseContent])
  const rawText = useMemo(() => contextFlow ? JSON.stringify(contextFlow, null, 2) : '', [contextFlow])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rows[index]
      if (!row) return 120
      if (row.kind === 'round') return 96
      if (row.kind === 'tools') return Math.min(420, 110 + row.tools.length * 72)
      if (row.kind === 'response') return Math.min(520, 120 + Math.ceil(row.content.length / 90) * 18)
      return Math.min(520, 135 + Math.ceil(row.content.length / 90) * 18 + row.toolCalls.length * 72)
    },
    overscan: 5,
  })

  const copyRaw = async () => {
    if (!rawText) return
    await navigator.clipboard.writeText(rawText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[85vh] max-w-[min(1200px,96vw)] grid-rows-[auto_minmax(0,1fr)] p-0">
        <DialogHeader className="border-b px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle>LLM Context Flow</DialogTitle>
              <DialogDescription>
                {contextFlow
                  ? `${contextFlow.provider}${contextFlow.model ? ` / ${contextFlow.model}` : ''} / ${contextFlow.rounds.length} request${contextFlow.rounds.length === 1 ? '' : 's'}`
                  : 'No context snapshot is available for this message.'}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={mode === 'trace' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('trace')}
              >
                Trace
              </Button>
              <Button
                type="button"
                variant={mode === 'raw' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('raw')}
              >
                Raw
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={copyRaw} disabled={!rawText}>
                {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {mode === 'trace' ? (
          <div className="min-h-0 px-5 pb-5 pt-4">
            {contextFlow?.note ? (
              <p className="mb-3 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {contextFlow.note}
              </p>
            ) : null}
            {rows.length > 0 ? (
              <div ref={parentRef} className="h-full min-h-0 overflow-auto pr-2">
                <div
                  className="relative w-full"
                  style={{ height: `${virtualizer.getTotalSize()}px` }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const row = rows[virtualRow.index]
                    if (!row) return null
                    return (
                      <div
                        key={row.id}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        className="absolute left-0 top-0 w-full pb-3"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <TraceRowView row={row} />
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                <MessageSquare className="mr-2 h-4 w-4" />
                No context snapshot is available for this message.
              </div>
            )}
          </div>
        ) : (
          <div className="min-h-0 overflow-auto px-5 pb-5 pt-4">
            <pre className="min-h-full whitespace-pre-wrap break-words rounded-md border border-border/70 bg-muted/35 p-3 font-mono text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {rawText || 'No context snapshot is available for this message.'}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
