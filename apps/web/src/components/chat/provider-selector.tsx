/**
 * ProviderSelector — dropdown to choose the agent provider for chat.
 * Follows the same pattern as ModeSelector.
 */

import { useState, useEffect } from 'react'
import { Bot, ChevronDown, Check, AlertTriangle } from 'lucide-react'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Claude from '@lobehub/icons/es/Claude'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { agentsApi, type ProviderId, type ProviderInfo } from '@/lib/agents-api'

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

/** Turn a long unavailableReason into a short badge label. */
function summariseReason(reason: string): string {
  const lower = reason.toLowerCase()
  if (lower.includes('not installed') || lower.includes('not found')) return 'not installed'
  if (lower.includes('not authenticated') || lower.includes('login')) return 'not authenticated'
  return 'unavailable'
}

export function ProviderSelector({ provider, onChange, disabled, className }: ProviderSelectorProps) {
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderInfo>>({})

  useEffect(() => {
    agentsApi.listProviders()
      .then((providers) => {
        const map: Record<string, ProviderInfo> = {}
        for (const p of providers) map[p.id] = p
        setProviderStatus(map)
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
          const status = providerStatus[p.value]
          const isAvailable = status?.available !== false // default to available if not fetched
          const reason = status?.unavailableReason
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
                    <span className="text-[10px] text-destructive/80 flex items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3" />
                      {reason ? summariseReason(reason) : 'unavailable'}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground leading-snug">
                  {!isAvailable && reason ? reason : p.description}
                </div>
              </div>
              {isActive && <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
