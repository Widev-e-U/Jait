/**
 * OptionDropdown — shared icon+label+chevron trigger with an icon/label/
 * description option menu. Used by ModeSelector and StyleSelector.
 */

import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'

export interface DropdownOption<T extends string> {
  value: T
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

interface OptionDropdownProps<T extends string> {
  value: T
  options: ReadonlyArray<DropdownOption<T>>
  onChange: (value: T) => void
  fallbackValue: T
  titlePrefix: string
  disabled?: boolean
  className?: string
  compact?: boolean
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom'
  contentClassName?: string
}

export function OptionDropdown<T extends string>({
  value,
  options,
  onChange,
  fallbackValue,
  titlePrefix,
  disabled,
  className,
  compact = false,
  align = 'start',
  side = 'top',
  contentClassName = 'w-64',
}: OptionDropdownProps<T>) {
  const current = options.find((option) => option.value === value) ?? (options.find((option) => option.value === fallbackValue) ?? options[0])
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <TooltipHint content={`${titlePrefix}: ${current.label}`}>
        <button
          type="button"
          className={cn(
            'flex h-10 items-center gap-1 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-muted-foreground sm:h-8 sm:px-1.5 sm:text-xs',
            'hover:text-foreground hover:bg-muted/60 transition-colors',
            'focus-visible:outline-none focus-visible:border-ring/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
        >
          <CurrentIcon className="h-4 w-4" />
          {!compact && <span>{current.label}</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        </TooltipHint>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className={contentClassName}>
        {options.map((option) => {
          const Icon = option.icon
          const isActive = value === option.value
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
              className="flex items-start gap-2.5 py-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
              {isActive && <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}