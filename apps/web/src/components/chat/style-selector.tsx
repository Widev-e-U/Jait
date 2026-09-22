import { Dumbbell, Feather, MessageSquareText } from 'lucide-react'
import { OptionDropdown, type DropdownOption } from '@/components/chat/option-dropdown'
import type { ResponseStyle } from '@jait/shared'

interface StyleSelectorProps {
  value: ResponseStyle
  onChange: (value: ResponseStyle) => void
  disabled?: boolean
  className?: string
  compact?: boolean
  /** Which side the trigger tooltip opens on. Defaults to "bottom" (composer footer). */
  tooltipSide?: 'top' | 'bottom'
}

const STYLES: Array<DropdownOption<ResponseStyle>> = [
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

export function StyleSelector({ value, onChange, disabled, className, compact = false, tooltipSide = 'bottom' }: StyleSelectorProps) {
  return (
    <OptionDropdown
      value={value}
      options={STYLES}
      onChange={onChange}
      fallbackValue="normal"
      titlePrefix="Style"
      disabled={disabled}
      className={className}
      compact={compact}
      tooltipSide={tooltipSide}
    />
  )
}