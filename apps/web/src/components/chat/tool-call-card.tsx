import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Terminal, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight, FileText, Globe, Monitor, Server, ExternalLink, Search, ListTodo, Network, Zap, BookOpen, Brain, Circle } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EditDiffView } from '@/components/chat/edit-diff-view'
import { FileIcon } from '@/components/icons/file-icons'
import { resolveChatImageUrl } from '@/lib/chat-image-url'
import { getMcpToolLabel, getToolCallBodyKind, getToolFilePath, getToolFilePaths, getToolImageDataUri, getToolImagePath, isAgentToolName, isMcpToolName, normalizeToolArgs, normalizeToolName, summarizeToolArguments } from '@/lib/tool-call-body'
import { getApiUrl } from '@/lib/gateway-url'
import { agentsApi } from '@/lib/agents-api'
import type { ThreadActivity } from '@/lib/agents-api'
import { cn } from '@/lib/utils'

/** Auto-scroll a container to the bottom when content changes. */
function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLPreElement>(null)
  const rafRef = useRef<number | null>(null)
  useEffect(() => {
    if (rafRef.current !== null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      const el = ref.current
      if (el) el.scrollTop = el.scrollHeight
    })
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [dep])
  return ref
}

export interface ToolCallInfo {
  callId: string
  parentCallId?: string
  tool: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'success' | 'error'
  approvalRequestId?: string
  approvalState?: 'pending' | 'approved' | 'rejected'
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
  'delete':          { icon: FileText,  label: 'Delete',      color: 'text-red-500' },
  'move':            { icon: FileText,  label: 'Move',        color: 'text-blue-500' },
  'think':           { icon: Zap,       label: 'Think',       color: 'text-purple-500' },
  'other':           { icon: Terminal,  label: 'Tool',        color: 'text-muted-foreground' },
  'fetch':           { icon: Globe,     label: 'Fetch',       color: 'text-cyan-500' },
  'web':             { icon: Globe,     label: 'Web',         color: 'text-cyan-500' },
  'agent':           { icon: Network,   label: 'Agent',       color: 'text-purple-500' },
  'agent.spawn':     { icon: Network,   label: 'Agent',       color: 'text-purple-500' },
  'agent.wait':      { icon: Network,   label: 'Agent',       color: 'text-purple-500' },
  'agent.close':     { icon: Network,   label: 'Agent',       color: 'text-purple-500' },
  'agent.resume':    { icon: Network,   label: 'Agent',       color: 'text-purple-500' },
  'agent.send':      { icon: Network,   label: 'Agent',       color: 'text-purple-500' },
  'agent.run':       { icon: Network,   label: 'Agent',       color: 'text-purple-500' },
  'agent.search':    { icon: Network,   label: 'Agent',       color: 'text-purple-500' },
  'todo':            { icon: ListTodo,  label: 'Todo',        color: 'text-orange-500' },
  'jait':            { icon: Zap,       label: 'Jait',        color: 'text-indigo-500' },
  'thread.control':  { icon: Network,   label: 'Threads',     color: 'text-purple-500' },
  'mcp-tool':        { icon: Server,    label: 'MCP Tool',   color: 'text-purple-500' },
  'skill':           { icon: BookOpen,  label: 'Skill',      color: 'text-violet-500' },
  'tools.search':    { icon: Search,    label: 'Search Tools', color: 'text-purple-500' },
  'tools.list':      { icon: ListTodo,  label: 'List Tools',   color: 'text-purple-500' },
  // ── SSH tools ───────────────────────────────────────────
  'ssh.run':           { icon: Terminal,  label: 'SSH',        color: 'text-yellow-500' },
  'run.ssh':           { icon: Terminal,  label: 'SSH',        color: 'text-yellow-500' },
  'ssh.session.start': { icon: Terminal,  label: 'SSH',        color: 'text-yellow-500' },
  'ssh.session.run':   { icon: Terminal,  label: 'SSH',        color: 'text-yellow-500' },
  'ssh.session.close': { icon: Terminal,  label: 'SSH',        color: 'text-yellow-500' },
  'elevated.run':      { icon: Terminal,  label: 'Elevated',   color: 'text-amber-500' },
  // ── Legacy / standard tools ─────────────────────────────
  'jait.terminal':   { icon: Terminal,  label: 'Terminal',    color: 'text-yellow-500' },
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
  'memory.save':     { icon: Brain,  label: 'Save Memory', color: 'text-amber-500' },
  'memory.search':   { icon: Brain,  label: 'Search Memory', color: 'text-amber-500' },
  'memory.list':     { icon: Brain,  label: 'List Memory', color: 'text-amber-500' },
  'memory.update':   { icon: Brain,  label: 'Update Memory', color: 'text-amber-500' },
  'memory.forget':   { icon: Brain,  label: 'Forget Memory', color: 'text-amber-500' },
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

/**
 * Return verb-tense-aware labels for a tool call, similar to Copilot's
 * `invocationMessage` / `pastTenseMessage` pattern.
 *
 * Returns { running, done } where:
 * - `running` is the in-progress label (e.g. "Reading file.ts")
 * - `done` is the completed label (e.g. "Read file.ts")
 *
 * Falls back to the static `meta.label` when no specific mapping exists.
 */
export function getToolInvocationLabels(
  tool: string,
  args: Record<string, unknown>,
  resultData?: unknown,
  resultMessage?: string | null,
): { running: string; done: string } {
  const initialNormalized = normalizeTool(tool)
  const normalized = getJaitMcpToolName(initialNormalized, null, args) ?? initialNormalized
  const resultRecord = resultData && typeof resultData === 'object' && !Array.isArray(resultData)
    ? resultData as Record<string, unknown>
    : undefined
  const normalizedArgs = normalizeToolArgs(normalized, getJaitMcpToolArgs(args), resultRecord)
  const fileName = (() => {
    const p = getToolFilePath(normalized, normalizedArgs, resultData, resultMessage)
      ?? displayStr(normalizedArgs.path ?? normalizedArgs.file)
    return p ? getBaseName(p) : ''
  })()
  const query = displayStr(normalizedArgs.query ?? normalizedArgs.pattern ?? normalizedArgs.q)

  // ── Core tools ──────────────────────────────────────────
  if (normalized === 'read' || normalized === 'file.read') {
    return { running: `Reading ${fileName || 'file'}`, done: `Read ${fileName || 'file'}` }
  }
  if (normalized === 'edit' || normalized === 'file.patch') {
    return { running: `Editing ${fileName || 'file'}`, done: `Edited ${fileName || 'file'}` }
  }
  if (normalized === 'file.write') {
    return { running: `Writing ${fileName || 'file'}`, done: `Created ${fileName || 'file'}` }
  }
  if (normalized === 'file.list') {
    return { running: 'Listing files', done: 'Listed files' }
  }
  if (normalized === 'file.stat') {
    return { running: `Inspecting ${fileName || 'file'}`, done: `Inspected ${fileName || 'file'}` }
  }
  if (normalized === 'execute' || normalized === 'jait.terminal' || normalized.startsWith('terminal.')) {
    return { running: 'Running command', done: 'Ran command' }
  }
  if (normalized.startsWith('ssh.') || normalized === 'run.ssh') {
    return { running: 'Running SSH command', done: 'Ran SSH command' }
  }
  if (normalized === 'elevated.run') {
    return { running: 'Running elevated command', done: 'Ran elevated command' }
  }
  if (normalized === 'search') {
    const mode = displayStr(normalizedArgs.mode ?? args.mode, 'content')
    const target = query ? ` "${truncate(query, 40)}"` : ''
    if (mode === 'files') return { running: `Finding files${target}`, done: `Found files${target}` }
    return { running: `Searching${target}`, done: `Searched${target}` }
  }
  if (normalized === 'web' || normalized === 'web.search' || normalized === 'browser.search') {
    const mode = displayStr(normalizedArgs.mode ?? normalizedArgs.type)
    if (mode === 'fetch') {
      const host = getUrlHost(normalizedArgs.url)
      return { running: `Fetching ${host || 'page'}`, done: `Fetched ${host || 'page'}` }
    }
    const target = query ? ` "${truncate(query, 40)}"` : ''
    return { running: `Searching web${target}`, done: `Searched web${target}` }
  }
  if (normalized === 'web.fetch' || normalized === 'browser.fetch') {
    const host = getUrlHost(normalizedArgs.url)
    return { running: `Fetching ${host || 'page'}`, done: `Fetched ${host || 'page'}` }
  }
  if (normalized === 'browser.navigate') {
    const host = getUrlHost(normalizedArgs.url)
    return { running: `Navigating to ${host || 'page'}`, done: `Navigated to ${host || 'page'}` }
  }
  if (normalized === 'browser.snapshot') {
    return { running: 'Taking snapshot', done: 'Took snapshot' }
  }
  if (normalized === 'browser.click') {
    return { running: 'Clicking element', done: 'Clicked element' }
  }
  if (normalized === 'browser.type') {
    return { running: 'Typing text', done: 'Typed text' }
  }
  if (normalized === 'browser.screenshot') {
    return { running: 'Taking screenshot', done: 'Took screenshot' }
  }
  if (normalized === 'browser.wait') {
    return { running: 'Waiting for element', done: 'Waited for element' }
  }
  if (normalized === 'browser.scroll') {
    return { running: 'Scrolling', done: 'Scrolled' }
  }
  if (normalized === 'browser.select') {
    return { running: 'Selecting', done: 'Selected' }
  }
  if (normalized === 'tools.search') {
    return { running: 'Searching tools', done: 'Searched tools' }
  }
  if (normalized === 'tools.list') {
    return { running: 'Listing tools', done: 'Listed tools' }
  }
  if (isAgentToolName(normalized)) {
    const desc = truncate(displayStr(args.description ?? args.prompt ?? args.message), 60)
    if (normalized === 'agent.wait') return { running: 'Waiting for agents', done: 'Collected agent results' }
    if (normalized === 'agent.close') return { running: 'Closing agent', done: 'Closed agent' }
    if (normalized === 'agent.resume') return { running: 'Resuming agent', done: 'Resumed agent' }
    if (normalized === 'agent.send') return { running: 'Sending to agent', done: 'Sent to agent' }
    return { running: `Running agent${desc ? `: ${desc}` : ''}`, done: `Agent completed${desc ? `: ${desc}` : ''}` }
  }
  if (normalized === 'thread.control') {
    const action = displayStr(normalizedArgs.action)
    const count = Array.isArray(normalizedArgs.threads) ? normalizedArgs.threads.length : 1
    if (action === 'create_many') return { running: `Running ${count} threads`, done: `Ran ${count} threads` }
    if ((action === 'create' || action === 'start') && normalizedArgs.start !== false) {
      return { running: 'Processing thread', done: 'Processed thread' }
    }
    if (action === 'create') return { running: 'Creating thread', done: 'Created thread' }
    return { running: 'Managing threads', done: 'Managed threads' }
  }
  if (normalized === 'todo') {
    return { running: 'Updating tasks', done: 'Updated tasks' }
  }
  if (normalized === 'skill') {
    const names = displayStr(args.skills)
    return { running: `Using skills ${names || ''}`.trim(), done: `Using skills ${names || ''}`.trim() }
  }
  if (normalized === 'memory.save') {
    return { running: 'Saving to memory', done: 'Saved to memory' }
  }
  if (normalized === 'memory.search') {
    return { running: 'Searching memory', done: 'Searched memory' }
  }
  if (normalized === 'memory.list') {
    return { running: 'Loading memory', done: 'Loaded memory' }
  }
  if (normalized === 'memory.update') {
    return { running: 'Updating memory', done: 'Updated memory' }
  }
  if (normalized === 'memory.forget') {
    return { running: 'Removing memory', done: 'Removed memory' }
  }
  if (normalized === 'os.query') {
    return { running: 'Querying system', done: 'Queried system' }
  }
  if (normalized === 'os.install') {
    return { running: `Installing ${displayStr(args.package) || 'package'}`, done: `Installed ${displayStr(args.package) || 'package'}` }
  }
  if (normalized.startsWith('cron.')) {
    const verb = normalized.split('.')[1] ?? 'manage'
    const ing = verb === 'add' ? 'Adding' : verb === 'update' ? 'Updating' : verb === 'remove' ? 'Removing' : 'Listing'
    const ed = verb === 'add' ? 'Added' : verb === 'update' ? 'Updated' : verb === 'remove' ? 'Removed' : 'Listed'
    return { running: `${ing} cron job`, done: `${ed} cron job` }
  }
  if (normalized.startsWith('ssh.') || normalized === 'run.ssh') {
    const cmd = displayStr(normalizedArgs.command ?? args.command)
    const host = displayStr(normalizedArgs.host ?? args.host)
    const label = cmd && host ? `${host}: ${truncate(cmd, 60)}` : cmd ? truncate(cmd, 80) : host || 'SSH'
    return { running: label, done: label }
  }
  if (normalized === 'elevated.run') {
    const label = displayStr(normalizedArgs.command ?? args.command) || 'elevated'
    return { running: label, done: label }
  }
  if (normalized.startsWith('surfaces.')) {
    const verb = normalized.split('.')[1] ?? 'manage'
    if (verb === 'start') return { running: 'Starting surface', done: 'Started surface' }
    if (verb === 'stop') return { running: 'Stopping surface', done: 'Stopped surface' }
    return { running: 'Listing surfaces', done: 'Listed surfaces' }
  }
  if (normalized.startsWith('ssh.') || normalized === 'run.ssh') {
    return { running: 'Running SSH command', done: 'Ran SSH command' }
  }
  if (normalized === 'image.view') {
    return { running: 'Viewing image', done: 'Viewed image' }
  }
  if (normalized === 'preview.open') {
    return { running: 'Opening preview', done: 'Opened preview' }
  }
  if (normalized === 'jait') {
    const action = displayStr(args.action)
    return { running: `Jait: ${action || 'working'}`, done: `Jait: ${action || 'done'}` }
  }
  if (isMcpToolName(normalized)) {
    const mcp = getMcpToolLabel(normalizedArgs, resultRecord)
    const label = mcp.title || 'MCP Tool'
    return { running: `Running ${label}`, done: `Ran ${label}` }
  }

  // Fallback
  const meta = getToolMeta(tool)
  return { running: meta.label, done: meta.label }
}

export function formatMcpHeaderText(
  invocationLabel: string,
  mcpLabel: { title: string | null; details: string | null },
): string {
  if (mcpLabel.title && mcpLabel.details) return `${mcpLabel.title} • ${mcpLabel.details}`
  if (mcpLabel.title) return mcpLabel.title
  if (mcpLabel.details) return `${invocationLabel}: ${mcpLabel.details}`
  return invocationLabel
}

function getWrappedJaitMcpToolName(args?: Record<string, unknown>): string | null {
  if (!args) return null
  const server = typeof args.server === 'string' ? args.server.trim() : ''
  if (server !== 'jait' && server !== 'jait_core') return null
  const tool = typeof args.tool === 'string' ? args.tool.trim() : ''
  return tool ? tool.replace(/_/g, '.') : null
}

export function getJaitMcpToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (!getWrappedJaitMcpToolName(args)) return args
  return parseStructuredRecord(args.arguments) ?? {}
}

