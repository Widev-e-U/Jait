import { useEffect, useState } from 'react'
import { Check, ChevronDown, FolderOpen, Plus, Search, UserRound } from 'lucide-react'
import type { ProjectRecord } from '@/hooks/useProjects'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface NewChatContextSelectorProps {
  projects: ProjectRecord[]
  activeProjectId: string | null
  lastProjectId: string | null
  disabled?: boolean
  onSelectProject: (projectId: string | null) => void | Promise<boolean>
  onAddProject: () => void
  searchProjects?: (query: string) => Promise<ProjectRecord[]>
}

export function NewChatContextSelector({
  projects, activeProjectId, lastProjectId, disabled = false,
  onSelectProject, onAddProject, searchProjects,
}: NewChatContextSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProjectRecord[]>([])
  const [searching, setSearching] = useState(false)
  const activeProject = projects.find(project => project.id === activeProjectId)
  const projectTitle = activeProject?.title || activeProject?.rootPath?.split(/[/\\]/).pop() || 'Project'

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    let cancelled = false
    setSearchResults([])
    const normalized = query.trim()
    if (!open || !normalized || !searchProjects) {
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      void searchProjects(normalized).then(results => {
        if (!cancelled) setSearchResults(results)
      }).catch(() => {
        // Keep locally available matches when remote search fails.
      }).finally(() => {
        if (!cancelled) setSearching(false)
      })
    }, 180)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, query, searchProjects])

  const normalized = query.trim().toLocaleLowerCase()
  const visibleProjects = Array.from(new Map([...projects, ...searchResults].map(project => [project.id, project])).values())
    .filter(project => project.status === 'active')
    .filter(project => !normalized || [project.title, project.rootPath].some(value => value?.toLocaleLowerCase().includes(normalized)))
    .sort((a, b) => Number(b.id === lastProjectId) - Number(a.id === lastProjectId))

  const selectProject = (projectId: string | null) => {
    setOpen(false)
    if (disabled || projectId === activeProjectId) return
    void Promise.resolve(onSelectProject(projectId)).then(changed => {
      // A remembered project may have been removed since the last visit.
      // Keep the picker reachable so the user can choose an available one.
      if (changed === false && projectId) setOpen(true)
    }).catch(() => {
      if (projectId) setOpen(true)
    })
  }
  const segmentClass = (selected: boolean) => cn(
    'inline-flex items-center justify-center gap-2 rounded-lg px-3 sm:px-4 py-2 text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-wait',
    selected ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.3)]' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
  )

  return (
    <div className="space-y-3 text-center" data-testid="new-chat-context">
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <div role="group" aria-label="Chat context" className="inline-flex gap-1 rounded-xl border bg-card/60 p-1">
              <button type="button" aria-pressed={!activeProjectId} disabled={disabled} onClick={() => selectProject(null)} className={segmentClass(!activeProjectId)}>
                <UserRound className="h-4 w-4" />Personal
              </button>
              <button type="button" aria-pressed={Boolean(activeProjectId)} disabled={disabled} onClick={() => {
                const projectId = lastProjectId ?? visibleProjects[0]?.id
                if (projectId) selectProject(projectId)
                else setOpen(true)
              }} className={segmentClass(Boolean(activeProjectId))}>
                <FolderOpen className="h-4 w-4" />Project
              </button>
            </div>
            {activeProjectId && (
              <button type="button" disabled={disabled} aria-label={`Choose project, current project: ${projectTitle}`} aria-haspopup="dialog" aria-expanded={open}
                onClick={() => setOpen(value => !value)}
                className="inline-flex min-w-0 max-w-[min(220px,70vw)] items-center gap-2 rounded-lg border bg-card/60 px-3 py-2.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                <span className="truncate">{projectTitle}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent align="center" collisionPadding={16} className="w-72 max-w-[calc(100vw-2rem)] rounded-xl p-2" aria-label="Choose a project">
          <div className="flex items-center gap-2 rounded-lg border px-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input autoFocus aria-label="Find a project" placeholder="Find a project…" value={query} onChange={event => setQuery(event.target.value)}
              className="h-9 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <p className="px-2 pb-1 pt-3 text-[10px] uppercase tracking-wider text-muted-foreground">{normalized ? 'Search results' : 'Recent projects'}</p>
          <div className="max-h-56 overflow-y-auto" aria-busy={searching}>
            {visibleProjects.map(project => (
              <button key={project.id} type="button" onClick={() => selectProject(project.id)}
                className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', project.id === activeProjectId && 'bg-primary/10 text-primary')}>
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{project.title || project.rootPath || 'Untitled project'}</span>
                {project.id === lastProjectId && <span className="shrink-0 text-[10px] text-muted-foreground">Last selected</span>}
                {project.id === activeProjectId && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
            {searching && <p className="px-2 py-3 text-xs text-muted-foreground" role="status">Searching projects…</p>}
            {!searching && visibleProjects.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">{normalized ? 'No projects found.' : 'Add a project to get started.'}</p>}
          </div>
          <button type="button" onClick={() => { setOpen(false); onAddProject() }} className="mt-1 flex w-full items-center gap-2 rounded-lg border-t px-2 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="h-4 w-4" />Add project
          </button>
        </PopoverContent>
      </Popover>
      <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
        {disabled ? 'Loading chat context…' : activeProjectId ? <>Using your last selected project · <span className="text-foreground/80">{projectTitle}</span></> : 'A personal chat, without a project attached'}
      </p>
    </div>
  )
}
