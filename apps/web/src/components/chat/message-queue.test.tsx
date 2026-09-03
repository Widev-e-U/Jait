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
    expect(markup).toContain('title="Ask in parallel"')
  })
})
