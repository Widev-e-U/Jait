import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AgentControlButton } from './agent-control-button'

const props = {
  state: { halted: false, reason: null, haltedAt: null, updatedAt: null },
  runningCount: 0,
  collapsed: true,
  placement: 'header' as const,
  onOpenAgents: () => {},
  onStopAll: () => {},
  onResume: () => {},
}

function render(avatars: string[]) {
  return renderToStaticMarkup(<TooltipProvider><AgentControlButton {...props} avatars={avatars} /></TooltipProvider>)
}

describe('mobile agent controls', () => {
  it('shows a skeleton until avatars are available, then shows the avatars', () => {
    const loading = render([])
    expect(loading).toContain('data-agent-avatar-skeleton')
    expect(loading).not.toContain('agent-creature')
    expect(loading).toContain('aria-label="Agent controls"')

    const loaded = render(['aurora'])
    expect(loaded).not.toContain('data-agent-avatar-skeleton')
    expect(loaded).toContain('agent-creature')
  })
})
