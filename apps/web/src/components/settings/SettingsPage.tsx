import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Key, CheckCircle2, AlertCircle, Loader2, Download, ArrowUpCircle, Home, Search, ArchiveRestore, Folder, ChevronRight, ExternalLink, LogIn, LogOut, Plus, RefreshCw, Trash2, Copy, Watch, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToolSettings } from './ToolSettings'
import { ExtensionSettings } from './ExtensionSettings'
import { SkillSettings } from './SkillSettings'
import { ChannelSettings } from './ChannelSettings'
import { EmailSettings } from './EmailSettings'
import { CalendarSettings } from './CalendarSettings'
import { UsageSettings } from './UsageSettings'
import { NodesPermissionsTab } from './NodesPermissionsTab'
import { KeyboardShortcutSettings } from './KeyboardShortcutSettings'
import { PatchNotesTooltip } from './PatchNotesTooltip'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ActivityFeed } from '@/components/activity'
import type { ProjectRecord } from '@/hooks/useProjects'
import { useProviders } from '@/hooks/useProviders'
import type { ActivityEvent } from '@jait/ui-shared'
import type { ChatStreamingAction, SttProvider } from '@/hooks/useAuth'
import type { JaitBackend } from '@/hooks/useAuth'
import { getApiUrl } from '@/lib/gateway-url'
import { cn } from '@/lib/utils'
import { highlightSearchMatchHtml } from './settings-search-highlight'
import { shouldShowProviderLoginAction } from './provider-account-actions'
import { getVsCodeThemeSearchTerms } from '@/lib/vscode-theme'
import { importVsCodeThemeFromText, removeVsCodeTheme, setActiveVsCodeTheme, useVsCodeThemeStore } from '@/lib/vscode-theme-store'
import { agentsApi, type ProviderAccount, type ProviderAccountType, type ProviderId, type ProviderInfo } from '@/lib/agents-api'
import { copyTextToClipboard } from '@/lib/clipboard'
import {
  JAIT_BACKEND_DEFAULT_URLS,
  parseJaitBackendInstances,
  serializeJaitBackendInstances,
  type JaitBackendInstanceConfig,
} from '@jait/shared'

import OpenAI from '@lobehub/icons/es/OpenAI'
import Perplexity from '@lobehub/icons/es/Perplexity'
import OpenRouter from '@lobehub/icons/es/OpenRouter'
import Gemini from '@lobehub/icons/es/Gemini'
import Moonshot from '@lobehub/icons/es/Moonshot'
import Kimi from '@lobehub/icons/es/Kimi'
import Grok from '@lobehub/icons/es/Grok'
import Ollama from '@lobehub/icons/es/Ollama'
import Anthropic from '@lobehub/icons/es/Anthropic'
import Vllm from '@lobehub/icons/es/Vllm'

interface ApiFieldGroup {
  label: string
  fields: readonly string[]
}

// Chat providers (Perplexity, xAI/Grok, Google Gemini, Moonshot/Kimi, …) are
// configured as Jait backend instances above — no standalone API-key group here.
const API_FIELD_GROUPS: ApiFieldGroup[] = [
  { label: 'OpenAI services', fields: ['OPENAI_API_KEY', 'OPENAI_TRANSCRIBE_MODEL', 'OPENAI_WEB_SEARCH_MODEL'] },
  { label: 'Brave Search', fields: ['BRAVE_API_KEY'] },
  { label: 'Speech / Home Assistant', fields: ['WHISPER_URL', 'HA_URL', 'HA_TOKEN', 'HA_STT_ENTITY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_STT_MODEL', 'ELEVENLABS_STT_URL', 'ELEVENLABS_LANGUAGE_CODE', 'STT_PROMPT'] },
]

const API_KEY_FIELDS = API_FIELD_GROUPS.flatMap((g) => g.fields) as unknown as readonly string[]

export function mergeApiSettingsDraft(
  apiKeys: Record<string, string>,
  draft: Record<string, string>,
): Record<string, string> {
  const next = { ...apiKeys }
  for (const field of API_KEY_FIELDS) {
    const value = draft[field]
    if (value === undefined) delete next[field]
    else next[field] = value
  }
  return next
}

type FieldName = string

type BackendInstanceDraft = Omit<JaitBackendInstanceConfig, 'apiKey' | 'model' | 'numCtx' | 'type'> & {
  type: JaitBackend | ''
  apiKey: string
  model: string
  numCtx: string
}

type BackendIcon = React.ComponentType<{ size?: number; className?: string }>
// lobehub/lucide icon components don't structurally match ComponentType, but
// they all render fine with just size/className — normalize them via cast.
const asIcon = (icon: React.ElementType): BackendIcon => icon as BackendIcon

const BACKEND_OPTIONS: Array<{
  type: JaitBackend
  label: string
  description: string
  icon: BackendIcon
}> = [
  { type: 'openai', label: 'OpenAI-compatible', description: 'OpenAI or any compatible /v1 API endpoint.', icon: asIcon(OpenAI) },
  { type: 'openrouter', label: 'OpenRouter', description: 'Hosted access to many model providers through one API.', icon: asIcon(OpenRouter) },
  { type: 'ollama', label: 'Ollama', description: 'A local or remote Ollama server with its own model library.', icon: asIcon(Ollama) },
  { type: 'omniroute', label: 'OmniRoute', description: 'A local model router with automatic provider selection.', icon: asIcon(Network) },
  { type: 'gemini', label: 'Gemini', description: 'Google Gemini through its OpenAI-compatible endpoint.', icon: asIcon(Gemini) },
  { type: 'anthropic', label: 'Anthropic', description: 'Anthropic Claude through its OpenAI-compatible endpoint.', icon: asIcon(Anthropic) },
  { type: 'grok', label: 'Grok', description: 'xAI Grok models via the xAI API.', icon: asIcon(Grok) },
  { type: 'perplexity', label: 'Perplexity', description: 'Perplexity reasoning and search models.', icon: asIcon(Perplexity) },
  { type: 'moonshot', label: 'Moonshot', description: 'Moonshot AI (Kimi) via its OpenAI-compatible endpoint.', icon: asIcon(Moonshot) },
  { type: 'kimi', label: 'Kimi', description: 'Kimi (Moonshot AI) via its OpenAI-compatible endpoint.', icon: asIcon(Kimi) },
  { type: 'vllm', label: 'vLLM', description: 'A local or remote vLLM server with an OpenAI-compatible endpoint.', icon: asIcon(Vllm) },
]

function legacyBackendDraft(
  type: JaitBackend,
  apiKeys: Record<string, string>,
): BackendInstanceDraft {
  if (type === 'openrouter') {
    return {
      id: 'legacy-openrouter',
      type,
      name: 'OpenRouter',
      baseUrl: JAIT_BACKEND_DEFAULT_URLS.openrouter,
      apiKey: apiKeys.OPENROUTER_API_KEY ?? '',
      model: '',
      numCtx: '',
    }
  }
  if (type === 'ollama') {
    return {
      id: 'legacy-ollama',
      type,
      name: 'Local Ollama',
      baseUrl: apiKeys.OLLAMA_URL?.trim() || JAIT_BACKEND_DEFAULT_URLS.ollama,
      apiKey: '',
      model: apiKeys.OLLAMA_MODEL ?? '',
      numCtx: apiKeys.OLLAMA_NUM_CTX ?? '',
    }
  }
  if (type === 'omniroute') {
    return {
      id: 'legacy-omniroute',
      type,
      name: 'Local OmniRoute',
      baseUrl: apiKeys.OMNIROUTE_BASE_URL?.trim() || JAIT_BACKEND_DEFAULT_URLS.omniroute,
      apiKey: apiKeys.OMNIROUTE_API_KEY ?? '',
      model: apiKeys.OMNIROUTE_MODEL ?? '',
      numCtx: '',
    }
  }
  if (type === 'gemini') {
    return {
      id: 'legacy-gemini',
      type,
      name: 'Google Gemini',
      baseUrl: apiKeys.GEMINI_BASE_URL?.trim() || JAIT_BACKEND_DEFAULT_URLS.gemini,
      apiKey: apiKeys.GEMINI_API_KEY ?? '',
      model: apiKeys.GEMINI_MODEL ?? '',
      numCtx: '',
    }
  }
  if (type === 'anthropic') {
    return {
      id: 'legacy-anthropic',
      type,
      name: 'Anthropic',
      baseUrl: apiKeys.ANTHROPIC_BASE_URL?.trim() || JAIT_BACKEND_DEFAULT_URLS.anthropic,
      apiKey: apiKeys.ANTHROPIC_API_KEY ?? '',
      model: apiKeys.ANTHROPIC_MODEL ?? '',
      numCtx: '',
    }
  }
  if (type === 'grok') {
    return {
      id: 'legacy-grok',
      type,
      name: 'Grok',
      baseUrl: apiKeys.XAI_BASE_URL?.trim() || JAIT_BACKEND_DEFAULT_URLS.grok,
      apiKey: apiKeys.XAI_API_KEY ?? '',
      model: apiKeys.GROK_MODEL ?? '',
      numCtx: '',
    }
  }
  if (type === 'perplexity') {
    return {
      id: 'legacy-perplexity',
      type,
      name: 'Perplexity',
      baseUrl: JAIT_BACKEND_DEFAULT_URLS.perplexity,
      apiKey: apiKeys.PERPLEXITY_API_KEY ?? '',
      model: apiKeys.PERPLEXITY_MODEL ?? '',
      numCtx: '',
    }
  }
  if (type === 'moonshot') {
    return {
      id: 'legacy-moonshot',
      type,
      name: 'Moonshot',
      baseUrl: apiKeys.MOONSHOT_BASE_URL?.trim() || JAIT_BACKEND_DEFAULT_URLS.moonshot,
      apiKey: apiKeys.MOONSHOT_API_KEY ?? '',
      model: apiKeys.MOONSHOT_MODEL ?? '',
      numCtx: '',
    }
  }
  if (type === 'kimi') {
    return {
      id: 'legacy-kimi',
      type,
      name: 'Kimi',
      baseUrl: apiKeys.KIMI_BASE_URL?.trim() || JAIT_BACKEND_DEFAULT_URLS.kimi,
      apiKey: apiKeys.MOONSHOT_API_KEY ?? '',
      model: apiKeys.KIMI_MODEL ?? '',
      numCtx: '',
    }
  }
  if (type === 'vllm') {
    return {
      id: 'legacy-vllm',
      type,
      name: 'Local vLLM',
      baseUrl: JAIT_BACKEND_DEFAULT_URLS.vllm,
      apiKey: '',
      model: '',
      numCtx: '',
    }
  }
  return {
    id: 'legacy-openai',
    type,
    name: 'OpenAI',
    baseUrl: apiKeys.OPENAI_BASE_URL?.trim() || JAIT_BACKEND_DEFAULT_URLS.openai,
    apiKey: apiKeys.OPENAI_API_KEY ?? '',
    model: apiKeys.OPENAI_MODEL ?? '',
    numCtx: '',
  }
}

