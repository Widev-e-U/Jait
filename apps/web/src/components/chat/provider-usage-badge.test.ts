import { describe, expect, it } from 'vitest'
import { encodeJaitModelId } from '@jait/shared'
import type { UsageSummary } from '@/components/app-shell/usage-modal'
import { findUsageProfile } from './provider-usage-badge'

const summary = { profiles: [
  { id: 'codex-work', providerType: 'codex', quotas: [] },
  { id: 'codex-personal', providerType: 'codex', quotas: [{ rateLimitType: 'five_hour', utilization: 0.3 }] },
  { id: 'claude-personal', providerType: 'claude-code', quotas: [] },
  { id: 'jait-backend:user:go-a', providerType: 'opencode-go', quotas: [] },
  { id: 'jait-backend:user:go-b', providerType: 'opencode-go', quotas: [] },
  { id: 'jait-backend:user:ollama', providerType: 'ollama', quotas: [] },
] } as unknown as UsageSummary

describe('findUsageProfile', () => {
  it('uses the selected account even when another account has quotas', () => {
    expect(findUsageProfile(summary, 'codex-work')?.id).toBe('codex-work')
    expect(findUsageProfile(summary, 'codex-personal')?.id).toBe('codex-personal')
  })

  it('matches the selected Jait backend instance without substituting another', () => {
    expect(findUsageProfile(summary, 'jait', encodeJaitModelId('opencode-go', 'go-b', 'model'))?.id).toBe('jait-backend:user:go-b')
    expect(findUsageProfile(summary, 'jait', encodeJaitModelId('ollama', 'ollama', 'model'))?.id).toBe('jait-backend:user:ollama')
    expect(findUsageProfile(summary, 'jait', encodeJaitModelId('opencode-go', 'missing', 'model'))).toBeUndefined()
    expect(findUsageProfile(summary, 'jait', 'legacy-model')).toBeUndefined()
    expect(findUsageProfile(summary, 'jait', null)).toBeUndefined()
  })

  it('only resolves a legacy provider type when it identifies one account', () => {
    expect(findUsageProfile(summary, 'codex')).toBeUndefined()
    expect(findUsageProfile(summary, 'claude-code')?.id).toBe('claude-personal')
    expect(findUsageProfile(summary, 'missing')).toBeUndefined()
  })
})
