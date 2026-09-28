import { describe, expect, it } from 'vitest'
import { firstProjectSetupKey, shouldOfferFirstProjectSetup, type FirstProjectSetupState } from './first-project-setup'

const readyEmptyAccount: FirstProjectSetupState = {
  gatewayStep: 'auth',
  gatewayReachable: true,
  authenticated: true,
  authLoading: false,
  projectsLoading: false,
  projectsInitialLoadComplete: true,
  nodePermissionSetupReady: true,
  projectCount: 0,
  personalChatCount: 0,
  completed: false,
  hasRoutedDestination: false,
  view: 'chat',
  mode: 'developer',
}

describe('first project setup eligibility', () => {
  it('offers setup after an authenticated empty account has loaded', () => {
    expect(shouldOfferFirstProjectSetup(readyEmptyAccount)).toBe(true)
  })

  it.each([
    ['gateway selection', { gatewayStep: 'url' }],
    ['unreachable gateway', { gatewayReachable: false }],
    ['gateway connection check', { gatewayReachable: null }],
    ['sign-in', { authenticated: false }],
    ['authentication loading', { authLoading: true }],
    ['project loading', { projectsLoading: true }],
    ['failed or pending project fetch', { projectsInitialLoadComplete: false }],
    ['desktop node permissions', { nodePermissionSetupReady: false }],
    ['existing project', { projectCount: 1 }],
    ['existing personal chat', { personalChatCount: 1 }],
    ['completed setup', { completed: true }],
    ['routed chat', { hasRoutedDestination: true }],
    ['settings view', { view: 'settings' }],
    ['other mode', { mode: 'assistant' }],
  ] satisfies Array<[string, Partial<FirstProjectSetupState>]>)('does not interrupt %s', (_case, change) => {
    expect(shouldOfferFirstProjectSetup({ ...readyEmptyAccount, ...change })).toBe(false)
  })

  it('stores completion separately for each gateway/account scope', () => {
    expect(firstProjectSetupKey('gateway-a:user-a')).not.toBe(firstProjectSetupKey('gateway-b:user-a'))
    expect(firstProjectSetupKey('gateway-a:user-a')).not.toBe(firstProjectSetupKey('gateway-a:user-b'))
  })
})
