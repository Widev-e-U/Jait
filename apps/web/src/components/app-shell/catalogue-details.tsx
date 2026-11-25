import { useId, useLayoutEffect, useRef } from 'react'
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, FileText, Layers, PanelRightClose, PanelRightOpen, Wrench } from 'lucide-react'
import { JAIT_PAGES } from '@jait/shared'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { CatalogueNode } from '@/lib/catalogue-graph'

const sections = [
  { kind: 'page', label: 'Pages', Icon: FileText },
  { kind: 'skill', label: 'Skills', Icon: BookOpen },
  { kind: 'feature', label: 'Features', Icon: Layers },
  { kind: 'tool', label: 'Tools', Icon: Wrench },
] as const

interface CatalogueDetailsProps {
  nodes: CatalogueNode[]
  path: CatalogueNode[]
  selected: CatalogueNode
  collapsed: boolean
  focusedPage: boolean
  searching: boolean
  skillsMessage?: string
  destinationLabel?: string
  onToggle: () => void
  onChoose: (node: CatalogueNode) => void
  onNavigate: () => void
}

export function CatalogueDetails({ nodes, path, selected, collapsed, focusedPage, searching, skillsMessage,
  destinationLabel, onToggle, onChoose, onNavigate }: CatalogueDetailsProps) {
  const contentId = useId()
  const contentRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusHeadingRef = useRef(false)
  const selectedId = selected.id
  useLayoutEffect(() => {
    if (focusHeadingRef.current) {
      headingRef.current?.focus({ preventScroll: true })
      focusHeadingRef.current = false
    }
    contentRef.current?.scrollTo({ top: 0 })
  }, [selectedId])

  const selectFromList = (node: CatalogueNode) => {
    if (node.id !== selectedId) focusHeadingRef.current = true
    onChoose(node)
  }
  const toggleLabel = collapsed ? 'Expand catalogue details' : 'Collapse catalogue details'
  const ToggleIcon = collapsed ? PanelRightOpen : PanelRightClose

  return <aside aria-label="Catalogue details" className={cn('flex max-h-[50%] w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border bg-card md:max-h-none',
    collapsed ? 'md:w-12' : 'md:w-[19rem] xl:w-[21rem]')}>
    <div className={cn('flex min-h-11 shrink-0 items-center gap-2 px-2', collapsed ? 'md:justify-center' : 'border-b')}>
      <div className={cn('min-w-0 flex-1 truncate pl-2 text-sm font-medium', collapsed && 'md:sr-only')}>
        {collapsed ? selected.label : 'Browse catalogue'}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="size-9 shrink-0" aria-label={toggleLabel}
            aria-expanded={!collapsed} aria-controls={contentId} onClick={onToggle}>
            <ToggleIcon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{toggleLabel}</TooltipContent>
      </Tooltip>
    </div>
    <div id={contentId} hidden={collapsed} ref={contentRef} className="min-h-0 overflow-y-auto overscroll-contain">
      <div className="border-b bg-muted/20 p-3 sm:p-4">
        {path.length > 1 && <nav aria-label="Selected catalogue path" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {path.slice(0, -1).map((node) => <span className="inline-flex min-w-0 items-center gap-1" key={node.id}>
            <button type="button" onClick={() => selectFromList(node)} className="break-all rounded px-1 py-1 text-left hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">{node.label}</button>
            <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
          </span>)}
        </nav>}
        <h2 tabIndex={-1} ref={headingRef} className="-mx-2 w-fit max-w-[calc(100%+1rem)] break-words rounded-md px-2 py-1 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{selected.label}</h2>
        <div key={selectedId} className="space-y-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
          {selected.kind !== 'root' && <p className="mt-1 break-words text-sm text-muted-foreground">{selected.description}</p>}
          {selected.available === false && <p className="text-xs text-amber-700 dark:text-amber-300">Tool unavailable in this gateway</p>}
          {selected.tool && <p className="break-words text-xs text-muted-foreground">{[selected.tool.category, `${selected.tool.risk ?? 'unknown'} risk`, selected.tool.source ?? 'builtin'].filter(Boolean).join(' · ')}</p>}
          {selected.skill && <p className="text-xs text-muted-foreground">
            <span className="capitalize">{selected.skill.source} skill</span> · {selected.skill.enabled ? 'Enabled' : 'Disabled'}
            {selected.skill.toolsSatisfied === false && ' · Missing required tools'}
          </p>}
          {destinationLabel && <Button type="button" variant="outline" size="sm" className="w-full justify-between" onClick={onNavigate}>
            {destinationLabel}<ExternalLink aria-hidden="true" />
          </Button>}
        </div>
      </div>
      <nav aria-label="Browse catalogue entries" className="space-y-1 p-2">
        {sections.map(({ kind, label, Icon }) => {
          const entries = nodes.filter((node) => node.kind === kind)
          if (!entries.length && (kind !== 'skill' || !skillsMessage)) return null
          return <details key={kind} className="group rounded-md" open={searching || (focusedPage && kind === 'tool') || (kind === 'skill' && path.some((node) => node.id === 'feature:settings:installed-skills'))}>
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
              <span>{label}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{entries.length}</span>
              <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground motion-safe:transition-transform group-open:rotate-180" />
            </summary>
            {!entries.length ? <p className="px-3 py-2 text-sm text-muted-foreground">{skillsMessage}</p> :
              <ul className="space-y-0.5 pb-1" role="list">
                {entries.map((node) => <li key={node.id}>
                  <button type="button" aria-current={node.id === selectedId ? 'true' : undefined} onClick={() => selectFromList(node)}
                    className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-primary/10 aria-[current=true]:font-medium">
                    <span className="min-w-0 break-words">{kind === 'feature' && node.pageId && `${JAIT_PAGES[node.pageId].title} · `}{node.label}</span>
                    {node.available === false && <span className="shrink-0 text-xs text-amber-700 dark:text-amber-300">Unavailable</span>}
                    {node.skill && <span className="shrink-0 text-xs capitalize text-muted-foreground">{node.skill.source}</span>}
                  </button>
                </li>)}
              </ul>}
          </details>
        })}
      </nav>
    </div>
  </aside>
}
