const DEFAULT_GATEWAY_URL = 'http://localhost:8000'

function readGatewayUrlFromGlobal(): string | null {
  const globalValue = (globalThis as unknown as { JAIT_GATEWAY_URL?: unknown }).JAIT_GATEWAY_URL
  return typeof globalValue === 'string' && globalValue.trim() ? globalValue.trim() : null
}

export function getMobileGatewayUrl(): string {
  const envValue = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> }
  }).process?.env?.EXPO_PUBLIC_JAIT_GATEWAY_URL
  if (envValue?.trim()) return envValue.trim()
  return readGatewayUrlFromGlobal() ?? DEFAULT_GATEWAY_URL
}
