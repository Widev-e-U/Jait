import type { ProviderAuthInfo } from '@jait/shared'

export function shouldShowProviderLoginAction(auth?: ProviderAuthInfo): boolean {
  return Boolean(auth?.login) && auth?.authenticated !== true
}