export function getJaitMcpToolName(
  toolName: string,
  title?: string | null,
  args?: Record<string, unknown>,
): string | null {
  const wrappedTool = getWrappedJaitMcpToolName(args)
  if (wrappedTool) return wrappedTool

  for (const candidate of [toolName, title]) {
    if (!candidate) continue
    const normalized = candidate
      .replace(/^functions[._]/, '')
      .replace(/__/g, '.')
      .replace(/\.{2,}/g, '.')
    const match = normalized.match(/^mcp[._]jait(?:_core)?[._](.+)$/i)
    if (!match?.[1]) continue
    return match[1].replace(/_/g, '.')
  }
  return null
}

function getMemoryResultCount(value: unknown, depth = 0): number | null {
  if (depth > 5 || value == null) return null
  if (typeof value === 'string') {
    return getMemoryResultCount(parseStructuredOrEmbeddedRecord(value), depth + 1)
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const count = getMemoryResultCount(entry, depth + 1)
      if (count != null) return count
    }
    return null
  }
  if (typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  for (const key of ['retrieved', 'entries']) {
    if (Array.isArray(record[key])) return record[key].length
  }
  for (const key of ['result', 'data', 'flow', 'structuredContent', 'content']) {
    const count = getMemoryResultCount(record[key], depth + 1)
    if (count != null) return count
  }
  return null
}

export function shouldRenderToolCall(call: ToolCallInfo): boolean {
  const normalizedTool = normalizeTool(call.tool)
  const resultData = call.result?.data && typeof call.result.data === 'object' && !Array.isArray(call.result.data)
    ? call.result.data as Record<string, unknown>
    : undefined
  const mcpLabel = isMcpToolName(normalizedTool) ? getMcpToolLabel(call.args, resultData) : null
  const displayTool = getJaitMcpToolName(normalizedTool, mcpLabel?.title) ?? normalizedTool

  if (displayTool === 'skill') {
    const skills = call.args.skills ?? resultData?.names ?? resultData?.skills
    return (typeof skills === 'string' && skills.trim().length > 0)
      || (Array.isArray(skills) && skills.length > 0)
  }

  if (displayTool !== 'memory.search' || call.status === 'running' || call.status === 'pending') return true
  const retrievedCount = getMemoryResultCount(call.result?.data)
  if (retrievedCount != null) return retrievedCount > 0
  return !/no relevant memories found|0 relevant memories/i.test(call.result?.message ?? '')
}

/**
 * Derive a friendly display label from an MCP inner tool name.
 * Falls back to a cleaned-up version of the raw name.
 */
function getMcpDisplayLabel(innerName: string | null): { label: string; icon: typeof Terminal; color: string } | null {
  if (!innerName) return null
  const jaitToolName = getJaitMcpToolName(innerName)
  if (jaitToolName) {
    const nativeMeta = toolMeta[jaitToolName]
    if (nativeMeta) return nativeMeta
  }
  const n = innerName.toLowerCase().replace(/^mcp__/, '').replace(/__/g, '.')
  if (n.startsWith('ssh')) return { label: 'SSH', icon: Terminal, color: 'text-yellow-500' }
  if (n.startsWith('git')) return { label: 'Git', icon: Terminal, color: 'text-orange-500' }
  if (n.startsWith('docker') || n.startsWith('container')) return { label: 'Docker', icon: Server, color: 'text-blue-500' }
  if (n.startsWith('github')) return { label: 'GitHub', icon: Globe, color: 'text-purple-500' }
  if (n.startsWith('postgres') || n.startsWith('mysql') || n.startsWith('sqlite') || n.startsWith('db') || n.startsWith('sql')) return { label: 'Database', icon: Server, color: 'text-emerald-500' }
  if (n.startsWith('fs') || n.startsWith('file') || n.startsWith('read') || n.startsWith('write')) return { label: 'File', icon: FileText, color: 'text-blue-500' }
  if (n.startsWith('browser') || n.startsWith('web') || n.startsWith('http') || n.startsWith('fetch')) return { label: 'Web', icon: Globe, color: 'text-cyan-500' }
  if (n.startsWith('shell') || n.startsWith('exec') || n.startsWith('bash') || n.startsWith('terminal') || n.startsWith('command')) return { label: 'Terminal', icon: Terminal, color: 'text-yellow-500' }
  if (n.startsWith('memory') || n.startsWith('knowledge')) return { label: 'Memory', icon: Brain, color: 'text-amber-500' }
  // Use the first segment (server name) as a fallback label
  const firstSegment = n.split('.')[0] ?? n
  const pretty = firstSegment.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
  return pretty ? { label: pretty, icon: Server, color: 'text-purple-500' } : null
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

type ThreadListStatus = 'idle' | 'running' | 'completed' | 'error' | 'interrupted' | 'starting' | 'created'

interface ThreadListItem {
  id: string | null
  title: string
  status: ThreadListStatus
  providerId: string | null
  kind: string | null
  branch: string | null
  workingDirectory: string | null
  error: string | null
  /** Short mission/prompt snippet from the create_many spec, when available. */
  mission: string | null
}

type ThreadListRecord = Record<string, unknown>

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function getThreadListStatus(value: unknown, fallback: ThreadListStatus): ThreadListStatus {
  return value === 'idle'
    || value === 'running'
    || value === 'completed'
    || value === 'error'
    || value === 'interrupted'
    || value === 'starting'
    || value === 'created'
    ? value
    : fallback
}

function getThreadListString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

type TodoToolStatus = 'not-started' | 'in-progress' | 'completed'

interface TodoToolListItem {
  id: number
  title: string
  status: TodoToolStatus
}

function getTodoToolStatus(value: unknown): TodoToolStatus {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/_/g, '-') : ''
  if (normalized === 'completed' || normalized === 'done') return 'completed'
  if (normalized === 'in-progress' || normalized === 'running' || normalized === 'active') return 'in-progress'
  return 'not-started'
}

export function getTodoToolListItems(
  args: Record<string, unknown>,
  resultData?: Record<string, unknown>,
): TodoToolListItem[] {
  const argsTodoRecord = toRecord(args.todoList)
  const resultTodoRecord = toRecord(resultData?.todoList)
  const rawItems = Array.isArray(args.todoList)
    ? args.todoList
    : Array.isArray(argsTodoRecord?.items)
      ? argsTodoRecord.items
      : Array.isArray(resultData?.items)
        ? resultData.items
        : Array.isArray(resultData?.todoList)
          ? resultData.todoList
          : Array.isArray(resultTodoRecord?.items)
            ? resultTodoRecord.items
            : []

  return rawItems.flatMap((entry, index) => {
    const record = toRecord(entry)
    if (!record) return []
    const title = getThreadListString(record.title)
      ?? getThreadListString(record.step)
      ?? getThreadListString(record.task)
    if (!title) return []
    return [{
      id: typeof record.id === 'number' ? record.id : index + 1,
      title,
      status: getTodoToolStatus(record.status),
    }]
  })
}

function threadItemFromRecord(record: Record<string, unknown>, fallbackStatus: ThreadListStatus): ThreadListItem {
  return {
    id: getThreadListString(record.id),
    title: getThreadListString(record.title) ?? 'Untitled thread',
    status: getThreadListStatus(record.status, fallbackStatus),
    providerId: getThreadListString(record.providerId),
    kind: getThreadListString(record.kind),
    branch: getThreadListString(record.branch),
    workingDirectory: getThreadListString(record.workingDirectory),
    error: getThreadListString(record.error),
    mission: getThreadListString(record.prompt)
      ?? getThreadListString(record.message)
      ?? getThreadListString(record.task)
      ?? getThreadListString(record.description),
  }
}

function normalizeThreadTitle(value: string): string {
  return value.trim().replace(/^\[.*?\]\s*/, '').toLowerCase()
}

function mergeLiveThreadItems(items: ThreadListItem[], liveThreadRecords?: ThreadListRecord[]): ThreadListItem[] {
  if (!liveThreadRecords?.length) return items
  const liveItems = liveThreadRecords.flatMap((record) => [threadItemFromRecord(record, 'created')])
  const liveById = new Map(liveItems.flatMap((item) => item.id ? [[item.id, item]] : []))
  const liveByTitle = new Map<string, ThreadListItem>()
  for (const item of liveItems) {
    liveByTitle.set(normalizeThreadTitle(item.title), item)
  }
  return items.map((item) => {
    const live = (item.id ? liveById.get(item.id) : undefined) ?? liveByTitle.get(normalizeThreadTitle(item.title))
    return live ? { ...item, ...live } : item
  })
}

export function getThreadControlListItems(
  args: Record<string, unknown>,
  resultData?: Record<string, unknown>,
  status?: ToolCallInfo['status'],
  liveThreadRecords?: ThreadListRecord[],
): ThreadListItem[] {
  const dataThreads = Array.isArray(resultData?.threads) ? resultData.threads : null
  if (dataThreads) {
    return mergeLiveThreadItems(dataThreads.flatMap((entry) => {
      const record = toRecord(entry)
      return record ? [threadItemFromRecord(record, 'created')] : []
    }), liveThreadRecords)
  }

  const dataThread = toRecord(resultData?.thread)
  if (dataThread) return mergeLiveThreadItems([threadItemFromRecord(dataThread, 'created')], liveThreadRecords)

  const fallbackStatus: ThreadListStatus = status === 'running' || status === 'pending' ? 'starting' : 'created'
  if (Array.isArray(args.threads)) {
    return mergeLiveThreadItems(args.threads.flatMap((entry) => {
      const record = toRecord(entry)
      return record ? [threadItemFromRecord(record, fallbackStatus)] : []
    }), liveThreadRecords)
  }

  if (args.action === 'create') {
    return mergeLiveThreadItems([threadItemFromRecord(args, fallbackStatus)], liveThreadRecords)
  }

  return []
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

function getLines(value: string): string[] {
  if (!value) return []
  const lines = value.split('\n')
  return lines.length > 1 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines
}

function countChangedLines(original: string, modified: string): { insertions: number; deletions: number } {
  const originalLines = getLines(original)
  const modifiedLines = getLines(modified)
  if (originalLines.length === 0) return { insertions: modifiedLines.length, deletions: 0 }
  if (modifiedLines.length === 0) return { insertions: 0, deletions: originalLines.length }

  const previous = Array.from({ length: modifiedLines.length + 1 }, () => 0) as number[]
  const current = Array.from({ length: modifiedLines.length + 1 }, () => 0) as number[]

  for (let leftIndex = 1; leftIndex <= originalLines.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= modifiedLines.length; rightIndex += 1) {
      current[rightIndex] = originalLines[leftIndex - 1] === modifiedLines[rightIndex - 1]
        ? previous[rightIndex - 1]! + 1
        : Math.max(previous[rightIndex]!, current[rightIndex - 1]!)
    }
    previous.splice(0, previous.length, ...current)
    current.fill(0)
  }

  const unchanged = previous[modifiedLines.length] ?? 0
  return {
    insertions: Math.max(0, modifiedLines.length - unchanged),
    deletions: Math.max(0, originalLines.length - unchanged),
  }
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

function getFileSummaryActionLabel(tool: string, isActive: boolean): string {
  const normalized = normalizeTool(tool)
  if (normalized === 'read' || normalized === 'file.read') return isActive ? 'Reading' : 'Read'
  if (normalized === 'file.write') return isActive ? 'Writing' : 'Created'
  if (normalized === 'edit' || normalized === 'file.patch') return isActive ? 'Editing' : 'Edited'
  return isActive ? 'Working' : 'Done'
}

function getFileContextLabel(args: Record<string, unknown>): string | null {
  return firstDisplayString(
    args.symbol,
    args.method,
    args.methodName,
    args.function,
    args.functionName,
  )
}

/** Extract a 1-based line range from read-tool args or its result data, tolerating provider naming variants. */
function getReadLineRange(
  args: Record<string, unknown>,
  resultData?: Record<string, unknown>,
): { start: number; end: number } | null {
  const toNum = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) ? n : undefined
  }
  const resultStart = toNum(resultData?.startLine)
  const resultEnd = toNum(resultData?.endLine)
  if (resultStart != null && resultEnd != null) return { start: resultStart, end: resultEnd }

  const start = toNum(args.startLine ?? args.start_line ?? args.offset ?? args.line)
  const explicitEnd = toNum(args.endLine ?? args.end_line)
  if (start != null && explicitEnd != null) return { start, end: explicitEnd }
  const limit = toNum(args.limit ?? args.lineCount ?? args.line_count)
  if (start != null && limit != null && limit > 0) return { start, end: start + limit - 1 }
  if (start != null) return { start, end: start }
  return null
}

function formatFileNameAndContext(
  path: string,
  args: Record<string, unknown>,
  resultData?: Record<string, unknown>,
): string {
  const fileName = getBaseName(path)
  const lineRange = getReadLineRange(args, resultData)
  const rangeLabel = lineRange
    ? lineRange.start === lineRange.end
      ? `:${lineRange.start}`
      : `:${lineRange.start}-${lineRange.end}`
    : ''
  const base = `${fileName}${rangeLabel}`
  const context = getFileContextLabel(args)
  return context ? `${base} · ${context}` : base
}

