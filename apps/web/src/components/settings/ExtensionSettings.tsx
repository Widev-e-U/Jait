import { useCallback, useEffect, useState } from 'react'
import {
  Search,
  Puzzle,
  RefreshCw,
  AlertCircle,
  Trash2,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { getApiUrl } from '@/lib/gateway-url'
import type { PluginInfo, PluginStatus } from '@jait/shared'

const API_URL = getApiUrl()

// ── Constants ────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PluginStatus, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
  installed: { variant: 'secondary', label: 'installed' },
  enabled: { variant: 'default', label: 'enabled' },
  disabled: { variant: 'outline', label: 'disabled' },
  error: { variant: 'destructive', label: 'error' },
}

function useHeaders(token: string | null) {
  return useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }, [token])
}

// ── Installed sub-view ───────────────────────────────────────────────

function InstalledPlugins({ token }: { token: string | null }) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const headers = useHeaders(token)

  const fetchPlugins = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/plugins`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to load extensions (HTTP ${res.status})`)
      const data: PluginInfo[] = await res.json()
      setPlugins(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load extensions')
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => { void fetchPlugins() }, [fetchPlugins])

  const togglePlugin = useCallback(async (id: string, enable: boolean) => {
    setBusy(id)
    try {
      const action = enable ? 'enable' : 'disable'
      const res = await fetch(`${API_URL}/api/plugins/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        headers: headers(),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Failed to ${action} (HTTP ${res.status})`)
      }
      await fetchPlugins()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }, [headers, fetchPlugins])

  const uninstallPlugin = useCallback(async (id: string) => {
    setBusy(id)
    try {
      const res = await fetch(`${API_URL}/api/plugins/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Failed to uninstall (HTTP ${res.status})`)
      }
      await fetchPlugins()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }, [headers, fetchPlugins])

  const scanPlugins = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/plugins/scan`, {
        method: 'POST',
        headers: headers(),
      })
      if (!res.ok) throw new Error(`Scan failed (HTTP ${res.status})`)
      const data: PluginInfo[] = await res.json()
      setPlugins(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setLoading(false)
    }
  }, [headers])

  const lowerFilter = filter.toLowerCase()
  const filtered = plugins.filter((p) => {
    if (!lowerFilter) return true
    return (
      p.id.toLowerCase().includes(lowerFilter) ||
      p.displayName.toLowerCase().includes(lowerFilter) ||
      (p.description ?? '').toLowerCase().includes(lowerFilter) ||
      (p.author ?? '').toLowerCase().includes(lowerFilter)
    )
  })

  if (loading && plugins.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Loading extensions...</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter extensions..."
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void scanPlugins()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Scan
        </Button>
      </div>

      {error && (
        <Card className="flex items-start gap-2 border-destructive/50 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {filtered.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <Puzzle className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            {plugins.length === 0
              ? 'No extensions installed. Drop plugin folders into ~/.jait/extensions/ and click Scan.'
              : 'No extensions match your filter.'}
          </p>
        </Card>
      )}

      {filtered.map((plugin) => {
        const badge = STATUS_BADGE[plugin.status]
        const isEnabled = plugin.status === 'enabled'
        const isBusy = busy === plugin.id

        return (
          <Card key={plugin.id} className="flex items-start gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Puzzle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{plugin.displayName}</span>
                <Badge variant={badge.variant} className="text-2xs">
                  {badge.label}
                </Badge>
                <span className="text-xs text-muted-foreground">v{plugin.version}</span>
              </div>
              {plugin.description && (
                <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{plugin.description}</p>
              )}
              {plugin.author && (
                <p className="mt-0.5 text-xs text-muted-foreground">by {plugin.author}</p>
              )}
              {plugin.error && (
                <p className="mt-1 text-xs text-destructive">{plugin.error}</p>
              )}
              <p className="mt-0.5 text-2xs text-muted-foreground/60 font-mono">{plugin.id}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Switch
                checked={isEnabled}
                disabled={isBusy}
                onCheckedChange={(checked) => void togglePlugin(plugin.id, checked)}
                aria-label={isEnabled ? 'Disable' : 'Enable'}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                disabled={isBusy}
                onClick={() => void uninstallPlugin(plugin.id)}
                title="Uninstall"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Marketplace sub-view ─────────────────────────────────────────────

interface StorePackage {
  name?: string
  displayName?: string
  description?: string
  version?: string
  type?: string
  author?: string
  downloads?: number
}

function PluginMarketplace({ token }: { token: string | null }) {
  const [packages, setPackages] = useState<StorePackage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const headers = useHeaders(token)

  const fetchPackages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/store/packages?limit=50`, {
        headers: headers(),
      })
      if (!res.ok) throw new Error(`Failed to browse ClawHub (HTTP ${res.status})`)
      const data = await res.json()
      setPackages((data as { items?: StorePackage[] }).items ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace')
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    void fetchPackages()
  }, [fetchPackages])

  return (
    <div className="space-y-4">
      <Card className="bg-muted/30 p-4 text-sm text-muted-foreground">
        Browse OpenClaw plugins on{' '}
        <a
          href="https://clawhub.ai/plugins"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          ClawHub
        </a>
        . To install, download the plugin and place it in{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.jait/extensions/</code>, then
        click Scan on the Installed tab.
      </Card>

      {error && (
        <Card className="flex items-start gap-2 border-destructive/50 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {loading && packages.length === 0 && (
        <Card className="flex items-center justify-center gap-2 p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading from ClawHub...</p>
        </Card>
      )}

      {!loading && packages.length === 0 && (
        <Card className="p-8 text-center">
          <Puzzle className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No packages available.</p>
        </Card>
      )}

      {packages.map((pkg, i) => {
        const name = pkg.displayName ?? pkg.name ?? 'Unknown'
        const desc = pkg.description ?? ''
        const typ = pkg.type ?? 'plugin'

        return (
          <Card key={pkg.name ?? i} className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Puzzle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{name}</span>
                {pkg.version && (
                  <span className="text-xs text-muted-foreground">v{pkg.version}</span>
                )}
                <Badge variant="outline" className="text-2xs">
                  {typ}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{desc}</p>
              {pkg.author && (
                <p className="mt-0.5 text-xs text-muted-foreground">by @{pkg.author}</p>
              )}
            </div>
            <a
              href={`https://clawhub.ai/plugins/${encodeURIComponent(pkg.name ?? '')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <ExternalLink className="mr-1 h-3 w-3" />
                View
              </Button>
            </a>
          </Card>
        )
      })}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────

interface ExtensionSettingsProps {
  token: string | null
}

export function ExtensionSettings({ token }: ExtensionSettingsProps) {
  return (
    <Tabs defaultValue="installed" className="space-y-4">
      <Card className="space-y-3 p-5">
        <div>
          <h2 className="text-base font-medium">Extensions</h2>
          <p className="text-sm text-muted-foreground">
            Manage plugins and extensions. Browse the{' '}
            <a
              href="https://clawhub.ai/plugins"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              ClawHub
            </a>{' '}
            marketplace or drop plugins into{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.jait/extensions/</code>.
          </p>
        </div>
        <TabsList>
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
        </TabsList>
      </Card>

      <TabsContent value="installed" className="mt-0 space-y-4">
        <InstalledPlugins token={token} />
      </TabsContent>

      <TabsContent value="marketplace" className="mt-0 space-y-4">
        <PluginMarketplace token={token} />
      </TabsContent>
    </Tabs>
  )
}
