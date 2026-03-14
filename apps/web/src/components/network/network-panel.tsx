import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Search,
  RefreshCw,
  Loader2,
  X,
  Server,
  Monitor,
  Smartphone,
  Globe,
  Wifi,
  Shield,
  Terminal,
  Rocket,
} from 'lucide-react'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopologyGateway {
  id: string
  type: 'gateway'
  name: string
  platform: string
  ip: string
  version: string
  osVersion: string | null
  providers: string[]
  online: boolean
}

interface TopologyDevice {
  id: string
  type: 'device'
  name: string
  platform: string
  providers: string[]
  online: boolean
  registeredAt: string
}

interface TopologyHost {
  id: string
  type: 'host'
  name: string
  ip: string
  mac: string | null
  openPorts: number[]
  sshReachable: boolean
  agentStatus: string
  osVersion: string | null
  providers: string[]
  online: boolean
}

interface TopologyMeshNode {
  id: string
  type: 'mesh'
  name: string
  ip: string
  platform: string
  version: string
  status: string
  online: boolean
}

type TopologyNode = TopologyGateway | TopologyDevice | TopologyHost | TopologyMeshNode

interface TopologyResponse {
  gateway: TopologyGateway
  devices: TopologyDevice[]
  hosts: TopologyHost[]
  meshNodes: TopologyMeshNode[]
  scannedAt: string | null
}

interface GraphNode {
  id: string
  data: TopologyNode
  x?: number
  y?: number
  fx?: number
  fy?: number
}

