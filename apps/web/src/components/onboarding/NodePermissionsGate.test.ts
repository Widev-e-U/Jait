import { describe, expect, it } from 'vitest'

import { shouldShowNodePermissionsGate } from './NodePermissionsGate'

describe('shouldShowNodePermissionsGate', () => {
  it('keeps node permissions behind backend selection', () => {
    expect(shouldShowNodePermissionsGate({
      gatewayStep: 'url',
      authLoading: false,
      isAuthenticated: true,
      token: 'token',
    })).toBe(false)
  })

  it('keeps node permissions behind login', () => {
    expect(shouldShowNodePermissionsGate({
      gatewayStep: 'auth',
      authLoading: false,
      isAuthenticated: false,
      token: null,
    })).toBe(false)
  })

  it('shows node permissions only after backend selection and login', () => {
    expect(shouldShowNodePermissionsGate({
      gatewayStep: 'auth',
      authLoading: false,
      isAuthenticated: true,
      token: 'token',
    })).toBe(true)
  })
})
