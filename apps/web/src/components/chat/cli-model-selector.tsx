/**
 * CliModelSelector — dropdown to choose a model when a CLI provider (codex / claude-code) is active.
 * Fetches available models from the gateway via `GET /api/providers/:id/models`.
 * Auto-selects the provider's default model on load.
 */

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { agentsApi, type ProviderId } from '@/lib/agents-api'

interface CliModelSelectorProps {
  provider: ProviderId
  model: string | null
  onChange: (model: string | null) => void
  disabled?: boolean
  className?: string
}

interface ModelDef {
  id: string
  name: string
  description?: string
  isDefault?: boolean
}

export function CliModelSelector({ provider, model, onChange, disabled, className }: CliModelSelectorProps) {
  const [models, setModels] = useState<ModelDef[]>([])
  const [loading, setLoading] = useState(false)
  const fetchedProvider = useRef<string | null>(null)

  useEffect(() => {
    if (provider === 'jait') return
    if (fetchedProvider.current === provider) return
    fetchedProvider.current = provider
    setLoading(true)
    agentsApi.listProviderModels(provider)
      .then((result) => {
        setModels(result)
        // Auto-select the default model if no model is currently selected
        if (!model) {
          const defaultModel = result.find((m) => m.isDefault)
          if (defaultModel) onChange(defaultModel.id)
        }
      })
      .catch(() => setModels([]))
      .finally(() => setLoading(false))
  }, [provider])

  const displayLabel = model
    ? (models.find((m) => m.id === model)?.name ?? model)
    : 'model'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || loading}>
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
            : <span className="font-mono text-[11px]">{displayLabel}</span>
          }
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Model
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {models.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => onChange(m.id)}
            className="flex items-start gap-2 py-1.5 cursor-pointer"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {m.name}
                {m.isDefault && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(default)</span>
                )}
              </div>
              {m.description && (
                <div className="text-[11px] text-muted-foreground leading-snug">{m.description}</div>
              )}
            </div>
            {model === m.id && <Check className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
        {models.length === 0 && !loading && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No models available</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
