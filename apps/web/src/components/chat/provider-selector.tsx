/**
 * ProviderSelector — dropdown to choose the agent provider for chat.
 * Follows the same pattern as ModeSelector.
 */

import { useState, useEffect } from 'react'
import { Bot, ChevronDown, Check } from 'lucide-react'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Claude from '@lobehub/icons/es/Claude'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { agentsApi, type ProviderId } from '@/lib/agents-api'

interface ProviderSelectorProps {
  provider: ProviderId
  onChange: (provider: ProviderId) => void
  disabled?: boolean
  className?: string
}

/** Wrap @lobehub/icons so they conform to the same {className} interface as lucide icons. */
const OpenAIIcon = ({ className }: { className?: string }) => <OpenAI size={16} className={className} />
const ClaudeIcon = ({ className }: { className?: string }) => <Claude size={16} className={className} />

const PROVIDER_DEFS: Array<{
  value: ProviderId
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}> = [
  {
    value: 'jait',
    label: 'Jait',
    icon: Bot,
    description: 'Native Jait agent loop with full tool access',
  },
  {
    value: 'codex',
    label: 'Codex',
    icon: OpenAIIcon,
    description: 'OpenAI Codex CLI — coding agent with MCP tools',
  },
  {
    value: 'claude-code',
    label: 'Claude Code',
    icon: ClaudeIcon,
    description: 'Anthropic Claude Code CLI — coding agent with MCP tools',
  },
]

export function ProviderSelector({ provider, onChange, disabled, className }: ProviderSelectorProps) {
  const [availability, setAvailability] = useState<Record<string, boolean>>({})

  useEffect(() => {
    agentsApi.listProviders()
      .then((providers) => {
        const map: Record<string, boolean> = {}
        for (const p of providers) map[p.id] = p.available
        setAvailability(map)
      })
      .catch(() => {/* ignore */})
  }, [])

  const current = PROVIDER_DEFS.find((p) => p.value === provider) ?? PROVIDER_DEFS[0]
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground',
            'hover:text-foreground hover:bg-muted/60 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
          title={`Provider: ${current.label}`}
        >
          <CurrentIcon className="h-4 w-4" />
          <span>{current.label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        {PROVIDER_DEFS.map((p) => {
          const Icon = p.icon
          const isActive = provider === p.value
          const isAvailable = availability[p.value] !== false // default to available if not fetched
          return (
            <DropdownMenuItem
              key={p.value}
              onClick={() => onChange(p.value)}
              disabled={!isAvailable}
              className="flex items-start gap-2.5 py-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {p.label}
                  {!isAvailable && (
                    <span className="text-[10px] text-muted-foreground">(unavailable)</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground leading-snug">{p.description}</div>
              </div>
              {isActive && <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
