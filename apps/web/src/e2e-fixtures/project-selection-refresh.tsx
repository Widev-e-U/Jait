import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useProjects } from '@/hooks/useProjects'

const session = (id: string) => ({ id, projectId: 'project', name: id, status: 'active', createdAt: '2026-01-01', lastActiveAt: '2026-01-01' })
const project = { id: 'project', title: 'Project', status: 'active', sessions: [session('loop'), session('other')] }
window.fetch = async (input) => {
  const url = String(input)
  const data = url.includes('/last-active') ? { project, session: session('loop') }
    : url.includes('/api/projects?') ? { projects: [project], hasMore: false }
    : url.includes('/api/sessions?') ? { sessions: [] }
    : url.includes('/api/sessions/') ? session(url.split('/').pop()!)
    : {}
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function Harness() {
  const state = useProjects('fixture')
  const [refreshes, setRefreshes] = useState(0)
  return <>
    <button onClick={() => state.switchSession('project', 'other')}>Select other</button>
    <button onClick={() => void state.fetchProjects().then(() => setRefreshes(count => count + 1))}>Refresh projects</button>
    <output data-testid="refreshes">{refreshes}</output>
    <output data-testid="selection">{state.activeSessionId}</output>
  </>
}
createRoot(document.getElementById('root')!).render(<Harness />)
