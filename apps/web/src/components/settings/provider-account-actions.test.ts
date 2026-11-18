import { describe, expect, it } from 'vitest'
import type { ProviderAccount, ProviderInfo } from '@/lib/agents-api'
import { getGatewayProviderAccounts } from './provider-account-actions'

const account: ProviderAccount = {
  id: 'junie-account', providerType: 'junie', nodeId: 'gateway', label: 'Personal',
  userId: 'owner', createdAt: '', updatedAt: '',
}
const provider: ProviderInfo = {
  id: account.id, name: 'Junie — Personal', description: '', available: false,
  modes: ['full-access'], auth: { login: false, logout: false, deviceCode: false, authenticated: null },
}

describe('gateway provider account management', () => {
  it('keeps saved accounts visible when startup fails and auth actions are absent', () => {
    expect(getGatewayProviderAccounts([provider], [account], [])).toEqual([provider])
    expect(getGatewayProviderAccounts([{ ...provider, auth: undefined }], [account], []).map(p => p.id)).toEqual([account.id])
  })

  it('keeps an account removable when its provider is missing from the registry', () => {
    const [row] = getGatewayProviderAccounts([], [account], [])
    expect(row).toMatchObject({ id: account.id, name: 'junie — Personal', available: false })
    expect(row.unavailableReason).toContain('remove this account')
  })

  it('removes deleted accounts and excludes native and remote providers', () => {
    expect(getGatewayProviderAccounts([provider, { ...provider, id: 'jait' }], [], [])).toEqual([])
    expect(getGatewayProviderAccounts([{ ...provider, nodeId: 'desktop' }], [{ ...account, nodeId: 'desktop' }], [])).toEqual([])
  })
})
