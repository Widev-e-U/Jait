import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { Check, AlertTriangle, Server, Loader2, Monitor, Search, LogIn, Copy, ExternalLink, X, Network, Brain, Star, ChevronDown, Download } from 'lucide-react'
import { toast } from 'sonner'
import { ProviderActionsMenu } from './provider-actions-menu'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ClaudeCodeIcon,
  CodexIcon,
  CursorIcon,
  DeepAgentsIcon,
  GeminiIcon,
  GithubCopilotIcon,
  JaitIcon,
  PiIcon,
  providerBrandIcon,
  providerIconUrl,
} from '@/components/icons/provider-icons'
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
import { Kbd } from '@/components/ui/kbd'
import {
  loadModelFavorites,
  saveModelFavorites,
  toggleModelFavorite,
  type ModelFavorite,
} from './model-favorites'
import { ModelPickerRail, type ModelPickerRailSection } from './model-picker-rail'

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

export function resolveProviderModelReconciliation(input: {
  provider: string
  activeScopeKey: string
  loadedScopeKey: string | null
  loading: boolean
  currentModel: string | null
  models: Array<{ id: string; isDefault?: boolean }>
}): string | null | undefined {
  if (input.provider === 'jait') return undefined
  if (input.loadedScopeKey !== input.activeScopeKey || input.loading || input.models.length === 0) return undefined
  if (input.currentModel && input.models.some((entry) => entry.id === input.currentModel)) return undefined
  return (input.models.find((entry) => entry.isDefault) ?? input.models[0])?.id ?? null
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
  /** Which side the trigger tooltip opens on. Defaults to "top". */
  tooltipSide?: 'top' | 'bottom'
}

const PROVIDER_DEFS: ProviderDef[] = [
  { value: 'jait', label: 'Jait', icon: JaitIcon, description: 'Native Jait agent loop. The System Two Model handles reasoning + tools; the System One Model handles bounded decisions' },
  { value: 'codex', label: 'Codex', icon: CodexIcon, description: 'OpenAI Codex CLI — coding agent with MCP tools' },
  { value: 'claude-code', label: 'Claude Code', icon: ClaudeCodeIcon, description: 'Anthropic Claude Code CLI — coding agent with MCP tools' },
  { value: 'cursor', label: 'Cursor', icon: CursorIcon, description: 'Cursor agent via Agent Client Protocol' },
  { value: 'github-copilot-cli', label: 'GitHub Copilot CLI', icon: GithubCopilotIcon, description: 'GitHub Copilot CLI agent via Agent Client Protocol' },
  { value: 'pi', label: 'Pi', icon: PiIcon, description: 'Pi coding agent via Agent Client Protocol' },
  { value: 'pi-gemini', label: 'Pi Gemini', icon: GeminiIcon, description: 'Gemini-backed Pi ACP provider' },
  { value: 'deepagents', label: 'DeepAgents', icon: DeepAgentsIcon, description: 'DeepAgents multi-agent framework via Agent Client Protocol' },
]

export const PROVIDER_DEF_BY_ID = new Map(PROVIDER_DEFS.map((item) => [item.value, item]))

/**
 * Curated/brand icon for a provider, or null when the provider has no known
 * logo. Prefers the curated provider definition, then the shared brand library
 * so dynamic ACP agents (e.g. `github-copilot-cli`) still resolve.
 */
export function providerBrandIconOrNull(providerType: string | undefined, id: string): ComponentType<{ className?: string }> | null {
  const key = providerType ?? id
  return PROVIDER_DEF_BY_ID.get(key)?.icon ?? providerBrandIcon(key) ?? providerBrandIcon(id) ?? null
}

export function providerIconFor(providerType: string | undefined, id: string): ComponentType<{ className?: string }> {
  return providerBrandIconOrNull(providerType, id) ?? Network
}

