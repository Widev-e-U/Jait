import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { ChevronDown, Check, AlertTriangle, Server, Loader2, Monitor, Clock, Search, LogIn, Copy, ExternalLink, X, Network, Brain } from 'lucide-react'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Claude from '@lobehub/icons/es/Claude'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { agentsApi, type ProviderId, type ProviderInfo, type RemoteProviderInfo } from '@/lib/agents-api'
import type { RepositoryRuntimeInfo } from '@/lib/automation-repositories'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAuth, type ReasoningEffort } from '@/hooks/useAuth'
import { formatModelDisplayLabel } from '@/components/icons/model-icons'

const JaitIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 1024 1024" className={className}>
    <path d="M318 372 L430 486 L318 600" fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M610 258 L610 642 C610 734 549 796 455 796 C393 796 338 766 299 715" fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const OpenAIIcon = ({ className }: { className?: string }) => <OpenAI size={16} className={className} />
const ClaudeIcon = ({ className }: { className?: string }) => <Claude size={16} className={className} />

interface ModelDef {
  id: string
  name: string
  description?: string
  isDefault?: boolean
  group?: string
  reasoningEffortSupported?: boolean
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
  projectNodeId?: string
}

const PROVIDER_DEFS: ProviderDef[] = [
  { value: 'jait', label: 'Jait', icon: JaitIcon, description: 'Native Jait agent loop with full tool access' },
  { value: 'codex', label: 'Codex', icon: OpenAIIcon, description: 'OpenAI Codex CLI — coding agent with MCP tools' },
  { value: 'claude-code', label: 'Claude Code', icon: ClaudeIcon, description: 'Anthropic Claude Code CLI — coding agent with MCP tools' },
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

const RECENT_MODELS_KEY = 'jait-recent-models'
const MAX_RECENTS = 10

function summariseReason(reason: string): string {
  const lower = reason.toLowerCase()
  if (lower.includes('not installed') || lower.includes('not found')) return 'not installed'
  if (lower.includes('not authenticated') || lower.includes('login')) return 'not authenticated'
  return 'unavailable'
}

function isLoginStateModelError(message: string): boolean {
  const lower = message.trim().toLowerCase()
  if (!lower) return false
  if (
    lower.includes('quota')
    || lower.includes('rate limit')
    || lower.includes('token limit')
    || lower.includes('usage limit')
    || lower.includes('limit reached')
  ) {
    return false
  }
  return lower === 'authentication required'
    || lower === 'not authenticated'
    || lower.includes('not logged in')
    || lower.includes('login required')
    || lower.includes('credentials are not configured')
    || lower.includes('missing credentials')
    || lower.includes('no credentials')
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

function blurActiveElement(): void {
  if (typeof document === 'undefined') return
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement) {
    activeElement.blur()
  }
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
  projectNodeId,
}: ProviderModelSelectorProps) {
  const isMobile = useIsMobile()
  const { updateSettings, settings } = useAuth()
  const reasoningEffort = settings?.reasoning_effort ?? null
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderInfo>>({})
  const [localProviders, setLocalProviders] = useState<ProviderInfo[]>([])
  const [remoteProviders, setRemoteProviders] = useState<RemoteProviderInfo[]>([])
  const [models, setModels] = useState<ModelDef[]>([])
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
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
    requiresCodeInput?: boolean
    inputPrompt?: string
  } | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refreshProviders = useCallback((fresh = false) => {
    const request = fresh ? agentsApi.listProvidersFresh() : agentsApi.listProviders()
    request
      .then(({ providers, remoteProviders: remote }) => {
        const map: Record<string, ProviderInfo> = {}
        for (const item of providers) map[item.id] = item
        setProviderStatus(map)
        setLocalProviders(providers)
        setRemoteProviders(remote)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshProviders()
  }, [refreshProviders])

  const copyCode = async (providerId: ProviderId, code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setLoginDialog((prev) => prev && prev.providerId === providerId ? { ...prev, copied: true } : prev)
    } catch {
      setLoginDialog((prev) => prev && prev.providerId === providerId ? { ...prev, copied: false } : prev)
    }
  }

  const sendCode = async (providerId: ProviderId) => {
    const code = codeInputRef.current?.value.trim()
    if (!code || authBusyProvider) return
    setAuthBusyProvider(providerId)
    try {
      await agentsApi.sendProviderLoginInput(providerId, code)
      if (codeInputRef.current) codeInputRef.current.value = ''
      setLoginDialog((prev) => prev && prev.providerId === providerId
        ? { ...prev, requiresCodeInput: false, message: 'Code sent. Completing login…' }
        : prev)
      refreshProviders(true)
    } catch (error) {
      setLoginDialog((prev) => prev && prev.providerId === providerId
        ? { ...prev, tone: 'error', message: error instanceof Error ? error.message : 'Failed to send code.' }
        : prev)
    } finally {
      setAuthBusyProvider(null)
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
      if (result.verificationUri) {
        window.open(result.verificationUri, '_blank', 'noopener,noreferrer')
      }
      setLoginDialog({
        providerId,
        label,
        tone: 'success',
        message: result.userCode
          ? `Device code ${copied ? 'copied to clipboard.' : 'is ready to copy.'}`
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
    if (!loginDialog || loginDialog.tone !== 'success') return

    let stopped = false
    let closeTimer: ReturnType<typeof window.setTimeout> | null = null
    const interval = window.setInterval(() => {
      void checkAuthStatus()
    }, 2000)

    async function checkAuthStatus() {
      if (stopped || !loginDialog) return
      try {
        const authStatus = await agentsApi.getProviderAuthStatus(loginDialog.providerId)
        if (stopped || authStatus.authenticated !== true) return

        stopped = true
        window.clearInterval(interval)
        refreshProviders(true)
        setLoginDialog((prev) => prev && prev.providerId === loginDialog.providerId
          ? { ...prev, message: `${loginDialog.label} is logged in.` }
          : prev)
        closeTimer = window.setTimeout(() => {
          setLoginDialog((prev) => prev && prev.providerId === loginDialog.providerId ? null : prev)
        }, 900)
      } catch {
        // Keep the login dialog open; the next poll may succeed once the CLI writes credentials.
      }
    }

    void checkAuthStatus()

    return () => {
      stopped = true
      window.clearInterval(interval)
      if (closeTimer) window.clearTimeout(closeTimer)
    }
  }, [loginDialog?.providerId, loginDialog?.tone, loginDialog?.label, refreshProviders])

  useEffect(() => {
    if (!open) return
    setSearch('')
    if (!isMobile) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open, isMobile])

  useEffect(() => {
    setModels([])
    setModelError(null)
    setRecentIds(loadRecentModels())

    let cancelled = false
    setLoadingModels(true)
    agentsApi.listProviderModels(provider)
      .then((result) => {
        if (cancelled) return
        setModelError(null)
        setModels(result.models)
        if (result.recentModels?.length) {
          setRecentIds(result.recentModels)
        }
        if (result.currentBackend) {
          setCurrentBackend(result.currentBackend)
        }
      })
      .catch((error) => {
        if (cancelled) return
        setModels([])
        setModelError(error instanceof Error ? error.message : 'Failed to load models')
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

  const wsNodeIsRemote = Boolean(projectNodeId && projectNodeId !== 'gateway')
  const wsRemoteNode = wsNodeIsRemote ? remoteProviders.find((n) => n.nodeId === projectNodeId) : undefined
  const scopedToProjectNode = wsNodeIsRemote && !scopedToRepo

  const providerEntries = useMemo(() => {
    const source = localProviders.length > 0 ? localProviders.map(providerDefFromInfo) : PROVIDER_DEFS
    return source.map((item) => {
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
        const remoteNode = !isLocallyAvailable
          ? remoteProviders.find((remote) => remote.providers.includes(item.value))
          : undefined
        isAvailable = isLocallyAvailable || !!remoteNode
        reason = status?.unavailableReason
        nodeLabel = !status?.available && remoteNode ? remoteNode.nodeName : 'Gateway'
      }

      return { ...item, isAvailable, reason, nodeLabel, auth: status?.auth }
    })
  }, [localProviders, providerStatus, remoteProviders, scopedToRepo, repoIsGateway, repoLoading, repoOnline, repoAvailable, repoRuntime?.locationLabel, scopedToProjectNode, wsRemoteNode])

  const currentProvider = providerEntries.find((item) => item.value === provider) ?? providerEntries[0]!
  const CurrentIcon = currentProvider.icon
  const currentModel = model ? models.find((entry) => entry.id === model) : null
  const displayModelLabel = loadingModels
      ? 'Loading'
      : (currentModel?.name || model ? formatModelDisplayLabel(currentModel?.name ?? model!) : 'Default')
  const locationLabel = scopedToRepo
    ? (repoIsGateway ? 'Gateway' : repoRuntime?.locationLabel)
    : scopedToProjectNode
      ? (wsRemoteNode?.nodeName ?? projectNodeId)
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

  const modelErrorMessage = useMemo(() => {
    if (!modelError) return null
    const providerLabel = currentProvider.label
    if (currentProvider.auth?.authenticated === false && isLoginStateModelError(modelError)) {
      return `You're not logged in to ${providerLabel}.`
    }
    return modelError
  }, [currentProvider.auth?.authenticated, currentProvider.label, modelError])

  const handleProviderSelect = (nextProvider: ProviderId) => {
    onProviderChange(nextProvider)
  }

  const REASONING_EFFORTS: { value: ReasoningEffort; label: string; hint: string }[] = [
    { value: 'minimal', label: 'Minimal', hint: 'Fastest, least thinking' },
    { value: 'low', label: 'Low', hint: 'Brief reasoning' },
    { value: 'medium', label: 'Medium', hint: 'Balanced' },
    { value: 'high', label: 'High', hint: 'Deepest reasoning' },
  ]

  const handleReasoningEffortChange = (next: ReasoningEffort | null) => {
    updateSettings({ reasoning_effort: next }).catch(() => {})
  }

  // The reasoning-effort selector is relevant only when the active model is
  // known to accept the OpenAI `reasoning_effort` parameter.
  const activeModelDef = model ? models.find((entry) => entry.id === model) : null
  const modelSupportsReasoning = Boolean(activeModelDef?.reasoningEffortSupported)

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
    // Persist the picked model so background channels (e.g. WhatsApp) reply
    // with the same model instead of falling back to the server default.
    if (provider === 'jait') {
      // Clear a leftover reasoning-effort preference when moving to a model
      // that doesn't accept it, so it isn't silently forwarded to the API.
      if (reasoningEffort && !selectedModel?.reasoningEffortSupported) {
        updateSettings({ selected_model: modelId, reasoning_effort: null }).catch(() => {})
      } else {
        updateSettings({ selected_model: modelId }).catch(() => {})
      }
    }
    onModelChange(modelId)
    saveRecentModel(modelId)
    setRecentIds(loadRecentModels())
    setOpen(false)
  }

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen && isMobile) {
      blurActiveElement()
    }
    setOpen(nextOpen)
  }, [isMobile])

  const triggerButton = (
    <button
      type="button"
      disabled={disabled}
      onClick={isMobile ? () => handleOpenChange(true) : undefined}
      className={cn(
        'flex h-10 items-center gap-1 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-muted-foreground sm:h-8 sm:px-1.5 sm:text-xs',
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
  )

  const selectorContent = (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(9.5rem,0.8fr)_minmax(13rem,1.45fr)] overflow-hidden">
      <section className="flex min-h-0 min-w-0 flex-col border-r" aria-labelledby="provider-selector-heading">
      <div className={cn('shrink-0 border-b px-3 py-2', isMobile && 'flex min-h-10 items-center pr-12')}>
        <div id="provider-selector-heading" className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Providers</div>
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
      {scopedToProjectNode && !wsRemoteNode && (
        <div className="shrink-0 border-b px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          Device is offline — only Jait (gateway) is available
        </div>
      )}
      <div role="listbox" aria-labelledby="provider-selector-heading" className="min-h-0 flex-1 overflow-y-auto p-1">
        {providerEntries.map((entry) => {
          const Icon = entry.icon
          const active = entry.value === provider
          const showLoginAction = Boolean(entry.auth?.login) && entry.auth?.authenticated !== true && !scopedToProjectNode && (!scopedToRepo || repoIsGateway)
          const loginBusy = authBusyProvider === entry.value
          return (
            <div key={entry.value} className={cn('rounded-sm', active && 'bg-accent/50')}>
              <div className="flex items-start gap-1.5">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-describedby={`provider-description-${entry.value}`}
                  onClick={() => handleProviderSelect(entry.value)}
                  disabled={!entry.isAvailable}
                  className={cn(
                    'flex min-w-0 flex-1 items-start gap-2.5 rounded-sm px-2 py-2 text-left transition-colors',
                    'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
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
                    <div id={`provider-description-${entry.value}`} className="text-xs leading-snug text-muted-foreground">
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
                <div className={cn('text-xs leading-snug text-muted-foreground', isMobile && 'hidden')}>Run this repo on the gateway server instead</div>
              </div>
            </button>
          </>
        )}
      </div>

      </section>

      <section className="flex min-h-0 min-w-0 flex-col" aria-labelledby="model-selector-heading">
      <div className="shrink-0 border-b px-3 py-2">
        <div id="model-selector-heading" className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Models</div>
      </div>
      <div className="shrink-0 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <label htmlFor="provider-model-search" className="sr-only">Search models</label>
          <input
            id="provider-model-search"
            ref={inputRef}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search models..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div role="listbox" aria-labelledby="model-selector-heading" className="min-h-0 flex-1 overflow-y-auto p-1">
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
        {!loadingModels && modelErrorMessage && (
          <div className="flex items-start gap-2 px-3 py-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{modelErrorMessage}</span>
          </div>
        )}
        {!loadingModels && !modelErrorMessage && (() => {
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
        {!loadingModels && !modelErrorMessage && filteredModels.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            {search ? `No models matching "${search}"` : 'No models available'}
          </div>
        )}
      </div>

      {modelSupportsReasoning && !loadingModels && (
        <div className="shrink-0 border-t px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
              Reasoning effort
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => handleReasoningEffortChange(null)}
              className={cn(
                'flex items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                reasoningEffort === null && 'bg-accent/50',
              )}
            >
              <span className="text-muted-foreground">Default</span>
              {reasoningEffort === null && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
            {REASONING_EFFORTS.map((effort) => {
              const active = reasoningEffort === effort.value
              return (
                <button
                  key={effort.value}
                  type="button"
                  title={effort.hint}
                  onClick={() => handleReasoningEffortChange(effort.value)}
                  className={cn(
                    'flex items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    active && 'bg-accent/50',
                  )}
                >
                  <span>{effort.label}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-2xs leading-snug text-muted-foreground">
            Controls how much the model reasons before answering. Only applies to this reasoning model.
          </p>
        </div>
      )}
      </section>
    </div>
  )

  return (
    <>
      {isMobile ? (
        <>
          {triggerButton}
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
              showCloseButton={false}
              overlayClassName="bg-black/40"
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              className="!bottom-2 !top-auto !flex !max-w-none !translate-x-0 !translate-y-0 !flex-col !gap-0 !overflow-hidden !rounded-lg !p-0 shadow-lg"
              style={{
                left: '0.5rem',
                right: '0.5rem',
                bottom: 'max(0.5rem, env(safe-area-inset-bottom))',
                top: 'auto',
                width: 'auto',
                maxHeight: 'min(36rem, calc(100dvh - 1rem))',
                transform: 'translateZ(0)',
              }}
            >
              <DialogClose className="absolute right-2 top-1 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-80 transition-colors hover:bg-muted hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogClose>
              <DialogTitle className="sr-only">Provider and model</DialogTitle>
              <DialogDescription className="sr-only">Choose a provider and model</DialogDescription>
              {selectorContent}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild disabled={disabled}>
            {triggerButton}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            collisionPadding={8}
            className="flex w-[min(42rem,calc(100vw-1rem))] flex-col overflow-hidden p-0"
            style={{ maxHeight: 'min(32rem, var(--radix-popover-content-available-height, 80dvh))' }}
          >
            {selectorContent}
          </PopoverContent>
        </Popover>
      )}
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
              {loginDialog.requiresCodeInput && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Authorization code</div>
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      ref={codeInputRef}
                      type="text"
                      placeholder="Paste authorization code…"
                      className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      onKeyDown={(e) => { if (e.key === 'Enter') void sendCode(loginDialog.providerId) }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      disabled={Boolean(authBusyProvider)}
                      onClick={() => void sendCode(loginDialog.providerId)}
                    >
                      {authBusyProvider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Submit'}
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
      role="option"
      aria-selected={selected}
      aria-label={`${formatModelDisplayLabel(model.name)}${model.isDefault ? ', default model' : ''}`}
      onClick={() => onSelect(model.id)}
      className={cn(
        'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors',
        'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selected && 'bg-accent/50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {formatModelDisplayLabel(model.name)}
          {model.isDefault && <span className="ml-1.5 text-2xs font-normal text-muted-foreground">(default)</span>}
        </div>
        {model.description && <div className="truncate text-xs leading-snug text-muted-foreground">{model.description}</div>}
      </div>
      {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  )
}
