/**
 * CliModelSelector — searchable model picker with recent models.
 * Uses a Popover with inline search. Shows up to 5 recent models first.
 * Fetches available models from the gateway via `GET /api/providers/:id/models`.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { Bot, ChevronDown, Check, Loader2, Clock, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { agentsApi, type ProviderId } from '@/lib/agents-api'

interface CliModelSelectorProps {
  provider: ProviderId
  model: string | null
  onChange: (model: string | null) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

interface ModelDef {
  id: string
  name: string
  description?: string
  isDefault?: boolean
}

const RECENT_MODELS_KEY = 'jait-recent-models'
const MAX_RECENTS = 5

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

export function CliModelSelector({ provider, model, onChange, disabled, className, compact = false }: CliModelSelectorProps) {
  const [models, setModels] = useState<ModelDef[]>([])
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setModels([])
    setRecentIds(loadRecentModels())

    let cancelled = false
    setLoading(true)
    agentsApi.listProviderModels(provider)
      .then((result) => {
        if (!cancelled) {
          setModels(result.models)
          if (result.recentModels?.length) {
            setRecentIds(result.recentModels)
          }
        }
      })
      .catch(() => {
        if (!cancelled) setModels([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [provider])

  useEffect(() => {
    if (loading || models.length === 0) return
    if (model && models.some((entry) => entry.id === model)) return

    const defaultModel = models.find((entry) => entry.isDefault) ?? models[0] ?? null
    const nextModel = defaultModel?.id ?? null
    if (nextModel !== model) {
      onChange(nextModel)
    }
  }, [provider, loading, model, models, onChange])

  // Focus search input when popover opens
  useEffect(() => {
    if (open) {
      setSearch('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const handleSelect = (modelId: string) => {
    onChange(modelId)
    saveRecentModel(modelId)
    setRecentIds(loadRecentModels())
    setOpen(false)
  }

  const searchLower = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!searchLower) return models
    return models.filter((m) =>
      m.id.toLowerCase().includes(searchLower)
      || m.name.toLowerCase().includes(searchLower)
      || m.description?.toLowerCase().includes(searchLower),
    )
  }, [models, searchLower])

  const recentModels = useMemo(() => {
    if (searchLower) return [] // hide recents when searching
    const modelMap = new Map(models.map((m) => [m.id, m]))
    return recentIds
      .filter((id) => modelMap.has(id))
      .map((id) => modelMap.get(id)!)
      .slice(0, MAX_RECENTS)
  }, [models, recentIds, searchLower])

  // Models that aren't in recents (to avoid duplication)
  const nonRecentFiltered = useMemo(() => {
    if (searchLower) return filtered // show all when searching
    const recentSet = new Set(recentModels.map((m) => m.id))
    return filtered.filter((m) => !recentSet.has(m.id))
  }, [filtered, recentModels, searchLower])

  const displayLabel = model
    ? (models.find((m) => m.id === model)?.name ?? model)
    : 'model'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled || loading}>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground',
            'hover:text-foreground hover:bg-muted/60 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
          title={`Model: ${model ?? 'none'}`}
        >
          {loading
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : compact
              ? <Bot className="h-3.5 w-3.5" />
              : <span className="font-mono text-[11px] truncate max-w-[140px]">{displayLabel}</span>
          }
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-0">
        {/* Search input */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-64 overflow-y-auto p-1">
          {/* Recent models section */}
          {recentModels.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Recent</span>
              </div>
              {recentModels.map((m) => (
                <ModelItem key={`recent-${m.id}`} model={m} selected={model === m.id} onSelect={handleSelect} />
              ))}
              <div className="mx-2 my-1 border-t" />
            </>
          )}

          {/* All models / filtered results */}
          {!searchLower && recentModels.length > 0 && (
            <div className="px-2 py-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">All models</span>
            </div>
          )}
          {nonRecentFiltered.map((m) => (
            <ModelItem key={m.id} model={m} selected={model === m.id} onSelect={handleSelect} />
          ))}

          {filtered.length === 0 && !loading && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {search ? `No models matching "${search}"` : 'No models available'}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ModelItem({ model: m, selected, onSelect }: { model: ModelDef; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(m.id)}
      className={cn(
        'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left',
        'hover:bg-accent hover:text-accent-foreground cursor-pointer',
        'transition-colors',
        selected && 'bg-accent/50',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {m.name}
          {m.isDefault && (
            <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(default)</span>
          )}
        </div>
        {m.description && (
          <div className="text-[11px] text-muted-foreground leading-snug truncate">{m.description}</div>
        )}
      </div>
      {selected && <Check className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />}
    </button>
  )
}
