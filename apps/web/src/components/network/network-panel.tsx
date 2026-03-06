import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Wifi,
  WifiOff,
  Search,
  Server,
  Monitor,
  Terminal,
  Upload,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Copy,
  Globe,
  Network,
} from 'lucide-react'
import {
  useNetwork,
  type NetworkHost,
  type NetworkInterface,
  type GatewayNode,
  type SshTestResult,
  type DeployResult,
  type SshEnableInfo,
} from '@/hooks/useNetwork'

interface NetworkPanelProps {
  token?: string | null
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InterfaceCard({ iface }: { iface: NetworkInterface }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/50 text-sm">
      <Network className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{iface.name}</div>
        <div className="text-xs text-muted-foreground">{iface.ip} / {iface.netmask}</div>
      </div>
      <code className="text-xs text-muted-foreground">{iface.mac}</code>
    </div>
  )
}

function DeviceCard({
  host,
  onTestSsh,
  onDeploy,
  onSshEnable,
}: {
  host: NetworkHost
  onTestSsh: (ip: string) => void
  onDeploy: (ip: string) => void
  onSshEnable: (ip: string) => void
}) {
  const isGateway = host.agentStatus === 'running'

  return (
    <div className="border rounded-lg p-3 flex flex-col gap-2.5 hover:bg-muted/30 transition-colors">
      {/* Icon + name row */}
      <div className="flex items-start gap-2.5">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
          isGateway ? 'bg-green-500/15 text-green-500' : 'bg-muted text-muted-foreground'
        }`}>
          {isGateway ? <Server className="h-4.5 w-4.5" /> : <Monitor className="h-4.5 w-4.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">
            {host.hostname || host.ip}
          </div>
          {host.hostname && (
            <div className="text-xs text-muted-foreground font-mono">{host.ip}</div>
          )}
        </div>
      </div>

      {/* Info pills */}
      <div className="flex flex-wrap gap-1">
        {isGateway && (
          <Badge variant="default" className="bg-green-600 text-[10px] h-5">Gateway</Badge>
        )}
        {host.agentStatus === 'installed' && (
          <Badge variant="secondary" className="text-[10px] h-5">Installed</Badge>
        )}
        {host.sshReachable ? (
          <Badge variant="secondary" className="text-[10px] h-5 gap-1">
            <Shield className="h-2.5 w-2.5" /> SSH
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] h-5 gap-1 text-muted-foreground">
            <Shield className="h-2.5 w-2.5" /> No SSH
          </Badge>
        )}
        {host.openPorts.length > 0 && (
          <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
            {host.openPorts.length} {host.openPorts.length === 1 ? 'port' : 'ports'}
          </Badge>
        )}
      </div>

      {/* Details */}
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        {host.mac && <div>MAC: <span className="font-mono">{host.mac}</span></div>}
        {host.openPorts.length > 0 && (
          <div>Ports: <span className="font-mono">{host.openPorts.join(', ')}</span></div>
        )}
        <div>Seen: {new Date(host.lastSeen).toLocaleTimeString()}</div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => onTestSsh(host.ip)}>
          <Terminal className="h-3 w-3 mr-1" />
          Test SSH
        </Button>
        {!host.sshReachable && (
          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => onSshEnable(host.ip)}>
            <Shield className="h-3 w-3 mr-1" />
            Enable SSH
          </Button>
        )}
        {host.sshReachable && host.agentStatus !== 'running' && (
          <Button size="sm" variant="default" className="h-6 text-[11px] px-2" onClick={() => onDeploy(host.ip)}>
            <Upload className="h-3 w-3 mr-1" />
            Deploy
          </Button>
        )}
        {isGateway && (
          <Button size="sm" variant="secondary" className="h-6 text-[11px] px-2" asChild>
            <a href={`http://${host.ip}:8000`} target="_blank" rel="noopener noreferrer">
              <Globe className="h-3 w-3 mr-1" />
              Dashboard
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

function GatewayNodeCard({ node }: { node: GatewayNode }) {
  const statusColor = {
    online: 'bg-green-500',
    offline: 'bg-red-500',
    degraded: 'bg-yellow-500',
  }[node.status]

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-md border text-sm">
      <Server className="h-4 w-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{node.hostname ?? node.ip}</span>
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
        </div>
        <div className="text-xs text-muted-foreground">
          {node.ip} · v{node.version} · {node.platform}
        </div>
      </div>
      <Badge variant="outline" className="text-[10px]">{node.status}</Badge>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function SshTestDialog({
  open,
  onOpenChange,
  result,
  testing,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  result: SshTestResult | null
  testing: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>SSH Connection Test</DialogTitle>
          <DialogDescription>{result?.ip ?? 'Testing...'}</DialogDescription>
        </DialogHeader>
        {testing ? (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Testing SSH connection...</span>
          </div>
        ) : result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {result.reachable ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="font-medium">
                {result.reachable ? 'SSH is reachable' : 'SSH is not reachable'}
              </span>
            </div>
            {result.authMethods.length > 0 && (
              <div className="text-sm">
                <div className="text-muted-foreground mb-1">Auth methods:</div>
                <div className="flex gap-1.5">
                  {result.authMethods.map(m => (
                    <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
                  ))}
                </div>
              </div>
            )}
            {result.platform && (
              <div className="text-sm">
                <div className="text-muted-foreground mb-1">SSH Banner:</div>
                <code className="text-xs bg-muted px-2 py-1 rounded block">{result.platform}</code>
              </div>
            )}
            {result.error && (
              <div className="text-sm text-red-500">{result.error}</div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SshEnableDialog({
  open,
  onOpenChange,
  info,
  loading,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  info: SshEnableInfo | null
  loading: boolean
}) {
  const copyCommand = () => {
    if (info?.command) navigator.clipboard.writeText(info.command)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enable SSH</DialogTitle>
          <DialogDescription>
            Instructions for enabling SSH on the target machine
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading instructions...</span>
          </div>
        ) : info ? (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Platform: {info.platform}</Label>
              <div className="relative">
                <pre className="bg-muted text-xs p-3 rounded-md overflow-x-auto">{info.command}</pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-1 right-1 h-6 w-6 p-0"
                  onClick={copyCommand}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Steps:</Label>
              <ol className="space-y-1.5 text-sm list-decimal list-inside">
                {info.steps.map((step, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="text-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DeployDialog({
  open,
  onOpenChange,
  targetIp,
  onDeploy,
  result,
  deploying,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  targetIp: string
  onDeploy: (username: string, authMethod: string) => void
  result: DeployResult | null
  deploying: boolean
}) {
  const [username, setUsername] = useState('')
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>('key')

  const copyScript = () => {
    if (result?.deployScript) navigator.clipboard.writeText(result.deployScript)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deploy Jait Gateway</DialogTitle>
          <DialogDescription>
            Install and configure a Jait Gateway node on {targetIp}
          </DialogDescription>
        </DialogHeader>
        {!result ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="deploy-user" className="text-sm">SSH Username</Label>
              <Input
                id="deploy-user"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. pi, ubuntu, admin"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm mb-2 block">Authentication</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={authMethod === 'key' ? 'default' : 'outline'}
                  onClick={() => setAuthMethod('key')}
                  className="text-xs"
                >
                  SSH Key
                </Button>
                <Button
                  size="sm"
                  variant={authMethod === 'password' ? 'default' : 'outline'}
                  onClick={() => setAuthMethod('password')}
                  className="text-xs"
                >
                  Password
                </Button>
              </div>
            </div>
            <Button
              onClick={() => onDeploy(username, authMethod)}
              disabled={!username.trim() || deploying}
              className="w-full"
            >
              {deploying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Preparing deployment...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Deploy Gateway
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Deployment script generated
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-muted-foreground">Deployment Script</Label>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={copyScript}>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
              <pre className="bg-muted text-xs p-3 rounded-md overflow-auto max-h-48">{result.deployScript}</pre>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Steps:</Label>
              <ol className="space-y-1 text-sm list-decimal list-inside">
                {result.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
            <div className="text-xs text-muted-foreground">
              Estimated time: {result.estimatedDuration}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function NetworkPanel({ token }: NetworkPanelProps) {
  const {
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
  } = useNetwork(token)

  // Dialog state
  const [sshTestOpen, setSshTestOpen] = useState(false)
  const [sshTestResult, setSshTestResult] = useState<SshTestResult | null>(null)
  const [sshTesting, setSshTesting] = useState(false)

  const [sshEnableOpen, setSshEnableOpen] = useState(false)
  const [sshEnableInfo, setSshEnableInfo] = useState<SshEnableInfo | null>(null)
  const [sshEnableLoading, setSshEnableLoading] = useState(false)

  const [deployOpen, setDeployOpen] = useState(false)
  const [deployTargetIp, setDeployTargetIp] = useState('')
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null)
  const [deploying, setDeploying] = useState(false)

  // Initial load
  useEffect(() => {
    fetchInterfaces()
    fetchNodes()
    fetchLatestScan()
  }, [fetchInterfaces, fetchNodes, fetchLatestScan])

  // Handlers
  const handleScan = useCallback(() => {
    scan()
  }, [scan])

  const handleTestSsh = useCallback(async (ip: string) => {
    setSshTestResult(null)
    setSshTesting(true)
    setSshTestOpen(true)
    const result = await testSsh(ip)
    setSshTestResult(result)
    setSshTesting(false)
  }, [testSsh])

  const handleSshEnable = useCallback(async (_ip: string) => {
    setSshEnableInfo(null)
    setSshEnableLoading(true)
    setSshEnableOpen(true)
    // Detect platform heuristic — default to showing all
    const info = await getSshEnableInfo('windows')
    setSshEnableInfo(info)
    setSshEnableLoading(false)
  }, [getSshEnableInfo])

  const handleOpenDeploy = useCallback((ip: string) => {
    setDeployTargetIp(ip)
    setDeployResult(null)
    setDeployOpen(true)
  }, [])

  const handleDeploy = useCallback(async (username: string, authMethod: string) => {
    setDeploying(true)
    const result = await deploy(deployTargetIp, username, authMethod)
    setDeployResult(result)
    setDeploying(false)
  }, [deploy, deployTargetIp])

  // Total device count (scan hosts + gateway nodes, deduplicated by IP)
  const deviceCount = (() => {
    const ips = new Set<string>()
    scanResult?.hosts.forEach(h => ips.add(h.ip))
    nodes.forEach(n => ips.add(n.ip))
    return ips.size
  })()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Network</h2>
          {deviceCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {deviceCount} {deviceCount === 1 ? 'device' : 'devices'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {scanning ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancelScan}>
              <XCircle className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          ) : (
            <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleScan}>
              {scanResult ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Rescan
                </>
              ) : (
                <>
                  <Search className="h-3 w-3 mr-1" />
                  Discover Devices
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 rounded-md px-3 py-2">
            <WifiOff className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Scanning indicator */}
        {scanning && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground">
              Discovering devices — this may take 30-60 seconds...
            </div>
            <div className="text-xs text-muted-foreground">
              Probing ARP table, common ports (22, 80, 443, 8000, 8080)
            </div>
          </div>
        )}

        {/* Gateway Nodes (always show if present — these are "your" devices) */}
        {nodes.length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Jait Gateway Nodes
            </h3>
            <div className="space-y-1.5">
              {nodes.map(node => (
                <GatewayNodeCard key={node.id} node={node} />
              ))}
            </div>
          </section>
        )}

        {/* Discovered devices */}
        {!scanning && scanResult && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Discovered Devices
              </h3>
              <span className="text-[10px] text-muted-foreground">
                {scanResult.hosts.length} {scanResult.hosts.length === 1 ? 'device' : 'devices'}
                {' · '}{scanResult.subnet}
                {' · '}{(scanResult.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
            {scanResult.hosts.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No devices found. Try rescanning or check your network connection.
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                {scanResult.hosts.map(host => (
                  <DeviceCard
                    key={host.ip}
                    host={host}
                    onTestSsh={handleTestSsh}
                    onDeploy={handleOpenDeploy}
                    onSshEnable={handleSshEnable}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Empty state */}
        {!scanning && !scanResult && !error && nodes.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Monitor className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-medium">Discover devices</div>
              <div className="text-xs text-muted-foreground mt-1 max-w-xs">
                Scan your local network to find devices, test SSH connectivity,
                and deploy Jait Gateway to other machines.
              </div>
            </div>
            <Button size="sm" onClick={handleScan} className="mt-2">
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Discover Devices
            </Button>
          </div>
        )}

        {/* Network interfaces */}
        {interfaces.length > 0 && (
          <section className="pt-2 border-t">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Network className="h-3 w-3" />
              <span className="uppercase tracking-wider font-medium">Network Interfaces</span>
              <span className="text-[10px] ml-1">({interfaces.filter(i => !i.internal).length})</span>
            </div>
            <div className="space-y-1.5">
              {interfaces.filter(i => !i.internal).map(iface => (
                <InterfaceCard key={iface.name + iface.ip} iface={iface} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Dialogs */}
      <SshTestDialog
        open={sshTestOpen}
        onOpenChange={setSshTestOpen}
        result={sshTestResult}
        testing={sshTesting}
      />
      <SshEnableDialog
        open={sshEnableOpen}
        onOpenChange={setSshEnableOpen}
        info={sshEnableInfo}
        loading={sshEnableLoading}
      />
      <DeployDialog
        open={deployOpen}
        onOpenChange={setDeployOpen}
        targetIp={deployTargetIp}
        onDeploy={handleDeploy}
        result={deployResult}
        deploying={deploying}
      />
    </div>
  )
}