interface GraphLink {
  source: string
  target: string
  type: 'connected' | 'scanned'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<string, string> = {
  gateway: '#22c55e',
  device: '#3b82f6',
  mesh: '#a855f7',
  host: '#6b7280',
}

const NODE_SIZES: Record<string, number> = {
  gateway: 14,
  device: 10,
  mesh: 10,
  host: 8,
}

const PLATFORM_ICONS: Record<string, string> = {
  windows: '\u{1fa9f}',
  macos: '\ud83c\udf4e',
  linux: '\ud83d\udc27',
  android: '\ud83d\udcf1',
  ios: '\ud83d\udcf1',
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------

function NodeDetail({ node, onClose, onDeploy }: { node: TopologyNode | null; onClose: () => void; onDeploy?: (ip: string) => void }) {
  if (!node) return null

  const Icon = node.type === 'gateway' ? Server
    : node.type === 'device' ? ('platform' in node && (node.platform === 'android' || node.platform === 'ios') ? Smartphone : Monitor)
      : node.type === 'mesh' ? Globe
        : Monitor

  const color = NODE_COLORS[node.type] ?? '#6b7280'

  const showDeploy = 'sshReachable' in node && node.sshReachable
    && 'agentStatus' in node && node.agentStatus !== 'running'
    && 'ip' in node

  return (
    <Dialog open={!!node} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${color}22`, color }}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate">{node.name}</div>
              <div className="text-xs font-normal text-muted-foreground capitalize">{node.type}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${node.online ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>{node.online ? 'Online' : 'Offline'}</span>
          </div>

          {/* Platform */}
          {'platform' in node && node.platform && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Platform</span>
              <span className="flex items-center gap-1.5">
                {PLATFORM_ICONS[node.platform] ?? '\ud83d\udcbb'} {node.platform}
              </span>
            </div>
          )}

          {/* IP */}
          {'ip' in node && node.ip && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">IP Address</span>
              <code className="text-xs bg-muted px-2 py-0.5 rounded">{node.ip}</code>
            </div>
          )}

          {/* Version */}
          {'version' in node && node.version && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Version</span>
              <Badge variant="secondary" className="font-mono text-[10px]">v{node.version}</Badge>
            </div>
          )}

          {/* OS Version (gateway + hosts) */}
          {'osVersion' in node && node.osVersion && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">OS</span>
              <span className="text-xs">{node.osVersion}</span>
            </div>
          )}

          {/* MAC */}
          {'mac' in node && node.mac && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">MAC Address</span>
              <code className="text-xs bg-muted px-2 py-0.5 rounded">{node.mac}</code>
            </div>
          )}

          {/* Providers */}
          {'providers' in node && node.providers.length > 0 && (
            <div>
              <span className="text-muted-foreground block mb-1.5">Providers</span>
              <div className="flex flex-wrap gap-1">
                {node.providers.map(p => (
                  <Badge key={p} variant="outline" className="text-[10px]">
                    <Terminal className="h-2.5 w-2.5 mr-1" />{p}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Open Ports */}
          {'openPorts' in node && node.openPorts.length > 0 && (
            <div>
              <span className="text-muted-foreground block mb-1.5">Open Ports</span>
              <div className="flex flex-wrap gap-1">
                {node.openPorts.map(p => (
                  <Badge key={p} variant="outline" className="text-[10px] font-mono">{p}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* SSH */}
          {'sshReachable' in node && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">SSH</span>
              <span className="flex items-center gap-1.5">
                <Shield className="h-3 w-3" />
                {node.sshReachable ? 'Reachable' : 'Not reachable'}
              </span>
            </div>
          )}

          {/* Agent Status */}
          {'agentStatus' in node && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Agent</span>
              <Badge variant={node.agentStatus === 'running' ? 'default' : 'secondary'} className="text-[10px]">
                {node.agentStatus}
              </Badge>
            </div>
          )}

          {/* Registered At (devices) */}
          {'registeredAt' in node && node.registeredAt && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Connected</span>
              <span className="text-xs">{new Date(node.registeredAt).toLocaleString()}</span>
            </div>
          )}

          {/* Gateway link for running agents */}
          {('agentStatus' in node && node.agentStatus === 'running' && 'ip' in node) && (
            <Button size="sm" variant="outline" className="w-full mt-2" asChild>
              <a href={`http://${node.ip}:8000`} target="_blank" rel="noopener noreferrer">
                <Globe className="h-3.5 w-3.5 mr-1.5" />
                Open Dashboard
              </a>
            </Button>
          )}

          {/* Deploy Node button — shown when SSH is reachable but agent is not running */}
          {showDeploy && onDeploy && (
            <Button size="sm" variant="default" className="w-full mt-2"
              onClick={() => { onDeploy((node as TopologyHost).ip); onClose(); }}>
              <Rocket className="h-3.5 w-3.5 mr-1.5" />
              Deploy Node
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Deploy Dialog
// ---------------------------------------------------------------------------

function DeployDialog({ ip, token, onClose }: { ip: string | null; token?: string | null; onClose: () => void }) {
  const [username, setUsername] = useState('')
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>('password')
  const [result, setResult] = useState<{ instructions: string[]; sshCommand: string } | null>(null)
  const [loading, setLoading] = useState(false)

  if (!ip) return null

  const handleDeploy = async () => {
    setLoading(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${API_URL}/api/network/deploy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ip, username, authMethod }),
      })
      if (res.ok) {
        const data = await res.json() as { instructions: string[]; sshCommand: string }
        setResult(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!ip} onOpenChange={(o) => { if (!o) { setResult(null); setUsername(''); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4" />
            Deploy Jait Node to {ip}
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">SSH Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. pi, ubuntu, root"
                className="w-full px-3 py-2 text-sm rounded-md border bg-background"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Auth Method</label>
              <div className="flex gap-2">
                <Button size="sm" variant={authMethod === 'password' ? 'default' : 'outline'}
                  onClick={() => setAuthMethod('password')}>
                  Password
                </Button>
                <Button size="sm" variant={authMethod === 'key' ? 'default' : 'outline'}
                  onClick={() => setAuthMethod('key')}>
                  SSH Key
                </Button>
              </div>
            </div>

            <Button className="w-full" onClick={() => void handleDeploy()} disabled={!username.trim() || loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
              Generate Deploy Script
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-sm font-medium">Instructions</span>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                {result.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">SSH Command</span>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                {result.sshCommand}
              </pre>
            </div>

            <Button variant="outline" className="w-full" onClick={() => { navigator.clipboard.writeText(result.sshCommand); }}>
              Copy Command
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

interface NetworkPanelProps {
  token?: string | null
}

export function NetworkPanel({ token }: NetworkPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [topology, setTopology] = useState<TopologyResponse | null>(null)
  const [scanning, setScanning] = useState(false)
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [deployIp, setDeployIp] = useState<string | null>(null)

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {}
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [token])

  // Fetch topology
  const fetchTopology = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/network/topology`, { headers: headers() })
      if (res.ok) {
        const data = await res.json() as TopologyResponse
        setTopology(data)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch topology')
    }
  }, [headers])

  // Trigger network scan
  const handleScan = useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/network/scan`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`)
      await fetchTopology()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }, [headers, fetchTopology])

  // Initial load + polling
  useEffect(() => {
    void fetchTopology()
    const interval = setInterval(() => void fetchTopology(), 15_000)
    return () => clearInterval(interval)
  }, [fetchTopology])

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Build graph data
  const graphData = useMemo(() => {
    if (!topology) return { nodes: [] as GraphNode[], links: [] as GraphLink[] }

    const nodes: GraphNode[] = []
    const links: GraphLink[] = []

    // Gateway (center)
    nodes.push({ id: topology.gateway.id, data: topology.gateway })

    // Connected devices
    for (const d of topology.devices) {
      nodes.push({ id: d.id, data: d })
      links.push({ source: d.id, target: 'gateway', type: 'connected' })
    }

    // Mesh nodes
    for (const m of topology.meshNodes) {
      nodes.push({ id: m.id, data: m })
      links.push({ source: m.id, target: 'gateway', type: 'connected' })
    }

    // Scanned hosts (skip if the host IP matches the gateway IP)
    for (const h of topology.hosts) {
      if (h.ip === topology.gateway.ip) continue
      nodes.push({ id: h.id, data: h })
      links.push({ source: h.id, target: 'gateway', type: 'scanned' })
    }

    return { nodes, links }
  }, [topology])

  // Center on gateway once after first data load — avoid re-zooming on every scan
  const hasInitialZoomRef = useRef(false)
  useEffect(() => {
    if (graphRef.current && graphData.nodes.length > 0 && !hasInitialZoomRef.current) {
      hasInitialZoomRef.current = true
      setTimeout(() => {
        const fg = graphRef.current
        if (!fg) return
        fg.zoomToFit(400, 160)
        // Cap zoom so it doesn't fly in too close with few nodes
        setTimeout(() => {
          const currentZoom = fg.zoom()
          if (currentZoom > 3) fg.zoom(3, 400)
        }, 500)
      }, 1200)
    }
  }, [graphData.nodes.length])

  // Draw node
  const drawNode = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { data } = node
    const x = node.x ?? 0
    const y = node.y ?? 0
    const size = NODE_SIZES[data.type] ?? 8
    const color = NODE_COLORS[data.type] ?? '#6b7280'
    const isHovered = hoveredNode === node.id
    const isSelected = selectedNode?.id === data.id

    // Glow for gateway
    if (data.type === 'gateway') {
      ctx.beginPath()
      ctx.arc(x, y, size + 4, 0, 2 * Math.PI)
      ctx.fillStyle = `${color}33`
      ctx.fill()
    }

    // SSH ring indicator for hosts
    if (data.type === 'host' && 'sshReachable' in data && data.sshReachable) {
      ctx.beginPath()
      ctx.arc(x, y, size + 3, 0, 2 * Math.PI)
      ctx.strokeStyle = '#f59e0b55'
      ctx.lineWidth = 1.5 / globalScale
      ctx.stroke()
    }

    // Outer ring on hover/select
    if (isHovered || isSelected) {
      ctx.beginPath()
      ctx.arc(x, y, size + 2.5, 0, 2 * Math.PI)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5 / globalScale
      ctx.stroke()
    }

    // Main circle
    ctx.beginPath()
    ctx.arc(x, y, size, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()

    // Online indicator dot
    if (data.online) {
      ctx.beginPath()
      ctx.arc(x + size * 0.65, y - size * 0.65, 2.5, 0, 2 * Math.PI)
      ctx.fillStyle = '#22c55e'
      ctx.fill()
      ctx.strokeStyle = '#0a0a0a'
      ctx.lineWidth = 0.5
      ctx.stroke()
    }

    // Platform emoji inside for gateway/device/mesh
    if ((data.type === 'gateway' || data.type === 'device' || data.type === 'mesh') && 'platform' in data) {
      const emoji = PLATFORM_ICONS[data.platform] ?? '\ud83d\udcbb'
      ctx.font = `${size * 0.9}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emoji, x, y + 0.5)
    }

    // Label below
    const fontSize = Math.max(3.5, 10 / globalScale)
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = isHovered ? '#ffffff' : '#a1a1aa'
    const label = data.name.length > 20 ? data.name.slice(0, 18) + '\u2026' : data.name
    ctx.fillText(label, x, y + size + 3)

    // Type badge for gateway
    if (data.type === 'gateway') {
      ctx.font = `bold ${Math.max(3, 8 / globalScale)}px -apple-system, BlinkMacSystemFont, sans-serif`
      ctx.fillStyle = '#22c55e'
      ctx.fillText('GATEWAY', x, y + size + 3 + fontSize + 2)
      // Show OS version below GATEWAY label
      if ('osVersion' in data && data.osVersion) {
        const osFontSize = Math.max(2.5, 7 / globalScale)
        ctx.font = `${osFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
        ctx.fillStyle = '#60a5fa'
        const osLabel = data.osVersion.length > 30 ? data.osVersion.slice(0, 28) + '\u2026' : data.osVersion
        ctx.fillText(osLabel, x, y + size + 3 + fontSize + 2 + Math.max(3, 8 / globalScale) + 2)
      }
    }

    // OS version label for hosts
    if (data.type === 'host' && 'osVersion' in data && data.osVersion) {
      const osFontSize = Math.max(2.5, 7 / globalScale)
      ctx.font = `${osFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
      ctx.fillStyle = '#60a5fa'
      const osLabel = data.osVersion.length > 24 ? data.osVersion.slice(0, 22) + '\u2026' : data.osVersion
      ctx.fillText(osLabel, x, y + size + 3 + fontSize + 2)
    }

    // Providers label below name (for devices and hosts with providers)
    const providers = ('providers' in data && Array.isArray(data.providers)) ? data.providers : []
    if (providers.length > 0) {
      const provFontSize = Math.max(2.5, 7 / globalScale)
      ctx.font = `${provFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
      ctx.fillStyle = '#a855f7'
      const yOffset = data.type === 'gateway' ? fontSize * 2 + 6 : fontSize + 5
      ctx.fillText(providers.join(' \u00b7 '), x, y + size + 3 + yOffset)
    }

    // Port count badge for hosts (top-left of node)
    if (data.type === 'host' && 'openPorts' in data && data.openPorts.length > 0) {
      const portCount = data.openPorts.length
      const badgeFontSize = Math.max(2.5, 7 / globalScale)
      ctx.font = `bold ${badgeFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
      ctx.fillStyle = '#3b82f6'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // Small badge circle
      const bx = x - size * 0.65
      const by = y - size * 0.65
      ctx.beginPath()
      ctx.arc(bx, by, 3.5, 0, 2 * Math.PI)
      ctx.fillStyle = '#3b82f6'
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(String(portCount), bx, by)
    }
  }, [hoveredNode, selectedNode])

  // Draw link
  const drawLink = useCallback((link: GraphLink, ctx: CanvasRenderingContext2D) => {
    const source = link.source as unknown as GraphNode
    const target = link.target as unknown as GraphNode
    if (!source?.x || !target?.x) return

    ctx.beginPath()
    ctx.moveTo(source.x, source.y!)
    ctx.lineTo(target.x, target.y!)

    if (link.type === 'connected') {
      ctx.strokeStyle = '#3b82f644'
      ctx.lineWidth = 1.5
      ctx.setLineDash([])
    } else {
      ctx.strokeStyle = '#6b728033'
      ctx.lineWidth = 0.5
      ctx.setLineDash([4, 4])
    }
    ctx.stroke()
    ctx.setLineDash([])
  }, [])

  const deviceCount = topology
    ? 1 + topology.devices.length + topology.meshNodes.length + topology.hosts.length
    : 0

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Network</h2>
          {deviceCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {deviceCount} {deviceCount === 1 ? 'node' : 'nodes'}
            </Badge>
          )}
          {topology?.scannedAt && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              Last scan: {new Date(topology.scannedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void fetchTopology()}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs"
            onClick={() => void handleScan()}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="h-3 w-3 mr-1" />
                {topology?.scannedAt ? 'Rescan Network' : 'Discover Devices'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 px-4 py-2">
          <X className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b text-[10px] text-muted-foreground shrink-0 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NODE_COLORS.gateway }} />
          Gateway
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NODE_COLORS.device }} />
          Connected Device
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NODE_COLORS.mesh }} />
          Mesh Node
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NODE_COLORS.host }} />
          Network Host
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-amber-500/50" style={{ backgroundColor: 'transparent' }} />
          SSH Available
        </span>
      </div>

