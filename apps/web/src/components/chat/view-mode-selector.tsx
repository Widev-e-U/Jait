/**
 * ViewModeSelector — Developer / Manager mode toggle.
 *
 * Placed in the PromptInput bottom bar. Switches the entire UI
 * context between Developer (chat) mode and Manager (automation) mode.
 */

import { Code, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ViewMode = 'developer' | 'manager'

interface ViewModeSelectorProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

const MODES: Array<{
  value: ViewMode
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}> = [
  {
    value: 'developer',
    label: 'Developer',
    icon: Code,
    description: 'Chat with the AI assistant — ask, plan, and execute',
  },
  {
    value: 'manager',
    label: 'Manager',
    icon: Users,
    description: 'Automation — delegate tasks to agent threads on repos',
  },
]

export function ViewModeSelector({ mode, onChange, disabled, className, compact = false }: ViewModeSelectorProps) {
  const activeIndex = MODES.findIndex((m) => m.value === mode)
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0

  return (
    <div
      role="tablist"
      aria-label="View mode"
      className={cn(
        'relative inline-grid h-8 grid-cols-2 rounded-lg border border-border/70 bg-muted/40 p-0.5',
        'shadow-sm transition-colors',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-background shadow-sm',
          'transition-transform duration-200 ease-out',
        )}
        style={{ transform: `translateX(${safeActiveIndex * 100}%)` }}
      />
      {MODES.map((m) => {
        const Icon = m.icon
        const isActive = mode === m.value
        return (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={m.label}
            title={`${m.label}: ${m.description}`}
            disabled={disabled}
            onClick={() => onChange(m.value)}
            className={cn(
              'relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium',
              'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              compact ? 'w-9' : 'min-w-[5.75rem]',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {!compact && <span>{m.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
