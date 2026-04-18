import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Search,
  BookOpen,
  AlertCircle,
  Download,
  Star,
  Check,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { getApiUrl } from '@/lib/gateway-url'
import type { SkillInfo } from '@jait/shared'

const API_URL = getApiUrl()

// ── Helpers ──────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

const SOURCE_BADGE: Record<
  string,
  { variant: 'default' | 'secondary' | 'outline'; label: string }
> = {
  bundled: { variant: 'default', label: 'bundled' },
  user: { variant: 'secondary', label: 'user' },
  workspace: { variant: 'outline', label: 'workspace' },
  plugin: { variant: 'secondary', label: 'plugin' },
}

function useHeaders(token: string | null) {
  return useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }, [token])
}

// ── Installed sub-view ───────────────────────────────────────────────

function InstalledSkills({ token }: { token: string | null }) {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const headers = useHeaders(token)

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/skills`, { headers: headers() })
      if (!res.ok) throw new Error(`Failed to load skills (HTTP ${res.status})`)
      const data: SkillInfo[] = await res.json()
      setSkills(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    void fetchSkills()
  }, [fetchSkills])

  const toggleSkill = useCallback(
    async (id: string, enabled: boolean) => {
      setBusy(id)
      try {
        const res = await fetch(
          `${API_URL}/api/skills/${encodeURIComponent(id)}`,
          { method: 'PATCH', headers: headers(), body: JSON.stringify({ enabled }) },
        )
        if (!res.ok) throw new Error(`Failed to update skill (HTTP ${res.status})`)
        setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)))
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Action failed')
      } finally {
        setBusy(null)
      }
    },
    [headers],
  )

  const lowerFilter = filter.toLowerCase()
  const filtered = skills.filter((s) => {
    if (!lowerFilter) return true
    return (
      s.id.toLowerCase().includes(lowerFilter) ||
      s.name.toLowerCase().includes(lowerFilter) ||
      s.description.toLowerCase().includes(lowerFilter) ||
      s.source.includes(lowerFilter)
    )
  })

  if (loading && skills.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Loading skills...</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter installed skills..."
          className="pl-9"
        />
      </div>

      {error && (
        <Card className="flex items-start gap-2 border-destructive/50 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {filtered.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            {skills.length === 0
              ? 'No skills discovered. Install from the Marketplace or create a SKILL.md in ~/.jait/skills/.'
              : 'No skills match your filter.'}
          </p>
        </Card>
      )}

      {filtered.map((skill) => {
        const badge = SOURCE_BADGE[skill.source] ?? SOURCE_BADGE.user
        const isBusy = busy === skill.id
        return (
          <Card key={skill.id} className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{skill.name}</span>
                <Badge variant={badge.variant} className="text-2xs">
                  {badge.label}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                {skill.description}
              </p>
              <p className="mt-0.5 text-2xs text-muted-foreground/60 font-mono truncate">
                {skill.filePath}
              </p>
            </div>
            <Switch
              checked={skill.enabled}
              disabled={isBusy}
              onCheckedChange={(checked) => void toggleSkill(skill.id, checked)}
              aria-label={skill.enabled ? 'Disable' : 'Enable'}
              className="shrink-0"
            />
          </Card>
        )
      })}
    </div>
  )
}

// ── Marketplace sub-view ─────────────────────────────────────────────

interface StoreSkill {
  slug?: string
  displayName?: string
  summary?: string | null
  version?: string | null
  score?: number
  updatedAt?: number
  installed?: boolean
  stats?: { downloads?: number; stars?: number }
  latestVersion?: { version: string }
}

function SkillMarketplace({ token }: { token: string | null }) {
  const [results, setResults] = useState<StoreSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('tool workflow agent')
  const [installing, setInstalling] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const headers = useHeaders(token)

  const fetchStore = useCallback(
    async (search?: string, cat?: string) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (search) params.set('q', search)
        else params.set('sort', cat ?? 'tool workflow agent')
        params.set('limit', '25')
        const res = await fetch(`${API_URL}/api/store/skills?${params}`, {
          headers: headers(),
        })
        if (!res.ok) throw new Error(`Failed to browse ClawHub (HTTP ${res.status})`)
        const data = await res.json()
        setResults((data as { results?: StoreSkill[] }).results ?? [])
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load marketplace')
      } finally {
        setLoading(false)
      }
    },
    [headers],
  )

  useEffect(() => {
    void fetchStore(undefined, category)
  }, [fetchStore, category])

  const onSearch = useCallback(
    (value: string) => {
      setQuery(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        void fetchStore(value || undefined, category)
      }, 400)
    },
    [fetchStore, category],
  )

  const install = useCallback(
    async (slug: string) => {
      setInstalling(slug)
      setError(null)
      try {
        const res = await fetch(
          `${API_URL}/api/store/skills/${encodeURIComponent(slug)}/install`,
          {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({}),
          },
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(
            (body as { error?: string }).error ?? `Install failed (HTTP ${res.status})`,
          )
        }
        setResults((prev) =>
          prev.map((r) => (r.slug === slug ? { ...r, installed: true } : r)),
        )
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Install failed')
      } finally {
        setInstalling(null)
      }
    },
    [headers],
  )

  return (
    <div className="space-y-4">
      {/* Search + sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search ClawHub skills..."
            className="pl-9"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="tool workflow agent">Popular</option>
          <option value="memory learning self-improving">Memory</option>
          <option value="search web browser automation">Search</option>
          <option value="git github code development">Development</option>
          <option value="calendar slack obsidian productivity">Productivity</option>
        </select>
      </div>

      {error && (
        <Card className="flex items-start gap-2 border-destructive/50 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {loading && results.length === 0 && (
        <Card className="flex items-center justify-center gap-2 p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading from ClawHub...</p>
        </Card>
      )}

      {!loading && results.length === 0 && (
        <Card className="p-8 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            {query ? 'No skills match your search.' : 'No skills available.'}
          </p>
        </Card>
      )}

      {/* Results */}
      {results.map((skill) => {
        const slug = skill.slug ?? ''
        const name = skill.displayName ?? slug
        const desc = skill.summary ?? ''
        const version = skill.latestVersion?.version ?? skill.version ?? ''
        const stars = skill.stats?.stars ?? 0
        const downloads = skill.stats?.downloads ?? 0
        const isInstalled = skill.installed === true
        const isInstalling = installing === slug

        return (
          <Card key={slug} className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{name}</span>
                {version && (
                  <span className="text-xs text-muted-foreground">v{version}</span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{desc}</p>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                {stars > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Star className="h-3 w-3" />
                    {formatCount(stars)}
                  </span>
                )}
                {downloads > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Download className="h-3 w-3" />
                    {formatCount(downloads)}
                  </span>
                )}
                <a
                  href={`https://clawhub.ai/skills?focus=search&q=${encodeURIComponent(slug)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-0.5 hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  ClawHub
                </a>
              </div>
            </div>

            <div className="shrink-0">
              {isInstalled ? (
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1 text-2xs"
                >
                  <Check className="h-3 w-3" />
                  Installed
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isInstalling}
                  onClick={() => void install(slug)}
                  className="h-7 text-xs"
                >
                  {isInstalling ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3 w-3" />
                  )}
                  Install
                </Button>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────

interface SkillSettingsProps {
  token: string | null
}

export function SkillSettings({ token }: SkillSettingsProps) {
  return (
    <Tabs defaultValue="installed" className="space-y-4">
      <Card className="space-y-3 p-5">
        <div>
          <h2 className="text-base font-medium">Skills</h2>
          <p className="text-sm text-muted-foreground">
            Specialized instruction sets that teach the AI how to use specific tools and
            workflows. Install from{' '}
            <a
              href="https://clawhub.ai/skills"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              ClawHub
            </a>{' '}
            or place SKILL.md files in{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.jait/skills/</code>.
          </p>
        </div>
        <TabsList>
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
        </TabsList>
      </Card>

      <TabsContent value="installed" className="mt-0 space-y-4">
        <InstalledSkills token={token} />
      </TabsContent>

      <TabsContent value="marketplace" className="mt-0 space-y-4">
        <SkillMarketplace token={token} />
      </TabsContent>
    </Tabs>
  )
}
