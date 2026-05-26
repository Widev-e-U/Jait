/**
 * ProviderSelector — dropdown to choose the agent provider for chat.
 * Follows the same pattern as ModeSelector.
 */

import { useState, useEffect, useMemo, useRef, type ComponentType } from 'react'
import { ChevronDown, Check, AlertTriangle, Server, Loader2, Monitor, LogIn, LogOut, Copy, ExternalLink, Network } from 'lucide-react'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Claude from '@lobehub/icons/es/Claude'

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
  /** Node ID of the open developer-mode project (scopes CLI providers to that device). */
  projectNodeId?: string
}

/** Wrap @lobehub/icons so they conform to the same {className} interface as lucide icons. */
const OpenAIIcon = ({ className }: { className?: string }) => <OpenAI size={16} className={className} />
const ClaudeIcon = ({ className }: { className?: string }) => <Claude size={16} className={className} />

interface ProviderDef {
  value: ProviderId
  label: string
  icon: ComponentType<{ className?: string }>
  description: string
}

const PROVIDER_DEFS: ProviderDef[] = [
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
]

const PROVIDER_DEF_BY_ID = new Map(PROVIDER_DEFS.map((item) => [item.value, item]))

function providerDefFromInfo(info: ProviderInfo): ProviderDef {
  const known = PROVIDER_DEF_BY_ID.get(info.id)
  return known ?? {
    value: info.id,
    label: info.name || info.id,
    icon: Network,
    description: info.description,
  }
}

/** Turn a long unavailableReason into a short badge label. */
function summariseReason(reason: string): string {
  const lower = reason.toLowerCase()
  if (lower.includes('not installed') || lower.includes('not found')) return 'not installed'
  if (lower.includes('not authenticated') || lower.includes('login')) return 'not authenticated'
  return 'unavailable'
}

