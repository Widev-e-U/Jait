import { describe, expect, it } from 'vitest'
import { resolveRemoteCodexThreadConfig } from './remote-codex-config.js'

describe('resolveRemoteCodexThreadConfig', () => {
  it('uses current Codex app-server values for supervised sessions', () => {
    expect(resolveRemoteCodexThreadConfig('supervised')).toEqual({
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
    })
  })

  it('allows full access only when explicitly requested', () => {
    expect(resolveRemoteCodexThreadConfig('full-access')).toEqual({
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    })
    expect(resolveRemoteCodexThreadConfig('unexpected-mode')).toEqual({
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
    })
  })
})
