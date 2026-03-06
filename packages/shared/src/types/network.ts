// @jait/shared — Network scanning, SSH, and device deployment types

export interface NetworkHost {
  ip: string
  mac: string | null
  hostname: string | null
  vendor: string | null
  /** Whether the host responded to ping / ARP */
  alive: boolean
  /** Open ports discovered (e.g. 22, 80, 443) */
  openPorts: number[]
  /** Whether SSH (port 22) appears reachable */
  sshReachable: boolean
  /** Gateway agent status on this host */
  agentStatus: 'not-installed' | 'installed' | 'running' | 'unreachable'
  /** Timestamp of last scan */
  lastSeen: string
}

export interface NetworkScanResult {
  subnet: string
  hosts: NetworkHost[]
  scannedAt: string
  /** Duration of the scan in ms */
  durationMs: number
}

export interface SshTestResult {
  ip: string
  reachable: boolean
  authMethods: string[]
  /** If authenticated, the remote platform info */
  platform?: string
  error?: string
}

export interface DeployStatus {
  ip: string
  stage: 'connecting' | 'uploading' | 'installing' | 'configuring' | 'starting' | 'done' | 'error'
  progress: number
  message: string
  error?: string
}

export interface GatewayNode {
  id: string
  ip: string
  hostname: string | null
  platform: string
  version: string
  status: 'online' | 'offline' | 'degraded'
  lastSeen: string
  capabilities: string[]
}
