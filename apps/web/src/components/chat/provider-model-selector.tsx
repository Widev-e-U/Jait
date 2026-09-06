import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import { ChevronDown, CircleCheck, Check, AlertTriangle, Server, Loader2, Monitor, Clock, Search, LogIn, Copy, ExternalLink, X, Network, Brain } from 'lucide-react'
import { toast } from 'sonner'
import { ProviderActionsMenu } from './provider-actions-menu'
import { useVirtualizer } from '@tanstack/react-virtual'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Claude from '@lobehub/icons/es/Claude'
import Cursor from '@lobehub/icons/es/Cursor'
import Gemini from '@lobehub/icons/es/Gemini'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { agentsApi, type ProviderId } from '@/lib/agents-api'
import { copyTextToClipboard } from '@/lib/clipboard'
import type { RepositoryRuntimeInfo } from '@/lib/automation-repositories'
import { decodeJaitModelId } from '@jait/shared'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAuth, type JaitBackend, type ReasoningEffort } from '@/hooks/useAuth'
import type { SessionReasoningEffort } from '@/lib/session-chat-selection'
import { useProviders } from '@/hooks/useProviders'
import { formatModelDisplayLabel } from '@/components/icons/model-icons'
import { resolveActiveModel, resolveReasoningEffortOptions } from '@/lib/reasoning-effort-options'
import { GATEWAY_NODE_ID, resolveScopedProviderSelection, scopeProviders } from '@/lib/provider-scope'
import {
  readProjectReasoningEffortSelection,
  saveProjectReasoningEffortSelection,
} from '@/lib/project-model-cache'
import { TooltipHint } from '@/components/ui/tooltip'

const JaitIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 1024 1024" className={className}>
    <path d="M318 372 L430 486 L318 600" fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M610 258 L610 642 C610 734 549 796 455 796 C393 796 338 766 299 715" fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const OpenAIIcon = ({ className }: { className?: string }) => <OpenAI size={16} className={className} />
const ClaudeIcon = ({ className }: { className?: string }) => <Claude size={16} className={className} />
const CursorIcon = ({ className }: { className?: string }) => <Cursor size={16} className={className} />
const GeminiIcon = ({ className }: { className?: string }) => <Gemini size={16} className={className} />

// Pi (pi.dev) — official pixel-art "pi" wordmark, sourced from pi.dev/logo.svg
const PiIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 800 800" fill="none" className={className}>
    <rect width="800" height="800" rx="150" fill="#09090b" />
    <path
      fill="#fff"
      fillRule="evenodd"
      d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
    />
    <path fill="#fff" d="M517.36 400H634.72V634.72H517.36Z" />
  </svg>
)

// DeepAgents (multi-agent framework) has no dedicated brand icon — use a
// stack-of-agents glyph so it is distinct from the generic network fallback.
const DeepAgentsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" className={className}>
    <rect x="4" y="3" width="16" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8 6h8M8 9h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M5 17h6a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M14 19h5a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
)

interface ModelDef {
  id: string
  name: string
  description?: string
  isDefault?: boolean
  group?: string
  reasoningEffortSupported?: boolean
  supportedReasoningEfforts?: Array<{
    reasoningEffort: string
    description?: string
  }>
}

function isNativeReasoningEffort(value: string): value is ReasoningEffort {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high'
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
  projectId?: string | null
  reasoningEffort?: SessionReasoningEffort | null
  onReasoningEffortChange?: (reasoningEffort: SessionReasoningEffort | null) => void
}

