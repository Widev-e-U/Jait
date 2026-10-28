import { Monitor, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useProviders } from '@/hooks/useProviders'
import { TooltipHint } from '@/components/ui/tooltip'

export function ChatNodeSelector({ nodeId, onChange, disabled, compact, error, onRetry }: {
  nodeId: string
  onChange: (nodeId: string) => void
  disabled?: boolean
  compact?: boolean
  error?: string | null
  onRetry: () => void
}) {
  const { remoteProviders } = useProviders()
  const nodes = [{ nodeId: 'gateway', nodeName: 'Gateway' }, ...remoteProviders.filter(node => node.nodeId !== 'gateway')]
  const selected = nodes.find(node => node.nodeId === nodeId)
  if (error) return <Button variant="ghost" size="sm" onClick={onRetry}>Retry devices</Button>
  return (
    <DropdownMenu>
      <TooltipHint content={selected?.nodeName ?? `${nodeId} (offline)`}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={disabled} aria-label="Chat node">
            <Monitor className="h-3.5 w-3.5 shrink-0" />
            {!compact && <span className="max-w-28 truncate">{selected?.nodeName ?? `${nodeId} (offline)`}</span>}
            <ChevronDown className="h-3 w-3 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipHint>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={nodeId} onValueChange={onChange}>
          {nodes.map(node => <DropdownMenuRadioItem key={node.nodeId} value={node.nodeId}>{node.nodeName}</DropdownMenuRadioItem>)}
          {!selected && <DropdownMenuRadioItem value={nodeId} disabled>{nodeId} (offline)</DropdownMenuRadioItem>}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
