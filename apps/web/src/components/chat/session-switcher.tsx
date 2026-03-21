import { useState } from 'react'
import { ChevronDown, Folder, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { WorkspaceRecord } from '@/hooks/useWorkspaces'

interface SessionSwitcherProps {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  onSelectWorkspace: (workspaceId: string) => void
  onCreateWorkspace: () => void
  onRemoveWorkspace: (workspaceId: string) => void
  onOpenChange?: (open: boolean) => void
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString()
}

export function SessionSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onRemoveWorkspace,
  onOpenChange,
}: SessionSwitcherProps) {
  const [open, setOpen] = useState(false)
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0] ?? null
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 max-w-full justify-between gap-2 rounded-lg px-3 text-left">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">
              {activeWorkspace?.title || 'Select workspace'}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {activeWorkspace?.rootPath || 'Choose a directory to start'}
            </div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(28rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div>
            <div className="text-sm font-medium">Workspaces</div>
            <div className="text-[11px] text-muted-foreground">
              Pick a workspace folder.
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => {
            onCreateWorkspace()
            setOpen(false)
          }}>
            <Folder className="mr-1 h-3 w-3" />
            New workspace
          </Button>
        </div>
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-2">
          {workspaces.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No workspaces yet.
            </div>
          ) : (
            <div className="space-y-2">
              {workspaces.map((workspace) => {
                const isActiveWorkspace = workspace.id === activeWorkspaceId
                const canRemoveWorkspace = workspace.sessions.length === 0

                return (
                  <div key={workspace.id} className="rounded-lg border border-border/70 bg-background/60">
                    <div className="flex items-start gap-2 px-3 py-2">
                      <button
                        type="button"
                        className={`min-w-0 flex-1 rounded-md px-1 py-0.5 text-left transition-colors ${
                          isActiveWorkspace ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => {
                          onSelectWorkspace(workspace.id)
                          setOpen(false)
                        }}
                      >
                        <div className="truncate text-xs font-medium">
                          {workspace.title || 'Untitled Workspace'}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {workspace.rootPath || 'No folder linked'}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatTime(workspace.lastActiveAt)}
                        </div>
                      </button>
                      {canRemoveWorkspace && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            onRemoveWorkspace(workspace.id)
                            setOpen(false)
                          }}
                          title="Remove empty workspace"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
