/**
 * ActivityItem — renders a single thread activity entry.
 *
 * Extracted from AutomationPage for reuse in the merged Chat view.
 */

import { AlertCircle, Bot, CheckCircle2, Info, MessageSquare, Shield, User, Wrench, XCircle, type LucideIcon } from 'lucide-react'
import type { ThreadActivity } from '@/lib/agents-api'

type ActivityMeta = {
  icon: LucideIcon
  label: string
  cardClass: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function truncate(value: string, max = 220): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function summarizeArgs(args: Record<string, unknown> | null): string | null {
  if (!args) return null
  const candidateKeys = ['command', 'path', 'url', 'query', 'pattern', 'selector', 'name', 'toolName']
  for (const key of candidateKeys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      return `${key}: ${truncate(value.trim())}`
    }
  }
  try {
    return truncate(JSON.stringify(args))
  } catch {
    return null
  }
}

function formatKindLabel(kind: string): string {
  return kind
    .replace(/^codex\/event\//, '')
    .replace(/[./_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function getMeta(kind: string, role?: string): ActivityMeta {
  if (kind === 'message' && role === 'user') {
    return {
      icon: User,
      label: 'User',
      cardClass: 'bg-primary/5 border-primary/20 ml-12',
    }
  }
  if (kind === 'message' && role === 'assistant') {
    return {
      icon: Bot,
      label: 'Assistant',
      cardClass: 'bg-card mr-12',
    }
  }

  const mapped: Record<string, ActivityMeta> = {
    'tool.start': { icon: Wrench, label: 'Tool Start', cardClass: 'bg-card mr-8' },
    'tool.result': { icon: CheckCircle2, label: 'Tool Result', cardClass: 'bg-card mr-8 border-green-500/20' },
    'tool.error': { icon: XCircle, label: 'Tool Error', cardClass: 'bg-card mr-8 border-red-500/30' },
    'tool.approval': { icon: Shield, label: 'Approval Required', cardClass: 'bg-card mr-8 border-amber-500/30' },
    session: { icon: Info, label: 'Session', cardClass: 'bg-card mr-8' },
    error: { icon: AlertCircle, label: 'Error', cardClass: 'bg-card mr-8 border-red-500/30' },
    reasoning: { icon: Bot, label: 'Reasoning', cardClass: 'bg-card mr-8' },
  }
  return mapped[kind] ?? { icon: MessageSquare, label: formatKindLabel(kind), cardClass: 'bg-card mr-8' }
}

export function ActivityItem({ activity }: { activity: ThreadActivity }) {
  const payload = asRecord(activity.payload)
  const role = typeof payload?.role === 'string' ? payload.role : undefined
  const tool = typeof payload?.tool === 'string' ? payload.tool : undefined
  const args = asRecord(payload?.args)
  const message = typeof payload?.message === 'string' ? payload.message : undefined
  const meta = getMeta(activity.kind, role)
  const Icon = meta.icon
  const summary = (message || activity.summary || '').trim()
  const argsPreview = summarizeArgs(args)

  return (
    <div className={`rounded-lg border p-3 text-sm ${meta.cardClass}`}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{meta.label}</span>
          {tool && (
            <code className="rounded bg-muted px-1.5 py-0.5 text-2xs">{tool}</code>
          )}
        </span>
        <span className="text-2xs text-muted-foreground">{new Date(activity.createdAt).toLocaleTimeString()}</span>
      </div>
      {summary && (
        <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed">{summary}</pre>
      )}
      {argsPreview && (
        <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">
          {argsPreview}
        </p>
      )}
      {payload && (
        <details className="mt-2 rounded-md border bg-muted/30 px-2 py-1">
          <summary className="cursor-pointer text-xs text-muted-foreground">Payload</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
