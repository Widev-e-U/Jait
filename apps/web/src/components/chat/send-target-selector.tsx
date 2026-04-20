import { GitBranch, Infinity } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'

export type SendTarget = 'agent' | 'thread'

interface SendTargetSelectorProps {
  target: SendTarget
  onChange: (target: SendTarget) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

const TARGETS: Array<{
  value: SendTarget
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}> = [
  {
    value: 'agent',
    label: 'Agent',
    icon: Infinity,
    description: 'Send to the current coding chat session',
  },
  {
    value: 'thread',
    label: 'Thread',
    icon: GitBranch,
    description: 'Create or continue an automation thread for the selected repo',
  },
]

export function SendTargetSelector({ target, onChange, disabled, className, compact = false }: SendTargetSelectorProps) {
  const isMobile = useIsMobile()
  const iconOnly = compact || isMobile
  const activeIndex = TARGETS.findIndex((entry) => entry.value === target)
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0

  return (
    <div
      role="tablist"
      aria-label="Send target"
      className={cn(
        'relative inline-grid h-8 grid-cols-2 rounded-lg border border-border/70 bg-muted/40 p-0.5',
        'shadow-sm transition-colors',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-background shadow-sm transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${safeActiveIndex * 100}%)` }}
      />
      {TARGETS.map((entry) => {
        const Icon = entry.icon
        const isActive = target === entry.value
        return (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={entry.label}
            title={`${entry.label}: ${entry.description}`}
            disabled={disabled}
            onClick={() => onChange(entry.value)}
            className={cn(
              'relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium',
              'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              iconOnly ? 'w-9' : 'min-w-[5.25rem]',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {!iconOnly && <span>{entry.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
