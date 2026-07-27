import { describe, expect, it } from 'vitest'
import { resolveRemoteCodexApprovalPolicy } from './remote-codex-config.js'

describe('resolveRemoteCodexApprovalPolicy', () => {
  it('uses the current Codex app-server policy for supervised sessions', () => {
    expect(resolveRemoteCodexApprovalPolicy('supervised')).toBe('on-request')
  })

  it('allows full access only when explicitly requested', () => {
    expect(resolveRemoteCodexApprovalPolicy('full-access')).toBe('never')
    expect(resolveRemoteCodexApprovalPolicy('unexpected-mode')).toBe('on-request')
  })
})
