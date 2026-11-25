import { useEffect, useState } from 'react'
import { Check, CheckCheck, Clock, TriangleAlert } from 'lucide-react'
import { deliveryAdvances, type DeliveryState } from '@jait/shared'
import { TooltipHint } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type { DeliveryState }

const STEPS: DeliveryState[] = ['sending', 'sent', 'received', 'read']

const LABELS: Record<DeliveryState, string> = {
  sending: 'Pending delivery',
  sent: 'Accepted by Jait',
  received: 'Received',
  read: 'Read',
  failed: 'Could not be sent',
}

/**
 * Shows a real delivery state one step at a time. Providers can move through
 * sent, received and read within a few milliseconds, so each forward step stays
 * visible for `stepMs` before the next one. Regressions and failures show at once.
 */
export function useSteppedDeliveryState(target: DeliveryState, stepMs = 450): DeliveryState {
  const [shown, setShown] = useState<DeliveryState>(target)
  useEffect(() => {
    if (target === shown) return
    if (!deliveryAdvances(shown, target)) { setShown(target); return }
    const next = STEPS[Math.max(0, STEPS.indexOf(shown) + 1)]!
    const timer = window.setTimeout(() => setShown(next), stepMs)
    return () => window.clearTimeout(timer)
  }, [target, shown, stepMs])
  return shown
}

/** The one send indicator: clock, one check, two grey checks, two blue checks. */
export function DeliveryIndicator({ state, label, className, iconClassName, testId, tooltip = true }: {
  state: DeliveryState
  /** Overrides the default accessible/tooltip text, e.g. to say who received it. */
  label?: string
  className?: string
  iconClassName?: string
  testId?: string
  tooltip?: boolean
}) {
  const text = label ?? LABELS[state]
  const icon = cn('h-3.5 w-3.5', iconClassName)
  const glyph = state === 'failed' ? <TriangleAlert aria-hidden="true" className={icon} />
    : state === 'sending' ? <Clock aria-hidden="true" className={icon} />
    : state === 'sent' ? <Check aria-hidden="true" className={icon} />
    : <CheckCheck aria-hidden="true" className={icon} />
  const body = (
    <span
      role="img"
      aria-label={text}
      className={cn('inline-flex shrink-0 items-center justify-center', state === 'read' ? 'text-blue-500' : state === 'failed' ? 'text-destructive' : state === 'sending' ? 'text-muted-foreground' : 'text-gray-400', className)}
      data-testid={testId}
      data-send-state={state}
    >
      {glyph}
    </span>
  )
  return tooltip ? <TooltipHint content={text}>{body}</TooltipHint> : body
}
