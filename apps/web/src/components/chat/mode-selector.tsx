import { MessageSquare, Infinity, ClipboardList, ChevronDown, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type ChatMode = 'ask' | 'agent' | 'plan'

interface ModeSelectorProps {
  mode: ChatMode
  onChange: (mode: ChatMode) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

const MODES: Array<{
  value: ChatMode
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}> = [
  {
    value: 'ask',
    label: 'Ask',
    icon: MessageSquare,
    description: 'Read-only — questions, explanations, analysis',
  },
  {
    value: 'agent',
    label: 'Agent',
    icon: Infinity,
    description: 'Full agentic — reads, writes, runs commands',
  },
  {
    value: 'plan',
    label: 'Plan',
    icon: ClipboardList,
    description: 'Propose changes — review before executing',
  },
]

export function ModeSelector({ mode, onChange, disabled, className, compact = false }: ModeSelectorProps) {
  const current = MODES.find((m) => m.value === mode) ?? MODES[1]
  const CurrentIcon = current.icon

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
          title={`Mode: ${current.label}`}
        >
          <CurrentIcon className="h-4 w-4" />
          {!compact && <span>{current.label}</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        {MODES.map((m) => {
          const Icon = m.icon
          const isActive = mode === m.value
          return (
            <DropdownMenuItem
              key={m.value}
              onClick={() => onChange(m.value)}
              className="flex items-start gap-2.5 py-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground">{m.description}</div>
              </div>
              {isActive && <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
