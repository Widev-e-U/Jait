import { useState, useCallback, useRef } from 'react'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

// ---------------------------------------------------------------------------
// Types (mirroring @jait/shared network types for the frontend)
// ---------------------------------------------------------------------------

export interface NetworkHost {
  ip: string
  mac: string | null
  hostname: string | null
  vendor: string | null
  alive: boolean
  openPorts: number[]
  sshReachable: boolean
  agentStatus: 'not-installed' | 'installed' | 'running' | 'unreachable'
  osVersion: string | null
  lastSeen: string
}

export interface NetworkScanResult {
  subnet: string
  hosts: NetworkHost[]
  scannedAt: string
  durationMs: number
}

export interface SshTestResult {
  ip: string
  reachable: boolean
  authMethods: string[]
  platform?: string
  error?: string
}

export interface NetworkInterface {
  name: string
  ip: string
  mac: string
  netmask: string
  internal: boolean
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

export interface DeployResult {
  ip: string
  username: string
  authMethod: string
  deployScript: string
  sshCommand: string
  instructions: string[]
  estimatedDuration: string
}

export interface SshEnableInfo {
  platform: string
  command: string
  steps: string[]
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNetwork(token?: string | null) {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([])
  const [scanResult, setScanResult] = useState<NetworkScanResult | null>(null)
  const [nodes, setNodes] = useState<GatewayNode[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [token])

  /** Fetch local network interfaces */
  const fetchInterfaces = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/network/interfaces`, { headers: headers() })
      if (res.ok) {
        const data = await res.json() as { interfaces: NetworkInterface[] }
        setInterfaces(data.interfaces)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch interfaces')
    }
  }, [headers])

  /** Fetch the latest cached scan result (from the scheduled job) */
  const fetchLatestScan = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/network/scan/latest`, { headers: headers() })
      if (res.ok) {
        const data = await res.json() as NetworkScanResult & { ok?: boolean }
        if (data.hosts) {
          setScanResult(data as NetworkScanResult)
        }
      }
    } catch {
      // ignore — no cached scan yet
    }
  }, [headers])

  /** Run a network scan (ARP + port probe) */
  const scan = useCallback(async (subnet?: string) => {
    setScanning(true)
    setError(null)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    try {
      const res = await fetch(`${API_URL}/api/network/scan`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ subnet }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`)
      const data = await res.json() as NetworkScanResult
      setScanResult(data)
      return data
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Scan failed')
      }
      return null
    } finally {
      setScanning(false)
    }
  }, [headers])

  /** Test SSH connectivity to a host */
  const testSsh = useCallback(async (ip: string, port = 22): Promise<SshTestResult | null> => {
    try {
      const res = await fetch(`${API_URL}/api/network/ssh/test`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ ip, port }),
      })
      if (!res.ok) return null
      return await res.json() as SshTestResult
    } catch {
      return null
    }
  }, [headers])

  /** Get SSH enable instructions for a platform */
  const getSshEnableInfo = useCallback(async (targetPlatform: string): Promise<SshEnableInfo | null> => {
    try {
      const res = await fetch(`${API_URL}/api/network/ssh/enable`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ platform: targetPlatform }),
      })
      if (!res.ok) return null
      return await res.json() as SshEnableInfo
    } catch {
      return null
    }
  }, [headers])

  /** Deploy gateway to a remote host */
  const deploy = useCallback(async (ip: string, username: string, authMethod = 'password'): Promise<DeployResult | null> => {
    try {
      const res = await fetch(`${API_URL}/api/network/deploy`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ ip, username, authMethod }),
      })
      if (!res.ok) return null
      return await res.json() as DeployResult
    } catch {
      return null
    }
  }, [headers])

  /** Fetch known gateway mesh nodes */
  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/network/nodes`, { headers: headers() })
      if (res.ok) {
        const data = await res.json() as { nodes: GatewayNode[] }
        setNodes(data.nodes)
      }
    } catch {
      // ignore
    }
  }, [headers])

  /** Cancel an ongoing scan */
  const cancelScan = useCallback(() => {
    abortRef.current?.abort()
    setScanning(false)
  }, [])

  return {
    interfaces,
    scanResult,
    nodes,
    scanning,
    error,
    fetchInterfaces,
    fetchLatestScan,
    scan,
    testSsh,
    getSshEnableInfo,
    deploy,
    fetchNodes,
    cancelScan,
  }
}
