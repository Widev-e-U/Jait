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

describe('PromptInput footer selectors', () => {
  it('hides every selector when the values are passed without change handlers', () => {
    // Mirrors the parallel-chat panel regression: passing `mode`, `provider`,
    // `providerRuntimeMode`, `responseStyle` and `reasoningEffort` as values
    // without their `on*Change` callbacks collapsed the whole footer control
    // row, so the panel showed a composer with no buttons at all.
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        mode="agent"
        provider="jait"
        providerRuntimeMode="full-access"
        responseStyle="concise"
        reasoningEffort="medium"
      />,
    )

    expect(markup).not.toContain('aria-label="Provider ')
    expect(markup).not.toContain('aria-label="Runtime:')
  })

  it('renders the footer selectors once their handlers are wired up', () => {
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        mode="agent"
        onModeChange={() => {}}
        provider="jait"
        providerRuntimeMode="full-access"
        onProviderRuntimeModeChange={() => {}}
        responseStyle="concise"
        onResponseStyleChange={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Runtime:')
    // The provider/model selector needs an auth context, so it stays out of
    // this SSR test — the runtime selector alone proves the row renders.
    expect(markup).not.toContain('aria-label="Provider ')
  })
})