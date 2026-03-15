import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, Key, Globe, CheckCircle2, AlertCircle, Loader2, Download, ArrowUpCircle, Home, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToolSettings } from './ToolSettings'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivityFeed } from '@/components/activity'
import type { ActivityEvent } from '@jait/ui-shared'
import type { SttProvider } from '@/hooks/useAuth'
import { getApiUrl, getStoredGatewayUrl, setStoredGatewayUrl } from '@/lib/gateway-url'

import OpenAI from '@lobehub/icons/es/OpenAI'
import Perplexity from '@lobehub/icons/es/Perplexity'
import OpenRouter from '@lobehub/icons/es/OpenRouter'
import XAI from '@lobehub/icons/es/XAI'
import Gemini from '@lobehub/icons/es/Gemini'
import Moonshot from '@lobehub/icons/es/Moonshot'
import Kimi from '@lobehub/icons/es/Kimi'
import Grok from '@lobehub/icons/es/Grok'

const API_KEY_FIELDS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OPENAI_WEB_SEARCH_MODEL',
  'BRAVE_API_KEY',
  'PERPLEXITY_API_KEY',
  'OPENROUTER_API_KEY',
  'XAI_API_KEY',
  'GEMINI_API_KEY',
  'MOONSHOT_API_KEY',
  'KIMI_BASE_URL',
  'KIMI_MODEL',
  'PERPLEXITY_MODEL',
  'PERPLEXITY_OPENROUTER_MODEL',
  'GROK_MODEL',
  'GEMINI_MODEL',
  'WHISPER_URL',
  'HA_URL',
  'HA_TOKEN',
  'HA_STT_ENTITY',
] as const

type FieldName = typeof API_KEY_FIELDS[number]

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

type SettingsTab = 'general' | 'api' | 'tools' | 'activity'

interface SettingsPageProps {
  username: string
  token: string | null
  apiKeys: Record<string, string>
  onSaveApiKeys: (next: Record<string, string>) => Promise<void>
  sttProvider: SttProvider
  onSttProviderChange: (next: SttProvider) => Promise<void>
  onClearArchive: () => Promise<number>
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
  onClearArchive,
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
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [envSet, setEnvSet] = useState<Record<string, boolean>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [search, setSearch] = useState('')

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

