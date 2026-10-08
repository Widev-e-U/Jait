import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { AgentsPage } from '@/components/manager/agents-page'
import { agentsApi, type AgentThread } from '@/lib/agents-api'
import { AuthProvider } from '@/hooks/useAuth'
import { initAuthToken } from '@/lib/auth-token'
import '../index.css'
function Fixture() {
  const [threads, setThreads] = useState<AgentThread[]>([])
  const refresh = () => { void agentsApi.listThreads().then(setThreads) }
  useEffect(refresh, [])
  return <main className="flex h-screen flex-col"><AgentsPage token="fixture-token" repositories={[]} availableSkills={[]} threads={threads} onOpenThread={() => {}} onRefreshThreads={refresh} onOpenSettings={() => {}} onRefreshSkills={() => {}} /><Toaster /></main>
}
void initAuthToken().then(() => createRoot(document.getElementById('root')!).render(<AuthProvider><Fixture /></AuthProvider>))
