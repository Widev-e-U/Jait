import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ChatLoop } from '@jait/shared'
import { LoopGoalCard } from '@/components/chat/loop-goal-card'
import { SessionRow } from '@/components/chat/session-row'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

function Fixture() {
  const [sessionId, setSessionId] = useState('fixture-a')
  const [loop, setLoop] = useState<ChatLoop>({ id: 'goal', goal: 'Fix the failing network inventory check and verify the result', criteria: ['Regression check passes', 'Existing authorization boundaries remain enforced'], status: 'running', iteration: 3, revision: 7, checkedIteration: 2, summary: 'The cause is identified. Preparing the regression check.', nextMessage: 'Run the regression check', evidence: [], updatedAt: new Date().toISOString() })
  const [fail, setFail] = useState(false)
  return <TooltipProvider><main className="mx-auto max-w-5xl p-4">
    <div className="mb-6 max-w-64"><SessionRow session={{ id: sessionId, name: 'Network inventory', metadata: JSON.stringify({ loop }) }} isActive={true} /></div>
    <div className="max-w-72">
      <div className="mb-2 rounded-md border px-2 py-1 text-xs text-muted-foreground">2 files changed</div>
      <LoopGoalCard key={sessionId} sessionId={sessionId} loop={loop} onControl={async action => {
        if (fail) throw new Error('Gateway unavailable. Try again.')
        setLoop(current => ({ ...current, status: action === 'pause' ? 'paused' : 'running', revision: current.revision + 1 }))
      }} />
    </div>
    <div className="mt-8 flex flex-wrap gap-4 text-xs">
      <button onClick={() => setSessionId('fixture-a')}>Open chat A</button>
      <button onClick={() => setSessionId('fixture-b')}>Open chat B</button>
      <button onClick={() => setFail(value => !value)}>Toggle gateway failure</button>
      <button onClick={() => setLoop(current => ({ ...current, status: 'completed', summary: 'Both checks passed.', evidence: ['Regression check exited 0', 'Scope boundary tests exited 0'] }))}>Complete goal</button>
      <button onClick={() => setLoop(current => ({ ...current, status: 'waiting', summary: 'Which execution node should run the checks?' }))}>Ask question</button>
    </div>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
