import { describe, expect, it } from 'vitest'

import { isProviderLoginDisabled } from './provider-account-ui-state'

describe('isProviderLoginDisabled', () => {
  it('disables login when the provider is already signed in', () => {
    expect(isProviderLoginDisabled({
      busy: false,
      hasLogoutInProgress: false,
      isSignedIn: true,
    })).toBe(true)
  })

  it('allows login for a signed-out idle provider', () => {
    expect(isProviderLoginDisabled({
      busy: false,
      hasLogoutInProgress: false,
      isSignedIn: false,
    })).toBe(false)
  })
})