const PROVIDER_DEFS: ProviderDef[] = [
  { value: 'jait', label: 'Jait', icon: JaitIcon, description: 'Native Jait agent loop with full tool access' },
  { value: 'codex', label: 'Codex', icon: OpenAIIcon, description: 'OpenAI Codex CLI — coding agent with MCP tools' },
  { value: 'claude-code', label: 'Claude Code', icon: ClaudeIcon, description: 'Anthropic Claude Code CLI — coding agent with MCP tools' },
  { value: 'cursor', label: 'Cursor', icon: CursorIcon, description: 'Cursor agent via Agent Client Protocol' },
  { value: 'pi', label: 'Pi', icon: PiIcon, description: 'Pi coding agent via Agent Client Protocol' },
  { value: 'pi-gemini', label: 'Pi Gemini', icon: GeminiIcon, description: 'Gemini-backed Pi ACP provider' },
  { value: 'deepagents', label: 'DeepAgents', icon: DeepAgentsIcon, description: 'DeepAgents multi-agent framework via Agent Client Protocol' },
]

export const PROVIDER_DEF_BY_ID = new Map(PROVIDER_DEFS.map((item) => [item.value, item]))

export function providerIconFor(providerType: string | undefined, id: string): ComponentType<{ className?: string }> {
  return PROVIDER_DEF_BY_ID.get(providerType ?? id)?.icon ?? Network
}

export function providerLabelFor(providerType: string | undefined, id: string): string {
  return PROVIDER_DEF_BY_ID.get(providerType ?? id)?.label ?? id
}

const RECENT_MODELS_KEY = 'jait-recent-models'
const MAX_RECENTS = 10

export const PROVIDER_SELECTOR_POPOVER_STYLE: CSSProperties = {
  height: 'min(32rem, var(--radix-popover-content-available-height, 80dvh))',
  maxHeight: 'min(32rem, var(--radix-popover-content-available-height, 80dvh))',
}

// Backend groups surfaced by the Jait provider. The group label is the display
// name of the backend instance (e.g. "Büro · Ollama"); the backend key is the
// canonical JaitBackend used to filter and to auto-switch jait_backend.
const GROUP_TO_BACKEND: Record<string, JaitBackend> = {
  OpenAI: 'openai',
  OpenRouter: 'openrouter',
  Ollama: 'ollama',
  OmniRoute: 'omniroute',
}

