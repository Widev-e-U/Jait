import { describe, expect, it } from 'vitest'
import { PROVIDER_SELECTOR_POPOVER_STYLE } from './provider-model-selector'

describe('provider selector geometry', () => {
  it('reserves its full panel height while another provider loads models', () => {
    expect(PROVIDER_SELECTOR_POPOVER_STYLE.height).toBe(
      PROVIDER_SELECTOR_POPOVER_STYLE.maxHeight,
    )
  })
})
