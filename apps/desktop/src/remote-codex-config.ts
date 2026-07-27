export type RemoteCodexApprovalPolicy = 'on-request' | 'never'

export function resolveRemoteCodexApprovalPolicy(mode: string): RemoteCodexApprovalPolicy {
  return mode === 'full-access' ? 'never' : 'on-request'
}
