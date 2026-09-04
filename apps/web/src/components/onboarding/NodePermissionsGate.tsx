import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Loader2, Save, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { NODE_CAPABILITIES, NODE_CAPABILITY_LABELS, NODE_CAPABILITY_DESCRIPTIONS, type NodeCapability, type NodeWithPermissions } from '@jait/shared'
import { useNodePermissions } from '@/hooks/useNodePermissions'
import { generateDeviceId } from '@/lib/device-id'

const CAPABILITY_LABELS = NODE_CAPABILITY_LABELS
const CAPABILITY_DESCRIPTIONS = NODE_CAPABILITY_DESCRIPTIONS

const SETTINGS_KEY = 'permissionsSetupDone'

export interface NodePermissionsGateVisibility {
  gatewayStep: 'url' | 'auth'
  authLoading: boolean
  isAuthenticated: boolean
  token: string | null
}

export function shouldShowNodePermissionsGate({
  gatewayStep,
  authLoading,
  isAuthenticated,
  token,
}: NodePermissionsGateVisibility): boolean {
  return gatewayStep === 'auth' && !authLoading && isAuthenticated && token !== null
}

function allDenied(): Record<NodeCapability, boolean> {
  return Object.fromEntries(NODE_CAPABILITIES.map((c) => [c, false])) as Record<NodeCapability, boolean>
}

/** A node that has no capability grants at all is unconfigured (deny-all default). */
function isUnconfigured(node: NodeWithPermissions): boolean {
  return NODE_CAPABILITIES.every((c) => node.permissions[c] === false)
}

function grantedCount(perms: Record<NodeCapability, boolean>): number {
  return NODE_CAPABILITIES.filter((c) => perms[c]).length
}

/**
 * Desktop first-run permission onboarding + a lightweight banner for any other
 * newly connected node that is still unconfigured (deny-all by default).
 *
 * On the first launch of the Electron app it blocks the UI until the user has
 * chosen which capabilities the LOCAL node may use, then persists the choice in
 * desktop-settings.json via the `permissionsSetupDone` flag. On every later
 * launch it only surfaces a dismissible banner for other nodes whose grants are
 * still all-denied, prompting the user to configure them in Settings → Nodes.
 */
export function NodePermissionsGate({ token }: { token: string | null }) {
  const isElectron = typeof window !== 'undefined' && !!window.jaitDesktop
  const localNodeId = useMemo(() => (isElectron ? generateDeviceId() : null), [isElectron])

  const { nodes, loading, error, saving, saveError, updatePermissions } = useNodePermissions(token)

  // ── First-run detection ──────────────────────────────────────────────
  // null = unknown (still reading the flag), so we render nothing and avoid a
  // flash of the main UI before we know whether onboarding is required.
  const [firstRunDone, setFirstRunDone] = useState<boolean | null>(null)
  useEffect(() => {
    if (!isElectron) {
      setFirstRunDone(true)
      return
    }
    let mounted = true
    window.jaitDesktop!
      .getSetting(SETTINGS_KEY, false)
      .then((v) => {
        if (mounted) setFirstRunDone(!!v)
      })
      .catch(() => {
        // If we can't read the flag, assume onboarding was done so we don't
        // block the app. The user can still manage nodes in Settings.
        if (mounted) setFirstRunDone(true)
      })
    return () => {
      mounted = false
    }
  }, [isElectron])

  const localNode = useMemo(
    () => (localNodeId ? nodes.find((n) => n.id === localNodeId) : undefined),
    [nodes, localNodeId],
  )

  // ── Draft for the local node's grants ────────────────────────────────
  const draftInitialized = useRef(false)
  const [draft, setDraft] = useState<Record<NodeCapability, boolean>>(allDenied)
  useEffect(() => {
    // Seed the draft from the node's persisted grants the first time the local
    // node shows up in a snapshot, so a re-run shows the saved state.
    if (!draftInitialized.current && localNode) {
      draftInitialized.current = true
      setDraft({ ...localNode.permissions })
    }
  }, [localNode])

  const toggle = useCallback((capability: NodeCapability) => {
    setDraft((prev) => ({ ...prev, [capability]: !prev[capability] }))
  }, [])

  // ── Save + persist the "setup done" flag once the gateway confirms ───
  const [savingStarted, setSavingStarted] = useState(false)
  const saved = useMemo(() => {
    if (!localNode) return false
    return NODE_CAPABILITIES.every((c) => localNode.permissions[c] === draft[c])
  }, [localNode, draft])

  useEffect(() => {
    if (savingStarted && !saving && saved && isElectron) {
      setSavingStarted(false)
      window.jaitDesktop!.setSetting(SETTINGS_KEY, true).then(() => setFirstRunDone(true))
    }
  }, [savingStarted, saving, saved, isElectron])

  const handleSave = () => {
    if (!localNodeId) return
    setSavingStarted(true)
    updatePermissions(localNodeId, draft)
  }

  // ── Banner for other newly connected, still-unconfigured nodes ──────
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const needsConfigNodes = useMemo(
    () => nodes.filter((n) => n.id !== localNodeId && isUnconfigured(n)),
    [nodes, localNodeId],
  )
  const showBanner = firstRunDone === true && !bannerDismissed && needsConfigNodes.length > 0 && !loading

  // While we're still figuring out whether this is first run, render nothing.
  if (firstRunDone === null) return null

  // ── First-run onboarding overlay (local node only) ───────────────────
  if (isElectron && firstRunDone === false) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
        <div className="w-full max-w-lg">
          <div className="mb-5 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">Configure this device</h1>
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            Welcome! This device (the local node) is connected to your gateway. For safety it starts with
            every capability <strong>denied</strong>. Choose what this device is allowed to do. You can change
            these anytime in Settings → Nodes.
          </p>

          <Card className="space-y-2 p-5">
            {NODE_CAPABILITIES.map((capability) => (
              <label
                key={capability}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <div className="text-sm font-medium">{CAPABILITY_LABELS[capability]}</div>
                  <div className="text-xs text-muted-foreground">{CAPABILITY_DESCRIPTIONS[capability]}</div>
                </div>
                <Switch checked={draft[capability]} onCheckedChange={() => toggle(capability)} />
              </label>
            ))}
          </Card>

          <div className="mt-3 text-xs text-muted-foreground">
            {grantedCount(draft)} of {NODE_CAPABILITIES.length} capabilities enabled
          </div>

          {error && (
            <Card className="mt-3 flex items-center gap-2 border-red-500/40 p-3 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {error}
            </Card>
          )}
          {saveError && (
            <Card className="mt-3 flex items-center gap-2 border-red-500/40 p-3 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {saveError}
            </Card>
          )}

          <Button className="mt-4 w-full" onClick={handleSave} disabled={saving || !localNodeId}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            {saving ? 'Saving…' : 'Save & continue'}
          </Button>
        </div>
      </div>
    )
  }

  // ── Dismissible banner for other unconfigured nodes ─────────────────
  if (showBanner) {
    return (
      <div className="fixed bottom-4 left-1/2 z-[999] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2">
        <Card className="flex items-start gap-3 border-amber-500/50 p-4 shadow-lg">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-sm">
            <div className="font-medium">A node needs your permission</div>
            <div className="text-muted-foreground">
              {needsConfigNodes.map((n) => n.name).join(', ')} connected but has all capabilities{' '}
              <strong>denied</strong>. Grant what you trust in Settings → Nodes.
            </div>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </Card>
      </div>
    )
  }

  return null
}
