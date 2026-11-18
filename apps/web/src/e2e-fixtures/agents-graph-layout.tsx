import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AgentsGraph } from '@/components/manager/agents-graph'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/useAuth'
import { newPersonaAgentDraft } from '@/lib/persona-agents'
import '@/index.css'

const team = [
  ['nova', 'Nova', null], ['atlas', 'Atlas', 'nova'], ['pixel', 'Pixel', 'nova'],
  ['orbit', 'Orbit', 'atlas'], ['echo', 'Echo', 'pixel'],
].map(([id, name, reportsToId]) => ({ ...newPersonaAgentDraft(), id: id!, name: name!, avatar: name!, providerId: 'codex', reportsToId }))
function Fixture() {
  const [agents, setAgents] = useState(team)
  const [open, setOpen] = useState(true)
  const [details, setDetails] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  return <TooltipProvider><main className="flex h-dvh flex-col bg-background text-foreground">
    <div className="flex h-12 shrink-0 gap-4 px-3">
      <button onClick={() => setOpen(value => !value)}>{open ? 'Hide graph' : 'Show graph'}</button>
      <button onClick={() => setAgents(value => [...value].reverse().map(agent => ({ ...agent })))}>Refresh profiles</button>
      <button onClick={() => setDetails(value => !value)}>Toggle details</button>
    </div>
    <div className="flex min-h-0 flex-1">
      {open && <AgentsGraph agents={agents} threads={[]} selectedId={selected} onSave={async () => {}}
        onOpen={setSelected} onChooseTask={setSelected} onRefresh={() => {}} onResume={async () => {}} />}
      {details && <aside className="w-80 shrink-0 border-l">Agent details</aside>}
    </div>
    <output aria-label="Selected agent" className="sr-only">{selected}</output>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<AuthProvider><Fixture /></AuthProvider>)
