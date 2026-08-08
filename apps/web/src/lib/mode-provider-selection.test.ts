import { describe, expect, it } from 'vitest'

import { updateModeProviderSelection } from './mode-provider-selection'

describe('mode provider selection', () => {
  it('does not overwrite the developer chat provider when manager falls back to Jait', () => {
    const selection = updateModeProviderSelection({
      developer: 'codex-account',
      manager: 'claude-account',
    }, 'manager', 'jait')

    expect(selection).toEqual({
      developer: 'codex-account',
      manager: 'jait',
    })
  })
})
