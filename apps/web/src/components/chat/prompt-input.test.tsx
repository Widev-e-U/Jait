import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { PromptInput } from './prompt-input'

const baseProps = {
  value: 'watch the failing test',
  onChange: () => {},
  onSubmit: () => {},
}

describe('PromptInput steering while loading', () => {
  it('renders Steer, Queue, and Ask in parallel with fast tooltip labels while streaming', () => {
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        isLoading
        onQueue={() => {}}
        onSteer={() => {}}
        onAskInParallel={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Steer the running agent (Enter)"')
    expect(markup).toContain('aria-label="Add to queue (Alt+Enter)"')
    expect(markup).toContain('aria-label="Ask in parallel"')
    expect(markup).not.toContain('title="Steer the running agent (Enter)"')
    expect(markup).not.toContain('title="Add to queue (Alt+Enter)"')
    expect(markup).not.toContain('title="Ask in parallel"')
  })

  it('keeps the queue-only fallback when no steer handler is provided', () => {
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        isLoading
        onQueue={() => {}}
      />,
    )

    expect(markup).not.toContain('title="Steer the running agent (Enter)"')
    expect(markup).toContain('aria-label="Add to queue"')
  })

  it('renders the plain submit button when not loading', () => {
    const markup = renderToStaticMarkup(
      <PromptInput {...baseProps} />,
    )

    expect(markup).not.toContain('title="Steer the running agent (Enter)"')
    expect(markup).not.toContain('title="Add to queue"')
  })

  it('never offers steering for the thread target while streaming', () => {
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        isLoading
        sendTarget="thread"
        onQueue={() => {}}
        onSteer={() => {}}
      />,
    )

    expect(markup).not.toContain('title="Steer the running agent (Enter)"')
  })
})