import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Bot, ChevronDown, Check, AlertTriangle, Server, Loader2, Monitor, Clock, Search, LogIn, Copy, ExternalLink } from 'lucide-react'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Claude from '@lobehub/icons/es/Claude'
import Gemini from '@lobehub/icons/es/Gemini'
import Copilot from '@lobehub/icons/es/Copilot'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { agentsApi, type ProviderId, type ProviderInfo, type RemoteProviderInfo } from '@/lib/agents-api'
import type { RepositoryRuntimeInfo } from '@/lib/automation-repositories'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAuth } from '@/hooks/useAuth'

const JaitIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 1024 1024" className={className}>
    <path d="M318 372 L430 486 L318 600" fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M610 258 L610 642 C610 734 549 796 455 796 C393 796 338 766 299 715" fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const OpenAIIcon = ({ className }: { className?: string }) => <OpenAI size={16} className={className} />
const ClaudeIcon = ({ className }: { className?: string }) => <Claude size={16} className={className} />
const GeminiIcon = ({ className }: { className?: string }) => <Gemini size={16} className={className} />
const CopilotIcon = ({ className }: { className?: string }) => <Copilot size={16} className={className} />

interface ModelDef {
  id: string
  name: string
  description?: string
  isDefault?: boolean
  group?: string
}

interface ProviderDef {
  value: ProviderId
  label: string
  icon: ComponentType<{ className?: string }>
  description: string
}

interface ProviderModelSelectorProps {
  provider: ProviderId
  model: string | null
  onProviderChange: (provider: ProviderId) => void
  onModelChange: (model: string | null) => void
  disabled?: boolean
  className?: string
  compact?: boolean
  repoRuntime?: RepositoryRuntimeInfo | null
  onMoveToGateway?: () => void
  sessionInfo?: { isRemote: boolean; remoteNode?: { nodeName: string; platform: string } } | null
  workspaceNodeId?: string
}

const PROVIDER_DEFS: ProviderDef[] = [
  { value: 'jait', label: 'Jait', icon: JaitIcon, description: 'Native Jait agent loop with full tool access' },
  { value: 'codex', label: 'Codex', icon: OpenAIIcon, description: 'OpenAI Codex CLI — coding agent with MCP tools' },
  { value: 'claude-code', label: 'Claude Code', icon: ClaudeIcon, description: 'Anthropic Claude Code CLI — coding agent with MCP tools' },
  { value: 'gemini', label: 'Gemini CLI', icon: GeminiIcon, description: 'Google Gemini CLI — coding agent' },
  { value: 'opencode', label: 'OpenCode', icon: Bot, description: 'OpenCode CLI — open-source coding agent' },
  { value: 'copilot', label: 'Copilot', icon: CopilotIcon, description: 'GitHub Copilot CLI — coding agent' },
]

const RECENT_MODELS_KEY = 'jait-recent-models'
const MAX_RECENTS = 5

function summariseReason(reason: string): string {
  const lower = reason.toLowerCase()
  if (lower.includes('not installed') || lower.includes('not found')) return 'not installed'
  if (lower.includes('not authenticated') || lower.includes('login')) return 'not authenticated'
  return 'unavailable'
}

function loadRecentModels(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_MODELS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((v: unknown) => typeof v === 'string').slice(0, MAX_RECENTS) : []
  } catch {
    return []
  }
}

function saveRecentModel(modelId: string): void {
  const recents = loadRecentModels().filter((id) => id !== modelId)
  recents.unshift(modelId)
  localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)))
}

