import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getApiUrl } from '@/lib/gateway-url'

interface JaitNode {
  id: string
  name: string
  version: string
  online: boolean
}

interface PairedUpdateNode {
  id: string
  name: string
  appVersion: string | null
  online: boolean
  granted: boolean
}

// Compare release versions only; unknown or prerelease versions are not safe to update blindly.
function isOlderRelease(current: string | null, latest: string): boolean | null {
  const a = current?.match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  const b = latest.match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  if (!a || !b) return null
  for (let i = 1; i <= 3; i++) {
    const difference = Number(a[i]) - Number(b[i])
    if (difference !== 0) return difference < 0
  }
  return false
}

interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  canApply?: boolean
}

interface JaitNodesPanelProps {
  gateway: JaitNode | null
  meshNodes: JaitNode[]
  devices?: Array<{ id: string; name: string; online: boolean }>
  token?: string | null
  loadError?: string | null
  onClose: () => void
}

export function JaitNodesPanel({ gateway, meshNodes, devices = [], token, loadError, onClose }: JaitNodesPanelProps) {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pairedNodes, setPairedNodes] = useState<PairedUpdateNode[] | null>(null)
  const [pairedError, setPairedError] = useState<string | null>(null)
  const [updatingNode, setUpdatingNode] = useState<string | null>(null)
  const [nodeMessages, setNodeMessages] = useState<Record<string, string>>({})

  const checkNodes = useCallback(async () => {
    if (!token) return
    try {
      const response = await fetch(`${getApiUrl()}/api/update/nodes`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Could not check node update support')
      const result = await response.json() as { nodes: PairedUpdateNode[] }
      setPairedNodes(result.nodes)
      setPairedError(null)
      setNodeMessages({})
    } catch {
      setPairedNodes(null)
      setPairedError('Could not check node update support')
    }
  }, [token])

  const check = useCallback(async () => {
    if (!token) return
    setChecking(true)
    void checkNodes()
    setMessage(null)
    try {
      const response = await fetch(`${getApiUrl()}/api/update/check`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Could not check for updates')
      setUpdate(await response.json() as UpdateInfo)
    } catch (error) {
      setUpdate(null)
      setMessage(error instanceof Error ? error.message : 'Could not check for updates')
    } finally {
      setChecking(false)
    }
  }, [token, checkNodes])

  useEffect(() => { void check() }, [check])

  const apply = async () => {
    if (!token || !update?.hasUpdate) return
    setApplying(true)
    setMessage(null)
    try {
      const response = await fetch(`${getApiUrl()}/api/update/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: update.latestVersion }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { hint?: string; error?: string }
        throw new Error(data.hint || data.error || 'Update failed')
      }
      setMessage(`Update to v${update.latestVersion} started. The gateway will restart.`)
      setUpdate(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed')
    } finally {
      setApplying(false)
    }
  }

  const applyNode = async (node: PairedUpdateNode) => {
    if (!token || !update || !node.online || !node.granted || isOlderRelease(node.appVersion, update.latestVersion) !== true) return
    setUpdatingNode(node.id)
    setNodeMessages(previous => ({ ...previous, [node.id]: '' }))
    try {
      const response = await fetch(`${getApiUrl()}/api/update/nodes/${encodeURIComponent(node.id)}/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: update.latestVersion }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; hint?: string }
      if (response.status >= 500) throw new Error('Update outcome unknown. Check the node version before retrying.')
      if (!response.ok) throw new Error(result.hint || result.error || 'Update failed')
      setNodeMessages(previous => ({ ...previous, [node.id]: 'Update started. The node will restart.' }))
    } catch (error) {
      setNodeMessages(previous => ({ ...previous, [node.id]: error instanceof TypeError ? 'Update outcome unknown. Check the node version before retrying.' : error instanceof Error ? error.message : 'Update outcome unknown. Check the node version before retrying.' }))
    } finally {
      setUpdatingNode(null)
    }
  }

  return (
    <aside aria-label="Jait nodes" className="absolute right-0 top-0 z-20 flex h-full w-80 max-w-full flex-col border-l bg-background shadow-lg">
      <div className="flex items-center justify-between border-b p-4">
        <div><h3 className="text-sm font-semibold">Jait nodes</h3><p className="text-xs text-muted-foreground">Versions and updates</p></div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close Jait nodes"><X className="h-4 w-4" /></Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {!gateway && <p className="text-sm text-muted-foreground">{loadError ? `Could not load nodes: ${loadError}` : 'Loading nodes…'}</p>}
        {gateway && <section className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2"><h4 className="truncate text-sm font-medium">{gateway.name}</h4><span className="text-xs text-muted-foreground">Gateway</span></div>
          <p className="text-xs text-muted-foreground">Version {gateway.version ? `v${gateway.version.replace(/^v/, '')}` : 'unknown'} · {gateway.online ? 'Online' : 'Offline'}</p>
          {checking ? <p className="text-xs text-muted-foreground">Checking for updates…</p> : update && <p className="text-xs text-muted-foreground">{update.hasUpdate ? `Update available: v${update.latestVersion}` : 'Up to date'}</p>}
          {update?.hasUpdate && update.canApply === false && <p className="text-xs text-muted-foreground">Automatic updates require a systemd-managed gateway.</p>}
          {update?.hasUpdate && update.canApply === undefined && <p className="text-xs text-muted-foreground">Automatic updates may require a systemd-managed gateway.</p>}
          {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void check()} disabled={checking || applying || !token}><RefreshCw className="mr-1 h-3 w-3" />Check</Button>
            {update?.hasUpdate && update.canApply !== false && <Button size="sm" onClick={() => void apply()} disabled={applying || !gateway.online}>{applying && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{applying ? 'Updating…' : 'Update'}</Button>}
          </div>
        </section>}
        <p className="text-xs text-muted-foreground">For paired, systemd-managed gateways, enable JAIT_ALLOW_REMOTE_UPDATE=1 on the node, then grant Gateway update in Settings → Nodes.</p>
        {pairedError && <p role="status" className="text-xs text-muted-foreground">{pairedError}</p>}
        {pairedNodes?.map(node => {
          const older = update ? isOlderRelease(node.appVersion, update.latestVersion) : null
          return <section key={`paired-${node.id}`} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2"><h4 className="truncate text-sm font-medium">{node.name}</h4><span className="text-xs text-muted-foreground">{node.online ? 'Online' : 'Offline'}</span></div>
            <p className="text-xs text-muted-foreground">Version {node.appVersion ? `v${node.appVersion.replace(/^v/, '')}` : 'unknown'}</p>
            {!node.online ? <p className="text-xs text-muted-foreground">Update unavailable while offline.</p> : !node.granted ? <p className="text-xs text-muted-foreground">Allow updates for this node in <a className="underline" href="/settings?tab=nodes">Settings → Nodes</a>.</p> : !update ? <p className="text-xs text-muted-foreground">Check for updates to compare versions.</p> : older === null ? <p className="text-xs text-muted-foreground">Unable to compare this version.</p> : older ? <p className="text-xs text-muted-foreground">Update available: v{update.latestVersion}</p> : <p className="text-xs text-muted-foreground">No update available</p>}
            {nodeMessages[node.id] && <p role="status" className="text-xs text-muted-foreground">{nodeMessages[node.id]}</p>}
            {node.online && node.granted && older === true && <Button size="sm" disabled={updatingNode !== null || Boolean(nodeMessages[node.id])} onClick={() => void applyNode(node)}>{updatingNode === node.id ? 'Updating…' : 'Update'}</Button>}
          </section>
        })}
        {devices.filter(device => !pairedNodes?.some(node => device.id === `device-${node.id}`)).map(device => <section key={`device-${device.id}`} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2"><h4 className="truncate text-sm font-medium">{device.name}</h4><span className="text-xs text-muted-foreground">{device.online ? 'Online' : 'Offline'}</span></div>
          <p className="text-xs text-muted-foreground">Connected device · Version unknown</p>
          <p className="text-xs text-muted-foreground">{pairedError ? 'Update support could not be checked.' : pairedNodes === null ? 'Checking update support…' : 'Updates are not available here.'}</p>
        </section>)}
        {meshNodes.map(node => <section key={node.id} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2"><h4 className="truncate text-sm font-medium">{node.name}</h4><span className="text-xs text-muted-foreground">{node.online ? 'Online' : 'Offline'}</span></div>
          <p className="text-xs text-muted-foreground">Version {node.version ? `v${node.version.replace(/^v/, '')}` : 'unknown'}</p>
          <p className="text-xs text-muted-foreground">{node.online ? 'Remote updates are not available here.' : 'Update unavailable while offline.'}</p>
        </section>)}
      </div>
    </aside>
  )
}
