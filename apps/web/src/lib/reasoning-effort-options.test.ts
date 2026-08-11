import { describe, expect, it } from 'vitest'

import {
  DEFAULT_REASONING_EFFORTS,
  resolveActiveModel,
  resolveReasoningEffortOptions,
} from './reasoning-effort-options'

// Shaped like the jait provider's OpenAI catalogue: no model is flagged as the
// provider default, and only some accept `reasoning_effort`.
const JAIT_MODELS = [
  { id: 'o3-mini', reasoningEffortSupported: true },
  { id: 'gpt-4o', reasoningEffortSupported: false },
]

// Shaped like an ACP provider, which names its default and advertises the exact
// effort values its CLI accepts.
const CLAUDE_CODE_MODELS = [
  {
    id: 'default',
    isDefault: true,
    reasoningEffortSupported: true,
    supportedReasoningEfforts: [
      { reasoningEffort: 'low' },
      { reasoningEffort: 'high' },
      { reasoningEffort: 'xhigh', description: 'Think harder' },
    ],
  },
  { id: 'haiku', reasoningEffortSupported: true, supportedReasoningEfforts: [{ reasoningEffort: 'low' }] },
]

describe('resolveActiveModel', () => {
  it('uses the explicitly selected model', () => {
    expect(resolveActiveModel(JAIT_MODELS, 'gpt-4o')?.id).toBe('gpt-4o')
  })

  it('falls back to the provider-declared default when nothing is selected', () => {
    expect(resolveActiveModel(CLAUDE_CODE_MODELS, null)?.id).toBe('default')
  })

  it('does not fall back to the first model when no default is declared', () => {
    // Regression: falling back to models[0] meant list order alone decided
    // whether a model the user never picked got a reasoning-effort selector.
    expect(resolveActiveModel(JAIT_MODELS, null)).toBeNull()
  })

  it('returns null when the selected model is not in the list', () => {
    expect(resolveActiveModel(JAIT_MODELS, 'o5-turbo')).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(resolveActiveModel([], null)).toBeNull()
  })
})

describe('resolveReasoningEffortOptions', () => {
  it('offers nothing when there is no active model', () => {
    expect(resolveReasoningEffortOptions(null)).toBeNull()
  })

  it('offers nothing for a model that takes no effort option', () => {
    expect(resolveReasoningEffortOptions({ id: 'gpt-4o', reasoningEffortSupported: false })).toBeNull()
  })

  it("uses the provider's own values, including ones outside the OpenAI ladder", () => {
    const options = resolveReasoningEffortOptions(CLAUDE_CODE_MODELS[0]!)

    expect(options?.map((option) => option.value)).toEqual(['low', 'high', 'xhigh'])
    expect(options?.map((option) => option.label)).toEqual(['Low', 'High', 'Xhigh'])
    expect(options?.[2]?.hint).toBe('Think harder')
    expect(options?.[0]?.hint).toBe('Use low reasoning')
  })

  it('falls back to the OpenAI ladder for a model that reports support without values', () => {
    expect(resolveReasoningEffortOptions({ id: 'o3-mini', reasoningEffortSupported: true }))
      .toEqual(DEFAULT_REASONING_EFFORTS)
  })

  it('prefers advertised values even when the support flag is absent', () => {
    const options = resolveReasoningEffortOptions({
      id: 'thinker',
      supportedReasoningEfforts: [{ reasoningEffort: 'thought_level_2' }],
    })

    expect(options).toEqual([
      { value: 'thought_level_2', label: 'Thought Level 2', hint: 'Use thought level 2 reasoning' },
    ])
  })
})