  // ── Gateway URL state ────────────────────────────────────────────
  const [gwDraft, setGwDraft] = useState(getStoredGatewayUrl() ?? '')
  const [gwStatus, setGwStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [gwError, setGwError] = useState<string | null>(null)

  const testGatewayUrl = useCallback(async (url: string) => {
    if (!url.trim()) {
      // Reset to default
      setStoredGatewayUrl(null)
      setGwStatus('ok')
      setGwError(null)
      return
    }
    setGwStatus('testing')
    setGwError(null)
    try {
      const target = url.replace(/\/$/, '')
      const res = await fetch(`${target}/health`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStoredGatewayUrl(target)
      setGwStatus('ok')
    } catch (err) {
      setGwStatus('error')
      setGwError(err instanceof Error ? err.message : 'Connection failed')
    }
  }, [])

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
  const showGatewaySection = matchesSearch(
    'gateway connection url domain ip server host network',
    gwDraft,
    getStoredGatewayUrl(),
    getApiUrl(),
  )
  const showArchiveSection = matchesSearch(
    'session archive archived clear delete messages history',
  )
  const showSpeechSection = matchesSearch(
    'speech stt input microphone whisper wyoming browser home assistant transcription',
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
          <TabsTrigger value="activity" className="flex-1 sm:flex-none">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          {showUpdateSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="flex items-center gap-2 text-base font-medium">
                  <ArrowUpCircle className="h-4 w-4" />
                  Software Update
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
                    {platform !== 'web' && (
                      <Button size="sm" variant="outline" asChild>
                        <a href="https://github.com/JakobWl/Jait/releases/latest" target="_blank" rel="noopener noreferrer">
                          <Download className="mr-1.5 h-4 w-4" />
                          Download latest {platform === 'capacitor' ? 'APK' : 'desktop app'}
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
                <h2 className="text-base font-medium">Desktop</h2>
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
                <h2 className="flex items-center gap-2 text-base font-medium">
                  <Globe className="h-4 w-4" />
                  Gateway connection
                </h2>
                <p className="text-sm text-muted-foreground">
                  Configure the IP address or domain of your Jait gateway. Leave empty to use the default.
                </p>
              </div>
              <div className="max-w-2xl space-y-2">
                <Label htmlFor="gateway-url" className="mb-1.5 block">Gateway URL</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="gateway-url"
                    type="url"
                    value={gwDraft}
                    onChange={(e) => { setGwDraft(e.target.value); setGwStatus('idle') }}
                    placeholder={getApiUrl()}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={() => { void testGatewayUrl(gwDraft) }}
                    disabled={gwStatus === 'testing'}
                    className="shrink-0"
                  >
                    {gwStatus === 'testing' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : 'Test & save'}
                  </Button>
                </div>
                {gwStatus === 'ok' && (
                  <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {gwDraft.trim() ? 'Connected — gateway URL saved.' : 'Reset to default.'}
                  </p>
                )}
                {gwStatus === 'error' && gwError && (
                  <p className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {gwError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Current: <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{getApiUrl()}</code>
                  {getStoredGatewayUrl() && (
                    <button
                      type="button"
                      className="ml-2 text-xs text-muted-foreground underline hover:text-foreground"
                      onClick={() => { setGwDraft(''); setStoredGatewayUrl(null); setGwStatus('idle') }}
                    >
                      Reset to default
                    </button>
                  )}
                </p>
              </div>
            </Card>
          )}

          {showArchiveSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">Session archive</h2>
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

          {showSpeechSection && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-base font-medium">Spracheingabe (Speech-to-Text)</h2>
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
                    <SelectItem value="simulated">Simuliert (Eingabe-Prompt)</SelectItem>
                    <SelectItem value="browser">Browser (Web Speech API)</SelectItem>
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

          {!showUpdateSection && !showDesktopSection && !showGatewaySection && !showArchiveSection && !showSpeechSection && emptyState}
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
      {filteredApiFields.length > 0 ? (
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-medium">API keys and provider settings</h2>
          <p className="text-sm text-muted-foreground">
            Values stored here are user-specific and override environment defaults for your account.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {filteredApiFields.map((field) => {
            const IconComponent = getFieldIcon(field)
            const secret = isSecretField(field)
            const shown = !!visible[field]

            return (
              <div key={field} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  {IconComponent ? (
                    <IconComponent size={14} className="shrink-0 text-muted-foreground" />
                  ) : (
                    <Key className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <Label htmlFor={`api-${field}`} className="font-mono text-xs">{field}</Label>
                  {renderSourceBadge(field)}
                </div>
                <div className="relative">
                  <Input
                    id={`api-${field}`}
                    type={secret && !shown ? 'password' : 'text'}
                    value={draft[field] ?? ''}
                    onChange={(event) => {
                      const next = event.target.value
                      setDraft((prev) => ({ ...prev, [field]: next }))
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
        <div className="flex items-center gap-3">
          <Button onClick={() => { void handleSave() }} disabled={saving}>
            {saving ? 'Saving...' : 'Save API settings'}
          </Button>
          {status && <span className="text-sm text-muted-foreground">{status}</span>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>
      ) : emptyState}
        </TabsContent>

        <TabsContent value="tools" className="space-y-6">
      {showToolsSection ? <ToolSettings token={token} /> : emptyState}
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
      {showActivitySection && activityEvents && activityEvents.length > 0 && (
        <Card className="p-5 space-y-4">
          <div>
            <h2 className="text-base font-medium">Recent activity</h2>
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
