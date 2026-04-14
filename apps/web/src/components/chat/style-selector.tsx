import { Check, ChevronDown, Dumbbell, Feather, MessageSquareText } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ResponseStyle } from '@jait/shared'

interface StyleSelectorProps {
  value: ResponseStyle
  onChange: (value: ResponseStyle) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

const STYLES: Array<{
  value: ResponseStyle
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}> = [
  {
    value: 'normal',
    label: 'Normal',
    icon: MessageSquareText,
    description: 'Default Jait tone with normal explanatory prose',
  },
  {
    value: 'simple',
    label: 'Simple',
    icon: Feather,
    description: 'Shorter, cleaner, less filler. Keep normal grammar.',
  },
  {
    value: 'caveman',
    label: 'Caveman',
    icon: Dumbbell,
    description: 'Terse fragments, minimal filler, exact technical meaning.',
  },
  {
    value: 'caveman-ultra',
    label: 'Caveman Ultra',
    icon: Dumbbell,
    description: 'Maximum compression. Use when shortness matters most.',
  },
]

export function StyleSelector({ value, onChange, disabled, className, compact = false }: StyleSelectorProps) {
  const current = STYLES.find((style) => style.value === value) ?? STYLES[0]
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground',
            'hover:text-foreground hover:bg-muted/60 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
          title={`Style: ${current.label}`}
        >
          <CurrentIcon className="h-4 w-4" />
          {!compact && <span>{current.label}</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        {STYLES.map((style) => {
          const Icon = style.icon
          const isActive = value === style.value
          return (
            <DropdownMenuItem
              key={style.value}
              onClick={() => onChange(style.value)}
              className="flex items-start gap-2.5 py-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{style.label}</div>
                <div className="text-xs text-muted-foreground">{style.description}</div>
              </div>
              {isActive && <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
