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

describe('MessageQueue pending steer', () => {
  // Two rows: a pending steer plus a normal queued message. Rendering a second
  // row matters because the drag handle is only offered when the queue has
  // more than one item — that makes "no drag handle on the pending row" a real
  // assertion instead of an artefact of a single-item queue.
  const pendingItems = () => [
    {
      id: 'steer-1',
      content: 'Actually use the second approach',
      queuedAt: Date.now(),
      pendingSteer: true,
      steerQueuedMessageId: 'steer-1',
    },
    { id: 'queued-1', content: 'Follow up on the diff', queuedAt: Date.now() },
  ]

  const renderQueue = (items: ReturnType<typeof pendingItems>) =>
    renderToStaticMarkup(
      <MessageQueue
        items={items}
        onSteer={() => {}}
        onEdit={() => {}}
        onToggleHold={() => {}}
        onReorder={() => {}}
        onRemove={() => {}}
      />,
    )

  /** Slice the markup for a single queue row so assertions stay row-scoped. */
  const rowMarkup = (markup: string, id: string) => {
    const marker = `data-queue-id="${id}"`
    const start = markup.indexOf(marker)
    expect(start).toBeGreaterThanOrEqual(0)
    const next = markup.indexOf('data-queue-id="', start + marker.length)
    return markup.slice(start, next === -1 ? undefined : next)
  }

  it('renders an accepted-but-not-yet-injected steer as a queued message', () => {
    const markup = renderQueue(pendingItems())
    const pendingRow = rowMarkup(markup, 'steer-1')

    // Still visibly queued — never presented as the next message to send.
    expect(pendingRow).toContain('Queued #1')
    expect(pendingRow).not.toContain('Next')
    // …and it says when it actually lands.
    expect(pendingRow).toContain('Sends after this step')
    // The content is unchanged, so the user still recognises their message.
    expect(pendingRow).toContain('Actually use the second approach')
  })

  it('hides reorder/edit/steer/hold actions on a pending steer', () => {
    const markup = renderQueue(pendingItems())
    const pendingRow = rowMarkup(markup, 'steer-1')

    // Re-sending or reordering a message that is already in flight would be a
    // duplicate steer, so those affordances are suppressed…
    expect(pendingRow).not.toContain('aria-label="Drag to reorder"')
    expect(pendingRow).not.toContain('aria-label="Steer with message"')
    expect(pendingRow).not.toContain('aria-label="Edit queued message"')
    expect(pendingRow).not.toContain('aria-label="Hold queued message"')

    // …while the sibling normal row keeps them, which proves the suppression
    // is specific to the pending steer rather than global.
    const normalRow = rowMarkup(markup, 'queued-1')
    expect(normalRow).toContain('aria-label="Drag to reorder"')
    expect(normalRow).toContain('aria-label="Steer with message"')
  })

  it('still renders a normal queued message as next with its actions', () => {
    const markup = renderToStaticMarkup(
      <MessageQueue
        items={[
          { id: 'queued-1', content: 'Follow up on the diff', queuedAt: Date.now() },
          { id: 'queued-2', content: 'And then run the tests', queuedAt: Date.now() },
        ]}
        onSteer={() => {}}
        onReorder={() => {}}
      />,
    )
    const firstRow = rowMarkup(markup, 'queued-1')

    expect(firstRow).toContain('Next')
    expect(markup).not.toContain('Sends after this step')
    expect(firstRow).toContain('aria-label="Steer with message"')
    expect(firstRow).toContain('aria-label="Drag to reorder"')
  })
})
