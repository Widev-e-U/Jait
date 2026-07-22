import { describe, expect, it } from 'vitest'

import type { ProviderInfo, RemoteProviderInfo } from './agents-api'
import { getScopedProviderSource, resolveScopedProviderSelection } from './provider-scope'

const jaitProvider: ProviderInfo = {
  id: 'jait',
  name: 'Jait',
  description: 'Built in',
  available: true,
  modes: ['full-access', 'supervised'],
}

const gatewayAccount: ProviderInfo = {
  id: 'codex-gateway-account',
  providerType: 'codex',
  name: 'Codex — Gateway work',
  description: 'Gateway account',
  available: true,
  modes: ['full-access', 'supervised'],
}

const windowsNode: RemoteProviderInfo = {
  nodeId: 'windows-node',
  nodeName: 'Windows workstation',
  platform: 'windows',
  providers: ['codex'],
  providerStatuses: [
    { id: 'codex', installed: true, authenticated: true, detail: 'Signed in on Windows' },
  ],
}

describe('getScopedProviderSource', () => {
  it('shows gateway Jait plus providers belonging to the selected remote node', () => {
    const providers = getScopedProviderSource({
      localProviders: [jaitProvider, gatewayAccount],
      remoteNode: windowsNode,
      scopedToRemoteNode: true,
    })

    expect(providers.map((provider) => provider.id)).toEqual(['jait', 'codex'])
    expect(providers.find((provider) => provider.id === 'codex')?.auth?.authenticated).toBe(true)
    expect(providers.some((provider) => provider.id === gatewayAccount.id)).toBe(false)
  })

  it('replaces a gateway-only account selection when the project moves to Windows', () => {
    const providers = [
      { value: 'jait', isAvailable: true },
      { value: 'codex', isAvailable: true },
    ]

    expect(resolveScopedProviderSelection('codex-gateway-account', providers)).toBe('jait')
    expect(resolveScopedProviderSelection('codex', providers)).toBe('codex')
  })
})
