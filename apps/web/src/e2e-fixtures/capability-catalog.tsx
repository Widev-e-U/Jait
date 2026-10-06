import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { JAIT_PAGES } from '@jait/shared'
import { ToolCallCard, type ToolCallInfo } from '@/components/chat/tool-call-card'
import { subscribeNotificationNavigation } from '@/lib/notification-navigation'
import '../index.css'

function call(id: string, tool: string, data: unknown): ToolCallInfo {
  return { callId: id, tool, args: {}, status: 'success', result: { ok: true, message: 'Completed', data }, startedAt: 1, completedAt: 2 }
}
function Fixture() {
  const [destination, setDestination] = useState('')
  useEffect(() => subscribeNotificationNavigation(async (activation) => { setDestination(activation.link); return true }), [])
  const data = {
    pages: [{ ...JAIT_PAGES.agents, id: 'agents', tools: [{ name: 'agent.profiles' }] }],
    pageLinks: [{ pageId: 'agents', title: 'Agents', href: '/agents' }],
  }
  return <main className="mx-auto max-w-3xl space-y-4 p-4">
    <h1>Jait capability catalog</h1>
    <output data-testid="destination">{destination}</output>
    <section data-testid="catalog"><ToolCallCard call={call('catalog', 'jait.catalog', data)} /></section>
    <section data-testid="profile"><ToolCallCard call={call('profile', 'mcp__jait__agent_profiles', { agent: { id: 'worker', name: 'Developer' } })} /></section>
    <section data-testid="external-catalog"><ToolCallCard call={call('external', 'functions.mcp__jait_core__jait_catalog', { content: [{ type: 'text', text: 'Catalog\n' + JSON.stringify(data) }] })} /></section>
    <section data-testid="explicit-link"><ToolCallCard call={call('link', 'jait.link', { kind: 'jait-link', href: '/agents', label: 'View the updated team' })} /></section>
    <section data-testid="external-link"><ToolCallCard call={call('wrapped-link', 'functions.mcp__jait_core__jait_link', { content: [{ type: 'text', text: 'Link\\n' + JSON.stringify({ kind: 'jait-link', href: '/jobs', label: 'View the new job' }) }] })} /></section>
    <section data-testid="job"><ToolCallCard call={call('job', 'cron.add', { id: 'job' })} /></section>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
