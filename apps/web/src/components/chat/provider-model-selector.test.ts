import { describe, expect, it } from 'vitest'
import {
  PROVIDER_SELECTOR_POPOVER_STYLE,
  resolveProviderModelReconciliation,
} from './provider-model-selector'

describe('provider model transitions', () => {
  it('does not assign the previous provider default while the new catalogue loads', () => {
    expect(resolveProviderModelReconciliation({
      provider: 'codex-pc-work',
      activeScopeKey: 'codex-pc-work:desktop-win32',
      loadedScopeKey: 'jait:gateway',
      loading: false,
      currentModel: null,
      models: [{ id: 'jait://omniroute/legacy-omniroute/auto', isDefault: true }],
    })).toBeUndefined()
  })

  it('selects the default after the active provider catalogue loads', () => {
    expect(resolveProviderModelReconciliation({
      provider: 'codex-pc-work',
      activeScopeKey: 'codex-pc-work:desktop-win32',
      loadedScopeKey: 'codex-pc-work:desktop-win32',
      loading: false,
      currentModel: null,
      models: [{ id: 'gpt-5.6-sol', isDefault: true }],
    })).toBe('gpt-5.6-sol')
  })
})

describe('provider selector geometry', () => {
  it('reserves its full panel height while another provider loads models', () => {
    expect(PROVIDER_SELECTOR_POPOVER_STYLE.height).toBe(
      PROVIDER_SELECTOR_POPOVER_STYLE.maxHeight,
    )
  })
})
