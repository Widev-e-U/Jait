import { createRoot } from 'react-dom/client'
import { SessionSelector } from '@/components/chat/session-selector'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useProjects, type ProjectRecord } from '@/hooks/useProjects'
import '@/index.css'

const project = (name: number | string, lastActiveAt: string): ProjectRecord => ({
  id: `project-${name}`,
  title: `Project ${name}`,
  rootPath: `/work/project-${name}`,
  nodeId: 'gateway',
  parentId: null,
  kind: 'workspace',
  instructions: null,
  description: null,
  color: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastActiveAt,
  metadata: null,
  sessions: [],
})

// Project 1 is the most recently active, project 12 the least.
const gatewayProjects = Array.from({ length: 12 }, (_, index) => project(index + 1, new Date(Date.UTC(2026, 5, 30 - index)).toISOString()))

// Stands in for the gateway: `GET /api/projects?limit=N` returns the N most
// recently active projects, newest first, and whether older ones remain.
window.fetch = async (input) => {
  const url = new URL(String(input), window.location.href)
  let data: unknown = {}
  if (url.pathname.endsWith('/api/projects')) {
    const limit = Number(url.searchParams.get('limit')) || gatewayProjects.length
    const byActivity = [...gatewayProjects].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
    data = { projects: byActivity.slice(0, limit), hasMore: byActivity.length > limit }
  } else if (url.pathname.endsWith('/api/sessions')) {
    data = { sessions: [] }
  } else if (url.pathname.endsWith('/api/projects/last-active')) {
    data = { project: null, session: null }
  }
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function Harness() {
  const state = useProjects('fixture')
  return <TooltipProvider>
    <main className="flex h-dvh gap-4 bg-background p-4 text-foreground">
      <aside aria-label="Projects and chats" className="h-full w-72 shrink-0 overflow-hidden rounded-md border">
        <SessionSelector
          projects={state.projects}
          personalSessions={state.personalSessions}
          activeProjectId={state.activeProjectId}
          activeSessionId={state.activeSessionId}
          loading={state.loading}
          hasMoreProjects={state.hasMoreProjects}
          showFewerProjects={state.projects.length > state.projectListLimit}
          isMobile={false}
          onSelectProject={() => {}}
          onCreateProject={() => {}}
          onRemoveProject={() => {}}
          onChangeDirectory={() => {}}
          onShowMore={state.showMoreProjects}
          onShowFewer={state.showFewerProjects}
        />
      </aside>
      <button
        className="h-8 shrink-0 self-start rounded-md border px-3 text-sm"
        onClick={() => {
          // A project created after the user arranged the list is the newest one.
          gatewayProjects.push(project('new', '2030-01-01T00:00:00.000Z'))
          void state.fetchProjects()
        }}
      >
        Add newest project
      </button>
    </main>
  </TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<Harness />)
