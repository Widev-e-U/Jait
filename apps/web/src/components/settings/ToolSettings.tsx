import { useCallback, useEffect, useState } from 'react'
import { Search, Shield, Puzzle, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Types ────────────────────────────────────────────────────────────

interface ToolInfo {
  name: string
  description: string
  tier: 'core' | 'standard' | 'external'
  category: string
  source: 'builtin' | 'mcp'
  enabled: boolean
  locked: boolean
}

interface ToolSettingsProps {
  token: string | null
}

// ── Constants ────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'warning'; label: string }> = {
  core: { variant: 'default', label: 'core' },
  standard: { variant: 'secondary', label: 'standard' },
  external: { variant: 'warning', label: 'external' },
}

const CATEGORY_ORDER = [
  'meta',
  'terminal',
  'filesystem',
  'os',
  'agent',
  'browser',
  'web',
  'surfaces',
  'scheduler',
  'memory',
  'voice',
  'screen',
  'gateway',
  'external',
] as const

// ── Component ────────────────────────────────────────────────────────

export function ToolSettings({ token }: ToolSettingsProps) {
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  // Fetch tool list on mount
  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/auth/settings/tools`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { tools: ToolInfo[] }
          setTools(data.tools)
        }
      } catch {
        if (!cancelled) setError('Failed to load tools')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const toggleTool = useCallback(
    async (toolName: string, enabled: boolean) => {
      if (!token) return

      // Optimistic update
      setTools((prev) =>
        prev.map((t) => (t.name === toolName ? { ...t, enabled } : t)),
      )

      setSaving(true)
      setError(null)

      try {
        const disabledTools = tools
          .map((t) => (t.name === toolName ? { ...t, enabled } : t))
          .filter((t) => !t.enabled && !t.locked)
          .map((t) => t.name)

        const res = await fetch(`${API_URL}/auth/settings/tools`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ disabled_tools: disabledTools }),
        })

        if (!res.ok) {
          throw new Error('Failed to save')
        }
      } catch {
        // Revert on failure
        setTools((prev) =>
          prev.map((t) => (t.name === toolName ? { ...t, enabled: !enabled } : t)),
        )
        setError('Failed to update tool setting')
      } finally {
        setSaving(false)
      }
    },
    [token, tools],
  )

  // Group tools by category
  const grouped = new Map<string, ToolInfo[]>()
  const filtered = filter.trim().toLowerCase()
  for (const tool of tools) {
    if (filtered) {
      const haystack = `${tool.name} ${tool.description} ${tool.category}`.toLowerCase()
      if (!haystack.includes(filtered)) continue
    }
    const cat = tool.category
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(tool)
  }

  // Sort categories by defined order
  const sortedCategories = [...grouped.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number])
    const bi = CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number])
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  const stats = {
    total: tools.length,
    enabled: tools.filter((t) => t.enabled).length,
    core: tools.filter((t) => t.tier === 'core').length,
    standard: tools.filter((t) => t.tier === 'standard').length,
    external: tools.filter((t) => t.tier === 'external').length,
  }

  if (loading) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Loading tools...</p>
      </Card>
    )
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="text-base font-medium">Tools</h2>
        <p className="text-sm text-muted-foreground">
          Manage which tools are available to the AI agent.
          Core tools are always enabled. Standard tools can be toggled. External (MCP) tools are discovered on demand.
        </p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Shield className="h-3.5 w-3.5" />
          {stats.core} core
        </span>
        <span className="flex items-center gap-1">
          <Wrench className="h-3.5 w-3.5" />
          {stats.standard} standard
        </span>
        <span className="flex items-center gap-1">
          <Puzzle className="h-3.5 w-3.5" />
          {stats.external} external
        </span>
        <span className="ml-auto">
          {stats.enabled}/{stats.total} enabled
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter tools..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Tool list grouped by category */}
      <div className="space-y-5">
        {sortedCategories.map((category) => {
          const items = grouped.get(category)!
          return (
            <div key={category}>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {items.map((tool) => {
                  const tierInfo = TIER_BADGE[tool.tier] ?? TIER_BADGE.standard
                  return (
                    <div
                      key={tool.name}
                      className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <Switch
                        checked={tool.enabled}
                        onCheckedChange={(checked) => { void toggleTool(tool.name, checked) }}
                        disabled={tool.locked || saving}
                        aria-label={`Toggle ${tool.name}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{tool.name}</span>
                          <Badge
                            variant={tierInfo.variant}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {tierInfo.label}
                          </Badge>
                          {tool.source === 'mcp' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              MCP
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {sortedCategories.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {filtered ? 'No tools match your filter.' : 'No tools available.'}
          </p>
        )}
      </div>
    </Card>
  )
}
