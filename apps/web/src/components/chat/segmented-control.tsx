/**
 * SegmentedControl — shared sliding-thumb tablist. Used by ViewModeSelector
 * and SendTargetSelector.
 */

import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
  iconOnly?: boolean
  bordered?: boolean
  minOptionWidth?: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  className,
  iconOnly = false,
  bordered = true,
  minOptionWidth = 'min-w-[5.25rem]',
}: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex((option) => option.value === value)
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0
  const count = Math.max(options.length, 1)

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'relative inline-grid h-10 rounded-lg bg-muted/40 p-0.5 sm:h-8',
        bordered ? 'border border-border/70' : 'border-0',
        'shadow-sm transition-colors',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0.5 left-0.5 rounded-md bg-background shadow-sm',
          'transition-transform duration-200 ease-out',
        )}
        style={{ width: `calc(${100 / count}% - 2px)`, transform: `translateX(${safeActiveIndex * 100}%)` }}
      />
      {options.map((option) => {
        const Icon = option.icon
        const isActive = value === option.value
        return (
          <TooltipHint key={option.value} content={`${option.label}: ${option.description}`}>
          <button
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={option.label}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium',
              'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              iconOnly ? 'w-10 sm:w-9' : minOptionWidth,
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {!iconOnly && <span>{option.label}</span>}
          </button>
          </TooltipHint>
        )
      })}
    </div>
  )
}