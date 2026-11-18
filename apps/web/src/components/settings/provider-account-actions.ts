import type { ProviderAuthInfo } from '@jait/shared'
import type { ProviderAccount, ProviderAccountType, ProviderInfo } from '@/lib/agents-api'

export function shouldShowProviderLoginAction(auth?: ProviderAuthInfo): boolean {
  return Boolean(auth?.login) && auth?.authenticated !== true
}

/** Saved accounts must remain manageable even when their agent cannot start. */
export function getGatewayProviderAccounts(
  providers: ProviderInfo[],
  accounts: ProviderAccount[],
  types: ProviderAccountType[],
): ProviderInfo[] {
  const configuredIds = new Set(accounts.map((account) => account.id))
  const rows = providers.filter((provider) => {
    if ((provider.nodeId ?? 'gateway') !== 'gateway' || provider.id === 'jait') return false
    const auth = provider.auth
    return configuredIds.has(provider.id)
      || Boolean(auth && (auth.login || auth.logout || auth.authenticated !== null))
  })
  const rowIds = new Set(rows.map((provider) => provider.id))
  for (const account of accounts) {
    if (account.nodeId !== 'gateway' || rowIds.has(account.id)) continue
    const type = types.find((candidate) => candidate.providerType === account.providerType)
    rows.push({
      id: account.id,
      providerType: account.providerType,
      name: `${type?.name ?? account.providerType} — ${account.label}`,
      description: type?.description ?? '',
      available: false,
      unavailableReason: 'Provider is unavailable. Refresh providers or remove this account.',
      nodeId: 'gateway',
      nodeName: 'Gateway',
      modes: [],
    })
  }
  return rows
}
