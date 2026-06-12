import type { ResponseStyle } from '@jait/shared'

export function isResponseStyle(value: unknown): value is ResponseStyle {
  return value === 'normal' || value === 'simple' || value === 'caveman' || value === 'caveman-ultra'
}
