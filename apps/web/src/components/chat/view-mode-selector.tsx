import { Code, Users } from 'lucide-react'
import { SegmentedControl, type SegmentedOption } from '@/components/chat/segmented-control'

export type ViewMode = 'developer' | 'manager'

interface ViewModeSelectorProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

const MODES: Array<SegmentedOption<ViewMode>> = [
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
  return (
    <SegmentedControl
      value={mode}
      options={MODES}
      onChange={onChange}
      ariaLabel="View mode"
      disabled={disabled}
      className={className}
      iconOnly={compact}
      bordered={!compact}
      minOptionWidth="min-w-[5.75rem]"
    />
  )
}