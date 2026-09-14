import { useState } from 'react'
import { ProjectPanel } from '@/components/project'
import { AuthProvider } from '@/hooks/useAuth'
import { HotkeysProvider } from '@/components/hotkeys'
import { createRoot } from 'react-dom/client'
import { ParallelChatPanel } from '@/components/app-shell/parallel-chat-panel'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ProjectSession } from '@/hooks/useProjects'
import '@/index.css'

const controllers = new Map<string, ReadableStreamDefaultController<Uint8Array>>()
const originalFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const match = url.match(/\/api\/sessions\/(panel-\d)\/(messages|events)/)
  if (match?.[2] === 'messages') return Promise.resolve(Response.json({
    streaming: true, seq: 0, total: 41, hasMore: false,
    messages: [
      ...Array.from({ length: 40 }, (_, i) => ({ id: 'history-' + i, role: i % 2 ? 'assistant' : 'user', content: 'History ' + i + '\n\n' + 'Stable paragraph. '.repeat(30) })),
      { id: 'live', role: 'assistant', content: 'Live answer: ', segments: [{ type: 'text', content: 'Live answer: ' }] },
    ],
  }))
  if (match?.[2] === 'events') return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controllers.set(match[1], controller)
      init?.signal?.addEventListener('abort', () => { controllers.delete(match[1]); controller.close() }, { once: true })
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } }))
  if (url.includes('/api/')) return Promise.resolve(Response.json({}))
  return originalFetch(input, init)
}) as typeof window.fetch

Reflect.set(window, '__streamBothPanels', async () => {
  for (let i = 0; i < 30; i++) {
    for (const controller of controllers.values()) {
      controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ type: 'token', content: 'word' + i + ' ' }) + '\n\n'))
    }
    await new Promise(resolve => setTimeout(resolve, 16))
  }
  for (const controller of controllers.values()) controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'))
})
Reflect.set(window, '__panelStreamsReady', () => controllers.size === 2)

const editorFiles = [{ id: 'file', name: 'example.ts', path: 'example.ts', content: 'export const example = 1', language: 'typescript' }]
const noop = () => {}
function Repro() {
  const [editorOpen, setEditorOpen] = useState(false)
  return (
  <AuthProvider><HotkeysProvider><ConfirmDialogProvider><TooltipProvider>
    <button className="fixed left-0 top-0 z-50" onClick={() => setEditorOpen(open => !open)}>Toggle editor fixture</button>
    <main className="flex h-screen w-screen overflow-hidden">
      {editorOpen && <ProjectPanel files={editorFiles} activeFileId="file"
        onActiveFileChange={noop} onFileDrop={noop} onReferenceFile={noop}
        showTree={false} showEditor savedPanelSize={600} />}
      {[1, 2].map((id) => <ParallelChatPanel
        key={id}
        session={{ id: 'panel-' + id, projectId: 'project' } as ProjectSession}
        token={null} provider="codex" responseStyle="normal"
        model={null} reasoningEffort={null}
        availableFiles={[]} availableSkills={[]}
        isMobile={false} onSearchFiles={async () => []}
        showHideButton={false} onClose={() => {}}
        showDivider={id > 1}
      />)}
    </main>
  </TooltipProvider></ConfirmDialogProvider></HotkeysProvider></AuthProvider>
)
}
createRoot(document.getElementById('root')!).render(<Repro />)