      {/* Graph */}
      <div ref={containerRef} className="flex-1 min-h-0 relative bg-background">
        {graphData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef as React.MutableRefObject<ForceGraphMethods<GraphNode, GraphLink> | undefined>}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeId="id"
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={(node: GraphNode, color, ctx) => {
              const size = NODE_SIZES[node.data.type] ?? 6
              ctx.beginPath()
              ctx.arc(node.x ?? 0, node.y ?? 0, size + 4, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()
            }}
            linkCanvasObject={drawLink}
            onNodeClick={(node: GraphNode) => setSelectedNode(node.data)}
            onNodeHover={(node: GraphNode | null) => setHoveredNode(node?.id ?? null)}
            cooldownTicks={80}
            d3VelocityDecay={0.3}
            d3AlphaDecay={0.02}
            enableNodeDrag
            enableZoomInteraction
            enablePanInteraction
            backgroundColor="transparent"
          />
        ) : !topology ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading network topology...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Monitor className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium">No devices found</div>
            <div className="text-xs text-muted-foreground max-w-xs text-center">
              Run a network scan to discover devices on your local network.
            </div>
            <Button size="sm" onClick={() => void handleScan()} className="mt-2">
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Discover Devices
            </Button>
          </div>
        )}
      </div>

      {/* Node detail dialog */}
      <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} onDeploy={(ip) => setDeployIp(ip)} />

      {/* Deploy dialog */}
      <DeployDialog ip={deployIp} token={token} onClose={() => setDeployIp(null)} />
    </div>
  )
}
