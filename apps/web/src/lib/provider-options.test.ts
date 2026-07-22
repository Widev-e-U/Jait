import { describe, expect, it } from 'vitest'
import { getMissingRemoteProviderIds } from './provider-options'

describe('getMissingRemoteProviderIds', () => {
  it('keeps remote Codex selectable without a gateway base adapter', () => {
    expect(getMissingRemoteProviderIds(
      [
        { id: 'jait' },
        { id: 'codex-account-personal' },
      ],
      [
        { providers: ['codex', 'claude-code'] },
        { providers: ['codex'] },
      ],
    )).toEqual(['codex', 'claude-code'])
  })
})
