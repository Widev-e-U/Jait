import { describe, expect, it } from 'vitest'

import type { ProviderInfo } from './agents-api'
import { resolveScopedProviderSelection, scopeProviders } from './provider-scope'

const jaitProvider: ProviderInfo = {
  id: 'jait',
  name: 'Jait',
  description: 'Built in',
  available: true,
  modes: ['full-access', 'supervised'],
  nodeId: 'gateway',
  nodeName: 'Gateway',
}

const gatewayAccount: ProviderInfo = {
  id: 'codex-gateway-account',
  providerType: 'codex',
  name: 'Codex — Gateway work',
  description: 'Gateway account',
  available: true,
  modes: ['full-access', 'supervised'],
  nodeId: 'gateway',
  nodeName: 'Gateway',
}

const windowsAccount: ProviderInfo = {
  id: 'codex-windows-account',
  providerType: 'codex',
  name: 'Codex — Windows',
  description: 'Runs on Windows workstation',
  available: true,
  modes: ['full-access', 'supervised'],
  nodeId: 'windows-node',
  nodeName: 'Windows workstation',
  auth: { login: true, logout: true, deviceCode: true, authenticated: true },
}

const allProviders = [jaitProvider, gatewayAccount, windowsAccount]

describe('scopeProviders', () => {
  it('keeps providers advertised by the selected repository node', () => {
    const { entries } = scopeProviders({
      providers: [jaitProvider, gatewayAccount],
      scopeNodeId: 'windows-node',
      connectedNodeIds: ['windows-node'],
      availableProviderIds: ['jait', gatewayAccount.id, 'codex'],
    })

    expect(entries.map((entry) => entry.id)).toEqual([
      'jait',
      gatewayAccount.id,
      'codex',
    ])
  })

  it('lists only gateway-hosted providers when working on the gateway', () => {
    const { entries, scopeNodeOffline } = scopeProviders({
      providers: allProviders,
      scopeNodeId: 'gateway',
      connectedNodeIds: ['windows-node'],
    })

    expect(entries.map((entry) => entry.id)).toEqual([
      'jait',
      'codex-gateway-account',
    ])
    expect(entries.map((entry) => entry.nodeName)).toEqual([
      'Gateway',
      'Gateway',
    ])
    expect(entries.every((entry) => entry.isAvailable)).toBe(true)
    expect(scopeNodeOffline).toBe(false)
  })

  it('shows only the project device plus Jait when the project lives on a device', () => {
    const { entries, scopeNodeLabel } = scopeProviders({
      providers: allProviders,
      scopeNodeId: 'windows-node',
      connectedNodeIds: ['windows-node'],
    })

    expect(entries.map((entry) => entry.id)).toEqual(['jait', 'codex-windows-account'])
    expect(entries.find((entry) => entry.id === 'codex-windows-account')?.isAvailable).toBe(true)
    expect(scopeNodeLabel).toBe('Windows workstation')
  })

  it('keeps Jait usable and flags the device when the project device is offline', () => {
    const { entries, scopeNodeOffline } = scopeProviders({
      providers: allProviders,
      scopeNodeId: 'windows-node',
      connectedNodeIds: [],
      scopeNodeLabel: 'Windows workstation',
    })

    expect(scopeNodeOffline).toBe(true)
    expect(entries.find((entry) => entry.id === 'jait')?.isAvailable).toBe(true)
    const windows = entries.find((entry) => entry.id === 'codex-windows-account')
    expect(windows?.isAvailable).toBe(false)
    expect(windows?.reason).toContain('offline')
  })

  it('reports the gateway reason when a gateway provider is not signed in', () => {
    const { entries } = scopeProviders({
      providers: [
        jaitProvider,
        { ...gatewayAccount, available: false, unavailableReason: 'Login required' },
      ],
      scopeNodeId: 'gateway',
    })

    const account = entries.find((entry) => entry.id === gatewayAccount.id)
    expect(account?.isAvailable).toBe(false)
    expect(account?.reason).toBe('Login required')
  })

  it('hides provider accounts that are not installed on the selected node', () => {
    const { entries } = scopeProviders({
      providers: [
        jaitProvider,
        {
          ...windowsAccount,
          installed: false,
          available: false,
          unavailableReason: 'Not installed on Windows workstation',
        },
      ],
      scopeNodeId: 'windows-node',
      connectedNodeIds: ['windows-node'],
    })

    expect(entries.map((entry) => entry.id)).toEqual(['jait'])
  })

  it('keeps installed provider accounts visible when login is required', () => {
    const { entries } = scopeProviders({
      providers: [
        jaitProvider,
        {
          ...windowsAccount,
          installed: true,
          available: false,
          unavailableReason: 'Login required on Windows workstation',
        },
      ],
      scopeNodeId: 'windows-node',
      connectedNodeIds: ['windows-node'],
    })

    expect(entries.map((entry) => entry.id)).toEqual(['jait', windowsAccount.id])
    expect(entries[1]?.isAvailable).toBe(false)
  })

  it('falls back to Jait before providers have loaded', () => {
    const { entries } = scopeProviders({ providers: [], loading: true })
    expect(entries.map((entry) => entry.id)).toEqual(['jait'])
    expect(entries[0]?.isAvailable).toBe(true)
  })
})

describe('resolveScopedProviderSelection', () => {
  it('replaces a gateway-only account selection when the project moves to Windows', () => {
    const providers = [
      { value: 'jait', isAvailable: true },
      { value: 'codex-windows-account', isAvailable: true },
    ]

    expect(resolveScopedProviderSelection('codex-gateway-account', providers)).toBe('jait')
    expect(resolveScopedProviderSelection('codex-windows-account', providers)).toBe('codex-windows-account')
  })

  it('restores the preferred provider after a temporary project availability fallback', () => {
    const windowsProviders = [
      { value: 'jait' as const, isAvailable: true },
      { value: 'codex' as const, isAvailable: false },
    ]
    const gatewayProviders = [
      { value: 'jait' as const, isAvailable: true },
      { value: 'codex' as const, isAvailable: true },
    ]

    const windowsSelection = resolveScopedProviderSelection('codex', windowsProviders, 'codex')
    const restoredSelection = resolveScopedProviderSelection(windowsSelection, gatewayProviders, 'codex')

    expect(windowsSelection).toBe('jait')
    expect(restoredSelection).toBe('codex')
  })
})
