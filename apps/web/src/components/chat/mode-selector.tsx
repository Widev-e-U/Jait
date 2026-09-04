import { MessageSquare, Infinity, ClipboardList } from 'lucide-react'
import { OptionDropdown, type DropdownOption } from '@/components/chat/option-dropdown'

export type ChatMode = 'ask' | 'agent' | 'swarm' | 'plan'

interface ModeSelectorProps {
  mode: ChatMode
  onChange: (mode: ChatMode) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

const MODES: Array<DropdownOption<ChatMode>> = [
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
  return (
    <OptionDropdown
      value={mode}
      options={MODES}
      onChange={onChange}
      fallbackValue="agent"
      titlePrefix="Mode"
      disabled={disabled}
      className={className}
      compact={compact}
    />
  )
}