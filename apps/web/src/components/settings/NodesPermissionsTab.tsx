import { useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Monitor, Save, Smartphone } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { NODE_CAPABILITIES, NODE_CAPABILITY_LABELS, NODE_CAPABILITY_DESCRIPTIONS, type NodeCapability, type NodeWithPermissions } from '@jait/shared'
import { useNodePermissions } from '@/hooks/useNodePermissions'

const CAPABILITY_LABELS = NODE_CAPABILITY_LABELS
const CAPABILITY_DESCRIPTIONS = NODE_CAPABILITY_DESCRIPTIONS

interface NodeRow {
  draft: Record<NodeCapability, boolean>
  dirty: boolean
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function statusBadge(node: NodeWithPermissions) {
  const online = node.lifecycle === 'ready'
  return (
    <Badge variant={online ? 'default' : 'outline'} className="gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
      {online ? 'Online' : 'Offline'}
    </Badge>
  )
}

export function NodesPermissionsTab({ token }: { token: string | null }) {
  const { nodes, loading, error, saving, saveError, refresh, updatePermissions } = useNodePermissions(token)
  // Per-node editable drafts, keyed by node id.
  const [drafts, setDrafts] = useState<Record<string, NodeRow>>({})

  const rowFor = (node: NodeWithPermissions): NodeRow => {
    const existing = drafts[node.id]
    if (existing) return existing
    return { draft: { ...node.permissions }, dirty: false }
  }

  const toggle = (node: NodeWithPermissions, capability: NodeCapability) => {
    setDrafts((prev) => {
      const current = rowFor(node)
      const nextDraft = { ...current.draft, [capability]: !current.draft[capability] }
      return {
        ...prev,
        [node.id]: { draft: nextDraft, dirty: true },
      }
    })
  }

  const isDirty = (node: NodeWithPermissions) => rowFor(node).dirty

  const saveNode = (node: NodeWithPermissions) => {
    const { draft } = rowFor(node)
    updatePermissions(node.id, draft)
    // The gateway broadcasts the persisted snapshot back; clear the draft when it arrives.
    setDrafts((prev) => ({ ...prev, [node.id]: { draft, dirty: false } }))
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-medium">Node permissions</h2>
        <p className="text-sm text-muted-foreground">
          Control what each connected node is allowed to do. New nodes start with all
          capabilities <strong>denied</strong> until you explicitly grant them here.
        </p>
      </div>

      {error && (
        <Card className="flex items-center gap-2 border-red-500/40 p-4 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
          <Button variant="outline" size="sm" className="ml-auto" onClick={refresh}>
            Retry
          </Button>
        </Card>
      )}

      {loading && nodes.length === 0 && (
        <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading node permissions…
        </Card>
      )}

      {!loading && !error && nodes.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          No nodes registered yet. Nodes appear here the first time they connect to this gateway.
        </Card>
      )}

      {nodes.map((node) => {
        const { draft } = rowFor(node)
        return (
          <Card key={node.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              {node.platform === 'android' || node.platform === 'ios' ? (
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Monitor className="h-4 w-4 text-muted-foreground" />
              )}
              <h3 className="text-base font-medium">{node.name}</h3>
              {statusBadge(node)}
              {isDirty(node) && <Badge variant="secondary">Unsaved</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">{node.id}</span>
            </div>

            <div className="text-xs text-muted-foreground">
              First seen {formatDate(node.firstSeenAt)}
              {' · '}Platform {node.platform}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {NODE_CAPABILITIES.map((capability) => (
                <label
                  key={capability}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <div className="text-sm font-medium">{CAPABILITY_LABELS[capability]}</div>
                    <div className="text-xs text-muted-foreground">{CAPABILITY_DESCRIPTIONS[capability]}</div>
                  </div>
                  <Switch checked={draft[capability]} onCheckedChange={() => toggle(node, capability)} />
                </label>
              ))}
            </div>

            <div className="flex justify-end">
              <Button onClick={() => saveNode(node)} disabled={saving || !isDirty(node)}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          </Card>
        )
      })}

      {saveError && (
        <Card className="flex items-center gap-2 border-red-500/40 p-4 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          {saveError}
        </Card>
      )}

      {!loading && !error && !saveError && saving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />
          Saving…
        </div>
      )}
    </div>
  )
}
