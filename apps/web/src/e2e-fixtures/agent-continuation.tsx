import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { AgentsPage } from '@/components/manager/agents-page'
import { agentsApi, type AgentThread } from '@/lib/agents-api'
import { initAuthToken } from '@/lib/auth-token'
import '../index.css'
function Fixture() {
  const [threads, setThreads] = useState<AgentThread[]>([])
  const refresh = () => { void agentsApi.listThreads().then(setThreads) }
  useEffect(refresh, [])
  return <main className="flex h-screen flex-col"><AgentsPage token="fixture-token" repositories={[]} availableSkills={[]} threads={threads} onOpenThread={() => {}} onRefreshThreads={refresh} onOpenSettings={() => {}} onRefreshSkills={() => {}} /><Toaster /></main>
}
void initAuthToken().then(() => createRoot(document.getElementById('root')!).render(<Fixture />))
