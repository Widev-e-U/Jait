/**
 * FolderPickerDialog — browse filesystem nodes and pick a directory.
 *
 * Shows a device/node selector at the top so users can pick which machine's
 * filesystem to browse (gateway, desktop, mobile). Defaults to the current
 * device's node if it's registered, otherwise falls back to the gateway.
 *
 * Uses the /api/filesystem/nodes, /api/filesystem/roots and
 * /api/filesystem/browse endpoints. Remote nodes are proxied through
 * the gateway via WebSocket.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  FolderOpen, FolderIcon, ChevronRight, ArrowUp, Home, Loader2,
  HardDrive, Monitor, Smartphone, Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FsNode, FsBrowseEntry } from '@jait/shared'
import { detectPlatform, generateDeviceId } from '@/lib/device-id'

const API_URL = import.meta.env.VITE_API_URL || ''

/** Icon for a filesystem node based on its platform */
function NodeIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'windows':
    case 'macos':
    case 'linux':
      return <Monitor className="h-3.5 w-3.5" />
    case 'android':
    case 'ios':
      return <Smartphone className="h-3.5 w-3.5" />
    default:
      return <Globe className="h-3.5 w-3.5" />
  }
}

interface FolderPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
}

export function FolderPickerDialog({ open, onOpenChange, onSelect }: FolderPickerDialogProps) {
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<FsBrowseEntry[]>([])
  const [roots, setRoots] = useState<FsBrowseEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualPath, setManualPath] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)

  // Device / node state
  const [nodes, setNodes] = useState<FsNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string>('gateway')

  // Load nodes + roots on first open
  useEffect(() => {
    if (!open) return
    void loadNodes()
  }, [open])

  const loadNodes = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/filesystem/nodes`)
      if (!res.ok) throw new Error('Failed to load nodes')
      const data = (await res.json()) as { nodes: FsNode[] }
      setNodes(data.nodes)

      // Auto-select the matching device node, or fall back to gateway
      const platform = detectPlatform()
      let defaultNodeId = 'gateway'

      if (platform === 'electron' || platform === 'capacitor') {
        const deviceId = generateDeviceId()
        const myNode = data.nodes.find(n => n.id === deviceId)
        if (myNode) defaultNodeId = myNode.id
      }

      setSelectedNodeId(defaultNodeId)
      // Load roots for the selected node
      await loadRoots(defaultNodeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load nodes')
    }
  }, [])

  const loadRoots = useCallback(async (nodeId: string) => {
    try {
      setLoading(true)
      setError(null)
      setCurrentPath(null)
      setParentPath(null)
      setEntries([])
      const url = `${API_URL}/api/filesystem/roots?nodeId=${encodeURIComponent(nodeId)}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load roots')
      const data = (await res.json()) as { roots: FsBrowseEntry[] }
      setRoots(data.roots)
      // Auto-navigate to home
      const home = data.roots.find(r => r.name === 'Home')
      if (home) {
        await browse(home.path, nodeId)
      } else if (data.roots.length > 0) {
        await browse(data.roots[0].path, nodeId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  const browse = useCallback(async (dirPath: string, nodeId?: string) => {
    const nid = nodeId ?? selectedNodeId
    try {
      setLoading(true)
      setError(null)
      const url = `${API_URL}/api/filesystem/browse?path=${encodeURIComponent(dirPath)}&nodeId=${encodeURIComponent(nid)}`
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed to browse' }))
        throw new Error((body as { message?: string }).message ?? 'Failed to browse')
      }
      const data = (await res.json()) as { path: string; parent: string | null; entries: FsBrowseEntry[] }
      setCurrentPath(data.path)
      setParentPath(data.parent)
      setEntries(data.entries)
      setManualPath(data.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse')
    } finally {
      setLoading(false)
    }
  }, [selectedNodeId])

  const handleNodeChange = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    void loadRoots(nodeId)
  }, [loadRoots])

  const handleSelect = useCallback(() => {
    if (currentPath) {
      onSelect(currentPath)
      onOpenChange(false)
    }
  }, [currentPath, onSelect, onOpenChange])

  const handleManualGo = useCallback(() => {
    if (manualPath.trim()) {
      void browse(manualPath.trim())
      setShowManualInput(false)
    }
  }, [manualPath, browse])

  // Only show directories in the listing
  const dirs = entries.filter(e => e.type === 'dir')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-4 w-4" />
            Open Workspace
          </DialogTitle>
        </DialogHeader>

        {/* Device / node selector */}
        {nodes.length > 1 && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/20 overflow-x-auto">
            {nodes.map(node => (
              <button
                key={node.id}
                onClick={() => handleNodeChange(node.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors',
                  selectedNodeId === node.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground text-muted-foreground',
                )}
              >
                <NodeIcon platform={node.platform} />
                <span>{node.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Breadcrumb / path bar */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b text-xs text-muted-foreground bg-muted/30">
          {/* Root buttons */}
          {roots.filter(r => r.name !== 'Home').map(r => (
            <button
              key={r.path}
              onClick={() => void browse(r.path)}
              className="px-1.5 py-0.5 rounded hover:bg-accent hover:text-accent-foreground flex items-center gap-1"
              title={r.path}
            >
              <HardDrive className="h-3 w-3" />
              <span>{r.name}</span>
            </button>
          ))}
          <button
            onClick={() => {
              const home = roots.find(r => r.name === 'Home')
              if (home) void browse(home.path)
            }}
            className="px-1.5 py-0.5 rounded hover:bg-accent hover:text-accent-foreground flex items-center gap-1"
            title="Home directory"
          >
            <Home className="h-3 w-3" />
          </button>
          <div className="h-3 w-px bg-border mx-1" />
          {parentPath && (
            <button
              onClick={() => void browse(parentPath)}
              className="px-1.5 py-0.5 rounded hover:bg-accent hover:text-accent-foreground flex items-center gap-1"
              title="Go up"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => setShowManualInput(v => !v)}
            className="ml-auto px-1.5 py-0.5 rounded hover:bg-accent hover:text-accent-foreground text-[10px]"
          >
            {showManualInput ? 'Browse' : 'Enter path'}
          </button>
        </div>

        {/* Manual path input */}
        {showManualInput && (
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
            <input
              type="text"
              value={manualPath}
              onChange={e => setManualPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleManualGo() }}
              className="flex-1 h-7 px-2 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Enter absolute path..."
              autoFocus
            />
            <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleManualGo}>
              Go
            </Button>
          </div>
        )}

        {/* Current path display */}
        <div className="px-3 py-1.5 text-xs font-mono text-muted-foreground truncate border-b">
          {currentPath ?? '...'}
        </div>

        {/* Directory listing */}
        <div className="overflow-y-auto min-h-[120px] max-h-[50vh]">
          <div className="p-2">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </div>
            )}
            {error && (
              <div className="text-destructive text-xs py-4 text-center">{error}</div>
            )}
            {!loading && !error && dirs.length === 0 && (
              <div className="text-muted-foreground text-xs py-4 text-center">No subdirectories</div>
            )}
            {!loading && !error && dirs.map(entry => (
              <button
                key={entry.path}
                onClick={() => void browse(entry.path)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left',
                  'hover:bg-accent hover:text-accent-foreground transition-colors',
                )}
              >
                <FolderIcon className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                <span className="truncate">{entry.name}</span>
                <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSelect} disabled={!currentPath}>
            <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
            Open this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