/**
 * Remote logo (e.g. an ACP registry SVG) to use when a provider has no brand
 * icon. Registry SVGs paint with `currentColor`, which an `<img>` cannot
 * resolve — they render as solid black and vanish in dark mode. So a remote
 * logo is only used as a last resort, and is drawn as a CSS mask (see
 * `RemoteProviderLogo`) so it follows the surrounding text colour.
 */
export function providerRemoteIconUrl(providerType: string | undefined, id: string, icon: unknown): string | undefined {
  if (providerBrandIconOrNull(providerType, id)) return undefined
  return providerIconUrl(icon)
}

/**
 * Draws a remote provider logo as a themed mask: the SVG is used as a
 * `mask-image` over a `currentColor` background, so monochrome registry logos
 * stay legible in both light and dark mode instead of always rendering black.
 */
export function RemoteProviderLogo({ url, className }: { url: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-provider-logo="remote"
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  )
}

export function providerLabelFor(providerType: string | undefined, id: string): string {
  return PROVIDER_DEF_BY_ID.get(providerType ?? id)?.label ?? id
}

// Row shapes for the flat, virtualized model list: an optional favorites
// header + rows, then a labeled section per provider instance. Keeping the
// list flat lets @tanstack/react-virtual render thousands of models cheaply
// and gives keyboard quick-jump a single index space (1-9) across sections.
type ModelListRow =
  | { type: 'header'; key: string; label: string; sectionIndex: number }
  | {
      type: 'model'
      key: string
      model: ModelDef
      instance: { label: string; icon: ComponentType<{ className?: string }>; iconUrl?: string }
      providerId: ProviderId
      sectionIndex: number
      quickJumpIndex: number | null
    }

const QUICK_JUMP_LIMIT = 9

// Digits 1-9 map onto the first QUICK_JUMP_LIMIT model rows (after favorites),
// matching the on-row Kbd hints rendered by ModelRow.
function modelQuickJumpIndex(rows: ModelListRow[]): Map<string, number> {
  const out = new Map<string, number>()
  let index = 1
  for (const row of rows) {
    if (row.type !== 'model') continue
    if (index > QUICK_JUMP_LIMIT) break
    out.set(row.key, index)
    index += 1
  }
  return out
}

