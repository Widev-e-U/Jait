import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { AgentGithubConnection } from '@/components/manager/agent-github-connection'
import { setAuthToken } from '@/lib/auth-token'
import '@/index.css'

setAuthToken('github-browser-fixture')
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<main className="mx-auto max-w-2xl p-6"><AgentGithubConnection agentId="fixture agent" agentName="Fixture" /><Toaster /></main>)
