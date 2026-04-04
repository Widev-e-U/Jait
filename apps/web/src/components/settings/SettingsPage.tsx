import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Key, CheckCircle2, AlertCircle, Loader2, Download, ArrowUpCircle, Home, Search, ArchiveRestore, Folder } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToolSettings } from './ToolSettings'
import { ExtensionSettings } from './ExtensionSettings'
import { SkillSettings } from './SkillSettings'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivityFeed } from '@/components/activity'
import type { WorkspaceRecord } from '@/hooks/useWorkspaces'
import type { ActivityEvent } from '@jait/ui-shared'
import type { SttProvider } from '@/hooks/useAuth'
import type { JaitBackend } from '@/hooks/useAuth'
import { getApiUrl } from '@/lib/gateway-url'
import { highlightSearchMatchHtml } from './settings-search-highlight'
import { getVsCodeThemeSearchTerms } from '@/lib/vscode-theme'
import { importVsCodeThemeFromText, removeVsCodeTheme, setActiveVsCodeTheme, useVsCodeThemeStore } from '@/lib/vscode-theme-store'

import OpenAI from '@lobehub/icons/es/OpenAI'
import Perplexity from '@lobehub/icons/es/Perplexity'
import OpenRouter from '@lobehub/icons/es/OpenRouter'
import XAI from '@lobehub/icons/es/XAI'
import Gemini from '@lobehub/icons/es/Gemini'
import Moonshot from '@lobehub/icons/es/Moonshot'
import Kimi from '@lobehub/icons/es/Kimi'
import Grok from '@lobehub/icons/es/Grok'

interface ApiFieldGroup {
  label: string
  fields: readonly string[]
}

const API_FIELD_GROUPS: ApiFieldGroup[] = [
  { label: 'OpenAI / Jait', fields: ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_WEB_SEARCH_MODEL'] },
  { label: 'Perplexity', fields: ['PERPLEXITY_API_KEY', 'PERPLEXITY_MODEL', 'PERPLEXITY_OPENROUTER_MODEL'] },
  { label: 'OpenRouter', fields: ['OPENROUTER_API_KEY'] },
  { label: 'xAI / Grok', fields: ['XAI_API_KEY', 'GROK_MODEL'] },
  { label: 'Google Gemini', fields: ['GEMINI_API_KEY', 'GEMINI_MODEL'] },
  { label: 'Moonshot / Kimi', fields: ['MOONSHOT_API_KEY', 'KIMI_BASE_URL', 'KIMI_MODEL'] },
  { label: 'Brave Search', fields: ['BRAVE_API_KEY'] },
  { label: 'Speech / Home Assistant', fields: ['WHISPER_URL', 'HA_URL', 'HA_TOKEN', 'HA_STT_ENTITY'] },
]

const API_KEY_FIELDS = API_FIELD_GROUPS.flatMap((g) => g.fields) as unknown as readonly string[]

type FieldName = string

/** Map field prefix → lobe icon component */
const FIELD_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  OPENAI: OpenAI,
  PERPLEXITY: Perplexity,
  OPENROUTER: OpenRouter,
  XAI: XAI,
  GEMINI: Gemini,
  MOONSHOT: Moonshot,
  KIMI: Kimi,
  GROK: Grok,
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

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
}

type SettingsTab = 'general' | 'api' | 'tools' | 'extensions' | 'skills' | 'activity'

interface SettingsPageProps {
  username: string
  token: string | null
  apiKeys: Record<string, string>
  onSaveApiKeys: (next: Record<string, string>) => Promise<void>
  sttProvider: SttProvider
  onSttProviderChange: (next: SttProvider) => Promise<void>
  jaitBackend: JaitBackend
  onJaitBackendChange: (next: JaitBackend) => Promise<void>
  onClearArchive: () => Promise<number>
  onClearArchivedWorkspaces: () => Promise<number>
  onFetchArchivedWorkspaces: () => Promise<WorkspaceRecord[]>
  onRestoreWorkspace: (workspaceId: string) => Promise<boolean>
  activityEvents?: ActivityEvent[]
  updateInfo: UpdateInfo | null
  updateChecking: boolean
  onCheckUpdate: () => void
  onApplyUpdate: () => void
  updateApplying: boolean
  platform: 'web' | 'electron' | 'capacitor'
}