export function ProviderModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled,
  className,
  compact = false,
  repoRuntime,
  onMoveToGateway,
  sessionInfo,
  workspaceNodeId,
}: ProviderModelSelectorProps) {
  const isMobile = useIsMobile()
  const { updateSettings } = useAuth()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderInfo>>({})
  const [remoteProviders, setRemoteProviders] = useState<RemoteProviderInfo[]>([])
  const [models, setModels] = useState<ModelDef[]>([])
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [currentBackend, setCurrentBackend] = useState<string | null>(null)
  const [authBusyProvider, setAuthBusyProvider] = useState<ProviderId | null>(null)
  const [loginDialog, setLoginDialog] = useState<{
    providerId: ProviderId
    label: string
    tone: 'loading' | 'success' | 'error'
    message: string
    userCode?: string
    verificationUri?: string
    copied?: boolean
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refreshProviders = (fresh = false) => {
    const request = fresh ? agentsApi.listProvidersFresh() : agentsApi.listProviders()
    request
      .then(({ providers, remoteProviders: remote }) => {
        const map: Record<string, ProviderInfo> = {}
        for (const item of providers) map[item.id] = item
        setProviderStatus(map)
        setRemoteProviders(remote)
      })
      .catch(() => {})
  }

  useEffect(() => {
    refreshProviders()
  }, [])

  const copyCode = async (providerId: ProviderId, code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setLoginDialog((prev) => prev && prev.providerId === providerId ? { ...prev, copied: true } : prev)
    } catch {
      setLoginDialog((prev) => prev && prev.providerId === providerId ? { ...prev, copied: false } : prev)
    }
  }

  const startLogin = async (providerId: ProviderId, label: string) => {
    if (authBusyProvider) return
    setOpen(false)
    setAuthBusyProvider(providerId)
    setLoginDialog({
      providerId,
      label,
      tone: 'loading',
      message: `Starting ${label} login...`,
    })
    try {
      const result = await agentsApi.startProviderLogin(providerId)
      let copied = false
      if (result.userCode) {
        try {
          await navigator.clipboard.writeText(result.userCode)
          copied = true
        } catch {
          copied = false
        }
      }
      setLoginDialog({
        providerId,
        label,
        tone: 'success',
        message: result.userCode
          ? `Device code ${copied ? 'copied to clipboard.' : 'is ready to copy.'}`
          : result.message,
        userCode: result.userCode,
        verificationUri: result.verificationUri,
        copied,
      })
      refreshProviders(true)
    } catch (error) {
      setLoginDialog({
        providerId,
        label,
        tone: 'error',
        message: error instanceof Error ? error.message : `Failed to start ${label} login.`,
      })
    } finally {
      setAuthBusyProvider(null)
    }
  }

  useEffect(() => {
    if (!open) return
    setSearch('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    setModels([])
    setRecentIds(loadRecentModels())

    let cancelled = false
    setLoadingModels(true)
    agentsApi.listProviderModels(provider)
      .then((result) => {
        if (cancelled) return
        setModels(result.models)
        if (result.recentModels?.length) {
          setRecentIds(result.recentModels)
        }
        if (result.currentBackend) {
          setCurrentBackend(result.currentBackend)
        }
      })
      .catch(() => {
        if (!cancelled) setModels([])
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false)
      })

    return () => {
      cancelled = true
    }
  }, [provider])

  useEffect(() => {
    if (provider === 'jait') return
    if (loadingModels || models.length === 0) return
    if (model && models.some((entry) => entry.id === model)) return

    const defaultModel = models.find((entry) => entry.isDefault) ?? models[0] ?? null
    const nextModel = defaultModel?.id ?? null
    if (nextModel !== model) onModelChange(nextModel)
  }, [provider, loadingModels, model, models, onModelChange])

  const scopedToRepo = repoRuntime != null
  const repoAvailable = repoRuntime?.availableProviders ?? []
  const repoOnline = repoRuntime?.online ?? true
  const repoLoading = repoRuntime?.loading ?? false
  const repoIsGateway = repoRuntime?.hostType === 'gateway'

  const wsNodeIsRemote = Boolean(workspaceNodeId && workspaceNodeId !== 'gateway')
  const wsRemoteNode = wsNodeIsRemote ? remoteProviders.find((n) => n.nodeId === workspaceNodeId) : undefined
  const scopedToWorkspaceNode = wsNodeIsRemote && !scopedToRepo

  const providerEntries = useMemo(() => {
    return PROVIDER_DEFS.map((item) => {
      const status = providerStatus[item.value]
      let isAvailable: boolean
      let reason: string | undefined
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
      } else if (scopedToWorkspaceNode) {
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
        const remoteNode = !isLocallyAvailable
          ? remoteProviders.find((remote) => remote.providers.includes(item.value))
          : undefined
        isAvailable = isLocallyAvailable || !!remoteNode
        reason = status?.unavailableReason
        nodeLabel = !status?.available && remoteNode ? remoteNode.nodeName : 'Gateway'
      }

      return { ...item, isAvailable, reason, nodeLabel, auth: status?.auth }
    })
  }, [providerStatus, remoteProviders, scopedToRepo, repoIsGateway, repoLoading, repoOnline, repoAvailable, repoRuntime?.locationLabel, scopedToWorkspaceNode, wsRemoteNode])

  const currentProvider = providerEntries.find((item) => item.value === provider) ?? providerEntries[0]!
  const CurrentIcon = currentProvider.icon
  const currentModel = model ? models.find((entry) => entry.id === model) : null
  const displayModelLabel = loadingModels
      ? 'Loading'
      : (currentModel?.name ?? model ?? 'Default')
  const locationLabel = scopedToRepo
    ? (repoIsGateway ? 'Gateway' : repoRuntime?.locationLabel)
    : scopedToWorkspaceNode
      ? (wsRemoteNode?.nodeName ?? workspaceNodeId)
      : sessionInfo?.isRemote && sessionInfo.remoteNode
        ? sessionInfo.remoteNode.nodeName
        : undefined

  const searchLower = search.trim().toLowerCase()
  const filteredModels = useMemo(() => {
    if (!searchLower) return models
    return models.filter((entry) =>
      entry.id.toLowerCase().includes(searchLower)
      || entry.name.toLowerCase().includes(searchLower)
      || entry.description?.toLowerCase().includes(searchLower),
    )
  }, [models, searchLower])

  const recentModels = useMemo(() => {
    if (searchLower) return []
    const modelMap = new Map(models.map((entry) => [entry.id, entry]))
    return recentIds
      .filter((id) => modelMap.has(id))
      .map((id) => modelMap.get(id)!)
      .slice(0, MAX_RECENTS)
  }, [models, recentIds, searchLower])

  const nonRecentFiltered = useMemo(() => {
    if (searchLower) return filteredModels
    const recentSet = new Set(recentModels.map((entry) => entry.id))
    return filteredModels.filter((entry) => !recentSet.has(entry.id))
  }, [filteredModels, recentModels, searchLower])

  const handleProviderSelect = (nextProvider: ProviderId) => {
    onProviderChange(nextProvider)
  }

  const GROUP_TO_BACKEND: Record<string, string> = { OpenAI: 'openai', OpenRouter: 'openrouter', Ollama: 'ollama' }

  const handleModelSelect = (modelId: string) => {
    // Auto-switch jaitBackend when picking a model from a different backend group
    const selectedModel = models.find((m) => m.id === modelId)
    if (provider === 'jait' && selectedModel?.group) {
      const targetBackend = GROUP_TO_BACKEND[selectedModel.group]
      if (targetBackend && targetBackend !== currentBackend) {
        updateSettings({ jait_backend: targetBackend as 'openai' | 'openrouter' | 'ollama' }).then(() => {
          setCurrentBackend(targetBackend)
        }).catch(() => {})
      }
    }
    onModelChange(modelId)
    saveRecentModel(modelId)
    setRecentIds(loadRecentModels())
    setOpen(false)
  }

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-1 rounded-md border border-transparent px-1.5 py-1 text-xs font-medium text-muted-foreground',
            'hover:text-foreground hover:bg-muted/60 transition-colors',
            'focus-visible:outline-none focus-visible:border-ring/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
          title={`Provider: ${currentProvider.label} · Model: ${displayModelLabel}`}
          aria-label={`Provider ${currentProvider.label}, model ${displayModelLabel}`}
        >
          <CurrentIcon className="h-4 w-4 shrink-0" />
          {!compact && (
            <>
              <span>{currentProvider.label}</span>
              <span className="max-w-[112px] truncate font-mono text-xs opacity-80">{displayModelLabel}</span>
            </>
          )}
          {!compact && locationLabel && (
            <span className="flex max-w-[72px] items-center gap-0.5 truncate text-2xs text-blue-500">
              <Monitor className="h-3 w-3" />
              {locationLabel}
            </span>
          )}
          {loadingModels ? <Loader2 className="h-3 w-3 animate-spin opacity-70" /> : null}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side={isMobile ? 'bottom' : 'top'}
        collisionPadding={8}
        className="flex w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden p-0"
        style={{
          maxHeight: isMobile
            ? 'min(32rem, calc(var(--radix-popover-content-available-height, 100dvh) - 0.75rem))'
            : 'min(32rem, var(--radix-popover-content-available-height, 80dvh))',
        }}
      >
        <div className="shrink-0 border-b px-3 py-2">
          <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Providers</div>
        </div>
        {scopedToRepo && !repoIsGateway && !repoOnline && !repoLoading && (
          <div className="shrink-0 border-b px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            Device is offline — only Jait (gateway) is available
          </div>
        )}
        {scopedToRepo && repoLoading && (
          <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Connecting to device…
          </div>
        )}
        {scopedToWorkspaceNode && !wsRemoteNode && (
          <div className="shrink-0 border-b px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            Device is offline — only Jait (gateway) is available
          </div>
        )}
        <div className="min-h-24 max-h-56 shrink-0 overflow-y-auto p-1">
          {providerEntries.map((entry) => {
            const Icon = entry.icon
            const active = entry.value === provider
            const showLoginAction = Boolean(entry.auth?.login) && entry.auth?.authenticated !== true && !scopedToWorkspaceNode && (!scopedToRepo || repoIsGateway)
            const loginBusy = authBusyProvider === entry.value
            return (
              <div key={entry.value} className={cn('rounded-sm', active && 'bg-accent/50')}>
                <div className="flex items-start gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleProviderSelect(entry.value)}
                    disabled={!entry.isAvailable}
                    className={cn(
                      'flex min-w-0 flex-1 items-start gap-2.5 rounded-sm px-2 py-2 text-left transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      !entry.isAvailable && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        {entry.label}
                        {entry.isAvailable && entry.nodeLabel && (
                          <span className="flex items-center gap-0.5 text-2xs text-muted-foreground">
                            <Monitor className="h-3 w-3" />
                            {entry.nodeLabel}
                          </span>
                        )}
                        {!entry.isAvailable && (
                          <span className="flex items-center gap-0.5 text-2xs text-destructive/80">
                            <AlertTriangle className="h-3 w-3" />
                            {entry.reason ? summariseReason(entry.reason) : 'unavailable'}
                          </span>
                        )}
                        {entry.auth && entry.auth.authenticated === true && (
                          <span className="text-2xs text-emerald-600 dark:text-emerald-400">signed in</span>
                        )}
                      </div>
                      <div className="text-xs leading-snug text-muted-foreground">
                        {!entry.isAvailable && entry.reason ? entry.reason : entry.description}
                      </div>
                    </div>
                    {active && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  </button>
                  {showLoginAction && (
                    <button
                      type="button"
                      title={`Login to ${entry.label}`}
                      aria-label={`Login to ${entry.label}`}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void startLogin(entry.value, entry.label)
                      }}
                      disabled={Boolean(authBusyProvider)}
                      className="mr-1 mt-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {loginBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {scopedToRepo && !repoIsGateway && !repoOnline && !repoLoading && onMoveToGateway && (
            <>
              <div className="mx-2 my-1 border-t" />
              <button
                type="button"
                onClick={onMoveToGateway}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Server className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Move to Gateway</div>
                  <div className="text-xs leading-snug text-muted-foreground">Run this repo on the gateway server instead</div>
                </div>
              </button>
            </>
          )}
        </div>

        <>
            <div className="shrink-0 border-y px-3 py-2">
              <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Models</div>
            </div>
            <div className="shrink-0 border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search models..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {recentModels.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Recent</span>
                  </div>
                  {recentModels.map((entry) => (
                    <ModelItem key={`recent-${entry.id}`} model={entry} selected={model === entry.id} onSelect={handleModelSelect} />
                  ))}
                  <div className="mx-2 my-1 border-t" />
                </>
              )}
              {!searchLower && recentModels.length > 0 && (
                <div className="px-2 py-1.5">
                  <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">All models</span>
                </div>
              )}
              {loadingModels && (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading models…
                </div>
              )}
              {!loadingModels && (() => {
                const hasGroups = nonRecentFiltered.some((m) => m.group)
                if (!hasGroups) {
                  return nonRecentFiltered.map((entry) => (
                    <ModelItem key={entry.id} model={entry} selected={model === entry.id} onSelect={handleModelSelect} />
                  ))
                }
                // Render models grouped by backend
                const groups: { label: string; items: ModelDef[] }[] = []
                const seen = new Set<string>()
                for (const m of nonRecentFiltered) {
                  const g = m.group || 'Other'
                  if (!seen.has(g)) {
                    seen.add(g)
                    groups.push({ label: g, items: [] })
                  }
                  groups.find((gr) => gr.label === g)!.items.push(m)
                }
                return groups.map((g) => (
                  <div key={g.label}>
                    <div className="sticky top-0 z-10 bg-popover px-2 py-1.5">
                      <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{g.label}</span>
                    </div>
                    {g.items.map((entry) => (
                      <ModelItem key={entry.id} model={entry} selected={model === entry.id} onSelect={handleModelSelect} />
                    ))}
                  </div>
                ))
              })()}
              {!loadingModels && filteredModels.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {search ? `No models matching "${search}"` : 'No models available'}
                </div>
              )}
            </div>
          </>
      </PopoverContent>
    </Popover>
    <Dialog open={Boolean(loginDialog)} onOpenChange={(next) => { if (!next) setLoginDialog(null) }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>{loginDialog?.label ?? 'Provider'} login</DialogTitle>
          <DialogDescription>
            {loginDialog?.tone === 'loading'
              ? loginDialog.message
              : 'Use the device code below on the provider login page.'}
          </DialogDescription>
        </DialogHeader>
        {loginDialog && (
          <div className="space-y-4">
            {loginDialog.tone !== 'loading' && (
              <div className={cn(
                'rounded-md border px-3 py-2 text-sm',
                loginDialog.tone === 'success'
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-destructive/25 bg-destructive/10 text-destructive',
              )}>
                {loginDialog.message}
              </div>
            )}
            {loginDialog.tone === 'loading' && (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting device login...
              </div>
            )}
            {loginDialog.userCode && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Device code</div>
                <div className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-md border bg-muted px-3 py-2 text-center font-mono text-lg font-semibold [overflow-wrap:anywhere]">
                    {loginDialog.userCode}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => void copyCode(loginDialog.providerId, loginDialog.userCode!)}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    {loginDialog.copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setLoginDialog(null)}>Close</Button>
          {loginDialog?.verificationUri && (
            <Button onClick={() => window.open(loginDialog.verificationUri, '_blank', 'noopener,noreferrer')}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open login page
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

function ModelItem({ model, selected, onSelect }: { model: ModelDef; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(model.id)}
      className={cn(
        'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        selected && 'bg-accent/50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {model.name}
          {model.isDefault && <span className="ml-1.5 text-2xs font-normal text-muted-foreground">(default)</span>}
        </div>
        {model.description && <div className="truncate text-xs leading-snug text-muted-foreground">{model.description}</div>}
      </div>
      {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  )
}