// Array.prototype.findLastIndex is ES2023 and the tsconfig lib is ES2020,
// so section navigation uses this small backscan helper instead.
function lastIndexWhere<T>(rows: readonly T[], predicate: (row: T) => boolean): number {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (predicate(rows[index]!)) return index
  }
  return -1
}

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
  tooltipSide = 'top',
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
  const [providerActionBusy, setProviderActionBusy] = useState<{ provider: ProviderId; action: 'refresh' | 'logout' | 'update' } | null>(null)
  const providerActionRef = useRef(false)
  const [models, setModels] = useState<ModelDef[]>([])
  const [loadedModelScopeKey, setLoadedModelScopeKey] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<ModelFavorite[]>([])
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
    iconUrl: providerRemoteIconUrl(entry.providerType, entry.id, entry.icon),
    description: entry.description,
    isAvailable: entry.isAvailable,
    reason: entry.reason,
    nodeId: entry.nodeId,
    nodeLabel: entry.nodeName,
    auth: entry.auth,
    update: entry.update,
  })), [scopedEntries])

  const runProviderAction = async (entry: typeof providerEntries[number], action: 'refresh' | 'logout' | 'update') => {
    if (providerActionRef.current || authBusyProvider) return
    providerActionRef.current = true
    setProviderActionBusy({ provider: entry.value, action })
    try {
      if (action === 'refresh') {
        await agentsApi.refreshProviderModels(entry.value, entry.nodeId)
        setModelReloadVersion((version) => version + 1)
        toast.success(`${entry.label} models refreshed.`)
      } else if (action === 'update') {
        const result = await agentsApi.updateProvider(entry.value)
        await refreshProviders({ fresh: true, force: true })
        setModelReloadVersion((version) => version + 1)
        toast.success(result.message || `${entry.label} updated.`)
      } else {
        const result = await agentsApi.logoutProvider(entry.value)
        agentsApi.resetProviderModels()
        await refreshProviders({ fresh: true, force: true })
        setModelReloadVersion((version) => version + 1)
        toast.success(result.message || `${entry.label} logged out.`)
      }
    } catch (error) {
      const verb = action === 'refresh' ? 'refresh models' : action === 'update' ? 'update' : 'log out'
      toast.error(error instanceof Error ? error.message : `Failed to ${verb} for ${entry.label}.`)
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
  const activeModelScopeKey = `${provider}:${activeProviderNodeId ?? ''}`

  useEffect(() => {
    if (!providerScopeResolved) return
    setModels([])
    setLoadedModelScopeKey(null)
    setModelError(null)

    let cancelled = false
    setLoadingModels(true)
    agentsApi.listProviderModels(provider, activeProviderNodeId)
      .then((result) => {
        if (cancelled) return
        setModelError(null)
        setModels(result.models)
        setLoadedModelScopeKey(activeModelScopeKey)
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
  }, [activeModelScopeKey, provider, activeProviderNodeId, activeProviderAuthenticated, providerScopeResolved, modelReloadVersion])

  useEffect(() => {
    const nextModel = resolveProviderModelReconciliation({
      provider,
      activeScopeKey: activeModelScopeKey,
      loadedScopeKey: loadedModelScopeKey,
      loading: loadingModels,
      currentModel: model,
      models,
    })
    if (nextModel !== undefined && nextModel !== model) onModelChange(nextModel)
  }, [activeModelScopeKey, loadedModelScopeKey, provider, loadingModels, model, models, onModelChange])

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

  // Favorites are scoped to the active provider and surface as their own
  // always-on-top section (T3-style), so the models you actually use never
  // depend on scrolling position or search state.
  const favoriteModels = useMemo(() => {
    if (searchLower) return []
    const modelMap = new Map(models.map((entry) => [entry.id, entry]))
    const seen = new Set<string>()
    const out: ModelDef[] = []
    for (const favorite of favorites) {
      if (favorite.provider !== provider) continue
      const entry = modelMap.get(favorite.modelId)
      if (!entry || seen.has(entry.id)) continue
      seen.add(entry.id)
      out.push(entry)
    }
    return out
  }, [favorites, provider, models, searchLower])

  // Sections: for jait, one section per backend group (so the whole model
  // catalog is reachable without the old backend filter chips); for CLI/API
  // providers, a single section labelled with the active provider instance.
  const instanceSections = useMemo(() => {
    if (provider !== 'jait') {
      return filteredModels.length > 0
        ? [{ key: 'default', label: currentProvider.label, models: filteredModels, instance: currentProvider }]
        : []
    }
    const byKey = new Map<string, { key: string; label: string; models: ModelDef[]; instance: typeof currentProvider }>()
    for (const entry of filteredModels) {
      const label = modelGroupLabel(entry)
      const key = label.toLowerCase()
      let section = byKey.get(key)
      if (!section) {
        section = { key, label, models: [], instance: currentProvider }
        byKey.set(key, section)
      }
      section.models.push(entry)
    }
    return Array.from(byKey.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, section]) => section)
  }, [filteredModels, provider, currentProvider])

  // Flat row list for the virtualizer: optional favorites block, then one
  // labelled section per provider instance. Digits 1-9 map onto the first nine
  // model rows (after favorites) as on-row Kbd hints.
  const modelRows = useMemo<ModelListRow[]>(() => {
    const rows: ModelListRow[] = []
    if (favoriteModels.length > 0) {
      rows.push({ type: 'header', key: 'favorites', label: 'Favorites', sectionIndex: 0 })
      for (const entry of favoriteModels) {
        rows.push({ type: 'model', key: `fav:${provider}:${entry.id}`, model: entry, instance: currentProvider, providerId: provider, sectionIndex: 0, quickJumpIndex: null })
      }
    }
    let sectionIndex = favoriteModels.length > 0 ? 1 : 0
    for (const section of instanceSections) {
      rows.push({ type: 'header', key: `section:${section.key}`, label: section.label, sectionIndex })
      for (const entry of section.models) {
        rows.push({ type: 'model', key: `${provider}:${section.key}:${entry.id}`, model: entry, instance: section.instance, providerId: provider, sectionIndex, quickJumpIndex: null })
      }
      sectionIndex += 1
    }
    const quickJump = modelQuickJumpIndex(rows)
    for (const row of rows) {
      if (row.type === 'model') row.quickJumpIndex = quickJump.get(row.key) ?? null
    }
    return rows
  }, [favoriteModels, instanceSections, provider, currentProvider])

  // Rail sections (desktop only): one entry per top-level section so you can
  // click straight to a provider group without scrolling a long catalog.
  // `startIndex` is the absolute row index of the section header in the
  // flattened `modelRows` list, so the rail can scroll the virtualizer there.
  const railSections = useMemo<ModelPickerRailSection[]>(() => {
    const sections: ModelPickerRailSection[] = []
    const startIndexFor = (key: string) => {
      const index = modelRows.findIndex((row) => row.type === 'header' && row.key === key)
      return index >= 0 ? index : 0
    }
    if (favoriteModels.length > 0) {
      sections.push({ key: 'favorites', startIndex: startIndexFor('favorites'), label: 'Favorites', kind: 'favorites' })
    }
    for (const section of instanceSections) {
      sections.push({ key: section.key, startIndex: startIndexFor(`section:${section.key}`), label: section.label, kind: 'instance' })
    }
    return sections
  }, [favoriteModels, instanceSections, modelRows])

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
        const index = modelRows.findIndex((row) => row.type === 'model' && row.model.id === model && row.sectionIndex > 0)
        if (index >= 0) modelVirtualizer.scrollToIndex(index, { align: 'center' })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [open, modelVirtualizer, model, modelRows])

  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  // When the model catalog or search changes, re-anchor the highlight on the
  // currently selected model (or the first row) so keyboard nav stays sane.
  useEffect(() => {
    if (!open || modelRows.length === 0) return
    const currentIndex = modelRows.findIndex((row) => row.type === 'model' && row.model.id === model)
    setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0)
  }, [open, model, modelRows])

  // Reset the search box whenever the selector opens.
  useEffect(() => {
    if (!open) return
    setSearch('')
  }, [open])

  const moveHighlight = (start: number, delta: number) => {
    const rowCount = modelRows.length
    if (rowCount === 0) return
    const direction = delta >= 0 ? 1 : -1
    let index = start
    for (let steps = 0; steps < rowCount; steps += 1) {
      index += direction
      if (index < 0 || index >= rowCount) break
      if (modelRows[index]!.type === 'model') {
        setHighlightedIndex(index)
        modelVirtualizer.scrollToIndex(index, { align: 'auto' })
        return
      }
    }
    if (index < 0) {
      setHighlightedIndex(0)
      modelVirtualizer.scrollToIndex(0, { align: 'auto' })
    }
  }

  // Keyboard: arrows move the highlight across model rows, Home/End jump to the
  // list ends, Enter/Space select the highlighted row, Escape closes. Digits
  // 1-9 quick-jump to the first row of the numbered section and 'f' toggles the
  // favorite on the highlighted row — both ignored while typing in the search
  // box (digits fall through to the filter there).
  const handleModelListKeyDown = (event: KeyboardEvent) => {
    const rowCount = modelRows.length
    if (rowCount === 0) return

    const activeElement = document.activeElement
    const typingInSearch = activeElement instanceof HTMLInputElement && activeElement === inputRef.current

    const digitMatch = /^([1-9])$/.exec(event.key)
    if (digitMatch) {
      if (typingInSearch && searchLower) return
      event.preventDefault()
      const digit = Number(digitMatch[1])
      const target = modelRows.find((row) => row.type === 'model' && row.sectionIndex === digit)
      if (!target) return
      const index = modelRows.indexOf(target)
      setHighlightedIndex(index)
      modelVirtualizer.scrollToIndex(index, { align: 'start' })
      return
    }

    if (event.key === 'f' && !typingInSearch) {
      const current = modelRows[highlightedIndex]
      if (current?.type !== 'model') return
      event.preventDefault()
      setFavorites((currentFavorites) => {
        const next = toggleModelFavorite(currentFavorites, current.providerId, current.model.id)
        saveModelFavorites(next)
        return next
      })
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(highlightedIndex, event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const currentSection = modelRows[highlightedIndex]?.sectionIndex
      if (currentSection === undefined) return
      const targetIndex = event.key === 'ArrowRight'
        ? modelRows.findIndex((row) => row.sectionIndex === currentSection + 1)
        : lastIndexWhere(modelRows, (row) => row.sectionIndex === currentSection - 1)
      if (targetIndex < 0) return
      setHighlightedIndex(targetIndex)
      modelVirtualizer.scrollToIndex(targetIndex, { align: 'start' })
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      moveHighlight(event.key === 'Home' ? -1 : rowCount, event.key === 'Home' ? -1 : 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const current = modelRows[highlightedIndex]
      const target = current?.type === 'model'
        ? current
        : modelRows.find((row) => row.type === 'model')
      if (target?.type === 'model') handleModelSelect(target.model.id)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  // Rail jump: scroll the virtualizer to the section header row and anchor the
  // keyboard highlight there, so Enter starts at the first model of the group.
  const handleRailJump = (startIndex: number) => {
    if (modelRows.length === 0) return
    const target = Math.min(Math.max(startIndex, 0), modelRows.length - 1)
    setHighlightedIndex(target)
    modelVirtualizer.scrollToIndex(target, { align: 'start' })
  }

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
    setOpen(false)
  }

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen && isMobile) {
      blurActiveElement()
    }
    setOpen(nextOpen)
  }, [isMobile])

  // Favorites are a purely local affordance ([providerId, modelId] pairs in
  // localStorage) and never affect the persisted model/backend settings.
  useEffect(() => {
    setFavorites(loadModelFavorites())
  }, [])

  const toggleFavoriteModel = useCallback((entry: ModelDef) => {
    setFavorites((current) => {
      const next = toggleModelFavorite(current, provider, entry.id)
      saveModelFavorites(next)
      return next
    })
  }, [provider])

  const triggerButton = (
    <TooltipHint side={tooltipSide} content={`Provider: ${currentProvider.label} · Model: ${displayModelLabel}`}>
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
      {currentProvider.iconUrl
        ? <RemoteProviderLogo url={currentProvider.iconUrl} className="h-4 w-4" />
        : <CurrentIcon className="h-4 w-4 shrink-0" />}
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

  const triggerWithProviderActions = (trigger: ReactNode) => activeEntry ? (
    <ProviderActionsMenu
      label={activeEntry.label}
      busy={Boolean(providerActionBusy || authBusyProvider)}
      canRefresh={activeEntry.isAvailable}
      canLogout={Boolean(activeEntry.auth?.logout) && activeEntry.auth?.authenticated !== false
        && !(scopeNodeOffline && activeEntry.nodeId !== GATEWAY_NODE_ID)}
      onRefresh={() => { void runProviderAction(activeEntry, 'refresh') }}
      onLogout={() => { void runProviderAction(activeEntry, 'logout') }}
    >
      {trigger}
    </ProviderActionsMenu>
  ) : trigger

  const selectorContent = (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(9.5rem,0.8fr)_minmax(13rem,1.45fr)] overflow-hidden">
      <section className="flex min-h-0 min-w-0 flex-col border-r" aria-labelledby="provider-selector-heading">
      <div className={cn('flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2', isMobile && 'min-h-10')}>
        <div id="provider-selector-heading" className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Providers</div>
        {locationLabel && (
          <TooltipHint side="left" content={locationLabel}>
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
          const updating = providerActionBusy?.provider === entry.value && providerActionBusy.action === 'update'
          const showUpdateAction = Boolean(entry.update?.updateAvailable)
            && !(scopeNodeOffline && entry.nodeId !== GATEWAY_NODE_ID)
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
              <div className="flex min-w-0 items-start gap-1.5">
                <TooltipHint side="left" content={!entry.isAvailable && entry.reason ? entry.reason : entry.description}>
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
                  {entry.iconUrl
                    ? <RemoteProviderLogo url={entry.iconUrl} className="mt-0.5 h-4 w-4" />
                    : <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      <span className="min-w-0 truncate">{entry.label}</span>
                      {!entry.isAvailable && (
                        <span className="flex min-w-0 items-center gap-0.5 truncate text-2xs text-destructive/80">
                          <AlertTriangle className="h-3 w-3" />
                          {entry.reason ? summariseReason(entry.reason) : 'unavailable'}
                        </span>
                      )}
                      {providerActionBusy?.provider === entry.value && !updating && <Loader2 aria-label="Provider action in progress" className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                  {active && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                </button>
                </TooltipHint>
                {showUpdateAction && (
                  <TooltipHint side="left" content={`Update ${entry.label} from ${entry.update?.currentVersion} to ${entry.update?.latestVersion}`}>
                  <button
                    type="button"
                    aria-label={updating ? `Updating ${entry.label}` : `Update ${entry.label} to ${entry.update?.latestVersion}`}
                    aria-busy={updating}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void runProviderAction(entry, 'update')
                    }}
                    disabled={Boolean(authBusyProvider || providerActionBusy)}
                    className="mr-1 mt-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                  >
                    {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </button>
                  </TooltipHint>
                )}
                {showLoginAction && (
                  <TooltipHint side="left" content={`Login to ${entry.label}`}>
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
      {currentGroupLabel && (
        <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="truncate text-2xs font-medium text-foreground">Current: {currentGroupLabel}</span>
        </div>
      )}
      <div
          className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2 focus-within:border-ring"
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="model-selector-listbox"
            aria-autocomplete="list"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                handleModelListKeyDown(event.nativeEvent)
              }
              // Digits 1-9 fall through to the input; quick-jump handling is
              // guarded on document.activeElement in handleModelListKeyDown.
            }}
            placeholder="Search models..."
            className="h-7 w-full border-0 bg-transparent p-0 text-xs text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
      </div>
      <div
        ref={modelListRef}
        id="model-selector-listbox"
        role="listbox"
        aria-labelledby="model-selector-heading"
        className="min-h-0 flex-1 overflow-y-auto p-1"
        onKeyDown={(event) => {
          if (event.defaultPrevented) return
          if (/^[1-9]$/.test(event.key) || ['f', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) {
            handleModelListKeyDown(event.nativeEvent)
          }
        }}
      >
        {!loadingModels && modelErrorMessage && (
          <div className="flex items-start gap-2 px-3 py-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{modelErrorMessage}</span>
          </div>
        )}
        {loadingModels && (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading models…
          </div>
        )}
        {!loadingModels && !modelErrorMessage && modelRows.length > 0 && (
          <div className="relative min-h-0 flex-1" style={{ height: modelVirtualizer.getTotalSize() }}>
            {modelVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = modelRows[virtualRow.index]
              if (row.type === 'header') {
                return (
                  <div
                    key={`header-${virtualRow.key}`}
                    data-index={virtualRow.index}
                    ref={modelVirtualizer.measureElement}
                    className="px-3 py-1.5 text-3xs font-semibold uppercase tracking-wide text-muted-foreground/70"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {row.label}
                  </div>
                )
              }
              const favorite = favorites.some((entry) => entry.provider === row.providerId && entry.modelId === row.model.id)
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={modelVirtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                >
                  <ModelRow
                    model={row.model}
                    instanceLabel={row.instance.label}
                    instanceIcon={row.instance.icon}
                    instanceIconUrl={row.instance.iconUrl}
                    selected={model === row.model.id && provider === row.providerId}
                    onSelect={handleModelSelect}
                    onToggleFavorite={toggleFavoriteModel}
                    isFavorite={favorite}
                    stopPropagation
                    quickJumpIndex={row.quickJumpIndex}
                    highlighted={highlightedIndex === virtualRow.index}
                  />
                </div>
              )
            })}
          </div>
        )}
        {!loadingModels && !modelErrorMessage && modelRows.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            {search ? `No models found` : 'No models available'}
          </div>
        )}
      </div>
      <ModelPickerRail sections={railSections} activeRowIndex={highlightedIndex} onJump={handleRailJump} />

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
                <TooltipHint key={effort.value} side="left" content={effort.hint}>
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
          {triggerWithProviderActions(triggerButton)}
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
          {triggerWithProviderActions(
            <PopoverTrigger asChild disabled={disabled}>
              {triggerButton}
            </PopoverTrigger>,
          )}
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

interface ModelRowProps {
  model: ModelDef
  instanceLabel: string
  instanceIcon: ComponentType<{ className?: string }>
  instanceIconUrl?: string
  selected: boolean
  onSelect: (id: string) => void
  onToggleFavorite: ((model: ModelDef) => void) | null
  isFavorite: boolean
  stopPropagation: boolean
  quickJumpIndex: number | null
  highlighted: boolean
}

function ModelRow({
  model,
  instanceLabel,
  instanceIcon: InstanceIcon,
  instanceIconUrl,
  selected,
  onSelect,
  onToggleFavorite,
  isFavorite,
  stopPropagation,
  quickJumpIndex,
  highlighted,
}: ModelRowProps) {
  return (
    <div
      role="option"
      aria-selected={selected}
      data-highlighted={highlighted || undefined}
      data-row-key={quickJumpIndex === null ? undefined : quickJumpIndex}
      tabIndex={-1}
      onClick={() => onSelect(model.id)}
      onKeyDown={onToggleFavorite ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          onSelect(model.id)
        } else if (event.key === 'f') {
          event.preventDefault()
          onToggleFavorite(model)
        }
      } : undefined}
      className={cn(
        'group flex w-full cursor-pointer items-start gap-2 px-3 py-1.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground',
        selected && !highlighted && 'bg-accent/50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <span className="truncate">{formatModelDisplayLabel(model.name)}</span>
          {model.isDefault && <span className="shrink-0 text-2xs font-normal text-muted-foreground">(default)</span>}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.6875rem] leading-snug text-muted-foreground/70">
          {instanceIconUrl ? <RemoteProviderLogo url={instanceIconUrl} className="h-3 w-3" /> : <InstanceIcon className="h-3 w-3" />}
          <span className="truncate">{instanceLabel}</span>
          {model.description && <span className="hidden truncate opacity-80 sm:inline">· {model.description}</span>}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-0.5">
        {selected && <Check className="h-3.5 w-3.5 text-primary" />}
        <Kbd keys={quickJumpIndex !== null ? [String(quickJumpIndex)] : []} emptyLabel="" />
        {onToggleFavorite && (
          <button
            type="button"
            data-favorite-toggle="true"
            aria-label={isFavorite ? `Remove ${formatModelDisplayLabel(model.name)} from favorites` : `Add ${formatModelDisplayLabel(model.name)} to favorites`}
            aria-pressed={isFavorite}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={stopPropagation ? (event) => {
              event.stopPropagation()
              event.preventDefault()
              onToggleFavorite(model)
            } : () => onToggleFavorite(model)}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors',
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              isFavorite
                ? 'opacity-100 text-amber-500 hover:text-amber-400'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
          </button>
        )}
      </span>
    </div>
  )
}