export function SettingsPage({
  username,
  token,
  apiKeys,
  onSaveApiKeys,
  sttProvider,
  onSttProviderChange,
  jaitBackend,
  onJaitBackendChange,
  onClearArchive,
  onClearArchivedWorkspaces,
  onFetchArchivedWorkspaces,
  onRestoreWorkspace,
  activityEvents,
  updateInfo,
  updateChecking,
  onCheckUpdate,
  onApplyUpdate,
  updateApplying,
  platform,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<Record<string, string>>(apiKeys)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearingWorkspaces, setClearingWorkspaces] = useState(false)
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<WorkspaceRecord[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [envSet, setEnvSet] = useState<Record<string, boolean>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { importedThemes, activeTheme } = useVsCodeThemeStore()

  // ── Desktop close-to-tray setting ───────────────────────────────
  const [closeOnWindowClose, setCloseOnWindowClose] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  useEffect(() => {
    if (platform !== 'electron' || !window.jaitDesktop?.getInfo) return
    void window.jaitDesktop.getInfo().then((info) => {
      if (info.appVersion) setAppVersion(info.appVersion)
    })
  }, [platform])
  useEffect(() => {
    if (platform !== 'electron' || !window.jaitDesktop?.getSetting) return
    void window.jaitDesktop.getSetting('closeOnWindowClose', false).then((v) => {
      setCloseOnWindowClose(v === true)
    })
  }, [platform])

  useEffect(() => {
    setDraft(apiKeys)
  }, [apiKeys])

  // Fetch which fields have env values on mount
  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/auth/settings/env-status`, {
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

  const toggleVisibility = useCallback((field: string) => {
    setVisible((prev) => ({ ...prev, [field]: !prev[field] }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      await onSaveApiKeys(draft)
      setStatus('API keys saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API keys')
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

  const handleClearArchivedWorkspaces = async () => {
    setClearingWorkspaces(true)
    setError(null)
    setStatus(null)
    try {
      const removed = await onClearArchivedWorkspaces()
      setArchivedWorkspaces([])
      setStatus(`Cleared ${removed} archived workspace(s).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear archived workspaces')
    } finally {
      setClearingWorkspaces(false)
    }
  }

  const loadArchivedWorkspaces = useCallback(async () => {
    setLoadingArchived(true)
    try {
      const list = await onFetchArchivedWorkspaces()
      setArchivedWorkspaces(list)
    } finally {
      setLoadingArchived(false)
    }
  }, [onFetchArchivedWorkspaces])

  const handleRestoreWorkspace = async (workspaceId: string) => {
    setRestoringId(workspaceId)
    try {
      const ok = await onRestoreWorkspace(workspaceId)
      if (ok) {
        setArchivedWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId))
        setStatus('Workspace restored.')
      } else {
        setError('Failed to restore workspace.')
      }
    } catch {
      setError('Failed to restore workspace.')
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
      return <Badge variant="default" className="text-[10px] px-1.5 py-0">user</Badge>
    }
    if (envHasValue) {
      return <Badge variant="success" className="text-[10px] px-1.5 py-0">.env</Badge>
    }
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">empty</Badge>
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
  const showDesktopSection = platform === 'electron' && matchesSearch(
    'desktop tray close window quit minimize app',
    appVersion,
  )
  const showGatewaySection = platform !== 'web' && matchesSearch(
    'gateway connection url domain ip server host network',
    getApiUrl(),
  )
  const showArchiveSection = matchesSearch(
    'session archive archived clear delete messages history',
  )
  const showWorkspaceArchiveSection = matchesSearch(
    'workspace archive archived clear delete workspaces remove',
  )
  const showJaitBackendSection = matchesSearch(
    'jait backend provider openai openrouter model api llm',
    jaitBackend,
  )
  const showSpeechSection = matchesSearch(
    'speech stt input microphone whisper wyoming home assistant transcription',
    sttProvider,
    draft.WHISPER_URL,
    draft.HA_URL,
    draft.HA_TOKEN,
    draft.HA_STT_ENTITY,
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
  const showThemeSection = matchesSearch(...getVsCodeThemeSearchTerms(), 'import json token colors workbench sidebar tabs')

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
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/70 p-1">
          <TabsTrigger value="general" className="flex-1 sm:flex-none">General</TabsTrigger>
          <TabsTrigger value="api" className="flex-1 sm:flex-none">API</TabsTrigger>
          <TabsTrigger value="tools" className="flex-1 sm:flex-none">Tools</TabsTrigger>
          <TabsTrigger value="extensions" className="flex-1 sm:flex-none">Extensions</TabsTrigger>
          <TabsTrigger value="skills" className="flex-1 sm:flex-none">Skills</TabsTrigger>
          <TabsTrigger value="activity" className="flex-1 sm:flex-none">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
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
                            <Badge variant={isActive ? 'default' : 'outline'} className="h-5 px-1.5 text-[10px]">
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

          {showUpdateSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="flex items-center gap-2 text-base font-medium">
                  <ArrowUpCircle className="h-4 w-4" />
                  {highlight('Software Update')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {updateInfo
                    ? <>Gateway <span className="font-mono font-medium text-foreground">v{updateInfo.currentVersion}</span></>
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
                  <>
                    <Button size="sm" onClick={onApplyUpdate} disabled={updateApplying}>
                      {updateApplying ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                      {updateApplying ? 'Updating...' : `Update gateway to v${updateInfo.latestVersion}`}
                    </Button>
                    {platform === 'electron' ? (
                      <Button size="sm" variant="outline" onClick={async () => {
                        const desktop = (window as any).jaitDesktop
                        const result = await desktop.checkForUpdate()
                        if (result.updateAvailable) {
                          await desktop.downloadUpdate()
                          await desktop.installUpdate()
                        }
                      }}>
                        <Download className="mr-1.5 h-4 w-4" />
                        Update desktop app
                      </Button>
                    ) : platform !== 'web' && (
                      <Button size="sm" variant="outline" asChild>
                        <a href="https://github.com/Widev-e-U/Jait/releases/latest" target="_blank" rel="noopener noreferrer">
                          <Download className="mr-1.5 h-4 w-4" />
                          Download latest APK
                        </a>
                      </Button>
                    )}
                  </>
                )}
              </div>
              {updateInfo && !updateInfo.hasUpdate && (
                <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  You&apos;re on the latest version.
                </p>
              )}
              {updateInfo?.hasUpdate && (
                <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Version {updateInfo.latestVersion} is available{platform !== 'web' ? ' — download from jait.dev' : ''}.
                </p>
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
                Current gateway: <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{getApiUrl()}</code>
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

          {showWorkspaceArchiveSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">{highlight('Workspace archive')}</h2>
                <p className="text-sm text-muted-foreground">
                  Restore or permanently remove archived workspaces and their sessions.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { void loadArchivedWorkspaces() }} disabled={loadingArchived}>
                  {loadingArchived ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading...</> : 'Show archived workspaces'}
                </Button>
                <Button variant="destructive" onClick={() => { void handleClearArchivedWorkspaces() }} disabled={clearingWorkspaces}>
                  {clearingWorkspaces ? 'Clearing...' : 'Clear all archived'}
                </Button>
              </div>
              {archivedWorkspaces.length > 0 && (
                <div className="space-y-2">
                  {archivedWorkspaces.map((workspace) => (
                    <div key={workspace.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{workspace.title || workspace.rootPath || workspace.id}</p>
                          {workspace.rootPath && workspace.title && (
                            <p className="text-xs text-muted-foreground truncate">{workspace.rootPath}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 h-7 text-xs"
                        onClick={() => { void handleRestoreWorkspace(workspace.id) }}
                        disabled={restoringId === workspace.id}
                      >
                        {restoringId === workspace.id ? (
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

          {showJaitBackendSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">{highlight('Jait LLM Backend')}</h2>
                <p className="text-sm text-muted-foreground">
                  Choose which API backend the Jait provider uses for model inference.
                </p>
              </div>
              <div className="max-w-sm">
                <Label htmlFor="jait-backend" className="mb-1.5 block">Backend provider</Label>
                <Select
                  value={jaitBackend}
                  onValueChange={(value) => { void onJaitBackendChange(value as JaitBackend) }}
                >
                  <SelectTrigger id="jait-backend">
                    <SelectValue placeholder="Select backend" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI (direct)</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {jaitBackend === 'openrouter'
                    ? 'Models will be fetched from OpenRouter. Set your OPENROUTER_API_KEY in the API tab.'
                    : 'Uses your OPENAI_API_KEY and OPENAI_BASE_URL.'}
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
                    <SelectItem value="wyoming">Wyoming / Whisper (Home Assistant)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {sttProvider === 'whisper' && (
                <div className="max-w-sm space-y-3 border-l-2 border-primary/20 pl-4">
                  <p className="text-xs text-muted-foreground">
                    Uses a local Faster Whisper server for free, offline transcription.
                    Start the server with <code className="rounded bg-muted px-1 py-0.5 text-[10px]">python whisper-server/server.py</code> from the gateway package.
                    Optionally set <code className="rounded bg-muted px-1 py-0.5 text-[10px]">WHISPER_URL</code> in API keys below (defaults to <code className="rounded bg-muted px-1 py-0.5 text-[10px]">http://localhost:8178</code>).
                  </p>
                </div>
              )}
              {sttProvider === 'wyoming' && (
                <div className="max-w-sm space-y-3 border-l-2 border-primary/20 pl-4">
                  <p className="text-xs text-muted-foreground">
                    Configure your Home Assistant Wyoming/Whisper STT integration.
                    Set these values in the API keys section below: <code className="rounded bg-muted px-1 py-0.5 text-[10px]">HA_URL</code>, <code className="rounded bg-muted px-1 py-0.5 text-[10px]">HA_TOKEN</code>, and optionally <code className="rounded bg-muted px-1 py-0.5 text-[10px]">HA_STT_ENTITY</code> (defaults to <code className="rounded bg-muted px-1 py-0.5 text-[10px]">stt.faster_whisper</code>).
                  </p>
                </div>
              )}
            </Card>
          )}

          {!showThemeSection && !showUpdateSection && !showDesktopSection && !showGatewaySection && !showArchiveSection && !showWorkspaceArchiveSection && !showJaitBackendSection && !showSpeechSection && emptyState}
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
      {filteredApiFields.length > 0 ? (<>
        <p className="text-sm text-muted-foreground">
          Values stored here are user-specific and override environment defaults for your account.
        </p>
        {API_FIELD_GROUPS.map((group) => {
          const groupFields = group.fields.filter((f) => filteredApiFields.includes(f))
          if (groupFields.length === 0) return null
          const GroupIcon = getFieldIcon(groupFields[0] as FieldName)
          return (
            <Card key={group.label} className="p-5 space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                {GroupIcon ? <GroupIcon size={16} className="text-muted-foreground" /> : <Key className="h-4 w-4 text-muted-foreground" />}
                {highlight(group.label)}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
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
            </Card>
          )
        })}
        <div className="flex items-center gap-3">
          <Button onClick={() => { void handleSave() }} disabled={saving}>
            {saving ? 'Saving...' : 'Save API settings'}
          </Button>
          {status && <span className="text-sm text-muted-foreground">{status}</span>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </>) : emptyState}
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
      </Tabs>
    </div>
  )
}
