import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { MessageQueue } from './message-queue'

describe('MessageQueue parallel action', () => {
  it('renders the developer-facing Ask in parallel action beside steering', () => {
    const markup = renderToStaticMarkup(
      <MessageQueue
        items={[{
          id: 'queued-1',
          content: 'Explain the current approach',
          queuedAt: Date.now(),
        }]}
        onSteer={() => {}}
        onSendToParallelThread={() => {}}
        parallelActionLabel="Ask in parallel"
      />,
    )

    expect(markup).toContain('Steer')
    expect(markup).toContain('Ask in parallel')
    expect(markup).not.toContain('title="Ask in parallel"')
  })

  it('renders icon-only actions without visible text labels when iconOnly is set', () => {
    const markup = renderToStaticMarkup(
      <MessageQueue
        items={[{
          id: 'queued-1',
          content: 'Explain the current approach',
          queuedAt: Date.now(),
        }]}
        onSteer={() => {}}
        onSendToParallelThread={() => {}}
        parallelActionLabel="Ask in parallel"
        iconOnly
      />,
    )

    // The queued message text still renders…
    expect(markup).toContain('Explain the current approach')
    // …but the action buttons show icons only, no visible text labels.
    expect(markup).not.toContain('<span>Steer</span>')
    expect(markup).not.toContain('<span>Ask in parallel</span>')
    // Labels remain available for accessibility / tooltips.
    expect(markup).toContain('aria-label="Steer with message"')
    expect(markup).toContain('aria-label="Ask in parallel"')
  })
})
