import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FolderOpen, HardDrive, Loader2, Monitor, Settings2 } from 'lucide-react'
import type { FsNode, ProviderInfo } from '@jait/shared'
import type { AutomationRepository } from '@/lib/automation-repositories'
import { detectPlatform, generateDeviceId } from '@/lib/device-id'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FolderPickerDialog } from '@/components/project/folder-picker-dialog'
import { cn } from '@/lib/utils'

interface FirstProjectSetupProps {
  nodes: FsNode[]
  repositories: AutomationRepository[]
  providers: ProviderInfo[]
  onOpenProject: (path: string, nodeId: string) => Promise<void>
  onProviderSettings: () => void
  onSkip: () => void
}

interface ProjectChoice {
  path: string
  nodeId: string
}

function initialNodeId(): string {
  const platform = detectPlatform()
  return platform === 'desktop' || platform === 'capacitor' ? generateDeviceId() : 'gateway'
}

export function FirstProjectSetup({
  nodes,
  repositories,
  providers,
  onOpenProject,
  onProviderSettings,
  onSkip,
}: FirstProjectSetupProps) {
  const [step, setStep] = useState<'computer' | 'project'>('computer')
  const [nodeId, setNodeId] = useState('gateway')
  const preferredNodeId = useMemo(initialNodeId, [])
  const nodeTouched = useRef(false)
  const [choice, setChoice] = useState<ProjectChoice | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const computers = useMemo(() => (
    nodes.length > 0
      ? nodes.map((node) => ({ id: node.id, name: node.name, isGateway: node.isGateway }))
      : [{ id: 'gateway', name: 'Gateway', isGateway: true }]
  ), [nodes])

  useEffect(() => {
    if (nodes.length === 0) return
    const preferredNode = nodes.find((node) => node.id === preferredNodeId)
    if (!nodeTouched.current && nodeId === 'gateway' && preferredNode) {
      setNodeId(preferredNode.id)
    } else if (!nodes.some((node) => node.id === nodeId)) {
      setNodeId(nodes.find((node) => node.isGateway)?.id ?? nodes[0]!.id)
      setChoice(null)
    }
  }, [nodeId, nodes, preferredNodeId])

  const selectedComputer = computers.find((node) => node.id === nodeId)
  const knownRepositories = useMemo(() => {
    const seen = new Set<string>()
    return repositories.filter((repository) => {
      if ((repository.deviceId || 'gateway') !== nodeId || !repository.localPath) return false
      const key = repository.localPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [nodeId, repositories])
  const readyProviders = providers.filter((provider) =>
    (provider.nodeId || 'gateway') === nodeId && provider.available,
  )

  const selectNode = (nextNodeId: string) => {
    nodeTouched.current = true
    if (nextNodeId !== nodeId) {
      setNodeId(nextNodeId)
      setChoice(null)
      setError(null)
    }
  }

  const openProject = async () => {
    if (!choice || busy) return
    setBusy(true)
    setError(null)
    try {
      await onOpenProject(choice.path, choice.nodeId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this project.')
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open && !busy) onSkip() }}>
        <DialogContent className="max-h-[min(42rem,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto" showCloseButton={!busy}>
          <DialogHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className={cn(step === 'computer' && 'text-primary')}>1 · Computer</span>
              <ArrowRight className="h-3 w-3" />
              <span className={cn(step === 'project' && 'text-primary')}>2 · Project</span>
            </div>
            <DialogTitle>Set up your first project</DialogTitle>
            <DialogDescription>
              Choose where Jait will work, then open a folder to start chatting with your code.
            </DialogDescription>
          </DialogHeader>

          {step === 'computer' ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Where is your project?</p>
              <div className="space-y-2">
                {computers.map((computer) => (
                  <button
                    key={computer.id}
                    type="button"
                    aria-pressed={nodeId === computer.id}
                    onClick={() => selectNode(computer.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                      nodeId === computer.id && 'border-primary bg-primary/5',
                    )}
                  >
                    {computer.isGateway ? <HardDrive className="h-5 w-5 shrink-0" /> : <Monitor className="h-5 w-5 shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{computer.name}</span>
                      <span className="text-xs text-muted-foreground">{computer.isGateway ? 'Jait server' : 'Connected device'}</span>
                    </span>
                    {nodeId === computer.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
              <div className="flex justify-between gap-2 pt-2">
                <Button variant="ghost" onClick={onSkip}>Skip for now</Button>
                <Button onClick={() => { nodeTouched.current = true; setStep('project') }}>Continue <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Choose a project on {selectedComputer?.name ?? 'this computer'}</p>
                <p className="mt-1 text-xs text-muted-foreground">Jait will use this folder as the working directory for your first chat.</p>
              </div>
              {knownRepositories.length > 0 && (
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {knownRepositories.map((repository) => (
                    <button
                      key={repository.id}
                      type="button"
                      aria-pressed={choice?.path === repository.localPath && choice.nodeId === nodeId}
                      onClick={() => setChoice({ path: repository.localPath, nodeId })}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                        choice?.path === repository.localPath && choice.nodeId === nodeId && 'border-primary bg-primary/5',
                      )}
                    >
                      <FolderOpen className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{repository.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{repository.localPath}</span>
                      </span>
                      {choice?.path === repository.localPath && choice.nodeId === nodeId && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
              {choice && !knownRepositories.some((repository) => repository.localPath === choice.path) && (
                <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 p-3 text-sm">
                  <FolderOpen className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{choice.path}</span>
                  <Check className="h-4 w-4 text-primary" />
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
                <FolderOpen className="mr-2 h-4 w-4" /> Browse for a folder
              </Button>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                {readyProviders.length > 0 ? (
                  <span>{readyProviders.length} {readyProviders.length === 1 ? 'agent is' : 'agents are'} ready on this computer.</span>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>No agent is ready on this computer yet. You can add one after opening the project.</span>
                    <Button size="sm" variant="ghost" onClick={onProviderSettings}>
                      <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Provider settings
                    </Button>
                  </div>
                )}
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-between gap-2 pt-1">
                <Button variant="ghost" disabled={busy} onClick={() => setStep('computer')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button disabled={!choice || busy} onClick={() => { void openProject() }}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Open project
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FolderPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initialNodeId={nodeId}
        onSelect={(path, selectedNodeId) => {
          setNodeId(selectedNodeId)
          setChoice({ path, nodeId: selectedNodeId })
          setError(null)
        }}
      />
    </>
  )
}