export function getEditDiffCounts(tool: string, args: Record<string, unknown>): { insertions: number; deletions: number } | null {
  const normalized = normalizeTool(tool)
  const normalizedArgs = normalizeToolArgs(normalized, args)
  const search = typeof normalizedArgs.search === 'string' ? normalizedArgs.search : ''
  const replace = typeof normalizedArgs.replace === 'string' ? normalizedArgs.replace : ''
  const content = typeof normalizedArgs.content === 'string' ? normalizedArgs.content : ''

  if (normalized === 'file.write') {
    const added = countLines(content)
    return added > 0 ? { insertions: added, deletions: 0 } : null
  }

  if (normalized === 'file.patch' || normalized === 'edit') {
    if (search || replace) {
      return countChangedLines(search, replace)
    }
    if (content) {
      const added = countLines(content)
      return added > 0 ? { insertions: added, deletions: 0 } : null
    }
  }

  return null
}

function formatEditDiffCounts(counts: { insertions: number; deletions: number } | null): string | null {
  if (!counts) return null
  if (counts.insertions === 0 && counts.deletions === 0) return null
  return `+${counts.insertions} -${counts.deletions}`
}

function EditDiffCountBadge({ counts }: { counts: { insertions: number; deletions: number } }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border/60 bg-muted/35 px-1.5 py-0.5 text-2xs font-semibold tabular-nums">
      {counts.insertions > 0 && <span className="text-green-600 dark:text-green-400">+{counts.insertions}</span>}
      {counts.deletions > 0 && <span className="text-red-600 dark:text-red-400">-{counts.deletions}</span>}
    </span>
  )
}

function getCollapsedToolCategory(tool: string): string {
  const normalized = normalizeTool(tool)
  const displayTool = getJaitMcpToolName(normalized) ?? normalized

  if (displayTool === 'execute' || displayTool === 'jait.terminal' || displayTool.startsWith('terminal.')) return 'terminal'
  if (displayTool === 'edit' || displayTool === 'file.write' || displayTool === 'file.patch') return 'edit'
  if (displayTool === 'read' || displayTool === 'file.read') return 'read'
  if (normalized === 'search' || normalized === 'web.search' || normalized === 'browser.search') return 'search'
  if (normalized === 'web' || normalized === 'web.fetch') return 'web'
  if (normalized.startsWith('browser.')) return 'browser'
  if (normalized.startsWith('memory.')) return 'memory'
  if (normalized.startsWith('cron.')) return 'cron'
  if (normalized.startsWith('surfaces.')) return 'surface'
  if (normalized.startsWith('os.')) return 'system'
  if (isAgentToolName(normalized)) return 'agent'
  if (normalized === 'thread.control') return 'thread'
  if (normalized === 'todo') return 'todo'
  if (normalized === 'jait') return 'jait'
  if (isMcpToolName(normalized)) return 'mcp tool'
  if (normalized.startsWith('ssh.') || normalized === 'run.ssh') return 'ssh'

  return normalized.replace(/[._-]+/g, ' ').trim() || 'tool'
}

export function summarizeCollapsedToolCalls(calls: ToolCallInfo[]): string {
  if (calls.length === 0) return '0 tool calls'

  const counts = new Map<string, number>()
  for (const call of calls) {
    const category = getCollapsedToolCategory(call.tool)
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  const parts = Array.from(counts.entries()).map(([category, count]) => `${count} ${category}`)
  if (parts.length === 1) return `${parts[0]} tool call${calls.length === 1 ? '' : 's'}`
  return `${calls.length} tool calls: ${parts.join(', ')}`
}

export function getToolCallWrapperIconKind(calls: ToolCallInfo[]): 'terminal' | 'mcp' | 'web' | 'generic' {
  let hasMcp = false
  let hasWeb = false

  for (const call of calls) {
    const normalized = normalizeTool(call.tool)
    const displayTool = getJaitMcpToolName(normalized) ?? normalized
    if (displayTool === 'execute' || displayTool === 'jait.terminal' || displayTool.startsWith('terminal.')) return 'terminal'
    if (isMcpToolName(normalized)) hasMcp = true
    if (
      normalized === 'web'
      || normalized.startsWith('web.')
      || normalized.startsWith('browser.')
      || normalized.startsWith('preview.')
    ) {
      hasWeb = true
    }
  }

  if (hasMcp) return 'mcp'
  if (hasWeb) return 'web'
  return 'generic'
}

function getToolCallWrapperIcon(calls: ToolCallInfo[]) {
  const kind = getToolCallWrapperIconKind(calls)
  if (kind === 'terminal') return Terminal
  if (kind === 'mcp') return Server
  if (kind === 'web') return Globe
  return Server
}

/** Format a tool call's primary display text (e.g. the command or file path) */
export function getCallSummary(
  tool: string,
  args: Record<string, unknown>,
  resultData?: unknown,
  resultMessage?: string | null,
): string {
  const initialNormalized = normalizeTool(tool)
  const normalized = getJaitMcpToolName(initialNormalized, null, args) ?? initialNormalized
  const resultRecord = resultData && typeof resultData === 'object' && !Array.isArray(resultData)
    ? resultData as Record<string, unknown>
    : undefined
  const normalizedArgs = normalizeToolArgs(normalized, getJaitMcpToolArgs(args), resultRecord)
  const filePath = getToolFilePath(normalized, normalizedArgs, resultData, resultMessage)
  // ── Core tools ──────────────────────────────────────────
  if (normalized === 'read' || normalized === 'file.read') {
    const path = filePath ?? displayStr(normalizedArgs.path)
    return formatFileNameAndContext(path, normalizedArgs, resultRecord)
  }
  if (normalized === 'edit') {
    const path = filePath ?? displayStr(normalizedArgs.path)
    const fileSummary = formatFileNameAndContext(path, normalizedArgs)
    const diffCount = formatEditDiffCounts(getEditDiffCounts(normalized, normalizedArgs))
    if (normalizedArgs.search) return `${fileSummary}${diffCount ? ` (${diffCount})` : ' (patch)'}`
    if (diffCount) return `${fileSummary} (${diffCount})`
    return fileSummary
  }
  if (normalized === 'execute' || normalized === 'jait.terminal') return displayStr(normalizedArgs.command ?? args.command)
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
        typeof resultRecord?.url === 'string' ? resultRecord.url : undefined,
        typeof resultRecord?.finalUrl === 'string' ? resultRecord.finalUrl : undefined,
        typeof resultRecord?.content === 'string' ? resultRecord.content : undefined,
      ),
    )
    if (resultSite) return resultSite
    return displayStr(normalizedArgs.query)
  }
  if (normalized === 'tools.search') {
    return displayStr(normalizedArgs.query)
  }
  if (isAgentToolName(normalized)) {
    if (normalized === 'agent.wait') return displayStr(args.targets, 'waiting')
    return truncate(displayStr(args.description ?? args.prompt ?? args.message), 80)
  }
  if (normalized === 'thread.control') {
    const action = displayStr(normalizedArgs.action)
    const threads = getThreadControlListItems(normalizedArgs, resultRecord)
    if (action === 'create_many') return `${threads.length || displayStr(normalizedArgs.threads, '0')} threads`
    if (threads[0]) return threads[0].title
    return action || 'thread.control'
  }
  if (normalized === 'todo') {
    const rawList = args.todoList
    const list = Array.isArray(rawList)
      ? rawList as Array<{ title: string; status: string }>
      : Array.isArray((rawList as { items?: unknown })?.items)
        ? (rawList as { items: Array<{ title: string; status: string }> }).items
        : undefined
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
  if (isMcpToolName(normalized)) {
    const mcp = getMcpToolLabel(normalizedArgs)
    if (mcp.title && mcp.details) return `${mcp.title} • ${mcp.details}`
    if (mcp.title) return mcp.title
    if (mcp.details) return mcp.details
  }
  // ── Legacy tools ─────────────────────────────────────────
  if (normalized.startsWith('terminal.')) return displayStr(normalizedArgs.command ?? args.command)
  if (normalized === 'file.write' || normalized === 'file.patch') {
    const path = filePath ?? displayStr(normalizedArgs.path)
    const fileSummary = formatFileNameAndContext(path, normalizedArgs)
    const diffCount = formatEditDiffCounts(getEditDiffCounts(normalized, normalizedArgs))
    return diffCount ? `${fileSummary} (${diffCount})` : fileSummary
  }
  if (normalized.startsWith('file.')) {
    const path = filePath ?? displayStr(normalizedArgs.path)
    return formatFileNameAndContext(path, normalizedArgs)
  }
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
  const argCount = Object.keys(args ?? {}).length
  if (argCount === 0) return ''
  return `${argCount} argument(s)`
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

function formatMemorySearchResult(data: Record<string, unknown>): string | null {
  // memory.search returns `data.memories` (MemoryEntry[]) plus optional reminders.
  const rawMemories = data.memories
  if (!Array.isArray(rawMemories) || rawMemories.length === 0) return null

  const entries = rawMemories
    .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
    .slice(0, 10)

  if (entries.length === 0) return null

  const lines: string[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const scope = typeof entry.scope === 'string' ? entry.scope : ''
    const content = typeof entry.content === 'string' ? entry.content.trim() : ''
    const source = entry.source && typeof entry.source === 'object'
      ? entry.source as Record<string, unknown>
      : undefined
    const sourceType = typeof source?.type === 'string' ? source.type.trim() : ''
    const sourceId = typeof source?.id === 'string' ? source.id.trim() : ''
    const sourceSurface = typeof source?.surface === 'string' ? source.surface.trim() : ''

    lines.push(`${i + 1}. ${truncate(content, 280) || '(no content)'}`)
    const meta: string[] = []
    if (scope) meta.push(scope)
    let sourceLabel = ''
    if (sourceType) sourceLabel += sourceType
    if (sourceId) sourceLabel += sourceLabel ? `:${sourceId}` : sourceId
    if (sourceSurface) sourceLabel += `@${sourceSurface}`
    if (sourceLabel) meta.push(sourceLabel)
    if (meta.length > 0) lines.push(`   (${meta.join(' • ')})`)
    if (i < entries.length - 1) lines.push('')
  }

  return lines.join('\n').trim()
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
  const mcpEnvelope = formatMcpResultEnvelope(value)
  if (mcpEnvelope) return mcpEnvelope
  if (Array.isArray(value)) {
    const textBlocks = value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const text = extractAcpOrMcpContentText(entry)
      return text ? [text] : []
    })
    if (textBlocks.length > 0) return textBlocks.join('\n\n')
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '(complex value)'
  }
}

function extractAcpOrMcpContentText(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.text === 'string') return formatMcpContentText(record.text)
  if (record.type === 'content' && record.content) return extractAcpOrMcpContentText(record.content)
  return null
}

function firstFormattedStructuredText(...values: unknown[]): string | null {
  for (const value of values) {
    const formatted = formatStructuredValue(value)
    if (formatted?.trim()) return formatted
  }
  return null
}

function firstPayloadText(record: Record<string, unknown>): string | null {
  const stdout = firstFormattedStructuredText(
    record.formatted_output,
    record.formattedOutput,
    record.formattedoutput,
    record.output,
    record.stdout,
    record.content,
  )
  const stderr = firstFormattedStructuredText(record.stderr, record.error)
  const output = [stdout, stderr].filter((part): part is string => Boolean(part?.trim())).join(stdout && stderr ? '\n' : '').trim()
  if (output) return output

  return firstFormattedStructuredText(
    record.message,
    record.text,
    record.summary,
    record.result,
  )
}

