import { describe, expect, it } from 'vitest'
import { formatModelDisplayLabel } from './model-labels'

describe('model display labels', () => {
  it('formats reasoning effort suffixes consistently', () => {
    expect(formatModelDisplayLabel('gpt-5.5[medium]')).toBe('gpt-5.5 (medium)')
  })
})


// Provider fallbacks must use the same brands as selectors and subscription usage.
import { getModelIcon } from './model-icons'
import { providerIcon } from './provider-icons'

describe('provider icon fallback', () => {
  it('shares the provider registry for agents, backends, and unknown providers', () => {
    for (const provider of ['codex', 'claude-code', 'pi', 'opencode-go', 'ollama', 'jait', 'unknown']) {
      expect(getModelIcon(provider)).toBe(providerIcon(provider))
      expect(getModelIcon(provider, 'unrecognized-model')).toBe(providerIcon(provider))
    }
  })
})
