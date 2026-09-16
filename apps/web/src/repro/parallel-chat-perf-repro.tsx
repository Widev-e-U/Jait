import { memo, Profiler, useState, type ProfilerOnRenderCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { ProjectPanel } from '@/components/project'
import { AuthProvider } from '@/hooks/useAuth'
import { HotkeysProvider } from '@/components/hotkeys'
import { ParallelChatPanel, areParallelChatPanelPropsEqual, type ParallelChatPanelProps } from '@/components/app-shell/parallel-chat-panel'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ReferencedFile, PromptSkill } from '@/components/chat'
import type { ProjectSession } from '@/hooks/useProjects'
import '@/index.css'

const params = new URLSearchParams(window.location.search)
const PANEL_COUNT = Number(params.get('panels') ?? 3)
const HISTORY_COUNT = Number(params.get('history') ?? 80)
/**
 * Reproduces the pre-fix App: every parent render re-creates the collection and
 * callback props, which (correctly) makes the panels' memoization fail. Used as
 * the negative control proving the harness detects the regression.
 */
const UNSTABLE_PROPS = params.get('unstable') === '1'

const controllers = new Map<string, ReadableStreamDefaultController<Uint8Array>>()
const originalFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const match = url.match(/\/api\/sessions\/(panel-\d)\/(messages|events)/)
  if (match?.[2] === 'messages') return Promise.resolve(Response.json({
    streaming: true, seq: 0, total: HISTORY_COUNT + 1, hasMore: false,
    messages: [
      ...Array.from({ length: HISTORY_COUNT }, (_, i) => ({
        id: 'history-' + i,
        role: i % 2 ? 'assistant' : 'user',
        content: 'History ' + i + '\n\n' + 'Stable paragraph text for layout measurement. '.repeat(20),
      })),
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

interface PerfEntry { commits: number; duration: number; phases: Record<string, number>; renders: number }
const perf: Record<string, Omit<PerfEntry, 'renders'>> = {}
/**
 * A `<Profiler>` around a memoized component still fires `onRender` for commits
 * in which every descendant bailed out (the Profiler fiber itself is flagged for
 * the update), so commit counts alone cannot tell "the panel re-rendered" from
 * "the parent committed". This wrapper is memoized with the panel's *own*
 * comparator, so its render body only runs when the comparator lets a render
 * through: the counts below are the ground truth the spec asserts on.
 */
const panelRenders = new Map<string, number>()
const CountedPanel = memo(function CountedPanelImpl(props: ParallelChatPanelProps) {
  panelRenders.set(props.session.id, (panelRenders.get(props.session.id) ?? 0) + 1)
  return <ParallelChatPanel {...props} />
}, areParallelChatPanelPropsEqual)

const record: ProfilerOnRenderCallback = (id, phase, actualDuration) => {
  const entry = (perf[id] ??= { commits: 0, duration: 0, phases: {} })
  entry.commits += 1
  entry.duration += actualDuration
  entry.phases[phase] = (entry.phases[phase] ?? 0) + 1
  const marks = Reflect.get(window, '__perfMarks') as unknown[] | undefined
  const next = marks ?? []
  next.push([id, performance.now(), phase])
  if (!marks) Reflect.set(window, '__perfMarks', next)
}

Reflect.set(window, '__perf', perf)
Reflect.set(window, '__perfReset', () => {
  for (const key of Object.keys(perf)) delete perf[key]
  panelRenders.clear()
})
/** Profiler commits (parent saw the panel) plus the ground-truth panel renders. */
Reflect.set(window, '__perfReport', () => {
  const report: Record<string, PerfEntry> = {}
  for (const id of [...Object.keys(perf), ...panelRenders.keys()]) {
    const entry = perf[id]
    report[id] = entry
      ? { ...entry, renders: panelRenders.get(id) ?? 0 }
      : { commits: 0, duration: 0, phases: {}, renders: panelRenders.get(id) ?? 0 }
  }
  return JSON.stringify(report)
})

/** Simulate the main chat streaming: App re-renders once per animation frame. */
Reflect.set(window, '__forceParentRenders', async (frames = 60, intervalMs = 16) => {
  await Reflect.get(window, '__bumpParent')?.(frames, intervalMs)
})

/**
 * Control for `__forceParentRenders`: same parent re-render cadence, but the
 * session prop the panels read genuinely changes each frame, so every panel
 * *must* re-render. Used to prove the idle measurement is not vacuous (i.e. that
 * the Profiler would see real work if there were any) and to give the idle cost
 * a machine-independent reference point.
 */
Reflect.set(window, '__forceLiveParentRenders', async (frames = 60, intervalMs = 16) => {
  await Reflect.get(window, '__bumpLiveParent')?.(frames, intervalMs)
})

const encoder = new TextEncoder()
const sendToken = (controller: ReadableStreamDefaultController<Uint8Array>, content: string) =>
  controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'token', content }) + '\n\n'))

