import { MEETING_TRANSCRIPT_MAX_LENGTH } from '@jait/shared'
import { AudioLines, CircleCheck, FileText, Loader2, Mic, Minus, Scissors, Square } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { useMeetingRecording } from '@/hooks/useMeetingRecording'
import { meetingTimestamp, type LiveMeetingLine } from '@/lib/meeting-live-transcript'

const inputStyle = 'min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70'

type Recorder = ReturnType<typeof useMeetingRecording>
export type MeetingPanelState = Pick<Recorder, 'phase' | 'seconds' | 'transcript' | 'job' | 'pending' | 'error' | 'saving' | 'review'> & { configured: boolean }
export type MeetingPanelActions = Pick<Recorder, 'editLine' | 'editReview'> & {
  start: () => void
  stop: () => void
  retry: () => void
  discard: () => void
  saveTranscript: (text: string) => void
  openNote: () => void
  hide: () => void
}

type EditLine = MeetingPanelActions['editLine']

function TranscriptLine({ line, names, editable, edit }: { line: LiveMeetingLine; names: string; editable: boolean; edit: EditLine }) {
  const textInput = useRef<HTMLTextAreaElement>(null)
  const speakerInput = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(line.text)
  const [speaker, setSpeaker] = useState(line.speaker)
  useEffect(() => { if (document.activeElement !== textInput.current) setText(line.text) }, [line.text])
  useEffect(() => { if (document.activeElement !== speakerInput.current) setSpeaker(line.speaker) }, [line.speaker])
  const timestamp = meetingTimestamp(line.start)
  return (
    <li className="grid min-w-0 gap-2 rounded-lg border bg-card p-3 min-[540px]:grid-cols-[6.5rem_minmax(0,1fr)] min-[540px]:gap-3">
      <div className="flex min-w-0 items-center gap-2 min-[540px]:flex-col min-[540px]:items-stretch">
        <time className="shrink-0 px-1 font-mono text-[11px] tabular-nums text-muted-foreground">{timestamp}</time>
        <input ref={speakerInput} className={`${inputStyle} w-full`} placeholder="Speaker" aria-label={`Speaker at ${timestamp}`} list={names} maxLength={80}
          value={speaker} disabled={!editable} onChange={event => { setSpeaker(event.target.value); edit(line.id, { speaker: event.target.value }) }} />
      </div>
      <div className="flex min-w-0 items-start gap-1">
        <textarea ref={textInput} rows={2} className={`${inputStyle} min-h-14 flex-1 resize-y leading-relaxed`} aria-label={`Transcript at ${timestamp}`}
          maxLength={4000} value={text} disabled={!editable} onChange={event => { setText(event.target.value); edit(line.id, { text: event.target.value }) }} />
        {editable && <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Split transcript at ${timestamp}`}
              onClick={() => edit(line.id, {}, textInput.current?.selectionStart ?? 0)}><Scissors className="h-4 w-4" /></Button>
          </TooltipTrigger>
          <TooltipContent>Split at the cursor to label a new speaker</TooltipContent>
        </Tooltip>}
      </div>
    </li>
  )
}

function TranscriptDraft({ text, onReveal }: { text: string; onReveal: () => void }) {
  const [revealed, setRevealed] = useState('')
  useEffect(() => {
    const words = text.split(' ')
    const visible = revealed.split(' ')
    let shared = 0
    while (shared < words.length && words[shared] === visible[shared]) shared++
    const next = words.slice(0, shared + 1).join(' ')
    if (next === revealed) return
    // A new hypothesis may replace an earlier word instead of just appending.
    if (shared === 0 || shared < visible.length) {
      setRevealed(next)
      return
    }
    const timer = window.setTimeout(() => setRevealed(next), 75)
    return () => window.clearTimeout(timer)
  }, [text, revealed])
  useLayoutEffect(onReveal, [onReveal, revealed])
  return (
    <li aria-label="Transcribing now" className="grid min-w-0 gap-2 rounded-lg border border-dashed bg-card p-3 min-[540px]:grid-cols-[6.5rem_minmax(0,1fr)] min-[540px]:gap-3">
      <span className="self-start px-1 text-xs leading-relaxed text-muted-foreground">Transcribing…</span>
      <p className="min-w-0 break-words text-sm leading-relaxed text-foreground">{revealed}</p>
    </li>
  )
}

export function MeetingRecordingPanel({ state, actions, heading, startDrag }: {
  state: MeetingPanelState
  actions: MeetingPanelActions
  heading?: React.Ref<HTMLHeadingElement>
  startDrag?: () => void
}) {
  const floating = !!startDrag
  const [review, setReview] = useState(state.review)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const reviewInput = useRef<HTMLTextAreaElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const names = useId()
  const { phase, seconds, transcript, job, pending, error, saving, configured } = state
  const { start, stop, editLine, editReview, saveTranscript, retry, discard, hide, openNote } = actions
  useEffect(() => { if (document.activeElement !== reviewInput.current) setReview(state.review) }, [state.review])
  useEffect(() => { setConfirmDiscard(false) }, [job?.id])
  const scrollToLatest = useCallback(() => {
    const panel = scroll.current
    if (panel && follow.current && !panel.contains(document.activeElement)) panel.scrollTop = panel.scrollHeight
  }, [])
  useLayoutEffect(scrollToLatest, [scrollToLatest, transcript.lines.length])
  const active = phase === 'recording'
  const partial = active ? transcript.partial : undefined
  const starting = phase === 'starting'
  const uploading = phase === 'uploading'
  const reviewing = job?.stage === 'reviewing'
  const processing = uploading || job?.stage === 'transcribing' || job?.stage === 'summarizing' || job?.stage === 'saving'
  const completed = !active && !starting && !uploading && job?.stage === 'complete'
  const failure = error || job?.error
  const canDiscard = !active && !processing && !starting && (pending || reviewing || job?.stage === 'failed' || job?.stage === 'uploading')
  const suggestedSpeakers = [...new Set(transcript.lines.map(line => line.speaker.trim()).filter(Boolean))]
  const status = active ? 'Recording' : starting ? 'Starting microphone' : uploading ? 'Preparing transcript'
    : reviewing ? 'Ready for review' : job?.stage === 'transcribing' ? 'Transcribing recording'
      : job?.stage === 'summarizing' ? 'Summarizing with Nemotron' : job?.stage === 'saving' ? 'Saving to Obsidian'
        : completed ? 'Saved to Obsidian' : failure ? 'Recording needs attention' : pending ? 'Recording ready to upload' : 'Ready to record'
  const description = reviewing ? 'Review the transcript and speaker names before Jait creates the note.'
    : completed ? 'Your meeting note is ready to open.'
      : 'Edit the transcript and label speakers as the meeting happens.'
  const StatusBar = floating ? 'header' : 'div'
  const StatusLabel = floating ? 'h1' : 'span'
  return (
    <>
      {!floating && <header className="flex shrink-0 items-start gap-3 border-b px-4 pb-4 pr-11 pt-5 sm:px-6 sm:pr-12">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <AudioLines className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-1">
          <DialogTitle ref={heading} tabIndex={-1} className="text-left text-lg leading-tight outline-none">Meeting recorder</DialogTitle>
          <DialogDescription className="text-left text-sm text-muted-foreground">{description}</DialogDescription>
        </div>
      </header>}
      <StatusBar className="flex shrink-0 items-stretch border-b bg-muted/35">
        <div className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-6 ${floating ? 'cursor-grab select-none active:cursor-grabbing' : ''}`}
          role="status" onMouseDown={startDrag ? event => { if (event.button === 0) startDrag() } : undefined}>
          <StatusLabel className="flex items-center gap-2 text-sm font-medium">
            {active ? <span className="h-2 w-2 rounded-full bg-red-500" /> : processing || starting || saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              : completed ? <CircleCheck aria-hidden="true" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <FileText aria-hidden="true" className="h-4 w-4 text-muted-foreground" />}
            {status}
          </StatusLabel>
          {active && <>
            {/* The monospaced digits sit above the visual center of their line box. */}
            <span className={`font-mono text-xs tabular-nums text-muted-foreground ${floating ? 'translate-y-0.5' : ''}`} aria-label="Elapsed time">
              {meetingTimestamp(seconds)}
            </span>
            <span className="text-xs text-muted-foreground">{transcript.queued ? 'Transcribing audio…' : 'Listening'}</span>
          </>}
        </div>
        {floating && <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="mr-2 size-9 shrink-0 self-center text-muted-foreground sm:mr-4" aria-label="Hide recorder" onClick={hide}>
              <Minus className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Hide recorder</TooltipContent>
        </Tooltip>}
      </StatusBar>
      <div ref={scroll} role="region" aria-label={active ? "Transcript" : "Recording details"} tabIndex={0} onScroll={event => {
        const panel = event.currentTarget
        follow.current = panel.scrollHeight - panel.clientHeight - panel.scrollTop < 72
      }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/15 px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6">
        {failure && <p role="alert" className="mb-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{failure}</p>}
        {reviewing ? <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">Transcript
          <textarea ref={reviewInput} className={`${inputStyle} min-h-[min(20rem,38dvh)] w-full resize-y p-3 font-mono leading-relaxed`} maxLength={MEETING_TRANSCRIPT_MAX_LENGTH}
            value={review} placeholder="No speech was detected. Add meeting notes here if needed." disabled={saving}
            onChange={event => { setReview(event.target.value); editReview(event.target.value) }} />
        </label> : completed ? <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /><p className="break-all text-sm">{job?.notePath}</p>
        </div> : <>
          {transcript.hasGap && (active || processing) && <p className="mb-3 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">Jait will transcribe any missed audio after you stop and keep your live edits in the note.</p>}
          {(transcript.lines.length > 0 || partial) ? <>
            <datalist id={names}>{suggestedSpeakers.map(name => <option key={name} value={name} />)}</datalist>
            <ul className="space-y-2">
              {transcript.lines.map(line => <TranscriptLine key={line.id} line={line} names={names} editable={active} edit={editLine} />)}
              {partial && <TranscriptDraft key={partial.offset} text={partial.text} onReveal={scrollToLatest} />}
            </ul>
          </> : (active || starting || processing) && <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 text-center">
            <Mic className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">{active ? 'Waiting for speech' : status}</p>
            {active && <p className="text-sm text-muted-foreground">Words appear here as you speak.</p>}
          </div>}
          {job?.stage === 'uploading' && !pending && !processing && <p className="text-sm text-muted-foreground">Resume the upload on the device that recorded the audio.</p>}
        </>}
      </div>
      <footer className={`flex min-h-16 shrink-0 flex-wrap items-center justify-end gap-2 border-t px-4 py-3 sm:px-6 ${floating ? 'empty:hidden' : ''}`}>
        {confirmDiscard ? <>
          <p className="mr-auto text-sm">Discard this recording and its edits?</p>
          <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(false)}>Keep recording</Button>
          <Button variant="destructive" size="sm" onClick={() => { setConfirmDiscard(false); void discard() }}>Discard recording</Button>
        </> : <>
          {canDiscard && <Button variant="ghost" size="sm" className="mr-auto" disabled={saving} onClick={() => setConfirmDiscard(true)}>Discard</Button>}
          {active && !floating && <Button size="sm" variant="ghost" onClick={hide}>Hide</Button>}
          {active && <Button variant="destructive" size="sm" onClick={stop}><Square className="mr-2 h-3 w-3 fill-current" aria-hidden="true" />Stop recording</Button>}
          {reviewing && <Button size="sm" disabled={saving} onClick={() => void saveTranscript(review.trim())}>Save to Obsidian</Button>}
          {completed && configured && <Button size="sm" variant="outline" onClick={() => void start()}>New recording</Button>}
          {completed && job?.noteUrl && <Button size="sm" onClick={openNote}>Open in Obsidian</Button>}
          {!active && !processing && !starting && !reviewing && (pending || job?.stage === 'failed') && <Button size="sm" onClick={() => void retry()}>Retry</Button>}
          {!starting && !active && !processing && !pending && !job && failure && <Button size="sm" onClick={() => void start()}>Record again</Button>}
        </>}
      </footer>
    </>
  )
}

export function MeetingRecordingDialog({ open, state, actions }: { open: boolean; state: MeetingPanelState; actions: MeetingPanelActions }) {
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) actions.hide() }}>
      <DialogContent className="flex max-h-[min(86dvh,48rem)] w-[calc(100%-1rem)] max-w-[44rem] flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-2xl sm:w-[calc(100%-2rem)]"
        onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus() }}>
        <MeetingRecordingPanel state={state} actions={actions} heading={heading} />
      </DialogContent>
    </Dialog>
  )
}