function parseEmbeddedJsonRecord(value: string): Record<string, unknown> | null {
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(value.slice(start, end + 1)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

interface ToolSearchMatch {
  name?: unknown
  displayName?: unknown
  display_name?: unknown
  description?: unknown
  category?: unknown
  tier?: unknown
}

export interface ToolSearchListItem {
  name: string
  description: string
  category: string
  tier: string
}

function findToolSearchMatches(value: unknown, depth = 0): ToolSearchMatch[] | null {
  if (depth > 6 || value == null) return null
  if (typeof value === 'string') {
    return findToolSearchMatches(parseStructuredOrEmbeddedRecord(value), depth + 1)
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const matches = findToolSearchMatches(entry, depth + 1)
      if (matches) return matches
    }
    return null
  }
  if (typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  if (Array.isArray(record.matches)) {
    return record.matches.filter((entry): entry is ToolSearchMatch => Boolean(entry && typeof entry === 'object'))
  }

  for (const key of ['result', 'data', 'structuredContent', 'content', 'message', 'text', 'output']) {
    const matches = findToolSearchMatches(record[key], depth + 1)
    if (matches) return matches
  }
  return null
}

function conciseToolDescription(value: unknown): string {
  if (typeof value !== 'string') return ''
  const paragraphs = value
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const specific = [...paragraphs].reverse().find((part) => !part.startsWith('Prefer Jait tools'))
    ?? paragraphs[paragraphs.length - 1]
    ?? ''
  return truncate(specific, 140)
}

export function getToolSearchResultItems(...values: unknown[]): ToolSearchListItem[] {
  for (const value of values) {
    const matches = findToolSearchMatches(value)
    if (!matches) continue
    return matches.slice(0, 40).map((match) => ({
      name: displayStr(match.displayName ?? match.display_name ?? match.name, 'Unnamed tool'),
      description: conciseToolDescription(match.description),
      category: displayStr(match.category),
      tier: displayStr(match.tier),
    }))
  }
  return []
}

function formatToolSearchResults(...values: unknown[]): string | null {
  const items = getToolSearchResultItems(...values)
  if (items.length === 0) return null
  return items
    .map((item) => `• ${item.name}${item.description ? ` — ${item.description}` : ''}`)
    .join('\n')
}

function formatMcpContentText(value: string): string {
  const parsed = parseEmbeddedJsonRecord(value)
  if (!parsed) return value
  return firstPayloadText(parsed) ?? value
}

function formatMcpResultEnvelope(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const looksLikeEnvelope = Array.isArray(record.content)
    || 'structuredContent' in record
    || '_meta' in record
  if (!looksLikeEnvelope) return null

  const structured = firstFormattedStructuredText(record.structuredContent)
  if (structured) return structured

  if (Array.isArray(record.content)) {
    const content = record.content
      .flatMap((entry) => {
        const text = extractAcpOrMcpContentText(entry)
        if (text) return [text]
        const formatted = formatStructuredValue(entry)
        return formatted ? [formatted] : []
      })
      .filter((entry) => entry.trim().length > 0)
      .join('\n\n')
    if (content.trim()) return content
  }

  const error = firstFormattedStructuredText(record.error)
  if (error) return error
  return null
}

function parseStructuredRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function parseStructuredOrEmbeddedRecord(value: unknown): Record<string, unknown> | null {
  const structured = parseStructuredRecord(value)
  if (structured) return structured
  return typeof value === 'string' ? parseEmbeddedJsonRecord(value) : null
}

function firstStructuredText(...values: unknown[]): string | null {
  for (const value of values) {
    const formatted = formatStructuredValue(value)
    if (formatted?.trim()) return formatted
  }
  return null
}

function hasCommandPayloadShape(record: Record<string, unknown>): boolean {
  return 'formatted_output' in record
    || 'formattedOutput' in record
    || 'formattedoutput' in record
    || 'stdout' in record
    || 'stderr' in record
    || 'exitCode' in record
    || 'exit_code' in record
    || 'exitcode' in record
    || 'timedOut' in record
    || 'terminalId' in record
}

function formatCommandPayloadRecord(record: Record<string, unknown>): string | null {
  if (!hasCommandPayloadShape(record)) return null
  return firstPayloadText(record)
}

function formatCommandPayloadResult(result: ToolCallInfo['result']): string | null {
  if (!result) return null
  const records = [
    parseStructuredOrEmbeddedRecord(result.data),
    parseStructuredOrEmbeddedRecord(result.message),
  ].filter((record): record is Record<string, unknown> => record != null)

  for (const record of records) {
    const direct = formatCommandPayloadRecord(record)
    if (direct) return direct

    const nested = parseStructuredOrEmbeddedRecord(record.result)
    if (nested) {
      const formatted = formatCommandPayloadRecord(nested)
      if (formatted) return formatted
    }
  }

  return null
}

function formatTerminalResult(result: ToolCallInfo['result']): string | null {
  if (!result) return null
  const commandPayload = formatCommandPayloadResult(result)
  if (commandPayload) return commandPayload

  const data = parseStructuredRecord(result.data)
  const messageData = parseStructuredRecord(result.message)
  const source = data ?? messageData
  if (!source) return null

  const stdout = firstStructuredText(source.formatted_output, source.formattedOutput, source.output, source.stdout, source.content)
  const stderr = firstStructuredText(source.stderr, source.error)
  const output = [stdout, stderr].filter((part): part is string => Boolean(part?.trim())).join(stdout && stderr ? '\n' : '').trim()
  return output || null
}

/** Format the output data from a tool result */
export function formatOutput(result: ToolCallInfo['result'], tool?: string): string {
  if (!result) return ''
  const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data)
    ? result.data as Record<string, unknown>
    : undefined
  const normalizedTool = normalizeTool(tool ?? '')
  if (normalizedTool === 'tools.search') {
    const toolsOutput = formatToolSearchResults(result.data, result.message)
    if (toolsOutput) return toolsOutput
  }
  const rawDataOutput = formatStructuredValue(result.data)
  const mcpOutput = formatMcpResultEnvelope(data?.result) ?? formatMcpResultEnvelope(data) ?? formatMcpResultEnvelope(parseStructuredRecord(result.message))
  if (mcpOutput) return mcpOutput
  if (rawDataOutput && Array.isArray(result.data)) return rawDataOutput

  if (normalizedTool === 'execute' || normalizedTool.startsWith('terminal.')) {
    const terminalOutput = formatTerminalResult(result)
    if (terminalOutput) return terminalOutput
  }

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
  if (normalizedTool === 'memory.search' && data) {
    const formatted = formatMemorySearchResult(data)
    if (formatted) return formatted
  }
  if (normalizedTool === 'cron.add' && data) {
    const formatted = formatCronAddResult(data)
    if (formatted) return formatted
  }
  // Agent/subagent: return content for the SubAgentHistoryView to parse from data
  if (isAgentToolName(normalizedTool) && data) {
    const content = typeof data.content === 'string' ? data.content : ''
    if (content) return content
    // Fall through to result.message
  }

  const commandPayload = formatCommandPayloadResult(result)
  if (commandPayload) return commandPayload

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

  // Generic extraction: pull meaningful text out of structured result data
  // instead of dumping raw JSON with keys like formatted_output, exit_code
  if (data) {
    const extracted = formatTerminalResult(result)
    if (extracted) return extracted
  }

  if (result.message && result.message !== 'Command executed successfully') return result.message
  if (data) return safeStringify(data)
  return result.message
}

export function formatElapsedDuration(startedAt: number, completedAt?: number, now?: number): string {
  if (!Number.isFinite(startedAt) || startedAt <= 0) return '0ms'

  const end = completedAt ?? now ?? Date.now()
  if (!Number.isFinite(end) || end <= 0) return '0ms'

  const ms = Math.max(0, Math.round(end - startedAt))
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function ElapsedLabel({ startedAt, completedAt, now }: { startedAt: number; completedAt?: number; now?: number }) {
  return <span>{formatElapsedDuration(startedAt, completedAt, now)}</span>
}

function getNestedToolArgs(args: Record<string, unknown>): Record<string, unknown> | null {
  const rawArguments = args.arguments
  if (rawArguments && typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
    return rawArguments as Record<string, unknown>
  }
  if (typeof rawArguments === 'string') {
    try {
      const parsed = JSON.parse(rawArguments) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      return null
    }
  }
  return null
}

function getCommandFromToolArgs(args: Record<string, unknown>): string {
  const nested = getNestedToolArgs(args)
  return displayStr(
    args.command ??
    args.cmd ??
    args.shellCommand ??
    nested?.command ??
    nested?.cmd ??
    nested?.shellCommand,
  ).trim()
}

export function getRunningHint(tool: string, args: Record<string, unknown>): string {
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
  if (isAgentToolName(normalized)) return 'Sub-agent is working...'
  const command = getCommandFromToolArgs(args)
  const isKnownTerminal = normalized.startsWith('terminal.') || normalized === 'jait.terminal' || normalized === 'execute' ||
    normalized.startsWith('ssh.') || normalized === 'run.ssh' || normalized === 'elevated.run'
  if (isKnownTerminal || command) {
    return command ? `Executing ${command}...` : 'Command is still running...'
  }
  return 'Tool is still running...'
}

function isTerminalTool(tool: string): boolean {
  const normalized = normalizeTool(tool)
  const displayTool = getJaitMcpToolName(normalized) ?? normalized
  return displayTool.startsWith('terminal.') || displayTool === 'jait.terminal' || displayTool === 'execute'
    || displayTool.startsWith('ssh.') || displayTool === 'run.ssh' || displayTool === 'elevated.run'
}

function getTerminalOutcomeBadge(call: ToolCallInfo): { label: string; className: string } | null {
  if (!isTerminalTool(call.tool)) return null
  if (call.status === 'running' || call.status === 'pending') return null

  const data = parseStructuredRecord(call.result?.data) ?? parseStructuredRecord(call.result?.message) ?? undefined

  const timedOut = data?.timedOut === true || /timed out/i.test(call.result?.message ?? '')
  if (timedOut) {
    return {
      label: 'timeout',
      className: 'border-red-500/40 bg-red-500/10 text-red-500',
    }
  }

  const exitCodeRaw = data?.exitCode ?? data?.exit_code
  const exitCode = typeof exitCodeRaw === 'number'
    ? exitCodeRaw
    : typeof exitCodeRaw === 'string' && /^-?\d+$/.test(exitCodeRaw.trim())
      ? Number.parseInt(exitCodeRaw, 10)
      : null
  if (typeof exitCode === 'number') {
    const isOk = exitCode === 0
    return {
      label: `exit ${exitCode}`,
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

function parseJsonOutput(output: string): unknown | null {
  const trimmed = output.trim()
  if (!trimmed) return null
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function getStructuredOutputMeta(tool: string): { label: string; accent: string } {
  const normalized = normalizeTool(tool)
  if (normalized.startsWith('browser.') || normalized.startsWith('web.')) return { label: 'Web details', accent: 'bg-cyan-500' }
  if (normalized.startsWith('file.') || normalized === 'read' || normalized === 'edit') return { label: 'File details', accent: 'bg-blue-500' }
  if (normalized.startsWith('memory.')) return { label: 'Memory details', accent: 'bg-amber-500' }
  if (normalized.startsWith('cron.')) return { label: 'Schedule details', accent: 'bg-violet-500' }
  if (normalized.startsWith('surfaces.')) return { label: 'Surface details', accent: 'bg-purple-500' }
  if (isMcpToolName(normalized)) return { label: 'Details', accent: 'bg-purple-500' }
  return { label: `${getToolMeta(normalized).label} details`, accent: 'bg-primary' }
}

export function humanizeStructuredKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim()
}

function StructuredScalar({ value }: { value: unknown }) {
  if (value === null) return <span className="text-muted-foreground/70">Not set</span>
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const isUrl = /^https?:\/\/\S+$/i.test(trimmed)
    if (isUrl) {
      return (
        <a href={trimmed} target="_blank" rel="noopener noreferrer" className="break-all text-sky-500 hover:underline">
          {trimmed}
        </a>
      )
    }
    return <span className="whitespace-pre-wrap break-words text-foreground/90">{value || 'Empty'}</span>
  }
  if (typeof value === 'number') return <span className="font-medium tabular-nums text-foreground">{value}</span>
  if (typeof value === 'boolean') {
    return (
      <span className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-2xs font-medium',
        value ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
      )}>
        {value ? 'Yes' : 'No'}
      </span>
    )
  }
  return <span>{safeStringify(value)}</span>
}

export function StructuredDataView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value == null || typeof value !== 'object') return <StructuredScalar value={value} />

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">No items</span>
    return (
      <div className="space-y-1.5">
        {value.slice(0, 40).map((entry, index) => (
          <div key={index} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[9px] font-medium tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <div className={cn('min-w-0 flex-1', depth < 3 && 'rounded-md border border-border/40 bg-background/45 px-2.5 py-1.5')}>
              <StructuredDataView value={entry} depth={depth + 1} />
            </div>
          </div>
        ))}
        {value.length > 40 && <div className="pl-6 text-muted-foreground">{value.length - 40} more items</div>}
      </div>
    )
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return <span className="text-muted-foreground">No details</span>
  return (
    <div className="divide-y divide-border/35">
      {entries.slice(0, 60).map(([key, entry]) => (
        <div key={key} className="grid grid-cols-[minmax(88px,0.34fr)_minmax(0,1fr)] gap-3 py-1.5 first:pt-0 last:pb-0">
          <span className="truncate text-2xs font-medium text-muted-foreground" title={humanizeStructuredKey(key)}>
            {humanizeStructuredKey(key)}
          </span>
          <div className="min-w-0 break-words">
            <StructuredDataView value={entry} depth={depth + 1} />
          </div>
        </div>
      ))}
      {entries.length > 60 && <div className="pt-1.5 text-muted-foreground">{entries.length - 60} more fields</div>}
    </div>
  )
}

