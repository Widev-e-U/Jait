/**
 * ProviderSelector — dropdown to choose the agent provider for chat.
 * Follows the same pattern as ModeSelector.
 */

import { useState, useEffect } from 'react'
import { Bot, ChevronDown, Check, AlertTriangle, Server, Loader2, Monitor } from 'lucide-react'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Claude from '@lobehub/icons/es/Claude'
import Gemini from '@lobehub/icons/es/Gemini'
import Copilot from '@lobehub/icons/es/Copilot'

/** Inline Jait logo icon — matches the header SVG. */
const JaitIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 1024 1024" className={className}>
    <path d="M318 372 L430 486 L318 600"
          fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M610 258 L610 642 C610 734 549 796 455 796 C393 796 338 766 299 715"
          fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { agentsApi, type ProviderId, type ProviderInfo, type RemoteProviderInfo } from '@/lib/agents-api'
import type { RepositoryRuntimeInfo } from '@/lib/automation-repositories'

interface ProviderSelectorProps {
  provider: ProviderId
  onChange: (provider: ProviderId) => void
  disabled?: boolean
  className?: string
  iconOnly?: boolean
  /** When set, scopes provider availability to the selected repo's device. */
  repoRuntime?: RepositoryRuntimeInfo | null
  /** Called when user wants to move the repo to the gateway. */
  onMoveToGateway?: () => void
  /** Active session info — shows where the current session is running. */
  sessionInfo?: { isRemote: boolean; remoteNode?: { nodeName: string; platform: string } } | null
  /** Node ID of the open developer-mode workspace (scopes CLI providers to that device). */
  workspaceNodeId?: string
}

/** Wrap @lobehub/icons so they conform to the same {className} interface as lucide icons. */
const OpenAIIcon = ({ className }: { className?: string }) => <OpenAI size={16} className={className} />
const ClaudeIcon = ({ className }: { className?: string }) => <Claude size={16} className={className} />
const GeminiIcon = ({ className }: { className?: string }) => <Gemini size={16} className={className} />
const CopilotIcon = ({ className }: { className?: string }) => <Copilot size={16} className={className} />

const PROVIDER_DEFS: Array<{
  value: ProviderId
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}> = [
  {
    value: 'jait',
    label: 'Jait',
    icon: JaitIcon,
    description: 'Native Jait agent loop with full tool access',
  },
  {
    value: 'codex',
    label: 'Codex',
    icon: OpenAIIcon,
    description: 'OpenAI Codex CLI — coding agent with MCP tools',
  },
  {
    value: 'claude-code',
    label: 'Claude Code',
    icon: ClaudeIcon,
    description: 'Anthropic Claude Code CLI — coding agent with MCP tools',
  },
  {
    value: 'gemini',
    label: 'Gemini CLI',
    icon: GeminiIcon,
    description: 'Google Gemini CLI — coding agent',
  },
  {
    value: 'opencode',
    label: 'OpenCode',
    icon: Bot,
    description: 'OpenCode CLI — open-source coding agent',
  },
  {
    value: 'copilot',
    label: 'Copilot',
    icon: CopilotIcon,
    description: 'GitHub Copilot CLI — coding agent',
  },
]

/** Turn a long unavailableReason into a short badge label. */
function summariseReason(reason: string): string {
  const lower = reason.toLowerCase()
  if (lower.includes('not installed') || lower.includes('not found')) return 'not installed'
  if (lower.includes('not authenticated') || lower.includes('login')) return 'not authenticated'
  return 'unavailable'
}