export function getBackendInstanceDrafts(
  apiKeys: Record<string, string>,
  selectedBackend: JaitBackend,
): BackendInstanceDraft[] {
  const configured = parseJaitBackendInstances(apiKeys.JAIT_BACKEND_INSTANCES)
  if (configured.length > 0) {
    return configured.map((instance) => ({
      ...instance,
      apiKey: instance.apiKey ?? '',
      model: instance.model ?? '',
      numCtx: instance.numCtx ? String(instance.numCtx) : '',
    }))
  }

  const legacyTypes = new Set<JaitBackend>([selectedBackend])
  if (apiKeys.OPENAI_API_KEY || apiKeys.OPENAI_BASE_URL) legacyTypes.add('openai')
  if (apiKeys.OPENROUTER_API_KEY) legacyTypes.add('openrouter')
  if (apiKeys.OLLAMA_URL || apiKeys.OLLAMA_MODEL) legacyTypes.add('ollama')
  if (apiKeys.OMNIROUTE_BASE_URL || apiKeys.OMNIROUTE_API_KEY) legacyTypes.add('omniroute')
  if (apiKeys.GEMINI_API_KEY || apiKeys.GEMINI_BASE_URL || apiKeys.GEMINI_MODEL) legacyTypes.add('gemini')
  if (apiKeys.ANTHROPIC_API_KEY || apiKeys.ANTHROPIC_BASE_URL) legacyTypes.add('anthropic')
  if (apiKeys.XAI_API_KEY || apiKeys.XAI_BASE_URL || apiKeys.GROK_MODEL) legacyTypes.add('grok')
  if (apiKeys.PERPLEXITY_API_KEY) legacyTypes.add('perplexity')
  if (apiKeys.MOONSHOT_API_KEY || apiKeys.MOONSHOT_BASE_URL) legacyTypes.add('moonshot')
  if (apiKeys.KIMI_BASE_URL || apiKeys.KIMI_MODEL) legacyTypes.add('kimi')
  return [...legacyTypes].map((type) => legacyBackendDraft(type, apiKeys))
}

/** Map field prefix → lobe icon component */
const FIELD_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  OPENAI: asIcon(OpenAI),
  ELEVENLABS: Key as React.ComponentType<{ size?: number; className?: string }>,
  HA: Home as React.ComponentType<{ size?: number; className?: string }>,
}

function getFieldIcon(field: FieldName): React.ComponentType<{ size?: number; className?: string }> | null {
  const prefix = field.split('_')[0]
  return FIELD_ICON[prefix] ?? null
}

/** Is this a secret/key field that should be masked? */
function isSecretField(field: string): boolean {
  return field.endsWith('_KEY') || field.endsWith('_URL')
}

const API_URL = getApiUrl()

const PROVIDER_LABELS: Record<string, string> = {
  jait: 'Jait',
  codex: 'Codex',
  'claude-code': 'Claude Code',
}

function isProviderAccount(provider: ProviderInfo): boolean {
  const auth = provider.auth
  if (provider.id === 'jait' || !auth) return false
  return auth.login || auth.logout || auth.authenticated !== null
}

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  downloadUrl?: string | null
  wearDownloadUrl?: string | null
}

/** Patch notes for a single GitHub release (commit diff since the prior release). */
export interface ReleaseNote {
  version: string
  name: string
  publishedAt: string
  url: string
  previousVersion: string
  commits: Array<{ message: string; sha: string; date: string }>
}

interface WearStatus {
  connected: boolean
  directTransferSupported: boolean
  watches: Array<{
    id: string
    name: string
    nearby: boolean
    directTransferSupported: boolean
    /** Installed watch app version, when the watch has reported it. */
    version?: string
    versionCode?: number
  }>
}

type SettingsTab = 'general' | 'api' | 'tools' | 'extensions' | 'skills' | 'email' | 'channels' | 'shortcuts' | 'usage' | 'activity' | 'nodes' | 'changelog'

const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  general: 'General',
  api: 'API',
  tools: 'Tools',
  extensions: 'Extensions',
  skills: 'Skills',
  email: 'Mail & Calendar',
  channels: 'Channels',
  shortcuts: 'Shortcuts',
  usage: 'Usage',
  activity: 'Activity',
  nodes: 'Nodes & Permissions',
  changelog: 'Changelog',
}

interface SettingsPageProps {
  username: string
  token: string | null
  apiKeys: Record<string, string>
  onSaveApiKeys: (next: Record<string, string>) => Promise<void>
  sttProvider: SttProvider
  onSttProviderChange: (next: SttProvider) => Promise<void>
  chatStreamingAction: ChatStreamingAction
  onChatStreamingActionChange: (next: ChatStreamingAction) => Promise<void>
  jaitBackend: JaitBackend
  onJaitBackendChange: (next: JaitBackend) => Promise<void>
  onClearArchive: () => Promise<number>
  onClearArchivedProjects: () => Promise<number>
  onFetchArchivedProjects: () => Promise<ProjectRecord[]>
  onRestoreProject: (projectId: string) => Promise<boolean>
  activityEvents?: ActivityEvent[]
  updateInfo: UpdateInfo | null
  updateChecking: boolean
  onCheckUpdate: () => void
  onApplyUpdate: () => void
  updateApplying: boolean
  releases: ReleaseNote[] | null
  releasesLoading: boolean
  onCheckChangelog: () => void
  platform: 'web' | 'electron' | 'capacitor'
}

