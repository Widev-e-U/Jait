import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Eye, Shield } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { agentsApi, type ProviderId, type ProviderInfo, type RuntimeMode } from '@/lib/agents-api'

interface ProviderRuntimeSelectorProps {
  provider: ProviderId
  value: RuntimeMode
  onChange: (mode: RuntimeMode) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

const MODE_LABELS: Record<RuntimeMode, { label: string; description: string; icon: typeof Shield }> = {
  'full-access': {
    label: 'Full access',
    description: 'Provider runs without approval prompts when supported.',
    icon: Shield,
  },
  supervised: {
    label: 'Supervised',
    description: 'Provider asks for approvals when it supports them.',
    icon: Eye,
  },
}

export function ProviderRuntimeSelector({ provider, value, onChange, disabled, className, compact = false }: ProviderRuntimeSelectorProps) {
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderInfo>>({})

  useEffect(() => {
    agentsApi.listProviders()
      .then(({ providers }) => {
        const next: Record<string, ProviderInfo> = {}
        for (const item of providers) next[item.id] = item
        setProviderStatus(next)
      })
      .catch(() => {})
  }, [])

  const supportedModes = useMemo<RuntimeMode[]>(() => {
    const modes = providerStatus[provider]?.modes
    if (!modes || modes.length === 0) return provider === 'jait' ? [] : ['full-access', 'supervised']
    return modes as RuntimeMode[]
  }, [provider, providerStatus])

  if (provider === 'jait' || supportedModes.length <= 1) return null

  const activeMode = supportedModes.includes(value) ? value : supportedModes[0]
  const activeDef = MODE_LABELS[activeMode]
  const ActiveIcon = activeDef.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-1 rounded-md border border-transparent px-1.5 py-1 text-xs font-medium text-muted-foreground',
            'hover:text-foreground hover:bg-muted/60 transition-colors',
            'focus-visible:outline-none focus-visible:border-ring/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
          title={`Runtime: ${activeDef.label}`}
          aria-label={`Runtime: ${activeDef.label}`}
        >
          <ActiveIcon className="h-4 w-4" />
          {!compact && <span>{activeDef.label}</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        {supportedModes.map((mode) => {
          const def = MODE_LABELS[mode]
          const Icon = def.icon
          const active = activeMode === mode
          return (
            <DropdownMenuItem key={mode} onClick={() => onChange(mode)} className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{def.label}</div>
                  <div className="text-xs text-muted-foreground">{def.description}</div>
                </div>
              </div>
              {active && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