export function ToolSearchResultsView({ items }: { items: ToolSearchListItem[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/55 bg-card/55 text-xs shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/45 bg-muted/25 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-purple-500" />
        <span className="font-medium text-foreground">Available tools</span>
        <span className="ml-auto rounded-full bg-purple-500/10 px-2 py-0.5 text-2xs font-medium text-purple-600 dark:text-purple-400">
          {items.length} found
        </span>
      </div>
      <div className="max-h-80 divide-y divide-border/40 overflow-y-auto">
        {items.map((item) => (
          <div key={item.name} className="px-3 py-2.5 hover:bg-muted/25">
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 truncate text-[11px] font-semibold text-purple-600 dark:text-purple-400" title={item.name}>
                {item.name}
              </code>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {item.category && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                    {humanizeStructuredKey(item.category)}
                  </span>
                )}
                {item.tier && (
                  <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-600 dark:text-purple-400">
                    {humanizeStructuredKey(item.tier)}
                  </span>
                )}
              </div>
            </div>
            {item.description && (
              <p className="mt-1 leading-4 text-muted-foreground">{item.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ToolOutputView({ output, tool, isError, isRunning }: { output: string; tool: string; isError?: boolean; isRunning?: boolean }) {
  const parsed = useMemo(() => parseJsonOutput(output), [output])
  const meta = getStructuredOutputMeta(tool)

  if (parsed == null) {
    return (
      <pre className={cn(
        'text-xs font-mono leading-5 rounded-md px-3 py-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all',
        'bg-muted/40 text-foreground',
        isError && 'text-red-500 dark:text-red-400'
      )}>
        {output}
        {isRunning && (
          <span className="inline-block w-1.5 h-3.5 bg-foreground animate-pulse ml-0.5 align-text-bottom" />
        )}
      </pre>
    )
  }

  return (
    <div className={cn(
      'overflow-hidden rounded-md bg-muted/35 text-xs text-foreground',
      isError && 'text-red-500 dark:text-red-400',
    )}>
      <div className="flex items-center gap-2 bg-background/45 px-3 py-2">
        <span className={cn('h-2 w-2 rounded-full', meta.accent)} />
        <span className="font-medium">{meta.label}</span>
        {isRunning && <span className="ml-auto h-3 w-1.5 animate-pulse rounded-sm bg-foreground/70" />}
      </div>
      <div className="max-h-72 overflow-auto px-3 py-2.5 leading-5">
        <StructuredDataView value={parsed} />
      </div>
    </div>
  )
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

export function getLatestSubAgentActivity(streamingOutput: string | undefined): string | null {
  if (!streamingOutput) return null
  const latest = streamingOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)
  if (!latest) return null
  return truncate(
    latest
      .replace(/^\[sub-agent\]\s+Starting\s+(.+?)\.{3}$/, 'Using $1')
      .replace(/^\[sub-agent\]\s+[✓✗]\s*/, ''),
    120,
  )
}

function SubAgentMission({ args }: { args: Record<string, unknown> }) {
  const prompt = displayStr(args.prompt ?? args.message ?? args.description).trim()
  const allowedTools = displayStr(args.allowedTools).trim()
  if (!prompt && !allowedTools) return null

  // Styled like the app's own user-message bubble (rounded-lg bg-muted) — the
  // delegation prompt is, from the sub-agent's perspective, the message it received.
  return (
    <div className="border-b border-purple-500/15 px-3 py-2.5">
      {prompt && (
        <div className="w-fit max-w-full rounded-lg bg-muted px-4 py-3 text-xs leading-5 text-foreground/90 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {prompt}
        </div>
      )}
      {allowedTools && (
        <div className="mt-2 flex flex-wrap gap-1">
          {allowedTools.split(',').map((tool) => tool.trim()).filter(Boolean).map((tool) => (
            <code key={tool} className="rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-2xs text-muted-foreground">{tool}</code>
          ))}
        </div>
      )}
    </div>
  )
}

function SubAgentLiveActivity({ output, isRunning }: { output?: string; isRunning: boolean }) {
  const scrollRef = useAutoScroll(output)
  const latest = getLatestSubAgentActivity(output)
  if (!output && !isRunning) return null

  return (
    <div className="border-b border-purple-500/15 px-3 py-2.5">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        {isRunning ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-purple-500" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />}
        <span className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Activity</span>
        {latest && <span className="truncate text-xs text-foreground" title={latest}>{latest}</span>}
        {isRunning && <span className="ml-auto inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-purple-500" />}
      </div>
      {output ? (
        <pre ref={scrollRef} className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-zinc-950 px-3 py-2 font-mono text-[11px] leading-5 text-zinc-200 shadow-inner">
          {output}
          {isRunning && <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-purple-300 align-text-bottom" />}
        </pre>
      ) : (
        <div className="rounded-md border border-dashed border-purple-500/25 bg-purple-500/[0.025] px-3 py-2 text-xs text-muted-foreground">
          Preparing the delegated task...
        </div>
      )}
    </div>
  )
}

/** Labels/colors for the FIPA-ACL-inspired communicative act a sub-agent tags its final answer with. */
const PERFORMATIVE_BADGES: Record<string, { label: string; className: string }> = {
  propose: { label: 'Proposed options', className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  refuse: { label: 'Declined', className: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400' },
  failure: { label: 'Failed', className: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400' },
  query: { label: 'Needs clarification', className: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  agree: { label: 'Accepted', className: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400' },
}

function PerformativeBadge({ performative }: { performative?: string }) {
  if (!performative) return null
  const info = PERFORMATIVE_BADGES[performative]
  if (!info) return null
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-2xs font-medium', info.className)}>
      {info.label}
    </span>
  )
}

function SubAgentHistoryView({
  args,
  data,
  message,
  status,
  streamingOutput,
}: {
  args: Record<string, unknown>
  data: Record<string, unknown>
  message?: string
  status?: 'pending' | 'running' | 'success' | 'error'
  streamingOutput?: string
}) {
  const toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls as SubAgentToolCall[] : []
  const content = typeof data.content === 'string' ? data.content.trim() : ''
  const rounds = typeof data.rounds === 'number' ? data.rounds : null
  const durationMs = typeof data.durationMs === 'number' ? data.durationMs : null
  const performative = typeof data.performative === 'string' ? data.performative : undefined
  const isRunning = status === 'running' || status === 'pending'

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
    <div className="overflow-hidden rounded-lg border border-purple-500/25 bg-gradient-to-br from-purple-500/[0.065] via-card/80 to-card/55 text-xs shadow-sm">
      {(isRunning || rounds != null || toolCalls.length > 0 || durationMs != null) && (
        <div className="flex items-center gap-2 border-b border-purple-500/15 px-3 py-2 text-xs text-muted-foreground">
          <Network className="h-3.5 w-3.5 text-purple-500" />
          <span className="font-medium text-foreground">Sub-agent workspace</span>
          <PerformativeBadge performative={performative} />
          <span className="ml-auto" />
          {rounds != null && <span>{rounds} round{rounds !== 1 ? 's' : ''}</span>}
          {toolCalls.length > 0 && <span>{toolCalls.length} tool{toolCalls.length !== 1 ? 's' : ''}</span>}
          {durationMs != null && (
            <span>{durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}</span>
          )}
        </div>
      )}

      <SubAgentMission args={args} />
      <SubAgentLiveActivity output={streamingOutput} isRunning={isRunning} />

      {/* Nested tool calls rendered as full ToolCallCards */}
      {nestedCalls.length > 0 && (
        <div className="border-b border-purple-500/15 bg-background/25 py-1">
          {nestedCalls.map((call) => (
            <ToolCallCard key={call.callId} call={call} />
          ))}
        </div>
      )}

      {/* Final output — rendered as plain flowing text, like an assistant reply, not a boxed card */}
      {content && (
        <div className="border-t border-purple-500/15 px-3 py-2.5">
          <div className="max-h-52 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs leading-5 text-foreground/90">
            {content}
          </div>
        </div>
      )}

      {/* Fallback to message if no content */}
      {!content && message && (
        <div className="border-t border-purple-500/15 px-3 py-2">
          <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Final response</div>
          <div className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-background/60 px-3 py-2 text-xs leading-5 text-foreground/90">
            {message}
          </div>
        </div>
      )}
    </div>
  )
}

function BrowserSnapshotView({ snapshot }: { snapshot: string | null | undefined }) {
  if (!snapshot) return null
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
        {url ? <div className="font-mono text-xs break-all">{url}</div> : null}
      </div>
      <div>
        <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Text</div>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-xs leading-5">
          {textContent || '(no textual content)'}
        </pre>
      </div>
      <div>
        <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Interactive elements</div>
        {elements.length ? (
          <ul className="max-h-40 space-y-1 overflow-auto rounded bg-background p-2 font-mono text-xs">
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

function BrowserScreenshotView({ path }: { path: string | null | undefined }) {
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const trimmedPath = typeof path === 'string' ? path.trim() : ''
  const src = trimmedPath
    ? resolveChatImageUrl(trimmedPath) ?? `${getApiUrl()}/api/browser/screenshot?path=${encodeURIComponent(trimmedPath)}`
    : null

  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 text-xs">
      {trimmedPath && (
        <div className="text-xs text-muted-foreground">Screenshot path: <span className="font-mono break-all">{trimmedPath}</span></div>
      )}
      {src && (
        <div className="group relative overflow-hidden rounded-md bg-background/90 ring-1 ring-inset ring-border/35">
          <img
            src={src}
            alt="Browser screenshot"
            className="max-h-80 w-full cursor-pointer object-contain transition-opacity group-hover:opacity-80"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(false)}
            onClick={() => loaded && setExpanded(true)}
          />
          {loaded && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white">Click to expand</span>
            </div>
          )}
        </div>
      )}
      {(!src || !loaded) && (
        <div className="rounded bg-background p-2 text-muted-foreground">
          Preview unavailable in browser. Open the screenshot path directly from the host environment.
        </div>
      )}
      {src && expanded && (
        <Dialog open onOpenChange={(open) => !open && setExpanded(false)}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-2" showCloseButton>
            <img src={src} alt="Browser screenshot" className="max-h-[85vh] w-full object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function ImageView({ src, alt, caption }: { src: string | null | undefined; alt: string; caption?: string }) {
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const trimmedSrc = typeof src === 'string' ? src.trim() : ''
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 text-xs">
      {caption && (
        <div className="text-xs text-muted-foreground">{caption}</div>
      )}
      {trimmedSrc ? (
        <div className="group relative overflow-hidden rounded-md bg-background/90 ring-1 ring-inset ring-border/35">
          <img
            src={trimmedSrc}
            alt={alt}
            className="max-h-80 w-full cursor-pointer object-contain transition-opacity group-hover:opacity-80"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(false)}
            onClick={() => loaded && setExpanded(true)}
          />
          {loaded && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white">Click to expand</span>
            </div>
          )}
        </div>
      ) : null}
      {!trimmedSrc || !loaded ? (
        <div className="rounded bg-background p-2 text-muted-foreground">
          Image could not be displayed.
        </div>
      ) : null}
      {trimmedSrc && expanded && (
        <Dialog open onOpenChange={(open) => !open && setExpanded(false)}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-2" showCloseButton>
            <img src={trimmedSrc} alt={alt} className="max-h-[85vh] w-full object-contain" />
          </DialogContent>
        </Dialog>
      )}
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
  const displayTool = getJaitMcpToolName(normalizedTool) ?? normalizedTool
  if (displayTool === 'surfaces.start') {
    if (call.args.type === 'terminal') return getStructuredTerminalId(call) !== null

    const data = call.result?.data
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>
      if (record.type === 'terminal') return getStructuredTerminalId(call) !== null
    }
    return false
  }

  if (displayTool === 'execute' || displayTool === 'jait.terminal' || displayTool.startsWith('terminal.')) {
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
function PendingToolLabel({
  tool,
  args,
  streamingArgs,
}: {
  tool: string
  args: Record<string, unknown>
  streamingArgs?: string
}) {
  // Normalise OpenAI name (terminal_run → terminal.run) for meta lookup
  const normalized = normalizeTool(tool)
  const displayTool = getJaitMcpToolName(normalized) ?? normalized
  const meta = toolMeta[displayTool]
  const isTerminalTool = displayTool.startsWith('terminal.') || displayTool === 'jait.terminal' || displayTool === 'execute'
  const command = isTerminalTool ? extractStreamingCommand(streamingArgs) : null
  const isWebTool = normalized === 'web' || normalized === 'web.search' || normalized === 'web.fetch' || normalized === 'browser.search' || normalized === 'browser.fetch'
  const webTarget = isWebTool ? extractStreamingWebTarget(streamingArgs) : null
  const isFileTool = isEditLikeTool(displayTool) || displayTool === 'read' || displayTool === 'file.read'
  const filePath = isFileTool ? getToolFilePath(displayTool, args) : null

  if (meta && filePath) {
    return (
      <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-blue-400">
        <span>{getFileSummaryActionLabel(displayTool, true)}:</span>
        <code className="min-w-0 truncate text-xs font-mono text-foreground">{formatFileNameAndContext(filePath, args)}</code>
        <span className="inline-block w-1 h-3 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
      </span>
    )
  }

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
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-400" />
          <span className="break-all">{verb} {webTarget}...</span>
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
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-400" />
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
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-400" />
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
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-400" />
        <span>Preparing...</span>
      </div>
    </div>
  )
}

/**
 * Compute parent/child relationships for tool calls.
 * Explicit parentCallId edges take priority; agent lifetime heuristics remain
 * as a fallback for providers that do not emit ancestry metadata.
 */
export function computeAgentNesting(calls: ToolCallInfo[]): {
  childMap: Map<string, ToolCallInfo[]>
  parentSet: Set<string>
} {
  const childMap = new Map<string, ToolCallInfo[]>()
  const parentSet = new Set<string>()
  const callMap = new Map(calls.map((call) => [call.callId, call]))

  for (const call of calls) {
    if (!call.parentCallId) continue
    if (!callMap.has(call.parentCallId)) continue
    const existing = childMap.get(call.parentCallId) ?? []
    childMap.set(call.parentCallId, [...existing, call])
    parentSet.add(call.callId)
  }

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]
    if (!isAgentToolName(call.tool)) continue

    const children: ToolCallInfo[] = []
    for (let j = i + 1; j < calls.length; j++) {
      const candidate = calls[j]
      if (parentSet.has(candidate.callId)) continue

      const isAgentActive = call.status === 'running' || call.status === 'pending'
      const isWithinAgentLifetime = call.completedAt != null && candidate.startedAt <= call.completedAt

      if (isAgentActive || isWithinAgentLifetime) {
        children.push(candidate)
        parentSet.add(candidate.callId)
      } else {
        break
      }
    }

    if (children.length > 0) {
      const existing = childMap.get(call.callId) ?? []
      childMap.set(call.callId, [...existing, ...children])
    }
  }

  return { childMap, parentSet }
}

interface ToolCallCardProps {
  call: ToolCallInfo
  childCalls?: ToolCallInfo[]
  threadControlThreads?: ThreadListRecord[]
  onOpenTerminal?: (terminalId: string | null) => void
  onOpenDiff?: (filePath: string) => void
  inlineSecretPrompt?: ReactNode
  renderInlineSecretPrompt?: (call: ToolCallInfo) => ReactNode
  onApprovalResponse?: (requestId: string, approved: boolean) => Promise<void> | void
  hideTopConnector?: boolean
  hideBottomConnector?: boolean
}

function isInlineToolBodyKind(bodyKind: ReturnType<typeof getToolCallBodyKind>): boolean {
  return bodyKind === 'browserScreenshot' || bodyKind === 'imageView'
}

export function isInlineToolCall(call: ToolCallInfo): boolean {
  const normalizedTool = normalizeTool(call.tool)
  const resultData = call.result?.data && typeof call.result.data === 'object'
    ? call.result.data as Record<string, unknown>
    : undefined
  const normalizedArgs = normalizeToolArgs(normalizedTool, call.args, resultData)
  const screenshotPath = getToolImagePath(normalizedTool, normalizedArgs, resultData, call.result?.message)
  const imageDataUri = getToolImageDataUri(normalizedTool, normalizedArgs, resultData)

  return isInlineToolBodyKind(getToolCallBodyKind({
    tool: normalizedTool,
    args: normalizedArgs,
    status: call.status,
    displayOutput: formatOutput(call.result, normalizedTool) || call.streamingOutput || '',
    snapshotText: typeof resultData?.snapshot === 'string' ? resultData.snapshot : null,
    screenshotPath,
    imageDataUri,
  }))
}

function formatLineRangeLabel(lineRange: { start: number; end: number } | null | undefined): string | null {
  if (!lineRange) return null
  return lineRange.start === lineRange.end
    ? `:${lineRange.start}`
    : `:${lineRange.start}-${lineRange.end}`
}

function FileSummaryButton({
  path,
  context,
  lineRange,
  onOpenDiff,
  disabled,
}: {
  path: string
  context?: string | null
  lineRange?: { start: number; end: number } | null
  onOpenDiff?: (filePath: string) => void
  disabled?: boolean
}) {
  const fileName = getBaseName(path)
  const interactive = !!onOpenDiff && !disabled
  const lineRangeLabel = formatLineRangeLabel(lineRange)
  const content = (
    <>
      <FileIcon filename={fileName} className="h-3.5 w-3.5 shrink-0" />
      <span className="whitespace-nowrap">{fileName}</span>
      {lineRangeLabel ? <span className="whitespace-nowrap text-muted-foreground tabular-nums">{lineRangeLabel}</span> : null}
      {context ? <span className="whitespace-nowrap text-muted-foreground">· {context}</span> : null}
    </>
  )

  if (!interactive) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-muted/45 px-2 py-1 text-xs font-medium leading-none text-foreground"
        title={path}
      >
        {content}
      </span>
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-muted/45 px-2 py-1 text-xs font-medium leading-none text-foreground transition-colors hover:bg-muted cursor-pointer"
      title={`Open diff for ${path}`}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpenDiff(path)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          onOpenDiff(path)
        }
      }}
    >
      {content}
    </span>
  )
}

function ThreadStatusBadge({ status }: { status: ThreadListStatus }) {
  const classes = status === 'completed'
    ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
    : status === 'error' || status === 'interrupted'
      ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
      : status === 'running' || status === 'starting'
        ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
        : 'border-border/70 bg-muted/45 text-muted-foreground'
  const Icon = status === 'completed'
    ? CheckCircle2
    : status === 'error' || status === 'interrupted'
      ? XCircle
      : status === 'running' || status === 'starting'
        ? Loader2
        : Network

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-medium capitalize', classes)}>
      <Icon className={cn('h-3 w-3', (status === 'running' || status === 'starting') && 'animate-spin')} />
      {status}
    </span>
  )
}

type ThreadActivityTimelineEntry =
  | { kind: 'tool'; key: string; call: ToolCallInfo }
  | { kind: 'note'; key: string; activity: ThreadActivity }

/**
 * Pairs tool.start/tool.result(.error) activities by callId into single
 * ToolCallInfo entries so they can render through the same ToolCallCard
 * used for top-level and sub-agent tool calls, instead of a flat log line.
 */
function buildThreadActivityTimeline(activities: ThreadActivity[]): ThreadActivityTimelineEntry[] {
  const timeline: ThreadActivityTimelineEntry[] = []
  const callIndex = new Map<string, number>()

  for (const activity of activities) {
    const payload = activity.payload && typeof activity.payload === 'object' && !Array.isArray(activity.payload)
      ? activity.payload as Record<string, unknown>
      : null
    const callId = typeof payload?.callId === 'string' ? payload.callId : undefined
    const tool = typeof payload?.tool === 'string' ? payload.tool : undefined
    const createdAtMs = new Date(activity.createdAt).getTime()

    if (activity.kind === 'tool.start' && callId && tool) {
      const call: ToolCallInfo = {
        callId,
        tool,
        args: (payload?.args && typeof payload.args === 'object' && !Array.isArray(payload.args))
          ? payload.args as Record<string, unknown>
          : {},
        status: 'running',
        startedAt: createdAtMs,
      }
      callIndex.set(callId, timeline.length)
      timeline.push({ kind: 'tool', key: callId, call })
      continue
    }

    if ((activity.kind === 'tool.result' || activity.kind === 'tool.error') && callId) {
      const ok = activity.kind === 'tool.result' && payload?.ok !== false
      const message = typeof payload?.message === 'string' ? payload.message : activity.summary
      const idx = callIndex.get(callId)
      const existing = idx !== undefined ? timeline[idx] : undefined
      if (idx !== undefined && existing && existing.kind === 'tool') {
        timeline[idx] = {
          ...existing,
          call: {
            ...existing.call,
            status: ok ? 'success' : 'error',
            result: { ok, message, data: payload?.data },
            completedAt: createdAtMs,
          },
        }
      } else {
        const call: ToolCallInfo = {
          callId,
          tool: tool ?? 'tool',
          args: {},
          status: ok ? 'success' : 'error',
          result: { ok, message, data: payload?.data },
          startedAt: createdAtMs,
          completedAt: createdAtMs,
        }
        callIndex.set(callId, timeline.length)
        timeline.push({ kind: 'tool', key: callId, call })
      }
      continue
    }

    timeline.push({ kind: 'note', key: activity.id, activity })
  }

  return timeline
}

function ThreadListItemActivity({ threadId, isActive }: { threadId: string; isActive: boolean }) {
  const [activities, setActivities] = useState<ThreadActivity[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setActivities(null)
    if (!threadId) return

    const fetchActivities = () => {
      agentsApi.getActivities(threadId, 50).then((acts) => {
        if (!cancelled) setActivities(acts)
      }).catch(() => {
        if (!cancelled) setActivities((prev) => prev ?? [])
      })
    }

    fetchActivities()
    if (!isActive) return () => { cancelled = true }

    // Poll while the swarm agent's thread is still running, mirroring the
    // live-updating activity view a sub-agent tool call gets for free from
    // its streamed output.
    const interval = setInterval(fetchActivities, 1500)
    return () => { cancelled = true; clearInterval(interval) }
  }, [threadId, isActive])

  const timeline = useMemo(() => activities ? buildThreadActivityTimeline(activities) : [], [activities])

  if (activities === null) {
    return (
      <div className="flex items-center gap-1.5 py-1.5 text-2xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading activity…
      </div>
    )
  }
  if (activities.length === 0) {
    return (
      <div className="py-1.5 text-2xs text-muted-foreground">
        {isActive ? 'Starting…' : 'No activity yet.'}
      </div>
    )
  }
  return (
    <div className="space-y-1 py-1">
      {timeline.map((entry) => (
        entry.kind === 'tool'
          ? <ToolCallCard key={entry.key} call={entry.call} />
          : <ThreadActivityRow key={entry.key} activity={entry.activity} />
      ))}
    </div>
  )
}

function summarizeThreadArgs(args: Record<string, unknown> | null): string | null {
  if (!args) return null
  const candidateKeys = ['command', 'path', 'url', 'query', 'pattern', 'selector', 'name', 'toolName']
  for (const key of candidateKeys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim()
      return `${key}: ${trimmed.length > 120 ? `${trimmed.slice(0, 119)}…` : trimmed}`
    }
  }
  try {
    return JSON.stringify(args)
  } catch {
    return null
  }
}

function ThreadActivityRow({ activity }: { activity: ThreadActivity }) {
  const payload = activity.payload && typeof activity.payload === 'object' && !Array.isArray(activity.payload)
    ? activity.payload as Record<string, unknown>
    : null
  const role = typeof payload?.role === 'string' ? payload.role : undefined
  const tool = typeof payload?.tool === 'string' ? payload.tool : undefined
  const args = payload?.args && typeof payload.args === 'object' && !Array.isArray(payload.args)
    ? payload.args as Record<string, unknown>
    : null
  const message = typeof payload?.message === 'string' ? payload.message : undefined
  const summary = (message || activity.summary || '').trim()
  const argsPreview = summarizeThreadArgs(args)

  const isToolStart = activity.kind === 'tool.start'
  const isToolResult = activity.kind === 'tool.result'
  const isError = activity.kind === 'tool.error' || activity.kind === 'error'
  const Icon = isToolResult
    ? CheckCircle2
    : isError
      ? XCircle
      : isToolStart
        ? Loader2
        : Network

  return (
    <div className="flex items-start gap-2 rounded-md border border-border/40 bg-card/40 px-2 py-1.5">
      <Icon className={cn('mt-0.5 h-3 w-3 shrink-0', isToolStart && 'animate-spin', isToolResult ? 'text-green-500' : isError ? 'text-red-500' : 'text-muted-foreground')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          {tool && <code className="rounded bg-muted px-1 py-0.5 font-mono">{tool}</code>}
          {role && <span>{role}</span>}
          <span className="ml-auto shrink-0">{new Date(activity.createdAt).toLocaleTimeString()}</span>
        </div>
        {summary && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">{summary}</p>
        )}
        {argsPreview && (
          <p className="mt-0.5 text-2xs text-muted-foreground">{argsPreview}</p>
        )}
      </div>
    </div>
  )
}

function ThreadListItemCard({ item }: { item: ThreadListItem }) {
  const [open, setOpen] = useState(false)
  const shortId = item.id ? item.id.slice(-8) : null
  const location = item.branch ?? (item.workingDirectory ? getBaseName(item.workingDirectory) : null)
  const isActive = item.status === 'running' || item.status === 'starting'

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/25"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground" title={item.title}>{item.title}</div>
            {item.mission && (
              <div className="mt-0.5 line-clamp-1 text-2xs text-muted-foreground">{item.mission}</div>
            )}
            {!item.mission && (
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
                {shortId && <code className="rounded bg-background/70 px-1 py-0.5 font-mono">{shortId}</code>}
                {item.providerId && <span>{item.providerId}</span>}
                {item.kind && <span>{item.kind}</span>}
                {location && <span className="min-w-0 truncate">{location}</span>}
              </div>
            )}
            {item.error && <div className="mt-1 truncate text-2xs text-red-500" title={item.error}>{item.error}</div>}
          </div>
          <ThreadStatusBadge status={item.status} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/40 bg-background/30 px-3 pb-2">
          {isActive && !item.id ? (
            <div className="py-1.5 text-2xs text-muted-foreground">Awaiting thread start…</div>
          ) : item.id ? (
            <ThreadListItemActivity threadId={item.id} isActive={isActive} />
          ) : (
            <div className="py-1.5 text-2xs text-muted-foreground">No live activity available.</div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ThreadListView({ items, resultMessage }: { items: ThreadListItem[]; resultMessage?: string }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
        No thread details available.
      </div>
    )
  }

  const completedCount = items.filter((item) => item.status === 'completed').length

  return (
    <div className="overflow-hidden rounded-lg border border-purple-500/25 bg-gradient-to-br from-purple-500/[0.065] via-card/80 to-card/55 text-xs shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-purple-500/15 px-3 py-2">
        <span className="font-medium text-foreground">{items.length} sub-agent{items.length === 1 ? '' : 's'}</span>
        <span className="text-muted-foreground">
          {completedCount}/{items.length} complete
        </span>
      </div>
      <div className="divide-y divide-border/35">
        {items.map((item, index) => (
          <ThreadListItemCard key={item.id ?? `${item.title}-${index}`} item={item} />
        ))}
      </div>
      {resultMessage && (
        <div className="border-t border-purple-500/15 px-3 py-2 text-2xs text-muted-foreground">
          {resultMessage}
        </div>
      )}
    </div>
  )
}

function TodoToolListView({
  items,
  errorMessage,
}: {
  items: TodoToolListItem[]
  errorMessage?: string
}) {
  const completedCount = items.filter((item) => item.status === 'completed').length
  const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0

  return (
    <div className="overflow-hidden rounded-md border border-orange-500/20 bg-orange-500/[0.025] text-xs">
      <div className="flex items-center gap-3 border-b border-orange-500/15 px-3 py-2">
        <span className="font-medium text-foreground">Tasks</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              completedCount === items.length && items.length > 0 ? 'bg-green-500' : 'bg-orange-500',
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="tabular-nums text-muted-foreground">{completedCount}/{items.length}</span>
      </div>
      <div className="divide-y divide-border/35">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 px-3 py-2">
            {item.status === 'completed' ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
            ) : item.status === 'in-progress' ? (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-orange-500" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            )}
            <span className={cn(
              'min-w-0 flex-1 text-foreground',
              item.status === 'completed' && 'text-muted-foreground line-through',
            )}>
              {item.title}
            </span>
          </div>
        ))}
      </div>
      {errorMessage ? (
        <div className="border-t border-red-500/15 px-3 py-2 text-red-500">{errorMessage}</div>
      ) : null}
    </div>
  )
}

function ToolCallCardInner({
  call,
  childCalls,
  threadControlThreads,
  onOpenTerminal,
  onOpenDiff,
  inlineSecretPrompt,
  renderInlineSecretPrompt,
  onApprovalResponse,
  hideTopConnector = false,
  hideBottomConnector = false,
}: ToolCallCardProps) {
  const initialInline = isInlineToolCall(call)
  const [open, setOpen] = useState(call.status === 'running' || call.status === 'pending' || initialInline)
  const [now, setNow] = useState(() => Date.now())
  const [approvalSubmitting, setApprovalSubmitting] = useState<'approve' | 'reject' | null>(null)
  const prevStatusRef = useRef(call.status)
  const normalizedTool = normalizeTool(call.tool)
  const resultData = call.result?.data && typeof call.result.data === 'object'
    ? call.result.data as Record<string, unknown>
    : undefined
  const initialNormalizedArgs = normalizeToolArgs(normalizedTool, call.args, resultData)
  const initialMcpLabel = isMcpToolName(normalizedTool) ? getMcpToolLabel({
    ...(normalizedTool.startsWith('mcp.') && !initialNormalizedArgs.title ? { title: normalizedTool } : {}),
    ...initialNormalizedArgs,
  }, resultData) : null
  const displayTool = getJaitMcpToolName(normalizedTool, initialMcpLabel?.title, call.args) ?? normalizedTool
  const isJaitMcpTool = displayTool !== normalizedTool
  const normalizedArgs = normalizeToolArgs(displayTool, getJaitMcpToolArgs(call.args), resultData)
  const mcpLabel = isMcpToolName(normalizedTool) ? getMcpToolLabel({
    ...(normalizedTool.startsWith('mcp.') && !normalizedArgs.title ? { title: normalizedTool } : {}),
    ...normalizedArgs,
  }, resultData) : null
  const mcpMeta = mcpLabel && !isJaitMcpTool ? getMcpDisplayLabel(mcpLabel.title) : null
  const meta = getToolMeta(displayTool)
  const Icon = mcpMeta?.icon ?? meta.icon
  const effectiveColor = mcpMeta?.color ?? meta.color
  const summary = getCallSummary(displayTool, normalizedArgs, call.result?.data, call.result?.message)
  const editDiffCounts = getEditDiffCounts(displayTool, normalizedArgs)
  const finalOutput = formatOutput(call.result, displayTool)
  const displayOutput = finalOutput || call.streamingOutput || ''
  const toolSearchItems = displayTool === 'tools.search'
    ? getToolSearchResultItems(call.result?.data, call.result?.message)
    : []
  const snapshotText = typeof resultData?.snapshot === 'string' ? resultData.snapshot : null
  const screenshotPath = getToolImagePath(displayTool, normalizedArgs, resultData, call.result?.message)
  const imageDataUri = getToolImageDataUri(displayTool, normalizedArgs, resultData)
  const isTerminal = displayTool.startsWith('terminal.') || displayTool === 'jait.terminal' || displayTool === 'execute'
    || displayTool.startsWith('ssh.') || displayTool === 'run.ssh' || displayTool === 'elevated.run'
  const terminalOutcomeBadge = getTerminalOutcomeBadge(call)
  const canOpenTerminal = isTerminalCreationCall(call)
  const terminalId = canOpenTerminal ? getStructuredTerminalId(call) : null
  const runningHint = getRunningHint(displayTool, normalizedArgs)
  const resolvedInlineSecretPrompt = inlineSecretPrompt ?? renderInlineSecretPrompt?.(call) ?? null
  const hasInlineSecretPrompt = resolvedInlineSecretPrompt != null
  const isPending = call.status === 'pending'
  const isApprovalPending = !!call.approvalRequestId && call.status === 'pending'
  const handleApprovalResponse = useCallback(async (approved: boolean) => {
    if (!call.approvalRequestId || !onApprovalResponse || approvalSubmitting) return
    setApprovalSubmitting(approved ? 'approve' : 'reject')
    try {
      await onApprovalResponse(call.approvalRequestId, approved)
    } finally {
      setApprovalSubmitting(null)
    }
  }, [approvalSubmitting, call.approvalRequestId, onApprovalResponse])
  const filePaths = getToolFilePaths(displayTool, normalizedArgs, call.result?.data, call.result?.message)
    .map((path) => path.trim())
    .filter(Boolean)
  const filePath = filePaths[0] ?? getToolFilePath(displayTool, normalizedArgs, resultData, call.result?.message)?.trim() ?? ''
  const fileContext = getFileContextLabel(normalizedArgs)
  const fileLineRange = getReadLineRange(normalizedArgs, resultData)
  const showFileSummary = !!filePath && (isEditLikeTool(displayTool) || displayTool === 'read' || displayTool === 'file.read')
  const terminalScrollRef = useAutoScroll(displayOutput)
  const argsScrollRef = useAutoScroll(call.streamingArgs)
  const bodyKind = getToolCallBodyKind({
    tool: displayTool,
    args: normalizedArgs,
    status: call.status,
    displayOutput,
    snapshotText,
    screenshotPath,
    imageDataUri,
  })
  const inlineBody = isInlineToolBodyKind(bodyKind)
  const hasExpandableContent = bodyKind === 'terminal'
    ? true
    : bodyKind !== 'none' && !inlineBody
  const threadListItems = bodyKind === 'threadList'
    ? getThreadControlListItems(normalizedArgs, resultData, call.status, threadControlThreads)
    : []
  const todoListItems = bodyKind === 'todoList'
    ? getTodoToolListItems(normalizedArgs, resultData)
    : []
  const effectiveOpen = hasInlineSecretPrompt ? true : open
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (hasInlineSecretPrompt && !nextOpen) return
    setOpen(nextOpen)
  }, [hasInlineSecretPrompt])

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

  const stateClasses = call.status === 'error'
    ? {
        row: 'bg-red-500/[0.035] hover:bg-red-500/[0.06]',
        icon: 'bg-red-500/10',
        connector: 'bg-red-500/25',
        body: 'bg-red-500/[0.025]',
      }
    : call.status === 'success'
      ? {
          row: 'bg-card/58 hover:bg-muted/42',
          icon: 'bg-emerald-500/[0.08]',
          connector: 'bg-border/55',
          body: 'bg-card/42',
        }
      : {
          row: 'bg-primary/[0.045] hover:bg-primary/[0.075]',
          icon: 'bg-primary/10',
          connector: 'bg-primary/30',
          body: 'bg-primary/[0.025]',
        }

  useEffect(() => {
    const prevStatus = prevStatusRef.current
    if (
      !inlineBody
      && bodyKind !== 'threadList'
      && (prevStatus === 'running' || prevStatus === 'pending')
      && call.status !== 'running'
      && call.status !== 'pending'
    ) {
      setOpen(false)
    }
    if (call.status === 'pending' || call.status === 'running' || inlineBody || hasInlineSecretPrompt) {
      setOpen(true)
    }
    prevStatusRef.current = call.status
  }, [bodyKind, call.status, hasInlineSecretPrompt, inlineBody])

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

  const invocationLabels = getToolInvocationLabels(displayTool, normalizedArgs, call.result?.data, call.result?.message)
  const isActive = call.status === 'running' || call.status === 'pending'
  const invocationLabel = isActive ? invocationLabels.running : invocationLabels.done
  const fileSummaryActionLabel = showFileSummary
    ? getFileSummaryActionLabel(displayTool, isActive)
    : invocationLabel

  const headerContent = (
    <>
      <StatusIcon className={cn(
        'h-4 w-4 shrink-0',
        statusColor,
        (call.status === 'running' || call.status === 'pending') && 'animate-spin'
      )} />
      <span className="flex-1 truncate text-[13px] font-medium text-muted-foreground">
        {isPending ? (
          <PendingToolLabel tool={displayTool} args={normalizedArgs} streamingArgs={call.streamingArgs} />
        ) : isAgentToolName(displayTool) ? (
          <span className="inline-flex min-w-0 max-w-full items-center gap-2">
            <span className="shrink-0 font-semibold text-purple-600 dark:text-purple-400">Sub-agent</span>
            <span className="truncate text-foreground" title={summary}>{summary || (isActive ? 'Working' : 'Completed')}</span>
          </span>
        ) : isTerminal ? (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-foreground">
            <span className="shrink-0 text-xs text-emerald-500 dark:text-emerald-400 font-mono">$</span>
            <code className="min-w-0 truncate text-xs font-mono" title={summary}>{summary}</code>
          </span>
        ) : showFileSummary ? (
          <span className="flex min-w-0 max-w-full items-center gap-2">
            <span className="shrink-0">{fileSummaryActionLabel}:</span>
            <span className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:thin]">
              {(filePaths.length > 0 ? filePaths : [filePath]).filter(Boolean).map((p, i) => (
                <FileSummaryButton
                  key={`${p}-${i}`}
                  path={p}
                  context={i === 0 ? fileContext : null}
                  lineRange={i === 0 ? fileLineRange : null}
                  onOpenDiff={isEditLikeTool(displayTool) ? onOpenDiff : undefined}
                  disabled={call.status !== 'success'}
                />
              ))}
            </span>
          </span>
        ) : mcpLabel && !isJaitMcpTool && (mcpLabel.title || mcpLabel.details) ? (
          <span className="inline-flex min-w-0 max-w-full items-center gap-2">
            {mcpLabel.title ? (
              <span className="min-w-0 truncate">
                <code className="text-[11px] font-mono">{mcpLabel.title}</code>
                {mcpLabel.details ? <span className="text-muted-foreground"> • </span> : null}
                {mcpLabel.details ? <span className="text-xs text-muted-foreground">{mcpLabel.details}</span> : null}
              </span>
            ) : (
              <span>{invocationLabel}: <span className="text-xs text-muted-foreground">{mcpLabel.details}</span></span>
            )}
          </span>
        ) : (
          <span>{invocationLabel}: <code className="text-[11px] font-mono">{summary}</code></span>
        )}
      </span>
      <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0">
        <ElapsedLabel startedAt={call.startedAt} completedAt={call.completedAt} now={now} />
      </span>
      {editDiffCounts && (editDiffCounts.insertions > 0 || editDiffCounts.deletions > 0) && (
        <EditDiffCountBadge counts={editDiffCounts} />
      )}
      {terminalOutcomeBadge && (
        <span
          className={cn(
            'rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide shrink-0',
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
      'text-xs font-mono leading-5 rounded-md px-3 py-2 overflow-x-auto max-h-72 overflow-y-auto whitespace-pre',
      'bg-zinc-950 text-zinc-100 shadow-inner ring-1 ring-border/40',
      call.result && !call.result.ok && 'text-red-200'
    )}>
      {!displayOutput && call.status !== 'running' && (
        <span className="text-zinc-400"><span className="text-emerald-400">$ </span>{summary}</span>
      )}
      {displayOutput}
      {call.status === 'running' && !displayOutput && (
        <span className="text-zinc-400">{summary ? `Executing ${summary}...` : 'Running...'}</span>
      )}
      {call.status === 'running' && (
        <span className="inline-block w-1.5 h-3.5 bg-zinc-100 animate-pulse ml-0.5 align-text-bottom" />
      )}
    </pre>
  ) : bodyKind === 'browserSnapshot' && snapshotText ? (
    <BrowserSnapshotView snapshot={snapshotText} />
  ) : bodyKind === 'browserScreenshot' && screenshotPath ? (
    <BrowserScreenshotView path={screenshotPath} />
  ) : bodyKind === 'imageView' && imageDataUri ? (
    <ImageView src={imageDataUri} alt="Image" caption={typeof normalizedArgs.path === 'string' ? `Image: ${normalizedArgs.path}` : undefined} />
  ) : bodyKind === 'subagent' ? (
    childCalls && childCalls.length > 0 ? (
      <div className="overflow-hidden rounded-lg border border-purple-500/25 bg-gradient-to-br from-purple-500/[0.065] via-card/80 to-card/55 text-xs shadow-sm">
        <div className="flex items-center gap-2 border-b border-purple-500/15 px-3 py-2 text-muted-foreground">
          <Network className="h-3.5 w-3.5 text-purple-500" />
          <span className="font-medium text-foreground">Sub-agent workspace</span>
          <span className="ml-auto">{childCalls.length} tool{childCalls.length !== 1 ? 's' : ''}</span>
        </div>
        <SubAgentMission args={normalizedArgs} />
        <SubAgentLiveActivity
          output={call.streamingOutput}
          isRunning={call.status === 'running' || call.status === 'pending'}
        />
        <div className="border-b border-purple-500/15 bg-background/25 py-1">
          {childCalls.map((child) => (
            <ToolCallCard
              key={child.callId}
              call={child}
              threadControlThreads={threadControlThreads}
              onOpenTerminal={onOpenTerminal}
              onOpenDiff={onOpenDiff}
              renderInlineSecretPrompt={renderInlineSecretPrompt}
              onApprovalResponse={onApprovalResponse}
            />
          ))}
        </div>
        {call.result?.message && (call.status === 'success' || call.status === 'error') && (
          <div className="px-3 py-2.5">
            <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Final response</div>
            <div className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-background/60 px-3 py-2 text-xs leading-5 text-foreground/90">
              {call.result.message}
            </div>
          </div>
        )}
      </div>
    ) : (
      <SubAgentHistoryView
        args={normalizedArgs}
        data={resultData ?? {}}
        message={call.result?.message}
        status={call.status}
        streamingOutput={call.streamingOutput}
      />
    )
  ) : bodyKind === 'threadList' ? (
    <ThreadListView items={threadListItems} resultMessage={call.result?.message} />
  ) : bodyKind === 'todoList' ? (
    <TodoToolListView
      items={todoListItems}
      errorMessage={call.status === 'error' ? call.result?.message : undefined}
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
    toolSearchItems.length > 0 ? (
      <ToolSearchResultsView items={toolSearchItems} />
    ) : (
      <ToolOutputView
        output={displayOutput}
        tool={displayTool}
        isError={!!call.result && !call.result.ok}
        isRunning={call.status === 'running'}
      />
    )
  ) : bodyKind === 'runningHint' ? (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        'bg-muted/40 text-foreground',
      )}
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        <span className="break-all">{runningHint}</span>
      </div>
      <div className="mt-1 text-xs opacity-75">
        Elapsed: <ElapsedLabel startedAt={call.startedAt} completedAt={call.completedAt} now={now} />
      </div>
    </div>
  ) : null

  return (
    <Collapsible open={hasExpandableContent ? effectiveOpen : false} onOpenChange={handleOpenChange}>
      <div className="relative pl-8">
        {!hideTopConnector && (
          <span
            className={cn('absolute left-[12.5px] top-0 h-6 w-px', stateClasses.connector)}
            style={{ maskImage: 'linear-gradient(to bottom, transparent 0 22px, #000 22px 100%)' }}
            aria-hidden="true"
          />
        )}
        {!hideBottomConnector && (
          <span
            className={cn('absolute left-[12.5px] top-0 bottom-0 w-px', stateClasses.connector)}
            style={{ maskImage: 'linear-gradient(to bottom, #000 0 5px, transparent 5px 23px, #000 23px 100%)' }}
            aria-hidden="true"
          />
        )}
        {hideBottomConnector && !hideTopConnector && (
          <span
            className={cn('absolute left-[12.5px] top-0 bottom-0 w-px', stateClasses.connector)}
            style={{ maskImage: 'linear-gradient(to bottom, #000 0 5px, transparent 5px 100%)' }}
            aria-hidden="true"
          />
        )}
        <div className={cn(
          'absolute left-[3px] top-[6px] z-10 flex h-5 w-5 items-center justify-center rounded-md shadow-sm ring-2 ring-background',
          stateClasses.icon,
        )}>
          <Icon className={cn('h-3.5 w-3.5 shrink-0', effectiveColor)} />
        </div>

        <div className="group pb-1">
          <div className={cn(
            'flex min-h-8 items-center gap-2 rounded-md px-2 py-1 transition-colors',
            stateClasses.row,
          )}>
            {hasExpandableContent ? (
              <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <ChevronRight className={cn(
                  'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200',
                  effectiveOpen && 'rotate-90'
                )} />
                {headerContent}
              </CollapsibleTrigger>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="h-3 w-3 shrink-0" />
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
                    className="h-6 w-6 sm:h-6 sm:w-6 shrink-0"
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
                    className="h-6 w-6 sm:h-6 sm:w-6 shrink-0"
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
        </div>
      </div>

      {hasExpandableContent && (
        <CollapsibleContent>
          <div className={cn('ml-8 mr-3 mb-2 rounded-md px-3 py-2', stateClasses.body)}>
            {bodyContent}
          </div>
        </CollapsibleContent>
      )}
      {inlineBody && (
        <div className={cn('ml-8 mr-3 mb-2 rounded-md px-3 py-2', stateClasses.body)}>
          {bodyContent}
        </div>
      )}
      {isApprovalPending && (
        <div className="ml-6 mr-1.5 mb-2 rounded-md bg-amber-500/[0.045] px-2.5 py-2 ring-1 ring-amber-500/20 sm:ml-8 sm:mr-3 sm:px-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background/35 px-2.5 py-2 sm:px-3">
            <span className="text-xs text-muted-foreground">Approval required to continue.</span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!onApprovalResponse || approvalSubmitting !== null}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void handleApprovalResponse(false)
                }}
              >
                {approvalSubmitting === 'reject' ? 'Rejecting...' : 'Reject'}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!onApprovalResponse || approvalSubmitting !== null}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void handleApprovalResponse(true)
                }}
              >
                {approvalSubmitting === 'approve' ? 'Approving...' : 'Approve'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {hasInlineSecretPrompt && (
        <div className="ml-6 mr-1.5 mb-2 rounded-md bg-yellow-500/[0.035] px-2.5 py-2 ring-1 ring-yellow-500/15 sm:ml-8 sm:mr-3 sm:px-3">
          <div className="rounded-md bg-background/35 px-2.5 py-2 sm:px-3">
            {resolvedInlineSecretPrompt}
          </div>
        </div>
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
  threadControlThreads?: ThreadListRecord[]
  onOpenTerminal?: (terminalId: string | null) => void
  onOpenDiff?: (filePath: string) => void
  renderInlineSecretPrompt?: (call: ToolCallInfo) => ReactNode
  onApprovalResponse?: (requestId: string, approved: boolean) => Promise<void> | void
}

/**
 * Maximum number of completed tool calls to render individually.
 * Older completed calls are collapsed into a summary row to keep the DOM light.
 */
const MAX_VISIBLE_COMPLETED = 6

export function hasInlineSecretPromptForCalls(
  calls: ToolCallInfo[],
  renderInlineSecretPrompt?: (call: ToolCallInfo) => ReactNode,
): boolean {
  return !!renderInlineSecretPrompt && calls.some((call) => renderInlineSecretPrompt(call) != null)
}

export function shouldInitiallyCollapseToolCallGroup(calls: ToolCallInfo[], collapsible?: boolean): boolean {
  if (!collapsible) return false
  if (calls.some(isInlineToolCall)) return false
  const completedCalls = calls.filter(c => c.status !== 'running' && c.status !== 'pending')
  return completedCalls.length >= MIN_CALLS_TO_COLLAPSE && completedCalls.length === calls.length
}

function ToolCallGroupInner({ calls, collapsible, threadControlThreads, onOpenTerminal, onOpenDiff, renderInlineSecretPrompt, onApprovalResponse }: ToolCallGroupProps) {
  const [showAll, setShowAll] = useState(false)
  const [groupOpen, setGroupOpen] = useState(() => !shouldInitiallyCollapseToolCallGroup(calls, collapsible))
  const prevAllDoneRef = useRef(false)

  // Compute agent nesting so inner-agent tool calls render inside the agent card
  const { childMap, parentSet } = useMemo(() => computeAgentNesting(calls), [calls])
  const topLevelCalls = useMemo(() => calls.filter(c => !parentSet.has(c.callId)), [calls, parentSet])

  const activeCalls = topLevelCalls.filter(c => c.status === 'running' || c.status === 'pending')
  const completedCalls = topLevelCalls.filter(c => c.status !== 'running' && c.status !== 'pending')
  const allDone = activeCalls.length === 0 && completedCalls.length > 0
  const hasInlineSecretPrompt = hasInlineSecretPromptForCalls(calls, renderInlineSecretPrompt)
  const shouldCollapseGroup = collapsible && !hasInlineSecretPrompt && allDone && completedCalls.length >= MIN_CALLS_TO_COLLAPSE

  useEffect(() => {
    if (hasInlineSecretPrompt) {
      setGroupOpen(true)
      return
    }
    if (shouldCollapseGroup && !prevAllDoneRef.current) {
      setGroupOpen(false)
    }
    prevAllDoneRef.current = allDone
  }, [allDone, hasInlineSecretPrompt, shouldCollapseGroup])

  if (calls.length === 0) return null

  const totalSuccessCount = completedCalls.filter(c => c.status === 'success').length
  const totalErrorCount = completedCalls.filter(c => c.status === 'error').length
  const SummaryIcon = getToolCallWrapperIcon(completedCalls)

  if (shouldCollapseGroup && !groupOpen) {
    return (
      <div className="my-2">
        <button
          type="button"
          onClick={() => setGroupOpen(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/35"
        >
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <SummaryIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium">
            {summarizeCollapsedToolCalls(completedCalls)}
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
    <div className="my-2">
      {shouldCollapseGroup && (
        <button
          type="button"
          onClick={() => setGroupOpen(false)}
          className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/35"
        >
          <ChevronRight className="h-3 w-3 rotate-90 transition-transform" />
          <span>Collapse {summarizeCollapsedToolCalls(completedCalls)}</span>
        </button>
      )}
      {needsCollapse && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/35"
        >
          <ChevronRight className="h-3 w-3" />
          <span>
            {hiddenCount} earlier tool call{hiddenCount !== 1 ? 's' : ''}
            {successCount > 0 && <span className="text-green-500 ml-1">({successCount} passed)</span>}
            {errorCount > 0 && <span className="text-red-500 ml-1">({errorCount} failed)</span>}
          </span>
        </button>
      )}
      {showAll && completedCalls.slice(0, hiddenCount).map((call, index, arr) => (
        <ToolCallCard
          key={call.callId}
          call={call}
          childCalls={childMap.get(call.callId)}
          threadControlThreads={threadControlThreads}
          onOpenTerminal={onOpenTerminal}
          onOpenDiff={onOpenDiff}
          renderInlineSecretPrompt={renderInlineSecretPrompt}
          onApprovalResponse={onApprovalResponse}
          hideTopConnector={index === 0}
          hideBottomConnector={index === arr.length - 1 && visibleCompleted.length === 0 && activeCalls.length === 0}
        />
      ))}
      {visibleCompleted.map((call, index) => (
        <ToolCallCard
          key={call.callId}
          call={call}
          childCalls={childMap.get(call.callId)}
          threadControlThreads={threadControlThreads}
          onOpenTerminal={onOpenTerminal}
          onOpenDiff={onOpenDiff}
          renderInlineSecretPrompt={renderInlineSecretPrompt}
          onApprovalResponse={onApprovalResponse}
          hideTopConnector={showAll ? false : index === 0}
          hideBottomConnector={index === visibleCompleted.length - 1 && activeCalls.length === 0}
        />
      ))}
      {activeCalls.map((call, index) => (
        <ToolCallCard
          key={call.callId}
          call={call}
          childCalls={childMap.get(call.callId)}
          threadControlThreads={threadControlThreads}
          onOpenTerminal={onOpenTerminal}
          onOpenDiff={onOpenDiff}
          renderInlineSecretPrompt={renderInlineSecretPrompt}
          onApprovalResponse={onApprovalResponse}
          hideTopConnector={completedCalls.length === 0 && index === 0}
          hideBottomConnector={index === activeCalls.length - 1}
        />
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
    prevProps.renderInlineSecretPrompt === nextProps.renderInlineSecretPrompt &&
    prevProps.onApprovalResponse === nextProps.onApprovalResponse &&
    prevProps.threadControlThreads === nextProps.threadControlThreads &&
    prevProps.collapsible === nextProps.collapsible &&
    areToolCallListsEqual(prevProps.calls, nextProps.calls),
)
ToolCallGroup.displayName = 'ToolCallGroup'

/* ─── Agent Tool Call Wrapper ──────────────────────────────────────────────── */

interface AgentToolCallWrapperProps {
  provider: string
  calls: ToolCallInfo[]
  isStreaming?: boolean
  threadControlThreads?: ThreadListRecord[]
  onOpenTerminal?: (terminalId: string | null) => void
  onOpenDiff?: (filePath: string) => void
  renderInlineSecretPrompt?: (call: ToolCallInfo) => ReactNode
  onApprovalResponse?: (requestId: string, approved: boolean) => Promise<void> | void
}

export function shouldInitiallyCollapseAgentToolCallWrapper(calls: ToolCallInfo[], isStreaming?: boolean): boolean {
  if (isStreaming) return false
  return calls.length > 0 && calls.every(c => c.status !== 'running' && c.status !== 'pending')
}

function AgentToolCallWrapperInner({ provider: _provider, calls, isStreaming, threadControlThreads, onOpenTerminal, onOpenDiff, renderInlineSecretPrompt, onApprovalResponse }: AgentToolCallWrapperProps) {
  const [open, setOpen] = useState(() => !shouldInitiallyCollapseAgentToolCallWrapper(calls, isStreaming))
  const [showAll, setShowAll] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const prevActiveRef = useRef(!shouldInitiallyCollapseAgentToolCallWrapper(calls, isStreaming))

  const isActive = !!isStreaming || calls.some(c => c.status === 'running' || c.status === 'pending')
  const hasInlineSecretPrompt = hasInlineSecretPromptForCalls(calls, renderInlineSecretPrompt)
  const effectiveOpen = hasInlineSecretPrompt ? true : open
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (hasInlineSecretPrompt && !nextOpen) return
    setOpen(nextOpen)
  }, [hasInlineSecretPrompt])
  const successCount = calls.filter(c => c.status === 'success').length
  const errorCount = calls.filter(c => c.status === 'error').length
  const startedAt = calls.length > 0 ? Math.min(...calls.map(c => c.startedAt)) : Date.now()
  const completedAt = !isActive && calls.length > 0
    ? Math.max(...calls.map(c => c.completedAt ?? c.startedAt))
    : undefined
  const SummaryIcon = getToolCallWrapperIcon(calls)

  // Compute agent nesting so inner-agent tool calls render inside the agent card
  const { childMap, parentSet } = useMemo(() => computeAgentNesting(calls), [calls])
  const topLevelCalls = useMemo(() => calls.filter(c => !parentSet.has(c.callId)), [calls, parentSet])

  // Split into active and completed for inner collapsing
  const activeCalls = topLevelCalls.filter(c => c.status === 'running' || c.status === 'pending')
  const completedCalls = topLevelCalls.filter(c => c.status !== 'running' && c.status !== 'pending')
  const needsInnerCollapse = !showAll && completedCalls.length > MAX_VISIBLE_COMPLETED
  const hiddenCount = needsInnerCollapse ? completedCalls.length - MAX_VISIBLE_COMPLETED : 0
  const visibleCompleted = needsInnerCollapse ? completedCalls.slice(-MAX_VISIBLE_COMPLETED) : completedCalls
  const hiddenSuccessCount = needsInnerCollapse ? completedCalls.slice(0, hiddenCount).filter(c => c.status === 'success').length : 0
  const hiddenErrorCount = hiddenCount - hiddenSuccessCount

  // Auto-collapse when the agent finishes
  useEffect(() => {
    if (hasInlineSecretPrompt) {
      setOpen(true)
      prevActiveRef.current = isActive
      return
    }
    if (prevActiveRef.current && !isActive && calls.length > 0) {
      setOpen(false)
    }
    prevActiveRef.current = isActive
  }, [hasInlineSecretPrompt, isActive, calls.length])

  // Tick the elapsed timer while active
  useEffect(() => {
    if (!isActive) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [isActive])

  if (calls.length === 0) return null

  return (
    <Collapsible open={effectiveOpen} onOpenChange={handleOpenChange}>
      <div className="my-2">
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/35">
          <ChevronRight className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            effectiveOpen && 'rotate-90',
          )} />
          {isActive
            ? <Loader2 className="h-4 w-4 shrink-0 text-muted-foreground animate-spin" />
            : <SummaryIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          }
          <span className="text-sm font-medium text-foreground truncate">
            {summarizeCollapsedToolCalls(calls)}
          </span>
          <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
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
          <div className="mt-1">
            {needsInnerCollapse && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/35"
              >
                <ChevronRight className="h-3 w-3" />
                <span>
                  {hiddenCount} earlier tool call{hiddenCount !== 1 ? 's' : ''}
                  {hiddenSuccessCount > 0 && <span className="text-green-500 ml-1">({hiddenSuccessCount} passed)</span>}
                  {hiddenErrorCount > 0 && <span className="text-red-500 ml-1">({hiddenErrorCount} failed)</span>}
                </span>
              </button>
            )}
            {showAll && completedCalls.slice(0, hiddenCount).map((call, index, arr) => (
              <ToolCallCard
                key={call.callId}
                call={call}
                childCalls={childMap.get(call.callId)}
                threadControlThreads={threadControlThreads}
                onOpenTerminal={onOpenTerminal}
                onOpenDiff={onOpenDiff}
                renderInlineSecretPrompt={renderInlineSecretPrompt}
                onApprovalResponse={onApprovalResponse}
                hideTopConnector={index === 0}
                hideBottomConnector={index === arr.length - 1 && visibleCompleted.length === 0 && activeCalls.length === 0}
              />
            ))}
            {visibleCompleted.map((call, index) => (
              <ToolCallCard
                key={call.callId}
                call={call}
                childCalls={childMap.get(call.callId)}
                threadControlThreads={threadControlThreads}
                onOpenTerminal={onOpenTerminal}
                onOpenDiff={onOpenDiff}
                renderInlineSecretPrompt={renderInlineSecretPrompt}
                onApprovalResponse={onApprovalResponse}
                hideTopConnector={showAll ? false : index === 0}
                hideBottomConnector={index === visibleCompleted.length - 1 && activeCalls.length === 0}
              />
            ))}
            {activeCalls.map((call, index) => (
              <ToolCallCard
                key={call.callId}
                call={call}
                childCalls={childMap.get(call.callId)}
                threadControlThreads={threadControlThreads}
                onOpenTerminal={onOpenTerminal}
                onOpenDiff={onOpenDiff}
                renderInlineSecretPrompt={renderInlineSecretPrompt}
                onApprovalResponse={onApprovalResponse}
                hideTopConnector={completedCalls.length === 0 && index === 0}
                hideBottomConnector={index === activeCalls.length - 1}
              />
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
    prevProps.renderInlineSecretPrompt === nextProps.renderInlineSecretPrompt &&
    prevProps.onApprovalResponse === nextProps.onApprovalResponse &&
    prevProps.threadControlThreads === nextProps.threadControlThreads &&
    areToolCallListsEqual(prevProps.calls, nextProps.calls),
)
AgentToolCallWrapper.displayName = 'AgentToolCallWrapper'