export function ProviderSelector({ provider, onChange, disabled, className, iconOnly = false, repoRuntime, onMoveToGateway, sessionInfo, projectNodeId }: ProviderSelectorProps) {
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderInfo>>({})
  const [localProviders, setLocalProviders] = useState<ProviderInfo[]>([])
  const [remoteProviders, setRemoteProviders] = useState<RemoteProviderInfo[]>([])
  const [authBusy, setAuthBusy] = useState<{ providerId: ProviderId; action: 'login' | 'logout' | 'send-code' } | null>(null)
  const [authMessage, setAuthMessage] = useState<{
    providerId: ProviderId
    tone: 'success' | 'error'
    message: string
    userCode?: string
    verificationUri?: string
    copied?: boolean
    requiresCodeInput?: boolean
    inputPrompt?: string
  } | null>(null)

  const refreshProviders = (fresh = false) => {
    const request = fresh ? agentsApi.listProvidersFresh() : agentsApi.listProviders()
    request
      .then(({ providers, remoteProviders: remote }) => {
        const map: Record<string, ProviderInfo> = {}
        for (const p of providers) map[p.id] = p
        setProviderStatus(map)
        setLocalProviders(providers)
        setRemoteProviders(remote)
      })
      .catch(() => {/* ignore */})
  }

  useEffect(() => {
    refreshProviders()
  }, [])

  const copyCode = async (providerId: ProviderId, code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setAuthMessage((prev) => prev && prev.providerId === providerId ? { ...prev, copied: true } : prev)
    } catch {
      setAuthMessage((prev) => prev && prev.providerId === providerId ? { ...prev, copied: false } : prev)
    }
  }

  const codeInputRef = useRef<HTMLInputElement>(null)

  const sendCode = async (providerId: ProviderId) => {
    const code = codeInputRef.current?.value.trim()
    if (!code || authBusy) return
    setAuthBusy({ providerId, action: 'send-code' })
    try {
      await agentsApi.sendProviderLoginInput(providerId, code)
      if (codeInputRef.current) codeInputRef.current.value = ''
      setAuthMessage((prev) => prev && prev.providerId === providerId
        ? { ...prev, requiresCodeInput: false, message: 'Code sent. Completing login…' }
        : prev)
      // Poll providers until authenticated or 30s
      const start = Date.now()
      const poll = () => {
        if (Date.now() - start > 30_000) { refreshProviders(true); return }
        refreshProviders(true)
        setTimeout(poll, 2_000)
      }
      setTimeout(poll, 1_500)
    } catch (error) {
      setAuthMessage((prev) => prev && prev.providerId === providerId
        ? { ...prev, tone: 'error', message: error instanceof Error ? error.message : 'Failed to send code.' }
        : prev)
    } finally {
      setAuthBusy(null)
    }
  }

  const startLogin = async (providerId: ProviderId, label: string) => {
    if (authBusy) return
    let authWindow: Window | null = null
    try {
      authWindow = window.open('about:blank', '_blank')
    } catch {
      authWindow = null
    }
    setAuthBusy({ providerId, action: 'login' })
    setAuthMessage(null)
    try {
      const result = await agentsApi.startProviderLogin(providerId)
      if (result.verificationUri) {
        if (authWindow) {
          authWindow.location.href = result.verificationUri
        } else {
          window.open(result.verificationUri, '_blank', 'noopener,noreferrer')
        }
      } else {
        authWindow?.close()
      }
      let copied = false
      if (result.userCode) {
        try {
          await navigator.clipboard.writeText(result.userCode)
          copied = true
        } catch {
          copied = false
        }
      }
      setAuthMessage({
        providerId,
        tone: 'success',
        message: result.userCode
          ? `${label} login started. Device code ${copied ? 'copied to clipboard.' : 'is ready to copy.'}`
          : result.requiresCodeInput
            ? (result.inputPrompt ?? `Enter the authorization code from your browser to complete ${label} login.`)
            : result.message,
        userCode: result.userCode,
        verificationUri: result.verificationUri,
        copied,
        requiresCodeInput: result.requiresCodeInput,
        inputPrompt: result.inputPrompt,
      })
      refreshProviders(true)
    } catch (error) {
      authWindow?.close()
      setAuthMessage({
        providerId,
        tone: 'error',
        message: error instanceof Error ? error.message : `Failed to start ${label} login.`,
      })
    } finally {
      setAuthBusy(null)
    }
  }

  const logoutProvider = async (providerId: ProviderId, label: string) => {
    if (authBusy) return
    setAuthBusy({ providerId, action: 'logout' })
    setAuthMessage(null)
    try {
      const result = await agentsApi.logoutProvider(providerId)
      setAuthMessage({
        providerId,
        tone: 'success',
        message: result.message || `${label} logout completed.`,
      })
      refreshProviders(true)
    } catch (error) {
      setAuthMessage({
        providerId,
        tone: 'error',
        message: error instanceof Error ? error.message : `Failed to log out from ${label}.`,
      })
    } finally {
      setAuthBusy(null)
    }
  }

  // When a repo runtime is provided, scope provider availability to the repo's device
  const scopedToRepo = repoRuntime != null
  const repoAvailable = repoRuntime?.availableProviders ?? []
  const repoOnline = repoRuntime?.online ?? true
  const repoLoading = repoRuntime?.loading ?? false
  const repoIsGateway = repoRuntime?.hostType === 'gateway'

  // Developer-mode project scoping: if project is on a non-gateway node, scope providers
  const wsNodeIsRemote = Boolean(projectNodeId && projectNodeId !== 'gateway')
  const wsRemoteNode = wsNodeIsRemote ? remoteProviders.find((n) => n.nodeId === projectNodeId) : undefined
  const scopedToProjectNode = wsNodeIsRemote && !scopedToRepo

  const providerEntries = useMemo(() => {
    const source = localProviders.length > 0 ? localProviders.map(providerDefFromInfo) : PROVIDER_DEFS
    return source.map((item) => {
      const status = providerStatus[item.value]
      const auth = status?.auth

      let isAvailable: boolean
      let reason: string | undefined
      let remoteNode: RemoteProviderInfo | undefined
      let nodeLabel: string | undefined

      if (scopedToRepo) {
        if (item.value === 'jait') {
          isAvailable = true
          nodeLabel = 'Gateway'
        } else if (repoIsGateway) {
          isAvailable = status?.available !== false
          reason = status?.unavailableReason
          nodeLabel = 'Gateway'
        } else if (repoLoading) {
          isAvailable = false
          reason = 'Checking device…'
        } else if (!repoOnline) {
          isAvailable = false
          reason = 'Device is offline'
        } else {
          isAvailable = repoAvailable.includes(item.value)
          reason = isAvailable ? undefined : 'Not available on this device'
          nodeLabel = repoRuntime?.locationLabel ?? 'device'
        }
      } else if (scopedToProjectNode) {
        if (item.value === 'jait') {
          isAvailable = true
          nodeLabel = 'Gateway'
        } else if (!wsRemoteNode) {
          isAvailable = false
          reason = 'Device is offline'
        } else {
          isAvailable = wsRemoteNode.providers.includes(item.value)
          reason = isAvailable ? undefined : 'Not available on this device'
          nodeLabel = wsRemoteNode.nodeName
        }
      } else {
        const isLocallyAvailable = status?.available !== false
        reason = status?.unavailableReason
        remoteNode = !isLocallyAvailable
          ? remoteProviders.find((remote) => remote.providers.includes(item.value))
          : undefined
        isAvailable = isLocallyAvailable || !!remoteNode
        nodeLabel = !status?.available && remoteNode ? remoteNode.nodeName : 'Gateway'
      }

      return { ...item, isAvailable, reason, nodeLabel, auth }
    })
  }, [localProviders, providerStatus, remoteProviders, scopedToRepo, repoIsGateway, repoLoading, repoOnline, repoAvailable, repoRuntime?.locationLabel, scopedToProjectNode, wsRemoteNode])

  const current = providerEntries.find((p) => p.value === provider) ?? providerEntries[0] ?? PROVIDER_DEFS[0]
  const CurrentIcon = current.icon

  // Determine location label for the trigger button
  const locationLabel = scopedToRepo
    ? (repoIsGateway ? 'Gateway' : repoRuntime?.locationLabel)
    : scopedToProjectNode
      ? (wsRemoteNode?.nodeName ?? projectNodeId)
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
        {scopedToProjectNode && !wsRemoteNode && (
          <>
            <div className="px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
              Device is offline — only Jait (gateway) is available
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {providerEntries.map((p) => {
          const Icon = p.icon
          const isActive = provider === p.value
          const auth = p.auth
          const isAvailable = p.isAvailable
          const reason = p.reason
          const nodeLabel = p.nodeLabel

          const showLocalAuthActions = Boolean(auth?.login || auth?.logout) && !scopedToProjectNode && (!scopedToRepo || repoIsGateway)
          const busyForProvider = authBusy?.providerId === p.value ? authBusy.action : null
          const providerAuthMessage = authMessage?.providerId === p.value ? authMessage : null

          return (
            <div key={p.value} className="rounded-md px-2.5 py-2 transition-colors hover:bg-accent/60">
              <button
                type="button"
                onClick={() => isAvailable && onChange(p.value)}
                disabled={!isAvailable}
                className="flex w-full cursor-pointer items-start gap-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {p.label}
                    {isAvailable && nodeLabel && (
                      <span className="flex items-center gap-0.5 text-2xs text-muted-foreground">
                        <Monitor className="h-3 w-3" />
                        {nodeLabel}
                      </span>
                    )}
                    {!isAvailable && (
                      <span className="flex items-center gap-0.5 text-2xs text-destructive/80">
                        <AlertTriangle className="h-3 w-3" />
                        {reason ? summariseReason(reason) : 'unavailable'}
                      </span>
                    )}
                    {auth && auth.authenticated === true && (
                      <span className="text-2xs text-emerald-600 dark:text-emerald-400">signed in</span>
                    )}
                  </div>
                  <div className="text-xs leading-snug text-muted-foreground">
                    {!isAvailable && reason ? reason : p.description}
                  </div>
                </div>
                {isActive && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              </button>

              {showLocalAuthActions && (
                <div className="mt-2 ml-6 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {auth?.login && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void startLogin(p.value, p.label)
                        }}
                        disabled={Boolean(authBusy)}
                        className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-2xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {busyForProvider === 'login' ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                        Login
                      </button>
                    )}
                    {auth?.logout && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void logoutProvider(p.value, p.label)
                        }}
                        disabled={Boolean(authBusy)}
                        className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        {busyForProvider === 'logout' ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                        Logout
                      </button>
                    )}
                  </div>

                  {providerAuthMessage && (
                    <div className={cn(
                      'rounded-md border px-2 py-1.5 text-xs leading-snug',
                      providerAuthMessage.tone === 'success'
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-destructive/25 bg-destructive/10 text-destructive',
                    )}>
                      <div>{providerAuthMessage.message}</div>
                      {providerAuthMessage.userCode && (
                        <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                          <code className="min-w-0 flex-1 rounded bg-background/80 px-1.5 py-1 font-mono text-xs [overflow-wrap:anywhere]">
                            {providerAuthMessage.userCode}
                          </code>
                          <button
                            type="button"
                            onClick={() => void copyCode(p.value, providerAuthMessage.userCode!)}
                            className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-2xs font-medium text-foreground hover:bg-muted"
                          >
                            <Copy className="h-3 w-3" />
                            {providerAuthMessage.copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      )}
                      {providerAuthMessage.verificationUri && (
                        <button
                          type="button"
                          onClick={() => window.open(providerAuthMessage.verificationUri, '_blank', 'noopener,noreferrer')}
                          className="mt-1.5 inline-flex items-center gap-1 text-2xs font-medium underline-offset-2 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open login page
                        </button>
                      )}
                      {providerAuthMessage.requiresCodeInput && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <input
                            ref={codeInputRef}
                            type="text"
                            placeholder="Paste authorization code…"
                            className="h-6 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            onKeyDown={(e) => { if (e.key === 'Enter') void sendCode(p.value) }}
                          />
                          <button
                            type="button"
                            onClick={() => void sendCode(p.value)}
                            disabled={Boolean(authBusy)}
                            className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-2xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                          >
                            {authBusy?.action === 'send-code' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Submit'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
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
