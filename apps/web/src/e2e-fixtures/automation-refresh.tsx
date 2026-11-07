import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { useAutomation } from '@/hooks/useAutomation'
import { agentsApi, type ThreadActivity } from '@/lib/agents-api'
import { setAuthToken } from '@/lib/auth-token'

setAuthToken('fixture')
agentsApi.listRepos = async () => []
agentsApi.sendTurn = async () => {}
agentsApi.getThread = async () => { throw new Error('no fixture thread') }
const pending: Array<{ threadId: string; resolve: (value: ThreadActivity[]) => void }> = []
agentsApi.getActivities = (threadId) => new Promise(resolve => pending.push({ threadId, resolve }))
Object.assign(window, {
  activityRequests: pending,
  resolveActivity: (index: number, id: string) => pending[index]!.resolve([{ id, kind: 'message', createdAt: '2026-01-01T00:00:00Z', payload: {} } as ThreadActivity]),
})

function Harness() {
  const [enabled, setEnabled] = useState(true)
  const automation = useAutomation(enabled)
  return <>
    <button onClick={() => setEnabled(value => !value)}>Toggle enabled</button>
    <button onClick={() => automation.handleThreadEvent('thread.created', { thread: { id: 'a', title: 'A', workingDirectory: '/fixture', providerSessionId: 'session', status: 'completed' } })}>Add A</button>
    <button onClick={() => void automation.handleSendToThread('a', 'hello')}>Hydrate A</button>
    <button onClick={() => automation.handleThreadEvent('thread.activity', { threadId: 'a', activity: { id: 'live', kind: 'message', createdAt: '2026-01-02T00:00:00Z', payload: {} } })}>Live A</button>
    <button onClick={() => automation.setSelectedThreadId('a')}>Select A</button>
    <button onClick={() => automation.setSelectedThreadId('b')}>Select B</button>
    <button onClick={() => void automation.refreshSelectedThread()}>Refresh</button>
    <output data-testid="selection">{automation.selectedThreadId}</output>
    <output data-testid="activities">{automation.activities.map(activity => activity.id).join(',')}</output>
    <output data-testid="loading">{String(automation.loadingActivities)}</output>
  </>
}
createRoot(document.getElementById('root')!).render(<ConfirmDialogProvider><Harness /></ConfirmDialogProvider>)
