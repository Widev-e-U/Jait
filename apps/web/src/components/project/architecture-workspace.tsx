import { lazy, Suspense, useState } from 'react'
import { Braces, GitBranch, Workflow } from 'lucide-react'
import { ArchitecturePanel, type ArchitecturePanelProps } from './architecture-panel'
const CodeGraphPanel = lazy(() => import('./code-graph-panel').then((module) => ({ default: module.CodeGraphPanel })))

export interface ArchitectureWorkspaceProps extends ArchitecturePanelProps {
  projectRoot?: string | null
}

type WorkspaceTab = 'overview' | 'graph' | 'query'

const TABS: Array<{ id: WorkspaceTab; label: string; icon: typeof Workflow }> = [
  { id: 'overview', label: 'Overview', icon: Workflow },
  { id: 'graph', label: 'Code Graph', icon: GitBranch },
  { id: 'query', label: 'Query', icon: Braces },
]

export function ArchitectureWorkspace({ projectRoot, ...architectureProps }: ArchitectureWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-end gap-1 border-b bg-muted/20 px-2 pt-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex h-8 items-center gap-1.5 rounded-t-md border border-b-0 px-3 text-xs transition-colors ${activeTab === id ? 'border-border bg-background text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {activeTab === 'overview' ? (
          <ArchitecturePanel {...architectureProps} />
        ) : (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading code graph…</div>}>
            <CodeGraphPanel
              projectRoot={projectRoot}
              mode={activeTab === 'graph' ? 'graph' : 'query'}
              theme={architectureProps.theme}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