export function ProviderSelector({ provider, onChange, disabled, className, iconOnly = false, repoRuntime, onMoveToGateway, sessionInfo, workspaceNodeId }: ProviderSelectorProps) {
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderInfo>>({})
  const [remoteProviders, setRemoteProviders] = useState<RemoteProviderInfo[]>([])

  useEffect(() => {
    agentsApi.listProviders()
      .then(({ providers, remoteProviders: remote }) => {
        const map: Record<string, ProviderInfo> = {}
        for (const p of providers) map[p.id] = p
        setProviderStatus(map)
        setRemoteProviders(remote)
      })
      .catch(() => {/* ignore */})
  }, [])

  // When a repo runtime is provided, scope provider availability to the repo's device
  const scopedToRepo = repoRuntime != null
  const repoAvailable = repoRuntime?.availableProviders ?? []
  const repoOnline = repoRuntime?.online ?? true
  const repoLoading = repoRuntime?.loading ?? false
  const repoIsGateway = repoRuntime?.hostType === 'gateway'

  // Developer-mode workspace scoping: if workspace is on a non-gateway node, scope providers
  const wsNodeIsRemote = Boolean(workspaceNodeId && workspaceNodeId !== 'gateway')
  const wsRemoteNode = wsNodeIsRemote ? remoteProviders.find((n) => n.nodeId === workspaceNodeId) : undefined
  const scopedToWorkspaceNode = wsNodeIsRemote && !scopedToRepo

  const current = PROVIDER_DEFS.find((p) => p.value === provider) ?? PROVIDER_DEFS[0]
  const CurrentIcon = current.icon

  // Determine location label for the trigger button
  const locationLabel = scopedToRepo
    ? (repoIsGateway ? 'Gateway' : repoRuntime?.locationLabel)
    : scopedToWorkspaceNode
      ? (wsRemoteNode?.nodeName ?? workspaceNodeId)
      : sessionInfo?.isRemote && sessionInfo.remoteNode
        ? sessionInfo.remoteNode.nodeName
        : undefined

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground',
            'hover:text-foreground hover:bg-muted/60 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
          title={`Provider: ${current.label}${locationLabel ? ` · ${locationLabel}` : ''}`}
          aria-label={`Provider: ${current.label}${locationLabel ? ` on ${locationLabel}` : ''}`}
        >
          <CurrentIcon className="h-4 w-4" />
          {!iconOnly && <span>{current.label}</span>}
          {!iconOnly && locationLabel && (
            <span className="flex items-center gap-0.5 text-2xs text-blue-500">
              <Monitor className="h-3 w-3" />
              {locationLabel}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        {scopedToRepo && !repoIsGateway && !repoOnline && !repoLoading && (
          <>
            <div className="px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
              Device is offline — only Jait (gateway) is available
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {scopedToRepo && repoLoading && (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Connecting to device…
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {scopedToWorkspaceNode && !wsRemoteNode && (
          <>
            <div className="px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
              Device is offline — only Jait (gateway) is available
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {PROVIDER_DEFS.map((p) => {
          const Icon = p.icon
          const isActive = provider === p.value
          const status = providerStatus[p.value]

          let isAvailable: boolean
          let reason: string | undefined
          let remoteNode: RemoteProviderInfo | undefined
          let nodeLabel: string | undefined

          if (scopedToRepo) {
            // Jait always runs on the gateway
            if (p.value === 'jait') {
              isAvailable = true
              nodeLabel = 'Gateway'
            } else if (repoIsGateway) {
              // Gateway-hosted repo: use local gateway availability
              isAvailable = status?.available !== false
              reason = status?.unavailableReason
              nodeLabel = 'Gateway'
            } else if (repoLoading) {
              // Still loading — disable CLI providers
              isAvailable = false
              reason = 'Checking device…'
            } else if (!repoOnline) {
              // Device offline — CLI providers unavailable
              isAvailable = false
              reason = 'Device is offline'
            } else {
              // Device online — only show providers the device reports
              isAvailable = repoAvailable.includes(p.value)
              reason = isAvailable ? undefined : 'Not available on this device'
              nodeLabel = repoRuntime?.locationLabel ?? 'device'
            }
          } else if (scopedToWorkspaceNode) {
            // Developer mode with workspace on remote device
            if (p.value === 'jait') {
              isAvailable = true
              nodeLabel = 'Gateway'
            } else if (!wsRemoteNode) {
              // Node is offline
              isAvailable = false
              reason = 'Device is offline'
            } else {
              isAvailable = wsRemoteNode.providers.includes(p.value)
              reason = isAvailable ? undefined : 'Not available on this device'
              nodeLabel = wsRemoteNode.nodeName
            }
          } else {
            // Unscoped (chat mode) — original logic
            const isLocallyAvailable = status?.available !== false
            reason = status?.unavailableReason
            remoteNode = !isLocallyAvailable
              ? remoteProviders.find((r) => r.providers.includes(p.value))
              : undefined
            isAvailable = isLocallyAvailable || !!remoteNode
            nodeLabel = !status?.available && remoteNode ? remoteNode.nodeName : 'Gateway'
          }

          return (
            <DropdownMenuItem
              key={p.value}
              onClick={() => onChange(p.value)}
              disabled={!isAvailable}
              className="flex items-start gap-2.5 py-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {p.label}
                  {isAvailable && nodeLabel && (
                    <span className="text-2xs text-muted-foreground flex items-center gap-0.5">
                      <Monitor className="h-3 w-3" />
                      {nodeLabel}
                    </span>
                  )}
                  {!isAvailable && (
                    <span className="text-2xs text-destructive/80 flex items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3" />
                      {reason ? summariseReason(reason) : 'unavailable'}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground leading-snug">
                  {!isAvailable && reason ? reason : p.description}
                </div>
              </div>
              {isActive && <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          )
        })}
        {scopedToRepo && !repoIsGateway && !repoOnline && !repoLoading && onMoveToGateway && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onMoveToGateway}
              className="flex items-start gap-2.5 py-2 cursor-pointer"
            >
              <Server className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Move to Gateway</div>
                <div className="text-xs text-muted-foreground leading-snug">
                  Run this repo on the gateway server instead
                </div>
              </div>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
