import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ToolCallCard, ToolCallGroup, type ToolCallInfo } from '@/components/chat/tool-call-card'
import { cardRun, cardFinding } from './security-tool-card-data'
import '../index.css'

function call(id: string, tool: string, data: unknown, message = 'Saved assessment'): ToolCallInfo {
  return { callId: id, tool, args: {}, status: 'success', result: { ok: true, message, data }, startedAt: 1, completedAt: 2 }
}
function Fixture() {
  const [startedAt] = useState(() => Date.now())
  const [finished, setFinished] = useState(false)
  const [verification, setVerification] = useState('inconclusive')
  const [approved, setApproved] = useState(false)
  const streaming: ToolCallInfo = finished ? call('stream', 'security.http.check', cardRun) : { callId: 'stream', tool: 'security.http.check', args: { target: '127.0.0.1', port: 8080 }, status: 'running', startedAt }
  const plan = { findingId: cardFinding.id, target: cardFinding.target, port: cardFinding.port, recommendation: cardFinding.remediation,
    steps: ['Back up the current header configuration', 'Add the nosniff header', 'Repeat the same check'], rollback: ['Restore the previous header configuration'], requiresApproval: true }
  const imported = { ...cardRun, id: 'run-suspected', status: 'partial', findings: [{ ...cardFinding, status: 'suspected', title: 'Imported alert needs investigation' }], coverageGaps: ['Sensor vantage point is unknown'],
    evidence: [{ ...cardRun.evidence[0], summary: '<img src=x onerror=alert(1)>', facts: { statusCode: 200, password: 'DO-NOT-SHOW', raw: 'DO-NOT-SHOW-RAW' } }] }
  return <main className="mx-auto max-w-3xl space-y-5 p-4">
    <h1 className="text-xl font-semibold">Security cards in chat</h1>
    <section data-testid="stream-card"><button className="rounded border p-2" onClick={() => setFinished(true)}>Finish fixture check</button><ToolCallCard call={streaming} /></section>
    <section data-testid="persisted-cards">
      <ToolCallGroup collapsible calls={[
        call('saved', 'mcp__jait__security_results_show', { content: [{ type: 'text', text: 'Saved assessment\n' + JSON.stringify({ data: cardRun }) }] }),
        call('empty', 'security.findings.list', []),
        call('engines', 'security_engines_status', [{ name: 'nmap', available: false, version: null }]),
        call('imported', 'functions.mcp__jait_core__security_telemetry_ingest', imported),
      ]} />
    </section>
    <section data-testid="plan-card"><ToolCallCard call={call('plan', 'security.remediation.plan', plan)} /></section>
    <section data-testid="verify-card">
      <label>Verification fixture <select aria-label="Verification outcome" value={verification} onChange={event => setVerification(event.target.value)} className="rounded border bg-background p-2">
        <option value="inconclusive">Inconclusive</option><option value="still-observed">Still observed</option><option value="verified-absent">Verified absent</option>
      </select></label>
      <ToolCallCard call={{ ...call('verify', 'mcp.call', { findingId: cardFinding.id, runId: 'verification-run', status: verification, reason: verification === 'inconclusive' ? 'Repeat check timed out' : 'Compatible repeat measurement' }), args: { server: 'jait', tool: 'security_verification_run', arguments: { findingId: cardFinding.id } } }} />
    </section>
    <section data-testid="scope-card"><ToolCallCard
      call={approved ? call('scope', 'security.scope.create', cardRun.scope) : { callId: 'scope', tool: 'security.scope.create', args: { targets: ['127.0.0.1'] }, status: 'pending', approvalRequestId: 'approve-scope', startedAt }}
      onApprovalResponse={async (_id, accept) => { if (accept) setApproved(true) }}
    /></section>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
