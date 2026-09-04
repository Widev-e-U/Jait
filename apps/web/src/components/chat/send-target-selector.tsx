import { GitBranch, Infinity, Network } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { SegmentedControl, type SegmentedOption } from '@/components/chat/segmented-control'

export type SendTarget = 'agent' | 'swarm' | 'thread'

interface SendTargetSelectorProps {
  target: SendTarget
  onChange: (target: SendTarget) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

const TARGETS: Array<SegmentedOption<SendTarget>> = [
  {
    value: 'agent',
    label: 'Agent',
    icon: Infinity,
    description: 'Send to the current coding chat session',
  },
  {
    value: 'swarm',
    label: 'Swarm',
    icon: Network,
    description: 'Start visible specialist threads and synthesize their results',
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

  return (
    <SegmentedControl
      value={target}
      options={TARGETS}
      onChange={onChange}
      ariaLabel="Send target"
      disabled={disabled}
      className={className}
      iconOnly={compact || isMobile}
      minOptionWidth="min-w-[5.25rem]"
    />
  )
}