// The group label is the backend instance the model belongs to — for named
// instances it is "<instance name> · <backend>" (e.g. "Büro · Ollama"), for
// legacy single-backend setups just the backend name ("Ollama"). Filtering by
// this label (instead of the bare backend key) keeps every instance visible as
// its own chip, so "Ollama Büro" no longer collapses into a generic "Ollama".
function modelGroupLabel(model: ModelDef): string {
  return model.group || 'Other'
}

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
  projectId,
  reasoningEffort: controlledReasoningEffort,
  onReasoningEffortChange,
}: ProviderModelSelectorProps) {
  const isMobile = useIsMobile()
  const { updateSettings, settings } = useAuth()
  const reasoningEffort = controlledReasoningEffort !== undefined
    ? controlledReasoningEffort
    : settings?.reasoning_effort ?? null
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const {
    providers: allProviders,
    remoteProviders,
    loaded: providersLoaded,
    error: providersError,
    refresh: refreshProviders,
  } = useProviders()
  const [modelReloadVersion, setModelReloadVersion] = useState(0)
  const [providerActionBusy, setProviderActionBusy] = useState<ProviderId | null>(null)
  const providerActionRef = useRef(false)
  const [models, setModels] = useState<ModelDef[]>([])
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [currentBackend, setCurrentBackend] = useState<string | null>(null)
  const [backendFilter, setBackendFilter] = useState<string | null>(null)
  const [authBusyProvider, setAuthBusyProvider] = useState<ProviderId | null>(null)
  const [loginDialog, setLoginDialog] = useState<{
    providerId: ProviderId
    label: string
    tone: 'loading' | 'success' | 'error'
    message: string
    userCode?: string
    verificationUri?: string
    copied?: boolean
    waitingForCompletion?: boolean
    requiresCodeInput?: boolean
    inputPrompt?: string
  } | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Re-probe when the selector is opened so auth changes made outside the app
  // (a Claude Code / Codex CLI login, a device coming online) show up the
  // moment the user looks at the list. The store throttles forced probes.
  useEffect(() => {
    if (!open) return
    refreshProviders({ fresh: true })
  }, [open, refreshProviders])

  const copyCode = async (providerId: ProviderId, code: string) => {
    const copied = await copyTextToClipboard(code)
    setLoginDialog((prev) => prev && prev.providerId === providerId ? { ...prev, copied } : prev)
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
      refreshProviders({ fresh: true, force: true })
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
      const copied = result.userCode
        ? await copyTextToClipboard(result.userCode)
        : false
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
        waitingForCompletion: true,
        requiresCodeInput: result.requiresCodeInput,
        inputPrompt: result.inputPrompt,
      })
      refreshProviders({ fresh: true, force: true })
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
        refreshProviders({ fresh: true, force: true })
        setLoginDialog((prev) => prev && prev.providerId === loginDialog.providerId
          ? { ...prev, waitingForCompletion: false, message: `${loginDialog.label} is logged in.` }
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
    setBackendFilter(null)
    if (!isMobile) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open, isMobile])

  // ── Provider scope ─────────────────────────────────────────────────
  // A project pinned to a device scopes the picker to that device; on the
  // gateway every provider is listed, each labelled with the device it runs on.
  const scopeNodeId = (projectNodeId?.trim() || repoRuntime?.nodeId || GATEWAY_NODE_ID)
  const connectedNodeIds = useMemo(() => remoteProviders.map((node) => node.nodeId), [remoteProviders])

  const { entries: scopedEntries, scopeNodeOffline, scopeNodeLabel } = useMemo(() => scopeProviders({
    providers: allProviders,
    scopeNodeId,
    connectedNodeIds,
    availableProviderIds: repoRuntime?.availableProviders,
    scopeNodeLabel: repoRuntime?.locationLabel,
    loading: !providersLoaded || Boolean(repoRuntime?.loading),
  }), [allProviders, connectedNodeIds, providersLoaded, repoRuntime?.availableProviders, repoRuntime?.loading, repoRuntime?.locationLabel, scopeNodeId])

  const providerEntries = useMemo(() => scopedEntries.map((entry) => ({
    value: entry.id,
    label: entry.name || entry.id,
    icon: providerIconFor(entry.providerType, entry.id),
    description: entry.description,
    isAvailable: entry.isAvailable,
    reason: entry.reason,
    nodeId: entry.nodeId,
    nodeLabel: entry.nodeName,
    auth: entry.auth,
  })), [scopedEntries])

  const runProviderAction = async (entry: typeof providerEntries[number], action: 'refresh' | 'logout') => {
    if (providerActionRef.current || authBusyProvider) return
    providerActionRef.current = true
    setProviderActionBusy(entry.value)
    try {
      if (action === 'refresh') {
        await agentsApi.refreshProviderModels(entry.value, entry.nodeId)
        setModelReloadVersion((version) => version + 1)
        toast.success(`${entry.label} models refreshed.`)
      } else {
        const result = await agentsApi.logoutProvider(entry.value)
        agentsApi.resetProviderModels()
        await refreshProviders({ fresh: true, force: true })
        setModelReloadVersion((version) => version + 1)
        toast.success(result.message || `${entry.label} logged out.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action === 'refresh' ? 'refresh models' : 'log out'} for ${entry.label}.`)
    } finally {
      providerActionRef.current = false
      setProviderActionBusy(null)
    }
  }

  // Models come from the device that hosts the selected provider — never from
  // the project's device, which may be a different machine entirely.
  const activeEntry = providerEntries.find((entry) => entry.value === provider)
  const activeProviderNodeId = activeEntry?.nodeId
  // Re-fetch once the active provider becomes authenticated (e.g. right after a
  // CLI login): the earlier fetch failed with an auth error and nothing else
  // would re-trigger it, leaving the panel stuck on "not logged in".
  const activeProviderAuthenticated = activeEntry?.auth?.authenticated === true
  const providerScopeResolved = providersLoaded || Boolean(providersError)

  useEffect(() => {
    if (!providerScopeResolved) return
    setModels([])
    setModelError(null)
    setBackendFilter(null)
    setRecentIds(loadRecentModels())

    let cancelled = false
    setLoadingModels(true)
    agentsApi.listProviderModels(provider, activeProviderNodeId)
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
  }, [provider, activeProviderNodeId, activeProviderAuthenticated, providerScopeResolved, modelReloadVersion])

  useEffect(() => {
    if (provider === 'jait') return
    if (loadingModels || models.length === 0) return
    if (model && models.some((entry) => entry.id === model)) return

    const defaultModel = models.find((entry) => entry.isDefault) ?? models[0] ?? null
    const nextModel = defaultModel?.id ?? null
    if (nextModel !== model) onModelChange(nextModel)
  }, [provider, loadingModels, model, models, onModelChange])

  // Drop a selection the current scope cannot run — e.g. the project moved to a
  // device that does not host the selected provider. Only done once the
  // provider list is known, so a slow first load never resets the choice.
  //
  // `providersLoaded` latches true after the shared store's *first* response
  // and never resets (provider-store.ts) — including the very first page-load
  // probe, which can be a stale gateway-side snapshot (e.g. an account that
  // hadn't finished authenticating yet). Acting on that immediately would
  // silently switch the user's provider on every reload/project-switch that
  // happens to land on a stale snapshot. So the first time an entry looks
  // unavailable, request a fresh re-probe and wait for it to confirm before
  // actually switching anything.
  const unavailableSinceRef = useRef<string | null>(null)
  useEffect(() => {
    if (!providersLoaded) return
    if (repoRuntime?.loading) return
    const entry = providerEntries.find((item) => item.value === provider)
    // Merely signed out is not a reason to switch: on the gateway the entry
    // stays selected so the user can log in from right here. A provider this
    // scope cannot reach at all (wrong device, offline device) is replaced.
    if (entry && (entry.isAvailable || scopeNodeId === GATEWAY_NODE_ID)) {
      unavailableSinceRef.current = null
      return
    }
    const key = `${provider}:${scopeNodeId}`
    if (unavailableSinceRef.current !== key) {
      unavailableSinceRef.current = key
      void refreshProviders({ fresh: true })
      return
    }
    const nextProvider = resolveScopedProviderSelection(provider, providerEntries)
    if (nextProvider !== provider) {
      onProviderChange(nextProvider)
    }
  }, [onProviderChange, provider, providerEntries, providersLoaded, refreshProviders, repoRuntime?.loading, scopeNodeId])

  const currentProvider = providerEntries.find((item) => item.value === provider) ?? providerEntries[0]!
  const CurrentIcon = currentProvider.icon
  const currentModel = model ? models.find((entry) => entry.id === model) : null
  const currentGroupLabel = currentModel ? modelGroupLabel(currentModel) : null
  const displayModelLabel = loadingModels
      ? 'Loading'
      : (currentModel?.name || model ? formatModelDisplayLabel(currentModel?.name ?? model!) : 'Default')
  const locationLabel = currentProvider.nodeLabel
    ?? scopeNodeLabel
    ?? (sessionInfo?.isRemote ? sessionInfo.remoteNode?.nodeName : undefined)
  const showMoveToGateway = Boolean(onMoveToGateway) && scopeNodeOffline

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
      .filter((entry) => !backendFilter || modelGroupLabel(entry) === backendFilter)
      .slice(0, MAX_RECENTS)
  }, [models, recentIds, searchLower, backendFilter])

  const nonRecentFiltered = useMemo(() => {
    if (searchLower) return filteredModels
    const recentSet = new Set(recentModels.map((entry) => entry.id))
    return filteredModels.filter((entry) => !recentSet.has(entry.id))
  }, [filteredModels, recentModels, searchLower])

  // Backend filter chips. One chip per backend instance (group label), so named
  // instances like "Büro · Ollama" stay individually visible and filterable
  // instead of collapsing into a generic "Ollama". Shown whenever there is at
  // least one backend so the current backend is always discoverable.
  const backendOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of nonRecentFiltered) {
      const key = modelGroupLabel(entry)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, label: key, count }))
  }, [nonRecentFiltered])

  const backendFilteredModels = useMemo(() => {
    if (!backendFilter) return nonRecentFiltered
    return nonRecentFiltered.filter((entry) => modelGroupLabel(entry) === backendFilter)
  }, [nonRecentFiltered, backendFilter])

  // Flatten the (possibly grouped) model list into virtualizable rows. Header
  // rows carry the backend group label so you always know which backend you're
  // scrolled into; model rows are the selectable entries.
  const modelRows = useMemo(() => {
    const rows: ({ type: 'header'; label: string } | { type: 'model'; model: ModelDef })[] = []
    const hasGroups = backendFilteredModels.some((m) => m.group)
    if (!hasGroups) {
      for (const entry of backendFilteredModels) rows.push({ type: 'model', model: entry })
      return rows
    }
    const groups: { label: string; items: ModelDef[] }[] = []
    const seen = new Set<string>()
    for (const m of backendFilteredModels) {
      const g = m.group || 'Other'
      if (!seen.has(g)) {
        seen.add(g)
        groups.push({ label: g, items: [] })
      }
      groups.find((gr) => gr.label === g)!.items.push(m)
    }
    for (const g of groups) {
      rows.push({ type: 'header', label: g.label })
      for (const entry of g.items) rows.push({ type: 'model', model: entry })
    }
    return rows
  }, [backendFilteredModels])

  const modelListRef = useRef<HTMLDivElement | null>(null)
  const modelVirtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => modelListRef.current,
    estimateSize: (index) => (modelRows[index]?.type === 'header' ? 30 : 44),
    overscan: 12,
    enabled: open,
  })

  // Re-measure once the popover is laid out so the virtualizer knows the real
  // scrollport height (it is 0 while closed), and scroll the currently selected
  // model into view so you always know where you are when the list opens.
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      modelVirtualizer.measure()
      if (model) {
        const index = modelRows.findIndex((row) => row.type === 'model' && row.model.id === model)
        if (index >= 0) modelVirtualizer.scrollToIndex(index, { align: 'center' })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [open, modelVirtualizer, model, modelRows])

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

  useEffect(() => {
    if (controlledReasoningEffort !== undefined || provider !== 'jait') return
    const savedReasoningEffort = readProjectReasoningEffortSelection(projectId, provider)
    if (savedReasoningEffort === undefined || savedReasoningEffort === reasoningEffort) return
    const nativeEffort = savedReasoningEffort === null || isNativeReasoningEffort(savedReasoningEffort)
      ? savedReasoningEffort
      : null
    updateSettings({ reasoning_effort: nativeEffort }).catch(() => {})
  }, [controlledReasoningEffort, projectId, provider, reasoningEffort, updateSettings])

  const activeModelDef = resolveActiveModel(models, model)
  const reasoningEfforts = resolveReasoningEffortOptions(activeModelDef)
  const modelSupportsReasoning = reasoningEfforts !== null

  const handleReasoningEffortChange = (next: SessionReasoningEffort | null) => {
    saveProjectReasoningEffortSelection(projectId, provider, next)
    onReasoningEffortChange?.(next)
    if (provider === 'jait') {
      const nativeEffort = next === null || isNativeReasoningEffort(next) ? next : null
      updateSettings({ reasoning_effort: nativeEffort }).catch(() => {})
    }
  }

  const handleModelSelect = (modelId: string) => {
    // Auto-switch jaitBackend when picking a model from a different backend group
    const selectedModel = models.find((m) => m.id === modelId)
    if (provider === 'jait' && selectedModel) {
      const targetBackend = decodeJaitModelId(modelId)?.backend
        ?? (selectedModel.group ? GROUP_TO_BACKEND[selectedModel.group] : undefined)
      if (targetBackend && targetBackend !== currentBackend) {
        updateSettings({ jait_backend: targetBackend }).then(() => {
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
        saveProjectReasoningEffortSelection(projectId, provider, null)
        onReasoningEffortChange?.(null)
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
    <TooltipHint content={`Provider: ${currentProvider.label} · Model: ${displayModelLabel}`}>
    <button
      type="button"
      disabled={disabled}
      onClick={isMobile ? () => handleOpenChange(true) : undefined}
      className={cn(
        'inline-flex h-10 max-w-full items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-muted-foreground sm:h-8 sm:px-1.5 sm:text-xs',
        'hover:text-foreground hover:bg-muted/60 transition-colors',
        'focus-visible:outline-none focus-visible:border-ring/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      aria-label={`Provider ${currentProvider.label}, model ${displayModelLabel}`}
    >
      <CurrentIcon className="h-4 w-4 shrink-0" />
      {!compact && (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="max-w-32 truncate text-foreground/90">{currentProvider.label}</span>
          <span className="h-3 w-px shrink-0 bg-border" aria-hidden="true" />
          <span className="max-w-36 truncate font-mono text-[11px] font-normal opacity-75">{displayModelLabel}</span>
        </span>
      )}
      {!compact && locationLabel && (
        <span className="inline-flex max-w-28 shrink-0 items-center gap-1 rounded-sm bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-blue-500">
          <Monitor className="h-3 w-3 shrink-0" />
          <span className="truncate">{locationLabel}</span>
        </span>
      )}
      {loadingModels && <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-70" />}
      <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
    </button>
    </TooltipHint>
  )

  const selectorContent = (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(9.5rem,0.8fr)_minmax(13rem,1.45fr)] overflow-hidden">
      <section className="flex min-h-0 min-w-0 flex-col border-r" aria-labelledby="provider-selector-heading">
      <div className={cn('flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2', isMobile && 'min-h-10')}>
        <div id="provider-selector-heading" className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Providers</div>
        {locationLabel && (
          <TooltipHint content={locationLabel}>
          <span className="flex min-w-0 items-center gap-1 text-2xs text-blue-500">
            <Monitor className="h-3 w-3 shrink-0" />
            <span className="truncate">{locationLabel}</span>
          </span>
          </TooltipHint>
        )}
      </div>
      {repoRuntime?.loading && (
        <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Connecting to device…
        </div>
      )}
      {!repoRuntime?.loading && scopeNodeOffline && (
        <div className="shrink-0 border-b px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          {scopeNodeLabel ?? 'This device'} is offline — only Jait (gateway) is available
        </div>
      )}
      <div role="listbox" aria-labelledby="provider-selector-heading" className="min-h-0 flex-1 overflow-y-auto p-1">
        {providerEntries.map((entry) => {
          const Icon = entry.icon
          const active = entry.value === provider
          // Login works for gateway and device-hosted accounts alike — the
          // gateway proxies the login to whichever device owns the account.
          const showLoginAction = Boolean(entry.auth?.login)
            && entry.auth?.authenticated !== true
            && !(scopeNodeOffline && entry.nodeId !== GATEWAY_NODE_ID)
          const loginBusy = authBusyProvider === entry.value
          return (
            <ProviderActionsMenu
              key={entry.value}
              label={entry.label}
              className={cn('rounded-sm', active && 'bg-accent/50')}
              busy={Boolean(providerActionBusy || authBusyProvider)}
              canRefresh={entry.isAvailable}
              canLogout={Boolean(entry.auth?.logout) && entry.auth?.authenticated !== false
                && !(scopeNodeOffline && entry.nodeId !== GATEWAY_NODE_ID)}
              onRefresh={() => { void runProviderAction(entry, 'refresh') }}
              onLogout={() => { void runProviderAction(entry, 'logout') }}
            >
              <div className="flex items-start gap-1.5">
                <TooltipHint content={!entry.isAvailable && entry.reason ? entry.reason : entry.description}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { if (entry.isAvailable) handleProviderSelect(entry.value) }}
                  aria-disabled={!entry.isAvailable}
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
                      {!entry.isAvailable && (
                        <span className="flex items-center gap-0.5 text-2xs text-destructive/80">
                          <AlertTriangle className="h-3 w-3" />
                          {entry.reason ? summariseReason(entry.reason) : 'unavailable'}
                        </span>
                      )}
                      {entry.isAvailable && (
                        <TooltipHint content="Ready to use">
                        <span role="img" aria-label="Ready to use" className="text-emerald-600 dark:text-emerald-400">
                          <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        </TooltipHint>
                      )}
                      {providerActionBusy === entry.value && <Loader2 aria-label="Updating provider" className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                  {active && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                </button>
                </TooltipHint>
                {showLoginAction && (
                  <TooltipHint content={`Login to ${entry.label}`}>
                  <button
                    type="button"
                    aria-label={`Login to ${entry.label}`}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void startLogin(entry.value, entry.label)
                    }}
                    disabled={Boolean(authBusyProvider || providerActionBusy)}
                    className="mr-1 mt-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {loginBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                  </button>
                  </TooltipHint>
                )}
              </div>
            </ProviderActionsMenu>
          )
        })}
        {showMoveToGateway && onMoveToGateway && (
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
      <div className={cn('shrink-0 border-b px-3 py-2', isMobile && 'flex min-h-10 items-center pr-12')}>
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
      {currentGroupLabel && (
        <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="truncate text-2xs font-medium text-foreground">
            Current: {currentGroupLabel}
          </span>
        </div>
      )}
      {backendOptions.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2">
          <button
            type="button"
            onClick={() => setBackendFilter(null)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors',
              !backendFilter ? 'border-primary/40 bg-accent/50 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            All
            <span className="opacity-60">{nonRecentFiltered.length}</span>
          </button>
          {backendOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setBackendFilter(backendFilter === opt.key ? null : opt.key)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors',
                backendFilter === opt.key ? 'border-primary/40 bg-accent/50 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {opt.label}
              <span className="opacity-60">{opt.count}</span>
            </button>
          ))}
        </div>
      )}
      <div ref={modelListRef} role="listbox" aria-labelledby="model-selector-heading" className="min-h-0 flex-1 overflow-y-auto p-1">
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
        {!loadingModels && !modelErrorMessage && modelRows.length > 0 && (
          <div className="relative" style={{ height: modelVirtualizer.getTotalSize() }}>
            {modelVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = modelRows[virtualRow.index]
              if (row.type === 'header') {
                const isCurrentGroup = currentGroupLabel !== null && row.label === currentGroupLabel
                return (
                  <div
                    key={`header-${virtualRow.key}`}
                    data-index={virtualRow.index}
                    ref={modelVirtualizer.measureElement}
                    className={cn('flex items-center gap-1.5 px-2 py-1.5', isCurrentGroup && 'bg-accent/40')}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {isCurrentGroup && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
                    <span className={cn('text-2xs font-medium uppercase tracking-wider', isCurrentGroup ? 'text-foreground' : 'text-muted-foreground')}>
                      {row.label}
                    </span>
                  </div>
                )
              }
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={modelVirtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                >
                  <ModelItem model={row.model} selected={model === row.model.id} onSelect={handleModelSelect} />
                </div>
              )
            })}
          </div>
        )}
        {!loadingModels && !modelErrorMessage && modelRows.length === 0 && (
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
            {reasoningEfforts!.map((effort) => {
              const active = reasoningEffort === effort.value
              return (
                <TooltipHint key={effort.value} content={effort.hint}>
                <button
                  type="button"
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
                </TooltipHint>
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
                maxWidth: 'calc(100vw - 1rem)',
                maxHeight: 'min(36rem, calc(100dvh - 1rem))',
                height: 'min(36rem, calc(100dvh - 1rem))',
                boxSizing: 'border-box',
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
            style={PROVIDER_SELECTOR_POPOVER_STYLE}
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
              {loginDialog.waitingForCompletion && (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for login completion…
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
