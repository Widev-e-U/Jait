import { createRoot } from 'react-dom/client'
import { SessionSelector } from '@/components/chat/session-selector'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useProjects, type ProjectRecord, type ProjectSession } from '@/hooks/useProjects'
import '@/index.css'

const sessions = (prefix: string, projectId: string | null): ProjectSession[] => [2, 1, 3].map((index) => ({
  id: `${prefix}-${index}`,
  projectId,
  name: `${prefix} ${index}`,
  projectPath: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastActiveAt: new Date(Date.UTC(2026, 6, 4 - index)).toISOString(),
  viewedAt: null,
  metadata: null,
}))

const fixtureOptions = new URLSearchParams(window.location.search)

function fork(parent: ProjectSession, id: string, kind: 'manual' | 'background-command'): ProjectSession {
  const label = kind === 'manual' ? 'Fork' : 'Background terminal'
  return {
    ...parent,
    id,
    name: `${label} · ${parent.name}`,
    lastActiveAt: new Date().toISOString(),
    metadata: JSON.stringify({ branch: { kind, parentSessionId: parent.id } }),
  }
}

const personalSessions = sessions('Personal chat', null)

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
  sessions: name === 1 ? sessions('Project chat', 'project-1') : [],
})

// Project 1 is the most recently active, project 12 the least.
const gatewayProjects = Array.from({ length: 12 }, (_, index) => project(index + 1, new Date(Date.UTC(2026, 5, 30 - index)).toISOString()))

if (fixtureOptions.has('forks')) {
  const personalParent = personalSessions.find((session) => session.id === 'Personal chat-3')!
  personalParent.name = 'Release notes'
  personalSessions.push(fork(personalParent, 'manual-fork', 'manual'))

  const projectSessions = gatewayProjects[0]!.sessions
  const projectParent = projectSessions.find((session) => session.id === 'Project chat-3')!
  projectParent.name = 'Rust migration'
  const watcher = fork(projectParent, 'terminal-fork', 'background-command')
  projectSessions.push(watcher, { ...fork(watcher, 'watcher-fork', 'manual'), name: 'Build review' })
}


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
    data = { sessions: personalSessions }
  } else if (url.pathname.startsWith('/api/sessions/')) {
    const sessionId = decodeURIComponent(url.pathname.slice('/api/sessions/'.length))
    data = personalSessions.find((session) => session.id === sessionId)
    if (!data) return new Response(null, { status: 404 })
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
          isMobile={fixtureOptions.has('touch')}
          onSelectProjectSession={state.switchSession}
          onSelectPersonalSession={(sessionId) => state.switchSession(null, sessionId)}
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
