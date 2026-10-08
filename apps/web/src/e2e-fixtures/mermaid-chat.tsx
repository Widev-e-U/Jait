import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ToolCallCard, ToolCallGroup, type ToolCallInfo } from '@/components/chat/tool-call-card'
import '../index.css'

const diagram = 'flowchart TD\nUser-->Chat\nChat-->TeamRoom\nTeamRoom-->Developer\nDeveloper-->TeamRoom\nTeamRoom-->Reviewer\nReviewer-->TeamRoom'
function call(id: string, source: string, title: string, envelope = false): ToolCallInfo {
  const data = { kind: 'mermaid-diagram', diagram: source, title }
  return { callId: id, tool: envelope ? 'mcp__jait__diagram_render' : 'diagram.render', args: {}, status: 'success', startedAt: 1, completedAt: 2,
    result: { ok: true, message: 'Mermaid source ready for display in chat.', data: envelope ? { content: [{ type: 'text', text: 'Diagram\n' + JSON.stringify(data) }] } : data } }
}
function Fixture() {
  const [finished, setFinished] = useState(false)
  const [source, setSource] = useState('flowchart LR\nA[Before]-->B')
  return <main className="mx-auto max-w-3xl space-y-5 p-4">
    <h1>Diagrams in chat</h1>
    <section data-testid="persisted"><ToolCallGroup collapsible calls={[call('saved', diagram, 'Agent communication', true)]} /></section>
    <section data-testid="stream"><button onClick={() => setFinished(true)}>Finish diagram</button><ToolCallCard call={finished ? call('stream', diagram, 'Live diagram') : { callId: 'stream', tool: 'diagram.render', args: {}, status: 'running', startedAt: Date.now() }} /></section>
    <section data-testid="invalid"><ToolCallCard call={call('invalid', 'this is invalid Mermaid', 'Invalid diagram')} /></section>
    <section data-testid="untrusted"><ToolCallCard call={call('untrusted', 'flowchart LR\nA[Untrusted]-->B\nclick B "javascript:alert(1)"', 'Untrusted diagram')} /></section>
    <section data-testid="html"><ToolCallCard call={call('html', 'flowchart LR\nA["<img src=https://example.invalid/pixel onerror=alert(1)>"]-->B', 'HTML label')} /></section>
    <section data-testid="replace"><button onClick={() => setSource('flowchart LR\nA[After]-->B')}>Update source</button><ToolCallCard call={call('replace', source, 'Updated diagram')} /></section>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
