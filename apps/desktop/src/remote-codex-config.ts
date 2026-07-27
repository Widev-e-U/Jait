export type RemoteCodexApprovalPolicy = 'on-request' | 'never'
export type RemoteCodexSandboxMode = 'workspace-write' | 'danger-full-access'

export interface RemoteCodexThreadConfig {
  approvalPolicy: RemoteCodexApprovalPolicy
  sandbox: RemoteCodexSandboxMode
}

export function resolveRemoteCodexThreadConfig(mode: string): RemoteCodexThreadConfig {
  const hasFullAccess = mode === 'full-access'
  return {
    approvalPolicy: hasFullAccess ? 'never' : 'on-request',
    sandbox: hasFullAccess ? 'danger-full-access' : 'workspace-write',
  }
}
