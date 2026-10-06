import type { ChatPersona } from '@jait/shared'
export type { ChatPersona } from '@jait/shared'

export function parseChatPersona(value: unknown): ChatPersona | undefined {
  if (!value || typeof value !== 'object') return undefined
  const p = value as Record<string, unknown>
  if (typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.avatar !== 'string' || typeof p.providerId !== 'string') return undefined
  return { id: p.id, name: p.name, avatar: p.avatar, providerId: p.providerId,
    ...(typeof p.role === 'string' ? { role: p.role } : {}),
    ...(p.model === null || typeof p.model === 'string' ? { model: p.model } : {}),
  }
}