export function SettingsPage({
  username,
  token,
  apiKeys,
  onSaveApiKeys,
  sttProvider,
  onSttProviderChange,
  chatStreamingAction,
  onChatStreamingActionChange,
  jaitBackend,
  onJaitBackendChange,
  onClearArchive,
  onClearArchivedProjects,
  onFetchArchivedProjects,
  onRestoreProject,
  activityEvents,
  updateInfo,
  updateChecking,
  onCheckUpdate,
  onApplyUpdate,
  updateApplying,
  releases,
  releasesLoading,
  onCheckChangelog,
  platform,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<Record<string, string>>(apiKeys)
  const [saving, setSaving] = useState(false)
  const [maxRoundsDraft, setMaxRoundsDraft] = useState<string>(apiKeys['JAIT_MAX_ROUNDS'] ?? '')
  const [savingMaxRounds, setSavingMaxRounds] = useState(false)
  const [backendInstancesDraft, setBackendInstancesDraft] = useState<BackendInstanceDraft[]>(
    () => getBackendInstanceDrafts(apiKeys, jaitBackend),
  )
  const [backendTestingId, setBackendTestingId] = useState<string | null>(null)
  const [backendTestResults, setBackendTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [clearing, setClearing] = useState(false)
  const [clearingProjects, setClearingProjects] = useState(false)
  const [archivedProjects, setArchivedProjects] = useState<ProjectRecord[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [envSet, setEnvSet] = useState<Record<string, boolean>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  // Provider data comes from the shared store so this page, the chat pickers
  // and the automation hook never disagree about what exists.
  const { providers: allProviders, remoteProviders: remoteProviderNodes, refresh: refreshProviderSnapshot } = useProviders()
  // Device accounts are rendered from `remoteProviderNodes` further down, so the
  // gateway list must exclude them to avoid listing the same account twice.
  const providerAccounts = useMemo(
    () => allProviders.filter((provider) => (provider.nodeId ?? 'gateway') === 'gateway' && isProviderAccount(provider)),
    [allProviders],
  )
  const [configuredProviderAccounts, setConfiguredProviderAccounts] = useState<ProviderAccount[]>([])
  const [providerAccountTypes, setProviderAccountTypes] = useState<ProviderAccountType[]>([])
  const [newProviderAccountType, setNewProviderAccountType] = useState('')
  const [newProviderAccountNodeId, setNewProviderAccountNodeId] = useState('gateway')
  const [newProviderAccountLabel, setNewProviderAccountLabel] = useState('')
  const [providerAccountMutationBusy, setProviderAccountMutationBusy] = useState(false)
  const [providerAccountsLoading, setProviderAccountsLoading] = useState(false)
  const [omniRouteTesting, setOmniRouteTesting] = useState(false)
  const [omniRouteResult, setOmniRouteResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [providerLogoutBusy, setProviderLogoutBusy] = useState<ProviderId | null>(null)
  const [providerLoginBusy, setProviderLoginBusy] = useState<ProviderId | null>(null)
  const [providerLoginInstructions, setProviderLoginInstructions] = useState<{
    providerId: ProviderId
    message: string
    userCode?: string
    verificationUri?: string
    requiresCodeInput?: boolean
    copied?: boolean
    waitingForCompletion?: boolean
  } | null>(null)
  const [providerLoginCode, setProviderLoginCode] = useState('')
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { importedThemes, activeTheme } = useVsCodeThemeStore()

  // ── Desktop close-to-tray setting ───────────────────────────────
  const [closeOnWindowClose, setCloseOnWindowClose] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [wearStatus, setWearStatus] = useState<WearStatus | null>(null)
  const [wearStatusLoading, setWearStatusLoading] = useState(false)
  const [wearUpdating, setWearUpdating] = useState(false)
  // ── Desktop launch-on-startup setting ───────────────────────────
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [launchAtLoginSupported, setLaunchAtLoginSupported] = useState(true)
  useEffect(() => {
    if (platform !== 'electron' || !window.jaitDesktop?.getInfo) return
    void window.jaitDesktop.getInfo().then((info) => {
      if (info.appVersion) setAppVersion(info.appVersion)
    })
  }, [platform])
  const refreshWearStatus = useCallback(async () => {
    if (platform !== 'capacitor') return
    const appUpdater = (window as any).Capacitor?.Plugins?.AppUpdater
    if (!appUpdater?.getWearStatus) return
    setWearStatusLoading(true)
    try {
      setWearStatus(await appUpdater.getWearStatus() as WearStatus)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not check the connected watch')
    } finally {
      setWearStatusLoading(false)
    }
  }, [platform])
  useEffect(() => {
    void refreshWearStatus()
  }, [refreshWearStatus])
  const handleWearUpdate = useCallback(async () => {
    const wearDownloadUrl = updateInfo?.wearDownloadUrl
    const appUpdater = (window as any).Capacitor?.Plugins?.AppUpdater
    if (!wearDownloadUrl) {
      toast.error('No signed Wear OS APK found on the latest release')
      return
    }
    if (!appUpdater?.updateWearApp) {
      toast.error('Watch updates require a newer Android app')
      return
    }
    setWearUpdating(true)
    try {
      toast.info('Downloading the watch update to your phone...')
      const result = await appUpdater.updateWearApp({ url: wearDownloadUrl }) as {
        directTransfers?: number
        legacyTransfers?: number
      }
      const directTransfers = result.directTransfers ?? 0
      const legacyTransfers = result.legacyTransfers ?? 0
      if (directTransfers > 0) {
        toast.success('Watch update sent. Finish the installation on your watch.')
      } else if (legacyTransfers > 0) {
        toast.success('Watch update started. Follow the installation prompt on your watch.')
      } else {
        toast.error('No connected watch received the update')
      }
      await refreshWearStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the watch app')
    } finally {
      setWearUpdating(false)
    }
  }, [refreshWearStatus, updateInfo?.wearDownloadUrl])
  useEffect(() => {
    if (platform !== 'electron' || !window.jaitDesktop?.getSetting) return
    void window.jaitDesktop.getSetting('closeOnWindowClose', false).then((v) => {
      setCloseOnWindowClose(v === true)
    })
  }, [platform])
  useEffect(() => {
    if (platform !== 'electron' || !window.jaitDesktop?.getLoginItem) return
    void window.jaitDesktop.getLoginItem().then((res) => {
      setLaunchAtLogin(res.enabled)
      setLaunchAtLoginSupported(res.supported)
    })
  }, [platform])

  useEffect(() => {
    setDraft(apiKeys)
    setMaxRoundsDraft(apiKeys['JAIT_MAX_ROUNDS'] ?? '')
    setBackendInstancesDraft(getBackendInstanceDrafts(apiKeys, jaitBackend))
  }, [apiKeys, jaitBackend])

  const maxRoundsDirty = (maxRoundsDraft.trim()) !== (apiKeys['JAIT_MAX_ROUNDS'] ?? '')
  const handleSaveMaxRounds = async () => {
    setSavingMaxRounds(true)
    try {
      const next = { ...apiKeys }
      const trimmed = maxRoundsDraft.trim()
      if (trimmed) next['JAIT_MAX_ROUNDS'] = trimmed
      else delete next['JAIT_MAX_ROUNDS']
      await onSaveApiKeys(next)
    } finally {
      setSavingMaxRounds(false)
    }
  }

  const savedBackendInstances = getBackendInstanceDrafts(apiKeys, jaitBackend)
  const backendInstancesDirty = JSON.stringify(backendInstancesDraft) !== JSON.stringify(savedBackendInstances)
  const backendInstancesValid = backendInstancesDraft.length > 0 && backendInstancesDraft.every((instance) => (
    instance.type
    && instance.name.trim()
    && instance.baseUrl.trim()
    && (!instance.numCtx.trim() || Number(instance.numCtx) >= 2048)
  ))
  const handleTestBackendInstance = async (instance: BackendInstanceDraft) => {
    setBackendTestingId(instance.id)
    setBackendTestResults((prev) => ({ ...prev, [instance.id]: { ok: false, message: 'Testing…' } }))
    try {
      const res = await fetch(`${API_URL}/api/providers/backend/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          backend: instance.type,
          base_url: instance.baseUrl.trim(),
          api_key: instance.apiKey.trim(),
          model: instance.model.trim(),
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        modelCount?: number
        latencyMs?: number
        sampleModels?: string[]
        authenticated?: boolean
        modelPresent?: boolean
      }
      if (data.ok) {
        const sample = data.sampleModels?.length ? ` (e.g. ${data.sampleModels.join(', ')})` : ''
        const auth = data.authenticated ? 'with API key' : 'keyless'
        const model = data.modelPresent !== undefined
          ? (data.modelPresent ? ', default model found' : ', default model not found')
          : ''
        setBackendTestResults({
          ...backendTestResults,
          [instance.id]: {
            ok: true,
            message: `Reachable in ${data.latencyMs}ms — ${data.modelCount} models, ${auth}${sample}${model}`,
          },
        })
      } else {
        setBackendTestResults({
          ...backendTestResults,
          [instance.id]: { ok: false, message: data.error ?? 'Connection failed' },
        })
      }
    } catch (err) {
      setBackendTestResults({
        ...backendTestResults,
        [instance.id]: { ok: false, message: err instanceof Error ? err.message : 'Connection failed' },
      })
    } finally {
      setBackendTestingId(null)
    }
  }
  const handleAddBackendInstance = () => {
    const id = globalThis.crypto?.randomUUID?.() ?? `backend-${Date.now()}`
    setBackendInstancesDraft((instances) => [
      ...instances,
      {
        id,
        type: '',
        name: '',
        baseUrl: '',
        apiKey: '',
        model: '',
        numCtx: '',
      },
    ])
  }
  const updateBackendInstance = (id: string, patch: Partial<BackendInstanceDraft>) => {
    setBackendInstancesDraft((instances) => instances.map((instance) => {
      if (instance.id !== id) return instance
      if (patch.type && patch.type !== instance.type) {
        const option = BACKEND_OPTIONS.find((candidate) => candidate.type === patch.type)
        return {
          ...instance,
          ...patch,
          name: option?.label ?? instance.name,
          baseUrl: JAIT_BACKEND_DEFAULT_URLS[patch.type],
          apiKey: '',
          model: '',
          numCtx: '',
        }
      }
      return { ...instance, ...patch }
    }))
  }

  const isDirty = API_KEY_FIELDS.some((field) => (draft[field] ?? '') !== (apiKeys[field] ?? '')) || backendInstancesDirty

  const loadProviderAccounts = useCallback(async () => {
    if (!token) return
    setProviderAccountsLoading(true)
    try {
      const [, accountData] = await Promise.all([
        refreshProviderSnapshot({ fresh: true, force: true }),
        agentsApi.listProviderAccounts(),
      ])
      setConfiguredProviderAccounts(accountData.accounts)
      setProviderAccountTypes(accountData.providerTypes)
      setNewProviderAccountType((current) => (
        accountData.providerTypes.some((type) => type.providerType === current)
          ? current
          : (accountData.providerTypes[0]?.providerType ?? '')
      ))
    } catch {
      setConfiguredProviderAccounts([])
      setProviderAccountTypes([])
      setNewProviderAccountType('')
    } finally {
      setProviderAccountsLoading(false)
    }
  }, [refreshProviderSnapshot, token])

  useEffect(() => {
    void loadProviderAccounts()
  }, [loadProviderAccounts])

  useEffect(() => {
    if (newProviderAccountNodeId === "gateway") return
    const selectedNode = remoteProviderNodes.find((node) => node.nodeId === newProviderAccountNodeId)
    if (!selectedNode?.availableProviderTypes?.includes(newProviderAccountType)) {
      setNewProviderAccountNodeId("gateway")
    }
  }, [newProviderAccountNodeId, newProviderAccountType, remoteProviderNodes])

  const selectedProviderAccountType = providerAccountTypes.find((type) => type.providerType === newProviderAccountType)

  const handleCreateProviderAccount = async () => {
    const label = newProviderAccountLabel.trim()
    const accountType = selectedProviderAccountType
    if (!label || !accountType) return
    setProviderAccountMutationBusy(true)
    setError(null)
    try {
      await agentsApi.createProviderAccount(accountType.providerType, label, newProviderAccountNodeId)
      setNewProviderAccountLabel('')
      const targetName = newProviderAccountNodeId === "gateway"
        ? "Gateway"
        : (remoteProviderNodes.find((node) => node.nodeId === newProviderAccountNodeId)?.nodeName ?? newProviderAccountNodeId)
      setStatus(`${accountType.name} account “${label}” created on ${targetName}. Sign in on its account row.`)
      await loadProviderAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to create ${accountType.name} account.`)
    } finally {
      setProviderAccountMutationBusy(false)
    }
  }

  const handleDeleteProviderAccount = async (account: ProviderAccount) => {
    setProviderAccountMutationBusy(true)
    setError(null)
    try {
      await agentsApi.deleteProviderAccount(account.id)
      setStatus(`Provider account “${account.label}” removed.`)
      await loadProviderAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove provider account.')
    } finally {
      setProviderAccountMutationBusy(false)
    }
  }

  const handleProviderLogout = async (providerId: ProviderId) => {
    const configuredAccount = configuredProviderAccounts.find((account) => account.id === providerId)
    const label = providerAccounts.find((provider) => provider.id === providerId)?.name
      ?? (configuredAccount ? `${PROVIDER_LABELS[configuredAccount.providerType] ?? configuredAccount.providerType} — ${configuredAccount.label}` : undefined)
      ?? PROVIDER_LABELS[providerId]
      ?? providerId
    setProviderLogoutBusy(providerId)
    setError(null)
    setStatus(null)
    try {
      const result = await agentsApi.logoutProvider(providerId)
      setStatus(result.message || `${label} logout completed.`)
      await loadProviderAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to log out from ${label}.`)
    } finally {
      setProviderLogoutBusy(null)
    }
  }

  const handleProviderLogin = async (providerId: ProviderId) => {
    const configuredAccount = configuredProviderAccounts.find((account) => account.id === providerId)
    const label = providerAccounts.find((provider) => provider.id === providerId)?.name
      ?? (configuredAccount ? `${PROVIDER_LABELS[configuredAccount.providerType] ?? configuredAccount.providerType} — ${configuredAccount.label}` : undefined)
      ?? PROVIDER_LABELS[providerId]
      ?? providerId
    let loginWindow: Window | null = null
    try {
      loginWindow = window.open('about:blank', '_blank')
    } catch {
      loginWindow = null
    }
    setProviderLoginBusy(providerId)
    setError(null)
    setStatus(null)
    setProviderLoginInstructions(null)
    setProviderLoginCode('')
    try {
      const result = await agentsApi.startProviderLogin(providerId)
      const copied = result.userCode
        ? await copyTextToClipboard(result.userCode, loginWindow && !loginWindow.closed ? loginWindow : window)
        : false
      if (result.verificationUri) {
        if (loginWindow) loginWindow.location.href = result.verificationUri
        else window.open(result.verificationUri, '_blank', 'noopener,noreferrer')
      } else {
        loginWindow?.close()
      }
      setProviderLoginInstructions({
        providerId,
        message: result.userCode
          ? `${label} device code ${copied ? 'copied to clipboard.' : 'is ready to copy.'}`
          : result.requiresCodeInput
            ? (result.inputPrompt ?? `Enter the authorization code from your browser to complete ${label} login.`)
            : result.message,
        userCode: result.userCode,
        verificationUri: result.verificationUri,
        requiresCodeInput: result.requiresCodeInput,
        copied,
        waitingForCompletion: true,
      })
      await loadProviderAccounts()
    } catch (err) {
      loginWindow?.close()
      setError(err instanceof Error ? err.message : `Failed to start ${label} login.`)
    } finally {
      setProviderLoginBusy(null)
    }
  }

  const handleProviderLoginCode = async (providerId: ProviderId) => {
    const code = providerLoginCode.trim()
    if (!code) return
    setProviderLoginBusy(providerId)
    setError(null)
    try {
      await agentsApi.sendProviderLoginInput(providerId, code)
      setProviderLoginCode('')
      setStatus('Authorization code sent. Completing login…')
      await loadProviderAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the authorization code.')
    } finally {
      setProviderLoginBusy(null)
    }
  }

  const pendingLoginProviderId = providerLoginInstructions?.waitingForCompletion
    ? providerLoginInstructions.providerId
    : null
  const pendingLoginProviderLabel = pendingLoginProviderId
    ? (providerAccounts.find((provider) => provider.id === pendingLoginProviderId)?.name
      ?? configuredProviderAccounts.find((account) => account.id === pendingLoginProviderId)?.label
      ?? pendingLoginProviderId)
    : null

  useEffect(() => {
    if (!pendingLoginProviderId || !pendingLoginProviderLabel) return

    let stopped = false
    const interval = window.setInterval(() => {
      void checkAuthStatus()
    }, 2000)

    async function checkAuthStatus() {
      try {
        const authStatus = await agentsApi.getProviderAuthStatus(pendingLoginProviderId!)
        if (stopped || authStatus.authenticated !== true) return
        stopped = true
        window.clearInterval(interval)
        setProviderLoginInstructions(null)
        setStatus(`${pendingLoginProviderLabel} is logged in.`)
        await loadProviderAccounts()
      } catch {}
    }

    void checkAuthStatus()
    return () => {
      stopped = true
      window.clearInterval(interval)
    }
  }, [loadProviderAccounts, pendingLoginProviderId, pendingLoginProviderLabel])

  const handleDiscard = useCallback(() => {
    setDraft(apiKeys)
    setStatus(null)
    setError(null)
  }, [apiKeys])

  // Fetch which fields have env values on mount
  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/settings/env-status`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { env_set: Record<string, boolean> }
          setEnvSet(data.env_set)
        }
      } catch {
        // silently ignore — badges will just not show env status
      }
    })()
    return () => { cancelled = true }
  }, [token])

  /**
   * Probe the OmniRoute router via the gateway. Sends the *draft* values so the
   * user can verify a base URL before committing it — the whole point is to find
   * out whether it works, which is awkward if you must save a wrong value first.
   */
  const handleTestOmniRoute = useCallback(async () => {
    setOmniRouteTesting(true)
    setOmniRouteResult(null)
    try {
      const res = await fetch(`${API_URL}/api/providers/omniroute/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          base_url: draft.OMNIROUTE_BASE_URL ?? '',
          api_key: draft.OMNIROUTE_API_KEY ?? '',
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        modelCount?: number
        latencyMs?: number
        sampleModels?: string[]
        authenticated?: boolean
      }
      if (data.ok) {
        const sample = data.sampleModels?.length ? ` (e.g. ${data.sampleModels.join(', ')})` : ''
        const auth = data.authenticated ? 'with API key' : 'keyless'
        setOmniRouteResult({
          ok: true,
          message: `Reachable in ${data.latencyMs}ms — ${data.modelCount} models, ${auth}${sample}`,
        })
      } else {
        setOmniRouteResult({ ok: false, message: data.error ?? 'Connection failed' })
      }
    } catch (err) {
      setOmniRouteResult({ ok: false, message: err instanceof Error ? err.message : 'Connection failed' })
    } finally {
      setOmniRouteTesting(false)
    }
  }, [token, draft.OMNIROUTE_BASE_URL, draft.OMNIROUTE_API_KEY])

  const [resettingModels, setResettingModels] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)

  // Drop the cached model catalogues (gateway + browser) so the provider picker
  // shows the *current* models instead of a stale snapshot. `resetModelFetcherCaches`
  // on the gateway resets every backend (OpenAI, Ollama, OpenRouter, OmniRoute, …).
  const handleResetProviderModels = useCallback(async () => {
    setResettingModels(true)
    setResetMsg(null)
    try {
      const res = await fetch(`${API_URL}/api/providers/models/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Reset failed (HTTP ${res.status})`)
      agentsApi.resetProviderModels()
      setResetMsg('Model cache cleared. The picker will reload fresh models on next open.')
    } catch (err) {
      setResetMsg(`Failed to reset: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setResettingModels(false)
    }
  }, [token])

  const toggleVisibility = useCallback((field: string) => {
    setVisible((prev) => ({ ...prev, [field]: !prev[field] }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      const next = mergeApiSettingsDraft(apiKeys, draft)
      if (backendInstancesDirty) {
        const instances: JaitBackendInstanceConfig[] = backendInstancesDraft
          .filter((instance): instance is BackendInstanceDraft & { type: JaitBackend } => instance.type !== '')
          .map((instance) => ({
          id: instance.id,
          type: instance.type,
          name: instance.name.trim(),
          baseUrl: instance.baseUrl.trim(),
          ...(instance.apiKey.trim() ? { apiKey: instance.apiKey.trim() } : {}),
          ...(instance.model.trim() ? { model: instance.model.trim() } : {}),
          ...(instance.type === 'ollama' && instance.numCtx.trim()
            ? { numCtx: Number(instance.numCtx) }
            : {}),
        }))
        next.JAIT_BACKEND_INSTANCES = serializeJaitBackendInstances(instances)
      }
      await onSaveApiKeys(next)
      setStatus('Settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleClearArchive = async () => {
    setClearing(true)
    setError(null)
    setStatus(null)
    try {
      const removed = await onClearArchive()
      setStatus(`Cleared ${removed} archived session(s).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear archive')
    } finally {
      setClearing(false)
    }
  }

  const handleClearArchivedProjects = async () => {
    setClearingProjects(true)
    setError(null)
    setStatus(null)
    try {
      const removed = await onClearArchivedProjects()
      setArchivedProjects([])
      setStatus(`Cleared ${removed} archived project(s).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear archived projects')
    } finally {
      setClearingProjects(false)
    }
  }

  const loadArchivedProjects = useCallback(async () => {
    setLoadingArchived(true)
    try {
      const list = await onFetchArchivedProjects()
      setArchivedProjects(list)
    } finally {
      setLoadingArchived(false)
    }
  }, [onFetchArchivedProjects])

  const handleRestoreProject = async (projectId: string) => {
    setRestoringId(projectId)
    try {
      const ok = await onRestoreProject(projectId)
      if (ok) {
        setArchivedProjects((prev) => prev.filter((w) => w.id !== projectId))
        setStatus('Project restored.')
      } else {
        setError('Failed to restore project.')
      }
    } catch {
      setError('Failed to restore project.')
    } finally {
      setRestoringId(null)
    }
  }

  const handleThemeImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setStatus(null)
    try {
      const imported = importVsCodeThemeFromText(file.name, await file.text())
      setStatus(
        imported.hasInclude
          ? `Imported theme "${imported.name}". Relative "include" files are not resolved yet.`
          : `Imported theme "${imported.name}".`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import theme')
    }
  }, [])

  function renderSourceBadge(field: FieldName) {
    const userHasValue = !!(draft[field]?.trim())
    const envHasValue = !!envSet[field]

    if (userHasValue) {
      return <Badge variant="default" className="text-2xs px-1.5 py-0">user</Badge>
    }
    if (envHasValue) {
      return <Badge variant="success" className="text-2xs px-1.5 py-0">.env</Badge>
    }
    return <Badge variant="outline" className="text-2xs px-1.5 py-0 text-muted-foreground">empty</Badge>
  }

  const searchQuery = search.trim().toLowerCase()
  const matchesSearch = (...terms: Array<string | undefined | null>) => (
    !searchQuery || terms.some((term) => term?.toLowerCase().includes(searchQuery))
  )
  const highlight = (text: string) => (
    <span dangerouslySetInnerHTML={{ __html: highlightSearchMatchHtml(text, search) }} />
  )

  const showUpdateSection = matchesSearch(
    'software update version gateway desktop release download install',
    updateInfo?.currentVersion,
    updateInfo?.latestVersion,
    appVersion,
  )
  const androidPackageUnavailable = platform === 'capacitor'
    && !!updateInfo?.latestVersion
    && updateInfo.latestVersion !== updateInfo.currentVersion
    && !updateInfo.downloadUrl
  const showDesktopSection = platform === 'electron' && matchesSearch(
    'desktop tray close window quit minimize app',
    appVersion,
  )
  const wearWatches = Array.isArray(wearStatus?.watches) ? wearStatus.watches : []
  const showWatchSection = platform === 'capacitor' && matchesSearch(
    'watch wear os companion connected paired update apk transfer channel',
    ...wearWatches.map((watch) => watch.name),
  )
  const showGatewaySection = platform !== 'web' && matchesSearch(
    'gateway connection url domain ip server host network',
    getApiUrl(),
  )
  const showArchiveSection = matchesSearch(
    'session archive archived clear delete messages history',
  )
  const showProjectArchiveSection = matchesSearch(
    'project archive archived clear delete projects remove',
  )
  const showJaitBackendSection = matchesSearch(
    'jait backend provider openai openrouter ollama instances model api llm context max rounds agent tool calls loop iterations',
    jaitBackend,
  )
  const showProviderAccountsSection = matchesSearch(
    'provider accounts login logout codex claude gemini opencode copilot authentication',
    ...providerAccounts.map((provider) => `${provider.name} ${provider.auth?.detail ?? ''}`),
  )
  const showSpeechSection = matchesSearch(
    'speech stt input microphone whisper wyoming home assistant transcription gpt openai elevenlabs scribe',
    sttProvider,
    draft.WHISPER_URL,
    draft.HA_URL,
    draft.HA_TOKEN,
    draft.HA_STT_ENTITY,
    draft.OPENAI_TRANSCRIBE_MODEL,
    draft.ELEVENLABS_API_KEY,
    draft.ELEVENLABS_STT_MODEL,
    draft.ELEVENLABS_STT_URL,
    draft.ELEVENLABS_LANGUAGE_CODE,
  )
  const filteredApiFields = API_KEY_FIELDS.filter((field) => matchesSearch(
    field,
    field.replaceAll('_', ' '),
    draft[field],
  ))
  const showToolsSection = matchesSearch(
    'tools permissions mcp core standard external toggle meta terminal filesystem os agent browser web surfaces scheduler memory voice screen gateway',
  )
  const showActivitySection = matchesSearch(
    'activity recent messages terminal sessions feed history',
  )
  const showExtensionsSection = matchesSearch(
    'extensions plugins store install uninstall enable disable',
  )
  const showSkillsSection = matchesSearch(
    'skills instructions prompts specialized workflows SKILL.md',
  )
  const showChannelsSection = matchesSearch(
    'connectors channels telegram bot botfather token whatsapp teams messaging connect link pair qr inbound outbound',
  )
  const showThemeSection = matchesSearch(...getVsCodeThemeSearchTerms(), 'import json token colors workbench sidebar tabs')
  const showChatBehaviorSection = matchesSearch(
    'chat streaming behavior default action steer queue thread interrupt while agent running busy message submit enter',
  )

  // Whether a tab currently shows any matching content for the active search query.
  // Tabs that never filter (email, shortcuts, usage, nodes, changelog) always count as a match
  // so they stay reachable and never hijack an active search.
  const tabHasMatch = (tab: SettingsTab): boolean => {
    switch (tab) {
      case 'general':
        return showUpdateSection || showWatchSection || showThemeSection || showDesktopSection || showGatewaySection || showArchiveSection || showProjectArchiveSection || showSpeechSection || showChatBehaviorSection
      case 'api':
        return filteredApiFields.length > 0 || showJaitBackendSection || showProviderAccountsSection
      case 'tools':
        return showToolsSection
      case 'extensions':
        return showExtensionsSection
      case 'skills':
        return showSkillsSection
      case 'channels':
        return showChannelsSection
      case 'activity':
        return showActivitySection
      default:
        return true
    }
  }

  // When the user searches, jump to the first tab that has matching content so the
  // top-level search box actually finds results across the settings pages.
  useEffect(() => {
    if (!searchQuery) return
    if (tabHasMatch(activeTab)) return
    const next = (Object.keys(SETTINGS_TAB_LABELS) as SettingsTab[]).find((t) => tabHasMatch(t))
    if (next && next !== activeTab) setActiveTab(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeTab])

const providerAccountsCard = (
  <Card className="space-y-4 p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-medium">{highlight('Provider accounts')}</h2>
        <p className="text-sm text-muted-foreground">
          Provider accounts are tied to the device where their CLI login exists. Other devices cannot use them.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => { void loadProviderAccounts() }} disabled={providerAccountsLoading}>
        {providerAccountsLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
        Refresh
      </Button>
    </div>
    <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(10rem,0.7fr)_minmax(12rem,1fr)_auto]">
      <Select value={newProviderAccountType} onValueChange={setNewProviderAccountType}>
        <SelectTrigger aria-label="Provider account type">
          <SelectValue placeholder="Choose provider" />
        </SelectTrigger>
        <SelectContent>
          {providerAccountTypes.map((type) => (
            <SelectItem key={type.providerType} value={type.providerType}>
              {type.name}{type.version ? ` ${type.version}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={newProviderAccountNodeId} onValueChange={setNewProviderAccountNodeId}>
        <SelectTrigger aria-label="Provider account device">
          <SelectValue placeholder="Choose device" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="gateway">Gateway</SelectItem>
          {remoteProviderNodes.map((node) => {
            const supported = node.availableProviderTypes?.includes(newProviderAccountType) ?? false
            return <SelectItem key={node.nodeId} value={node.nodeId} disabled={!supported}>{node.nodeName}{supported ? "" : " (provider unavailable)"}</SelectItem>
          })}
        </SelectContent>
      </Select>
      <Input
        value={newProviderAccountLabel}
        onChange={(event) => setNewProviderAccountLabel(event.target.value)}
        placeholder="Account label, e.g. Work"
        maxLength={80}
        onKeyDown={(event) => { if (event.key === 'Enter') void handleCreateProviderAccount() }}
      />
      <Button
        className="sm:w-auto"
        onClick={() => { void handleCreateProviderAccount() }}
        disabled={!newProviderAccountType || !newProviderAccountLabel.trim() || providerAccountMutationBusy}
      >
        {providerAccountMutationBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
        Add account
      </Button>
      {selectedProviderAccountType && (
        <p className="text-xs text-muted-foreground sm:col-span-4">
          {selectedProviderAccountType.description}
          {selectedProviderAccountType.distribution
            ? ` Installs on first use via ${selectedProviderAccountType.distribution}.`
            : ''}
        </p>
      )}
    </div>
    <div className="space-y-2">
      {providerAccounts.length === 0 && remoteProviderNodes.every((node) => (node.providerStatuses?.length ?? node.providers.length) === 0) && !providerAccountsLoading ? (
        <p className="text-sm text-muted-foreground">No provider account actions are available on this gateway.</p>
      ) : providerAccounts.map((provider) => {
        const auth = provider.auth
        const providerId = provider.id
        const isSignedIn = auth?.authenticated === true
        const isKnownSignedOut = auth?.authenticated === false
        const logoutBusy = providerLogoutBusy === providerId
        const loginBusy = providerLoginBusy === providerId
        const busy = logoutBusy || loginBusy
        const loginInstructions = providerLoginInstructions?.providerId === providerId ? providerLoginInstructions : null
        const configuredAccount = configuredProviderAccounts.find((account) => account.id === providerId)
        return (
          <div key={provider.id} className="flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{PROVIDER_LABELS[providerId] ?? provider.name}</p>
                <Badge variant={isSignedIn ? 'success' : 'outline'} className="text-2xs">
                  {isSignedIn ? 'signed in' : auth?.authenticated === false ? 'signed out' : 'unknown'}
                </Badge>
                <Badge variant="outline" className="text-2xs">Gateway</Badge>
              </div>
              {isSignedIn && auth?.username && (
                <p className="mt-1 text-xs text-muted-foreground">Signed in as {auth.username}</p>
              )}
              {auth?.detail && (
                <p className="mt-1 text-xs text-muted-foreground">{auth.detail}</p>
              )}
              {loginInstructions && (
                <div className="mt-2 space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
                  <p>{loginInstructions.message}</p>
                  {loginInstructions.userCode && (
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 rounded bg-background px-2 py-1 font-mono text-foreground [overflow-wrap:anywhere]">{loginInstructions.userCode}</code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void copyTextToClipboard(loginInstructions.userCode!).then((copied) => {
                            setProviderLoginInstructions((current) => (
                              current?.providerId === providerId ? { ...current, copied } : current
                            ))
                          })
                        }}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        {loginInstructions.copied ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  )}
                  {loginInstructions.waitingForCompletion && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Waiting for login completion…
                    </div>
                  )}
                  {loginInstructions.verificationUri && (
                    <a className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" href={loginInstructions.verificationUri} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open login page
                    </a>
                  )}
                  {loginInstructions.requiresCodeInput && (
                    <div className="flex gap-2">
                      <Input value={providerLoginCode} onChange={(event) => setProviderLoginCode(event.target.value)} placeholder="Authorization code" onKeyDown={(event) => { if (event.key === 'Enter') void handleProviderLoginCode(providerId) }} />
                      <Button variant="outline" size="sm" onClick={() => { void handleProviderLoginCode(providerId) }} disabled={!providerLoginCode.trim() || busy}>Submit</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              {shouldShowProviderLoginAction(auth) && (
                <Button className="flex-1 sm:flex-none" variant="outline" size="sm" onClick={() => { void handleProviderLogin(providerId) }} disabled={busy || providerLogoutBusy !== null}>
                  {loginBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LogIn className="mr-1.5 h-3.5 w-3.5" />}
                  Login
                </Button>
              )}
              {auth?.logout && (
                <Button className="flex-1 sm:flex-none" variant="outline" size="sm" onClick={() => { void handleProviderLogout(providerId) }} disabled={busy || providerLoginBusy !== null || isKnownSignedOut}>
                  {logoutBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LogOut className="mr-1.5 h-3.5 w-3.5" />}
                  Logout
                </Button>
              )}
              {configuredAccount && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Remove ${configuredAccount.label}`}
                  disabled={busy || providerAccountMutationBusy}
                  onClick={() => {
                    if (window.confirm(`Remove “${configuredAccount.label}” and its local credentials?`)) {
                      void handleDeleteProviderAccount(configuredAccount)
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        )
      })}
      {remoteProviderNodes.flatMap((node) => (
        (node.providerStatuses ?? node.providers.map((id) => ({ id, providerType: id, name: undefined, installed: true, authenticated: null, detail: undefined })))
          .map((provider) => ({ node, provider }))
      )).map(({ node, provider }) => {
        const isSignedIn = provider.authenticated === true
        const configuredAccount = configuredProviderAccounts.find((account) => account.id === provider.id)
        const loginBusy = providerLoginBusy === provider.id
        const logoutBusy = providerLogoutBusy === provider.id
        const busy = loginBusy || logoutBusy
        const loginInstructions = providerLoginInstructions?.providerId === provider.id ? providerLoginInstructions : null
        return (
          <div key={`${node.nodeId}:${provider.id}`} className="flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{provider.name ?? PROVIDER_LABELS[provider.providerType ?? provider.id] ?? provider.id}</p>
                <Badge variant={isSignedIn ? 'success' : 'outline'} className="text-2xs">
                  {isSignedIn ? 'signed in' : provider.authenticated === false ? 'signed out' : 'unknown'}
                </Badge>
                <Badge variant="outline" className="text-2xs">{node.nodeName}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {provider.detail ?? `Available only for projects on this ${node.platform} device.`}
              </p>
              {loginInstructions && (
                <div className="mt-2 space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
                  <p>{loginInstructions.message}</p>
                  {loginInstructions.userCode && <code className="block rounded bg-background px-2 py-1 font-mono text-foreground [overflow-wrap:anywhere]">{loginInstructions.userCode}</code>}
                  {loginInstructions.verificationUri && (
                    <a className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" href={loginInstructions.verificationUri} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Open login page
                    </a>
                  )}
                  {loginInstructions.requiresCodeInput && (
                    <div className="flex gap-2">
                      <Input value={providerLoginCode} onChange={(event) => setProviderLoginCode(event.target.value)} placeholder="Authorization code" onKeyDown={(event) => { if (event.key === "Enter") void handleProviderLoginCode(provider.id) }} />
                      <Button variant="outline" size="sm" onClick={() => { void handleProviderLoginCode(provider.id) }} disabled={!providerLoginCode.trim() || busy}>Submit</Button>
                    </div>
                  )}
                  {loginInstructions.waitingForCompletion && <div className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for login completion…</div>}
                </div>
              )}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              {!isSignedIn && (
                <Button className="flex-1 sm:flex-none" variant="outline" size="sm" onClick={() => { void handleProviderLogin(provider.id) }} disabled={busy}>
                  {loginBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LogIn className="mr-1.5 h-3.5 w-3.5" />}
                  Login
                </Button>
              )}
              {isSignedIn && (
                <Button className="flex-1 sm:flex-none" variant="outline" size="sm" onClick={() => { void handleProviderLogout(provider.id) }} disabled={busy}>
                  {logoutBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LogOut className="mr-1.5 h-3.5 w-3.5" />}
                  Logout
                </Button>
              )}
              {configuredAccount && (
                <Button variant="outline" size="icon" aria-label={`Remove ${configuredAccount.label}`} disabled={busy || providerAccountMutationBusy} onClick={() => {
                  if (window.confirm(`Remove “${configuredAccount.label}” and its credentials from ${node.nodeName}?`)) void handleDeleteProviderAccount(configuredAccount)
                }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  </Card>
)

  const emptyState = (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">
        No settings match <span className="font-medium text-foreground">{search}</span>.
      </p>
    </Card>
  )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{username}</span>
          </p>
        </div>
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search settings..."
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)} className="space-y-4">
        <div className="sm:hidden">
          <Select value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)}>
            <SelectTrigger aria-label="Settings page" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(SETTINGS_TAB_LABELS) as [SettingsTab, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TabsList className="hidden h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/70 p-1 sm:flex">
          <TabsTrigger value="general" className="flex-1 sm:flex-none">General</TabsTrigger>
          <TabsTrigger value="api" className="flex-1 sm:flex-none">API</TabsTrigger>
          <TabsTrigger value="tools" className="flex-1 sm:flex-none">Tools</TabsTrigger>
          <TabsTrigger value="extensions" className="flex-1 sm:flex-none">Extensions</TabsTrigger>
          <TabsTrigger value="skills" className="flex-1 sm:flex-none">Skills</TabsTrigger>
          <TabsTrigger value="email" className="flex-1 sm:flex-none">Mail & Calendar</TabsTrigger>
          <TabsTrigger value="channels" className="flex-1 sm:flex-none">Channels</TabsTrigger>
          <TabsTrigger value="nodes" className="flex-1 sm:flex-none">Nodes</TabsTrigger>
          <TabsTrigger value="shortcuts" className="flex-1 sm:flex-none">Shortcuts</TabsTrigger>
          <TabsTrigger value="usage" className="flex-1 sm:flex-none">Usage</TabsTrigger>
          <TabsTrigger value="activity" className="flex-1 sm:flex-none">Activity</TabsTrigger>
          <TabsTrigger value="changelog" className="flex-1 sm:flex-none">Changelog</TabsTrigger>

        </TabsList>

        <TabsContent value="general" className="space-y-6">
          {showUpdateSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="flex items-center gap-2 text-base font-medium">
                  <ArrowUpCircle className="h-4 w-4" />
                  {highlight('Software Update')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {updateInfo
                    ? <>{platform === 'capacitor' ? 'App' : 'Gateway'} <span className="font-mono font-medium text-foreground">v{updateInfo.currentVersion}</span></>
                    : 'Check for the latest Jait version.'}
                  {appVersion && (
                    <> &middot; Desktop app <span className="font-mono font-medium text-foreground">v{appVersion}</span></>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" onClick={onCheckUpdate} disabled={updateChecking || updateApplying}>
                  {updateChecking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  {updateChecking ? 'Checking...' : 'Check for updates'}
                </Button>
                {updateInfo?.hasUpdate && (
                  <PatchNotesTooltip
                    targetVersion={updateInfo.latestVersion}
                    notes={releases}
                    align="left"
                  >
                    {platform === 'web' ? (
                      <Button size="sm" onClick={onApplyUpdate} disabled={updateApplying}>
                        {updateApplying ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                        {updateApplying ? 'Updating...' : `Update gateway to v${updateInfo.latestVersion}`}
                      </Button>
                    ) : platform === 'electron' ? (
                      <Button size="sm" onClick={async () => {
                        const desktop = (window as any).jaitDesktop
                        toast.info('Downloading update...')
                        const dl = await desktop.downloadUpdate()
                        if (dl?.ok) {
                          toast.success('Update downloaded. Restarting...')
                          await desktop.installUpdate()
                        } else {
                          toast.error('Download failed')
                        }
                      }}>
                        <Download className="mr-1.5 h-4 w-4" />
                        Update to v{updateInfo.latestVersion}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={onApplyUpdate} disabled={updateApplying || !updateInfo?.downloadUrl}>
                        {updateApplying ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                        {updateApplying ? 'Downloading...' : `Update to v${updateInfo.latestVersion}`}
                      </Button>
                    )}
                  </PatchNotesTooltip>
                )}
              </div>
              {updateInfo && !updateInfo.hasUpdate && !androidPackageUnavailable && (
                <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  You&apos;re on the latest version.
                </p>
              )}
              {updateInfo?.hasUpdate && (
                <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Version {updateInfo.latestVersion} is available.
                </p>
              )}
              {androidPackageUnavailable && (
                <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Version {updateInfo?.latestVersion} has no signed Android APK yet.
                </p>
              )}
            </Card>
          )}

          {showWatchSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="flex items-center gap-2 text-base font-medium">
                  <Watch className="h-4 w-4" />
                  {highlight('Wear OS Watch')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Update the Jait watch app from this phone over the Wear OS Data Layer.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {wearStatusLoading && !wearStatus ? (
                  <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Checking...</Badge>
                ) : wearStatus?.connected ? (
                  wearWatches.map((watch) => (
                    <Badge key={watch.id} variant={watch.nearby ? 'success' : 'outline'}>
                      {watch.name}{watch.version ? ` · v${watch.version}` : ''}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline">No connected watch</Badge>
                )}
              </div>
              {wearStatus?.connected && (
                <p className="text-sm text-muted-foreground">
                  {wearStatus.directTransferSupported
                    ? 'Direct phone-to-watch APK transfer is ready.'
                    : 'This watch uses the one-time legacy updater; future updates transfer directly from the phone.'}
                </p>
              )}
              {wearStatus?.connected
                && wearWatches.some((watch) => watch.version)
                && updateInfo?.latestVersion && (
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const reported = wearWatches.filter((watch) => watch.version)
                    const outdated = reported.filter((watch) => watch.version !== updateInfo.latestVersion)
                    if (outdated.length === 0) {
                      return `Watch app ${reported[0].version} is up to date.`
                    }
                    return `Watch app v${outdated[0].version} is installed; v${updateInfo.latestVersion} is available.`
                  })()}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  onClick={() => { void handleWearUpdate() }}
                  disabled={wearUpdating || wearStatusLoading || !wearStatus?.connected || !updateInfo?.wearDownloadUrl}
                >
                  {wearUpdating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                  {wearUpdating
                    ? 'Sending update...'
                    : updateInfo?.latestVersion
                      ? `Update watch to v${updateInfo.latestVersion}`
                      : 'Update watch app'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { void refreshWearStatus() }} disabled={wearStatusLoading || wearUpdating}>
                  <RefreshCw className={`mr-1.5 h-4 w-4 ${wearStatusLoading ? 'animate-spin' : ''}`} />
                  Refresh watch
                </Button>
              </div>
              {!updateInfo?.wearDownloadUrl && (
                <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  The latest release has no signed Wear OS APK.
                </p>
              )}
            </Card>
          )}

          {showThemeSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">{highlight('Editor theme')}</h2>
                <p className="text-sm text-muted-foreground">
                  Import a VS Code theme JSON file and apply its Monaco token colors plus a mapped shell palette.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => { void handleThemeImport(event) }}
                />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Import theme JSON
                </Button>
                <Button variant="ghost" size="sm" disabled={!activeTheme} onClick={() => setActiveVsCodeTheme(null)}>
                  Use built-in theme
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Imported themes stay local to this device. The quick light/system/dark toggle falls back to the built-in theme set.
              </p>
              {importedThemes.length > 0 ? (
                <div className="space-y-2">
                  {importedThemes.map((theme) => {
                    const isActive = activeTheme?.id === theme.id
                    return (
                      <div key={theme.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{theme.name}</p>
                            <Badge variant={isActive ? 'default' : 'outline'} className="h-5 px-1.5 text-2xs">
                              {isActive ? 'active' : theme.colorMode}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{theme.sourceLabel}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {!isActive && (
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setActiveVsCodeTheme(theme.id)}>
                              Apply
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => removeVsCodeTheme(theme.id)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No imported themes yet.</p>
              )}
            </Card>
          )}

          {showDesktopSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">{highlight('Desktop')}</h2>
                <p className="text-sm text-muted-foreground">
                  Settings specific to the desktop application.
                </p>
              </div>
              <div className="flex max-w-md items-center justify-between gap-4">
                <div>
                  <Label htmlFor="close-on-window-close">Quit on window close</Label>
                  <p className="text-xs text-muted-foreground">
                    When off, closing the window minimizes Jait to the system tray.
                  </p>
                </div>
                <Switch
                  id="close-on-window-close"
                  checked={closeOnWindowClose}
                  onCheckedChange={(checked) => {
                    setCloseOnWindowClose(checked)
                    void window.jaitDesktop?.setSetting('closeOnWindowClose', checked)
                  }}
                />
              </div>
              {launchAtLoginSupported && (
                <div className="flex max-w-md items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="launch-at-login">Start on PC startup</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically launch Jait when you log in to your computer.
                    </p>
                  </div>
                  <Switch
                    id="launch-at-login"
                    checked={launchAtLogin}
                    onCheckedChange={(checked) => {
                      setLaunchAtLogin(checked)
                      void window.jaitDesktop?.setLoginItem(checked)
                    }}
                  />
                </div>
              )}
            </Card>
          )}

          {showGatewaySection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">{highlight('Gateway connection')}</h2>
                <p className="text-sm text-muted-foreground">
                  Desktop and mobile clients can connect to a different Jait gateway.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Current gateway: <code className="rounded bg-muted px-1 py-0.5 text-xs">{getApiUrl()}</code>
              </p>
            </Card>
          )}

          {showArchiveSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">{highlight('Session archive')}</h2>
                <p className="text-sm text-muted-foreground">
                  Permanently remove archived sessions and their messages from your account.
                </p>
              </div>
              <div>
                <Button variant="destructive" onClick={() => { void handleClearArchive() }} disabled={clearing}>
                  {clearing ? 'Clearing...' : 'Clear archived sessions'}
                </Button>
              </div>
            </Card>
          )}

          {showProjectArchiveSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">{highlight('Project archive')}</h2>
                <p className="text-sm text-muted-foreground">
                  Restore or permanently remove archived projects and their sessions.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button className="w-full sm:w-auto" variant="outline" onClick={() => { void loadArchivedProjects() }} disabled={loadingArchived}>
                  {loadingArchived ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading...</> : 'Show archived projects'}
                </Button>
                <Button className="w-full sm:w-auto" variant="destructive" onClick={() => { void handleClearArchivedProjects() }} disabled={clearingProjects}>
                  {clearingProjects ? 'Clearing...' : 'Clear all archived'}
                </Button>
              </div>
              {archivedProjects.length > 0 && (
                <div className="space-y-2">
                  {archivedProjects.map((project) => (
                    <div key={project.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{project.title || project.rootPath || project.id}</p>
                          {project.rootPath && project.title && (
                            <p className="text-xs text-muted-foreground truncate">{project.rootPath}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 h-7 text-xs"
                        onClick={() => { void handleRestoreProject(project.id) }}
                        disabled={restoringId === project.id}
                      >
                        {restoringId === project.id ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <ArchiveRestore className="mr-1.5 h-3 w-3" />
                        )}
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}




          {showChatBehaviorSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">{highlight('Chat behavior')}</h2>
                <p className="text-sm text-muted-foreground">
                  What should happen when you send a message while the agent is still working?
                </p>
              </div>
              <div className="max-w-sm">
                <Label htmlFor="chat-streaming-action" className="mb-1.5 block">Default action while streaming</Label>
                <Select
                  value={chatStreamingAction}
                  onValueChange={(value) => { void onChatStreamingActionChange(value as ChatStreamingAction) }}
                >
                  <SelectTrigger id="chat-streaming-action">
                    <SelectValue placeholder="Choose a default action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="steer">Steer — send immediately as a new user message</SelectItem>
                    <SelectItem value="queue">Queue — queue it until the current turn finishes</SelectItem>
                    <SelectItem value="thread">New thread — start a fresh side thread for it</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Applies to the Enter key and the send button in chat. You can still override the default per message by using the arrow/steer, queue, and new-thread actions in the composer.
                </p>
              </div>
            </Card>
          )}

          {showSpeechSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">{highlight('Spracheingabe (Speech-to-Text)')}</h2>
                <p className="text-sm text-muted-foreground">
                  Wähle aus, wie gesprochene Sprache in Text umgewandelt wird, bevor sie als Nachricht gesendet wird.
                </p>
              </div>
              <div className="max-w-sm">
                <Label htmlFor="stt-provider" className="mb-1.5 block">STT-Anbieter</Label>
                <Select
                  value={sttProvider}
                  onValueChange={(value) => { void onSttProviderChange(value as SttProvider) }}
                >
                  <SelectTrigger id="stt-provider">
                    <SelectValue placeholder="STT-Anbieter wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whisper">Faster Whisper (lokal)</SelectItem>
                    <SelectItem value="gpt">GPT (OpenAI)</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs Scribe</SelectItem>
                    <SelectItem value="wyoming">Wyoming / Whisper (Home Assistant)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {sttProvider === 'whisper' && (
                <div className="max-w-sm space-y-3 border-l-2 border-primary/20 pl-4">
                  <p className="text-xs text-muted-foreground">
                    Uses a local Faster Whisper server for free, offline transcription.
                    Start the server with <code className="rounded bg-muted px-1 py-0.5 text-2xs">python whisper-server/server.py</code> from the gateway package.
                    Optionally set <code className="rounded bg-muted px-1 py-0.5 text-2xs">WHISPER_URL</code> in API keys below (defaults to <code className="rounded bg-muted px-1 py-0.5 text-2xs">http://localhost:8178</code>).
                  </p>
                </div>
              )}
              {sttProvider === 'wyoming' && (
                <div className="max-w-sm space-y-3 border-l-2 border-primary/20 pl-4">
                  <p className="text-xs text-muted-foreground">
                    Configure your Home Assistant Wyoming/Whisper STT integration.
                    Set these values in the API keys section below: <code className="rounded bg-muted px-1 py-0.5 text-2xs">HA_URL</code>, <code className="rounded bg-muted px-1 py-0.5 text-2xs">HA_TOKEN</code>, and optionally <code className="rounded bg-muted px-1 py-0.5 text-2xs">HA_STT_ENTITY</code> (defaults to <code className="rounded bg-muted px-1 py-0.5 text-2xs">stt.faster_whisper</code>).
                  </p>
                </div>
              )}
              {sttProvider === 'gpt' && (
                <div className="max-w-sm space-y-3 border-l-2 border-primary/20 pl-4">
                  <p className="text-xs text-muted-foreground">
                    Uses OpenAI audio transcription. Set <code className="rounded bg-muted px-1 py-0.5 text-2xs">OPENAI_API_KEY</code> and optionally <code className="rounded bg-muted px-1 py-0.5 text-2xs">OPENAI_TRANSCRIBE_MODEL</code> (defaults to <code className="rounded bg-muted px-1 py-0.5 text-2xs">gpt-4o-mini-transcribe</code>).
                  </p>
                </div>
              )}
              {sttProvider === 'elevenlabs' && (
                <div className="max-w-sm space-y-3 border-l-2 border-primary/20 pl-4">
                  <p className="text-xs text-muted-foreground">
                    Uses ElevenLabs Speech to Text. Set <code className="rounded bg-muted px-1 py-0.5 text-2xs">ELEVENLABS_API_KEY</code> and optionally <code className="rounded bg-muted px-1 py-0.5 text-2xs">ELEVENLABS_STT_MODEL</code> (defaults to <code className="rounded bg-muted px-1 py-0.5 text-2xs">scribe_v2</code>) and <code className="rounded bg-muted px-1 py-0.5 text-2xs">ELEVENLABS_LANGUAGE_CODE</code>.
                  </p>
                </div>
              )}
              <div className="max-w-sm space-y-3 border-l-2 border-primary/20 pl-4">
                <p className="text-xs text-muted-foreground">
                  Recognition hint: set <code className="rounded bg-muted px-1 py-0.5 text-2xs">STT_PROMPT</code> in the API keys below to bias transcription toward proper nouns. This fixes mishearings like "Jade" for "Jait". Applies to the voice assistant and GPT/Whisper transcription. Defaults to a built-in Jait hint.
                </p>
              </div>
            </Card>
          )}

          {!showThemeSection && !showUpdateSection && !showDesktopSection && !showGatewaySection && !showArchiveSection && !showProjectArchiveSection && !showSpeechSection && !showChatBehaviorSection && emptyState}
        </TabsContent>

        <TabsContent value="api" className="space-y-6 pb-20">
          {showJaitBackendSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">{highlight('Jait\'s own harness LLM')}</h2>
                <p className="text-sm text-muted-foreground">
                  Configure named inference backends. The model picker combines their catalogues and routes each request to the instance that supplied the model.
                </p>
              </div>
              <div className="max-w-sm">
                <Label htmlFor="jait-backend" className="mb-1.5 block">Fallback backend type</Label>
                <Select
                  value={jaitBackend}
                  onValueChange={(value) => { void onJaitBackendChange(value as JaitBackend) }}
                >
                  <SelectTrigger id="jait-backend">
                    <SelectValue placeholder="Select backend" />
                  </SelectTrigger>
                  <SelectContent>
                    {BACKEND_OPTIONS.map((option) => (
                      <SelectItem key={option.type} value={option.type}>
                        <span className="flex items-center gap-2">
                          <option.icon size={16} className="shrink-0" />
                          <span>{option.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Used for legacy or manually entered model IDs. Models picked from a named instance always route to that exact instance.
                </p>
              </div>
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label>Backend instances</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add any backend type more than once. Each instance contributes its models and keeps its own URL, key, and defaults.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleAddBackendInstance}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
                <div className="space-y-3">
                  {backendInstancesDraft.map((instance) => (
                    <div key={instance.id} className="space-y-3 rounded-md border p-3">
                      <div className="flex items-start gap-2">
                        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                          <Select
                            value={instance.type}
                            onValueChange={(value) => updateBackendInstance(instance.id, { type: value as JaitBackend })}
                          >
                            <SelectTrigger aria-label="Backend type">
                              <SelectValue placeholder="Select backend type" />
                            </SelectTrigger>
                            <SelectContent>
                              {BACKEND_OPTIONS.map((option) => (
                                <SelectItem key={option.type} value={option.type}>
                                  <span className="flex items-center gap-2">
                                    <option.icon size={16} className="shrink-0" />
                                    <span>{option.label}</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            aria-label="Backend instance name"
                            placeholder="Instance name"
                            value={instance.name}
                            onChange={(event) => updateBackendInstance(instance.id, { name: event.target.value })}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${instance.name}`}
                          disabled={backendInstancesDraft.length === 1}
                          onClick={() => setBackendInstancesDraft((instances) => instances.filter((item) => item.id !== instance.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-2 lg:grid-cols-2">
                        <Input
                          aria-label="Backend base URL"
                          placeholder={instance.type ? JAIT_BACKEND_DEFAULT_URLS[instance.type] : 'https://your-backend.example.com/v1'}
                          value={instance.baseUrl}
                          onChange={(event) => updateBackendInstance(instance.id, { baseUrl: event.target.value })}
                        />
                        <Input
                          aria-label="Backend API key"
                          type="password"
                          autoComplete="off"
                          placeholder={instance.type === 'ollama' ? 'API key (optional)' : 'API key'}
                          value={instance.apiKey}
                          onChange={(event) => updateBackendInstance(instance.id, { apiKey: event.target.value })}
                        />
                        <Input
                          aria-label="Default model"
                          placeholder="Default model (optional)"
                          value={instance.model}
                          onChange={(event) => updateBackendInstance(instance.id, { model: event.target.value })}
                        />
                        {instance.type === 'ollama' && (
                          <Input
                            aria-label="Ollama context window"
                            type="number"
                            min={2048}
                            step={1024}
                            inputMode="numeric"
                            placeholder="num_ctx (default 32768)"
                            value={instance.numCtx}
                            onChange={(event) => updateBackendInstance(instance.id, { numCtx: event.target.value })}
                          />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { void handleTestBackendInstance(instance) }}
                          disabled={backendTestingId === instance.id || !instance.type || !instance.baseUrl.trim()}
                        >
                          {backendTestingId === instance.id
                            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            : <Network className="mr-1.5 h-3.5 w-3.5" />}
                          Test connection
                        </Button>
                        {backendTestResults[instance.id] && (
                          <span className={cn('text-sm', backendTestResults[instance.id].ok ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive')}>
                            {backendTestResults[instance.id].message}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {backendInstancesDraft.some((instance) => instance.type === 'omniroute') && (
                  <p className="mt-3 text-xs text-amber-600 dark:text-amber-500">
                    OmniRoute can forward repository content to third-party providers. Review the providers enabled in each router.
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Backend instances are saved together with the other API settings using the page Save button below.
                </p>
              </div>
              <div className="max-w-sm">
                <Label htmlFor="jait-max-rounds" className="mb-1.5 block">Agent checkpoint interval</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="jait-max-rounds"
                    type="number"
                    min={1}
                    max={200}
                    inputMode="numeric"
                    placeholder="64"
                    value={maxRoundsDraft}
                    onChange={(event) => setMaxRoundsDraft(event.target.value)}
                    className="w-28"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { void handleSaveMaxRounds() }}
                    disabled={savingMaxRounds || !maxRoundsDirty}
                  >
                    {savingMaxRounds ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  How often a long-running agent compacts context and reassesses its remaining work. It continues automatically after each checkpoint (default 64). Leave blank to use the gateway default. Max 200.
                </p>
              </div>
            </Card>
          )}
      {filteredApiFields.length > 0 ? (<>
        <p className="text-sm text-muted-foreground">
          Values stored here are user-specific and override environment defaults for your account.
        </p>
        {API_FIELD_GROUPS.map((group) => {
          const groupFields = group.fields.filter((f) => filteredApiFields.includes(f))
          if (groupFields.length === 0) return null
          const GroupIcon = getFieldIcon(groupFields[0] as FieldName)
          return (
            <Collapsible key={group.label} defaultOpen={false}>
              <Card className="p-0 overflow-hidden">
                <CollapsibleTrigger className="flex w-full items-center gap-2 px-5 py-3.5 text-left hover:bg-muted/50 transition-colors group">
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  {GroupIcon ? <GroupIcon size={16} className="text-muted-foreground" /> : <Key className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm font-semibold">{highlight(group.label)}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
                    {groupFields.map((field) => {
                      const secret = isSecretField(field)
                      const shown = !!visible[field]
                      return (
                        <div key={field} className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor={`api-${field}`} className="font-mono text-xs">{highlight(field)}</Label>
                            {renderSourceBadge(field as FieldName)}
                          </div>
                          <div className="relative">
                            <Input
                              id={`api-${field}`}
                              type={secret && !shown ? 'password' : 'text'}
                              value={draft[field] ?? ''}
                              onChange={(event) => {
                                setDraft((prev) => ({ ...prev, [field]: event.target.value }))
                              }}
                              placeholder={envSet[field] ? '(set via .env)' : '(empty)'}
                              className={secret ? 'pr-9' : ''}
                            />
                            {secret && (
                              <button
                                type="button"
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => toggleVisibility(field)}
                                tabIndex={-1}
                                aria-label={shown ? 'Hide value' : 'Show value'}
                              >
                                {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="border-t px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {group.label === 'OmniRoute' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { void handleTestOmniRoute() }}
                            disabled={omniRouteTesting}
                          >
                            {omniRouteTesting
                              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              : <Network className="mr-1.5 h-3.5 w-3.5" />}
                            Test connection
                          </Button>
                          {omniRouteResult && (
                            <span className={cn('text-sm', omniRouteResult.ok ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive')}>
                              {omniRouteResult.message}
                            </span>
                          )}
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { void handleResetProviderModels() }}
                        disabled={resettingModels}
                      >
                        {resettingModels
                          ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                        Reset models
                      </Button>
                      {resetMsg && (
                        <span className={cn('text-sm', resetMsg.startsWith('Failed') ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500')}>
                          {resetMsg}
                        </span>
                      )}
                    </div>
                    {group.label === 'OmniRoute' && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Probed from the gateway, not your browser — that is the connection that
                        actually has to work. Tests the values shown above, saved or not.
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )
        })}
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
            <Button onClick={() => { void handleSave() }} disabled={saving || !isDirty || (backendInstancesDirty && !backendInstancesValid)}>
              {saving ? 'Saving...' : 'Save API settings'}
            </Button>
            <Button variant="ghost" onClick={handleDiscard} disabled={!isDirty}>
              Discard
            </Button>
            {status && <span className="text-sm text-muted-foreground">{status}</span>}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </div>
      </>) : null}
      {showProviderAccountsSection && providerAccountsCard}
      {filteredApiFields.length === 0 && !showJaitBackendSection && !showProviderAccountsSection && emptyState}
        </TabsContent>

        <TabsContent value="tools" className="space-y-6">
      {showToolsSection ? <ToolSettings token={token} /> : emptyState}
        </TabsContent>

        <TabsContent value="extensions" className="space-y-6">
          {showExtensionsSection ? <ExtensionSettings token={token} /> : emptyState}
        </TabsContent>

        <TabsContent value="skills" className="space-y-6">
          {showSkillsSection ? <SkillSettings token={token} /> : emptyState}
        </TabsContent>

        <TabsContent value="email" className="space-y-8">
          <EmailSettings token={token} />
          <CalendarSettings token={token} />
        </TabsContent>

        <TabsContent value="channels" className="space-y-6">
          {showChannelsSection ? <ChannelSettings token={token} /> : emptyState}
        </TabsContent>

        <TabsContent value="shortcuts" className="space-y-6">
          <KeyboardShortcutSettings search={search} />
        </TabsContent>

        <TabsContent value="usage" className="space-y-6">
          <UsageSettings token={token} />
        </TabsContent>

        <TabsContent value="nodes" className="space-y-6">
          <NodesPermissionsTab token={token} />
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
      {showActivitySection && activityEvents && activityEvents.length > 0 && (
        <Card className="p-5 space-y-4">
          <div>
            <h2 className="text-base font-medium">{highlight('Recent activity')}</h2>
            <p className="text-sm text-muted-foreground">
              Recent chat messages and terminal sessions.
            </p>
          </div>
          <ActivityFeed events={activityEvents} />
        </Card>
      )}
      {showActivitySection && (!activityEvents || activityEvents.length === 0) && (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">No recent activity yet.</p>
        </Card>
      )}
      {!showActivitySection && emptyState}
        </TabsContent>

        <TabsContent value="changelog" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-medium">
                <ArrowUpCircle className="h-4 w-4" />
                What&apos;s new
              </h2>
              <p className="text-sm text-muted-foreground">
                Release notes and changes for recent versions.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onCheckChangelog} disabled={releasesLoading} className="w-fit">
              {releasesLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>

          {releasesLoading && !releases ? (
            <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching release notes…
            </Card>
          ) : releases && releases.length > 0 ? (
            <div className="space-y-4">
              {releases.map((release) => (
                <Card key={release.version} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">v{release.version}</h3>
                    {release.version === updateInfo?.latestVersion && (
                      <Badge variant="default" className="text-2xs">latest</Badge>
                    )}
                    {release.version !== updateInfo?.latestVersion && release.version === updateInfo?.currentVersion && (
                      <Badge variant="outline" className="text-2xs">current</Badge>
                    )}
                    {release.url && (
                      <a
                        href={release.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                        GitHub release
                      </a>
                    )}
                  </div>
                  {release.publishedAt && (
                    <p className="text-xs text-muted-foreground">
                      Released {new Date(release.publishedAt).toLocaleDateString()}
                    </p>
                  )}
                  {release.commits.length > 0 ? (
                    <ul className="space-y-1.5">
                      {release.commits.map((commit) => (
                        <li key={commit.sha || commit.message} className="flex items-start gap-2 text-sm">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                          <span className="[overflow-wrap:anywhere]">{commit.message}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No change details available for this release.</p>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">
                No release notes available{updateInfo ? ` for v${updateInfo.currentVersion}` : ''}. Check for updates or refresh to try again.
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
