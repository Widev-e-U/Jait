import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BackgroundSecretPrompt, shouldPresentNativeUserQuestion } from './input-prompts'
import type { SecretInputRequest } from '@/lib/secret-input'

function backgroundRequest(overrides: Partial<SecretInputRequest> = {}): SecretInputRequest {
  return {
    id: 'secret-background',
    sessionId: 'session-background',
    title: 'Administrator password',
    prompt: 'Password to restart the Jait gateway',
    requestedBy: 'elevated.run',
    command: 'sudo systemctl restart jait',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: 'pending',
    ...overrides,
  }
}

describe('BackgroundSecretPrompt', () => {
  it('shows command context, a masked input, and a chat navigation action', () => {
    const markup = renderToStaticMarkup(
      <BackgroundSecretPrompt
        request={backgroundRequest()}
        submitting={false}
        onSubmit={vi.fn(async () => {})}
        onCancel={vi.fn(async () => {})}
        onOpenChat={vi.fn()}
      />,
    )

    expect(markup).toContain('Password needed in another chat')
    expect(markup).toContain('sudo systemctl restart jait')
    expect(markup).toContain('type="password"')
    expect(markup).toContain('Open chat')
    expect(markup).toContain('not sent to the model')
  })

  it('falls back to the requesting tool when no command is available', () => {
    const markup = renderToStaticMarkup(
      <BackgroundSecretPrompt
        request={backgroundRequest({ command: undefined })}
        submitting={false}
        onSubmit={vi.fn(async () => {})}
        onCancel={vi.fn(async () => {})}
        onOpenChat={vi.fn()}
      />,
    )

    expect(markup).toContain('elevated.run')
  })
})

describe('shouldPresentNativeUserQuestion', () => {
  it('opens the native Android prompt while the Capacitor app is foregrounded', () => {
    expect(shouldPresentNativeUserQuestion({
      appIsBackgrounded: false,
      attention: 'normal',
      hasCapacitorOverlay: true,
    })).toBe(true)
  })

  it('keeps foreground web and desktop prompts inline', () => {
    expect(shouldPresentNativeUserQuestion({
      appIsBackgrounded: false,
      attention: 'normal',
      hasCapacitorOverlay: false,
    })).toBe(false)
  })

  it('only opens a background native prompt for urgent requests', () => {
    expect(shouldPresentNativeUserQuestion({
      appIsBackgrounded: true,
      attention: 'normal',
      hasCapacitorOverlay: true,
    })).toBe(false)
    expect(shouldPresentNativeUserQuestion({
      appIsBackgrounded: true,
      attention: 'urgent',
      hasCapacitorOverlay: false,
    })).toBe(true)
  })
})
