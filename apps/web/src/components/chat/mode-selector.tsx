import { MessageSquare, Bot, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChatMode = 'ask' | 'agent' | 'plan'

interface ModeSelectorProps {
  mode: ChatMode
  onChange: (mode: ChatMode) => void
  disabled?: boolean
  className?: string
}

const MODES: Array<{
  value: ChatMode
  label: string
  shortLabel: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}> = [
  {
    value: 'ask',
    label: 'Ask',
    shortLabel: 'Ask',
    icon: MessageSquare,
    description: 'Read-only — questions, explanations, analysis',
  },
  {
    value: 'agent',
    label: 'Agent',
    shortLabel: 'Agent',
    icon: Bot,
    description: 'Full agentic — reads, writes, runs commands',
  },
  {
    value: 'plan',
    label: 'Plan',
    shortLabel: 'Plan',
    icon: ClipboardList,
    description: 'Propose changes — review before executing',
  },
]

export function ModeSelector({ mode, onChange, disabled, className }: ModeSelectorProps) {
  return (
    <div className={cn('flex items-center gap-0.5 rounded-lg bg-muted p-0.5', className)}>
      {MODES.map((m) => {
        const Icon = m.icon
        const isActive = mode === m.value
        return (
          <button
            key={m.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
            )}
            title={m.description}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{m.shortLabel}</span>
          </button>
        )
      })}
    </div>
  )
}