Reflect.set(window, '__streamAllPanels', async (tokens = 120, intervalMs = 8) => {
  for (let i = 0; i < tokens; i++) {
    for (const controller of controllers.values()) sendToken(controller, 'chunk' + i + ' ')
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  for (const controller of controllers.values()) controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'))
})

/** Stream into one panel only — used as a control proving the profiler is live. */
Reflect.set(window, '__streamPanel', async (panelId: string, tokens = 1, intervalMs = 8) => {
  const controller = controllers.get(panelId)
  if (!controller) throw new Error('unknown panel ' + panelId)
  for (let i = 0; i < tokens; i++) {
    sendToken(controller, 'control' + i + ' ')
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
})

Reflect.set(window, '__panelStreamsReady', () => controllers.size === PANEL_COUNT)

const editorFiles = [{ id: 'file', name: 'example.ts', path: 'example.ts', content: 'export const example = 1', language: 'typescript' }]
const noop = () => {}
// Reference-stable props, mirroring what App feeds the panels: collections live
// in state/hooks and callbacks are `useCallback`s. The panels are memoized, so
// re-creating these per render would (correctly) defeat the memoization and
// re-render every panel on each streamed token of the main chat.
const EMPTY_FILES: ReferencedFile[] = []
const EMPTY_SKILLS: PromptSkill[] = []
const searchFiles = async () => EMPTY_FILES

function PerfRepro() {
  const [editorOpen, setEditorOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const [liveTick, setLiveTick] = useState(0)

  // Emulates `useChat` living inside App: each primary-chat stream flush
  // re-renders the whole app tree, including every parallel panel. Resolves once
  // every frame has been committed, so a caller can never overlap two runs.
  Reflect.set(window, '__bumpParent', (frames: number, intervalMs: number) => new Promise<void>((resolve) => {
    let remaining = frames
    const step = () => {
      setTick((value) => value + 1)
      remaining -= 1
      if (remaining > 0) setTimeout(step, intervalMs)
      else resolve()
    }
    step()
  }))

  // Same cadence, but `liveTick` feeds a prop the panels read (`lastActiveAt`),
  // so the panels are guaranteed to re-render on every parent render.
  Reflect.set(window, '__bumpLiveParent', (frames: number, intervalMs: number) => new Promise<void>((resolve) => {
    let remaining = frames
    const step = () => {
      setLiveTick((value) => value + 1)
      remaining -= 1
      if (remaining > 0) setTimeout(step, intervalMs)
      else resolve()
    }
    step()
  }))

  return (
    <AuthProvider><HotkeysProvider><ConfirmDialogProvider><TooltipProvider>
      <button className="fixed left-0 top-0 z-50" onClick={() => setEditorOpen((open) => !open)}>
        Toggle editor fixture (tick {tick})
      </button>
      <main className="flex h-screen w-screen overflow-hidden">
        {editorOpen && <ProjectPanel files={editorFiles} activeFileId="file"
          onActiveFileChange={noop} onFileDrop={noop} onReferenceFile={noop}
          showTree={false} showEditor savedPanelSize={600} />}
        {Array.from({ length: PANEL_COUNT }, (_, index) => index + 1).map((id) => (
          <Profiler key={id} id={'panel-' + id} onRender={record}>
            <CountedPanel
              session={{ id: 'panel-' + id, projectId: 'project', lastActiveAt: String(liveTick) } as ProjectSession}
              token={null} provider="codex" responseStyle="normal"
              model={null} reasoningEffort={null}
              // `?unstable=1` re-creates these per render, i.e. the pre-fix App.
              availableFiles={UNSTABLE_PROPS ? [] : EMPTY_FILES}
              availableSkills={UNSTABLE_PROPS ? [] : EMPTY_SKILLS}
              isMobile={false}
              onSearchFiles={UNSTABLE_PROPS ? async () => EMPTY_FILES : searchFiles}
              showHideButton={false}
              onClose={UNSTABLE_PROPS ? () => {} : noop}
              showDivider={id > 1}
            />
          </Profiler>
        ))}
      </main>
    </TooltipProvider></ConfirmDialogProvider></HotkeysProvider></AuthProvider>
  )
}

createRoot(document.getElementById('root')!).render(<PerfRepro />)
