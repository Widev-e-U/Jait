import { useState } from 'react'
import { Bot, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  newPersonaAgentDraft,
  readPersonaAgentDrafts,
  savePersonaAgentDrafts,
  type PersonaAgentDraft,
  type PersonaSchedule,
} from '@/lib/persona-agents'

interface RepositoryChoice {
  id: string
  name: string
}

interface AgentsPageProps {
  repositories: RepositoryChoice[]
}

function commaList(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean)
}

interface CommaListInputProps {
  label: string
  value: string[]
  placeholder: string
  onCommit: (value: string[]) => void
}

function CommaListInput({ label, value, placeholder, onCommit }: CommaListInputProps) {
  const [text, setText] = useState(value.join(', '))
  return (
    <label className="block text-sm font-medium">{label}
      <input
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onCommit(commaList(text))}
        placeholder={placeholder}
      />
    </label>
  )
}

export function AgentsPage({ repositories }: AgentsPageProps) {
  const [drafts, setDrafts] = useState<PersonaAgentDraft[]>(readPersonaAgentDrafts)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = drafts.find((agent) => agent.id === selectedId) ?? null

  const persist = (next: PersonaAgentDraft[]) => {
    try {
      savePersonaAgentDrafts(next)
      setDrafts(next)
    } catch {
      toast.error('Could not save agent drafts on this device')
    }
  }

  const update = (changes: Partial<PersonaAgentDraft>) => {
    if (!selected) return
    persist(drafts.map((agent) => agent.id === selected.id
      ? { ...agent, ...changes, updatedAt: new Date().toISOString() }
      : agent))
  }

  const create = () => {
    const draft = newPersonaAgentDraft()
    persist([...drafts, draft])
    setSelectedId(draft.id)
  }

  const remove = () => {
    if (!selected) return
    persist(drafts.filter((agent) => agent.id !== selected.id))
    setSelectedId(null)
  }

  const updateSchedule = (schedule: PersonaSchedule) => update({ schedule })

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Agents</h1>
            <p className="mt-1 text-sm text-muted-foreground">Define virtual employees and the work they may take on.</p>
          </div>
          <Button onClick={create} size="sm"><Plus className="mr-1.5 h-4 w-4" /> New agent</Button>
        </div>
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
          Agent configurations are saved as drafts in this browser. Automatic runs, activity history, and notifications are not active yet.
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
          <div className="space-y-2" aria-label="Agent drafts">
            {drafts.length === 0 && (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                <Bot className="mx-auto mb-2 h-8 w-8" />
                No agents yet. Create a draft to define one.
              </div>
            )}
            {drafts.map((agent) => (
              <button
                type="button"
                key={agent.id}
                onClick={() => setSelectedId(agent.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 ${selectedId === agent.id ? 'border-primary bg-muted/40' : ''}`}
              >
                <span className="flex items-center gap-2 font-medium"><Bot className="h-4 w-4" />{agent.name || 'Untitled agent'}</span>
                <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{agent.persona || 'No persona yet'}</span>
                <span className="mt-2 block text-xs text-muted-foreground">Draft · Paused</span>
              </button>
            ))}
          </div>
          {selected ? (
            <div className="min-w-0 space-y-5 rounded-xl border p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Agent draft</h2>
                <Button variant="ghost" size="sm" onClick={remove} aria-label="Delete agent draft"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <label className="block text-sm font-medium">Name
                <input className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={selected.name} onChange={(event) => update({ name: event.target.value })} placeholder="Research assistant" />
              </label>
              <label className="block text-sm font-medium">Persona and responsibilities
                <textarea className="mt-1 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={selected.persona} onChange={(event) => update({ persona: event.target.value })} placeholder="Describe how this agent should work and communicate" />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Repositories</legend>
                {repositories.length === 0 ? <p className="text-xs text-muted-foreground">Add a repository on the Threads page first.</p> : repositories.map((repo) => (
                  <label key={repo.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selected.repositoryIds.includes(repo.id)} onChange={(event) => update({ repositoryIds: event.target.checked ? [...selected.repositoryIds, repo.id] : selected.repositoryIds.filter((id) => id !== repo.id) })} />
                    {repo.name}
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">When it may work</legend>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={selected.schedule.kind} onChange={(event) => updateSchedule(event.target.value === 'cron' ? { kind: 'cron', cron: '' } : { kind: 'adaptive', rules: '' })}>
                  <option value="adaptive">Based on rules</option>
                  <option value="cron">On a schedule</option>
                </select>
                {selected.schedule.kind === 'cron'
                  ? <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" aria-label="Cron schedule" value={selected.schedule.cron} onChange={(event) => updateSchedule({ kind: 'cron', cron: event.target.value })} placeholder="0 9 * * 1-5" />
                  : <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" aria-label="Trigger rules" value={selected.schedule.rules} onChange={(event) => updateSchedule({ kind: 'adaptive', rules: event.target.value })} placeholder="Describe events that may trigger work" />}
              </fieldset>
              <CommaListInput key={`${selected.id}:tools`} label="Allowed tools" value={selected.allowedTools} onCommit={(allowedTools) => update({ allowedTools })} placeholder="Comma separated tool names" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.requiresApproval} onChange={(event) => update({ requiresApproval: event.target.checked })} /> Require approval for actions</label>
              <CommaListInput key={`${selected.id}:channels`} label="Notification channels" value={selected.notificationChannels} onCommit={(notificationChannels) => update({ notificationChannels })} placeholder="e.g. in-app, email" />
              <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="mb-2 font-medium">Notify when</legend>
                {([['task_done', 'Task done'], ['blocked', 'Blocked'], ['question', 'Question']] as const).map(([event, label]) => (
                  <label key={event} className="flex items-center gap-2"><input type="checkbox" checked={selected.notificationEvents.includes(event)} onChange={(input) => update({ notificationEvents: input.target.checked ? [...selected.notificationEvents, event] : selected.notificationEvents.filter((item) => item !== event) })} />{label}</label>
                ))}
              </fieldset>
              <div className="border-t pt-4 text-sm text-muted-foreground">Activity history will appear here when autonomous runs are available.</div>
            </div>
          ) : (
            <div className="hidden rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground md:block">Select an agent draft to edit its settings.</div>
          )}
        </div>
      </div>
    </section>
  )
}
