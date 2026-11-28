import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { MeetingRecordingContext } from '@/hooks/useMeetingRecording'
import { MeetingRecordingDialog, MeetingRecordingPanel, type MeetingPanelActions, type MeetingPanelState } from './MeetingRecordingDialog'

type SimpleAction = 'start' | 'stop' | 'retry' | 'discard' | 'openNote' | 'hide'
type MeetingWindowAction = { name: SimpleAction }
  | { name: 'editLine'; args: Parameters<MeetingPanelActions['editLine']> }
  | { name: 'editReview' | 'saveTranscript'; text: string }
type MeetingWindowMessage = { type: 'connect' | 'ready' | 'reset' }
  | { type: 'state'; state: MeetingPanelState; dark: boolean }
  | { type: 'action'; action: MeetingWindowAction }
type WindowCommand = 'prepare' | 'show' | 'hide' | 'message'

const eventName = 'jait:meeting-window'
function listen(receive: (message: MeetingWindowMessage) => void) {
  const handler = (event: Event) => receive((event as CustomEvent<MeetingWindowMessage>).detail)
  window.addEventListener(eventName, handler)
  return () => window.removeEventListener(eventName, handler)
}

export function MeetingRecordingSurface() {
  const recording = useContext(MeetingRecordingContext)
  const bridge = window.jaitDesktop?.meetingWindow
  const [nativeUnavailable, setNativeUnavailable] = useState(false)
  const ready = useRef(false)
  const queue = useRef(Promise.resolve())
  const send = useCallback((action: WindowCommand, message?: MeetingWindowMessage) => {
    const pending = queue.current.then(() => bridge?.(action, message))
    queue.current = pending.catch(() => {})
    return pending
  }, [bridge])
  const state: MeetingPanelState | undefined = recording && recording.nativeApp ? {
    configured: !!recording.setup?.configured,
    phase: recording.phase, seconds: recording.seconds, transcript: recording.transcript,
    job: recording.job, pending: recording.pending, error: recording.error, saving: recording.saving, review: recording.review,
  } : undefined
  const actions: MeetingPanelActions | undefined = recording ? { ...recording, hide: () => recording.setOpen(false) } : undefined
  const latest = useRef({ state, actions })
  latest.current = { state, actions }
  const open = !!recording?.open && !!state

  const sendState = useCallback((current: MeetingPanelState) => send('message', {
    type: 'state', dark: document.documentElement.classList.contains('dark'),
    state: { ...current, job: current.job ? { ...current.job, transcript: undefined } : null },
  }), [send])

  useEffect(() => {
    if (!bridge || nativeUnavailable) return
    if (!open) { void send('hide').catch(() => {}); return }
    let disposed = false
    const fail = () => { if (!disposed) setNativeUnavailable(true) }
    const timeout = window.setTimeout(fail, 8000)
    const unlisten = listen(data => {
      const { state: current, actions: handle } = latest.current
      if (data?.type === 'ready' && current) {
        void sendState(current).catch(fail)
        if (!ready.current) {
          ready.current = true
          void send('show').then(() => window.clearTimeout(timeout), fail)
        }
      } else if (data?.type === 'action' && handle && ready.current) {
        const action = data.action
        switch (action.name) {
          case 'editLine': handle.editLine(...action.args); break
          case 'editReview': handle.editReview(action.text); break
          case 'saveTranscript': handle.saveTranscript(action.text); break
          case 'start': case 'stop': case 'retry': case 'discard': case 'openNote': case 'hide': handle[action.name](); break
        }
      }
    })
    void send('prepare').then(() => { if (!disposed) return send('message', { type: 'connect' }) }).catch(fail)
    return () => {
      disposed = true
      ready.current = false
      unlisten()
      window.clearTimeout(timeout)
      void send('message', { type: 'reset' }).catch(() => {})
      void send('hide').catch(() => {})
    }
  }, [bridge, open, nativeUnavailable, send, sendState])

  useEffect(() => {
    if (open && state && ready.current) void sendState(state).catch(() => setNativeUnavailable(true))
  })

  return state && actions && (!bridge || nativeUnavailable)
    ? <MeetingRecordingDialog open={open} state={state} actions={actions} /> : null
}

export function MeetingRecordingWindow({ send, startDrag }: NonNullable<Window['jaitMeetingWindow']>) {
  const [state, setState] = useState<MeetingPanelState>()
  const queue = useRef(Promise.resolve())
  const post = useCallback((message: MeetingWindowMessage) => {
    queue.current = queue.current.then(() => send(message)).catch(() => {})
  }, [send])
  const invoke = (action: MeetingWindowAction) => post({ type: 'action', action })
  useEffect(() => {
    const unlisten = listen(data => {
      if (data?.type === 'connect') post({ type: 'ready' })
      if (data?.type === 'reset') setState(undefined)
      if (data?.type === 'state') {
        document.documentElement.classList.toggle('dark', data.dark)
        setState(data.state)
      }
    })
    post({ type: 'ready' })
    const hide = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) post({ type: 'action', action: { name: 'hide' } })
    }
    window.addEventListener('keydown', hide)
    return () => { window.removeEventListener('keydown', hide); unlisten() }
  }, [post])
  const actions: MeetingPanelActions = {
    start: () => invoke({ name: 'start' }), stop: () => invoke({ name: 'stop' }),
    retry: () => invoke({ name: 'retry' }), discard: () => invoke({ name: 'discard' }),
    hide: () => invoke({ name: 'hide' }), openNote: () => invoke({ name: 'openNote' }),
    editLine: (...args) => invoke({ name: 'editLine', args }),
    editReview: text => invoke({ name: 'editReview', text }),
    saveTranscript: text => invoke({ name: 'saveTranscript', text }),
  }
  return <main className="flex h-dvh flex-col overflow-hidden border border-border bg-background text-foreground" aria-label="Meeting recorder window">
    {state && <MeetingRecordingPanel state={state} actions={actions} startDrag={() => { void startDrag().catch(() => {}) }} />}
  </main>
}
