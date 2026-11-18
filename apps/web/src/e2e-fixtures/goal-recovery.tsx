import { createRoot } from 'react-dom/client'
import { readChatLoop } from '@jait/shared'
import { useProjects } from '@/hooks/useProjects'
import { useIsMobile } from '@/hooks/useIsMobile'
import { LoopGoalCard } from '@/components/chat/loop-goal-card'
import '@/index.css'

function Fixture() {
  const { projects, personalSessions, activeSessionId, refreshActiveSession, loading } = useProjects('goal-recovery-fixture')
  const mobile = useIsMobile()
  const sessions = [...projects.flatMap(project => project.sessions), ...personalSessions]
  const loop = readChatLoop(sessions.find(session => session.id === activeSessionId)?.metadata)
  return <main className="p-4">
    <output>{loading ? 'Loading' : 'Ready'}</output>
    <output data-testid="session-count">{sessions.length}</output>
    <button onClick={() => void refreshActiveSession()}>Reconnect chat</button>
    {loop && activeSessionId && <div className="max-w-80">
      <LoopGoalCard key={activeSessionId} loop={loop} sessionId={activeSessionId} mobile={mobile} onControl={async () => {}} />
    </div>}
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
