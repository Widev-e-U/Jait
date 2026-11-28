import { CircleCheck, Loader2, Play, Square, TriangleAlert } from 'lucide-react'
import { useContext, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MeetingRecordingContext } from '@/hooks/useMeetingRecording'

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function MeetingRecordingControl({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  const recording = useContext(MeetingRecordingContext)
  const [openError, setOpenError] = useState('')
  if (!recording?.nativeApp || (!recording.setup?.configured && !recording.job && !recording.pending && recording.phase === 'idle')) return null
  const { job, phase, seconds, pending, error, start, stop, retry, discard } = recording
  const active = phase === 'recording'
  const failed = job?.stage === 'failed' || !!error
  const completed = job?.stage === 'complete'
  const processing = ['transcribing', 'summarizing', 'saving'].includes(job?.stage ?? '')
  const busy = phase === 'uploading' || processing
  const remaining = job?.stage === 'uploading'
  const resumable = remaining && !busy
  const status = active ? `Stop meeting recording (${clock(seconds)})`
    : phase === 'starting' ? 'Starting microphone…'
      : phase === 'uploading' ? 'Uploading recording…'
        : failed ? 'Recording needs attention'
          : job?.stage === 'transcribing' ? 'Transcribing with Parakeet…'
            : job?.stage === 'summarizing' ? 'Summarizing with Nemotron…'
              : job?.stage === 'saving' ? 'Saving to Obsidian…'
                : pending || resumable ? 'Resume meeting upload'
                  : completed ? 'Meeting saved' : 'Record meeting'
  const Icon = active ? Square : busy || phase === 'starting' ? Loader2 : failed ? TriangleAlert : completed ? CircleCheck : Play
  const className = mobile ? 'h-9 min-w-9 shrink-0 gap-1 px-2' : compact ? 'h-9 w-full px-0' : 'h-9 w-full justify-start gap-3 px-3'
  const iconClass = `h-4 w-4 shrink-0 ${busy || phase === 'starting' ? 'animate-spin' : active ? 'fill-current' : ''}`
  const details = busy || failed || pending || resumable || completed
  const button = (
    <Button variant="ghost" className={`${className} ${active ? 'text-red-600 dark:text-red-400' : ''}`}
      aria-label={status} disabled={phase === 'starting'}
      onClick={active ? () => void stop() : !details ? () => void start() : undefined}>
      <Icon className={iconClass} aria-hidden="true" />
      {active ? <span className="tabular-nums text-xs">{clock(seconds)}</span> : !compact && !mobile && <span className="truncate">{status}</span>}
    </Button>
  )
  return (
    <Popover>
      <Tooltip>
        {details && !active ? <TooltipTrigger asChild><PopoverTrigger asChild>{button}</PopoverTrigger></TooltipTrigger> : <TooltipTrigger asChild>{button}</TooltipTrigger>}
        <TooltipContent side={mobile ? 'bottom' : 'right'}>{status}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" side={mobile ? 'bottom' : 'right'} className="w-72 space-y-3">
        <div className="space-y-1" role="status">
          <p className="text-sm font-medium">{status}</p>
          {(error || job?.error) && <p className="text-sm text-muted-foreground">{error || job?.error}</p>}
          {resumable && !pending && <p className="text-sm text-muted-foreground">Resume on the device that recorded the audio, or discard this upload.</p>}
          {completed && <p className="break-all text-xs text-muted-foreground">{job?.notePath}</p>}
          {completed && openError && <p className="text-sm text-muted-foreground">{openError}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {completed && job?.noteUrl && <Button asChild size="sm"><a href={job.noteUrl} onClick={event => {
            if (!recording.openNativeNote) return
            event.preventDefault()
            setOpenError('')
            void recording.openNativeNote(job.noteUrl!).catch(() => setOpenError('Obsidian could not open this note on this device.'))
          }}>Open in Obsidian</a></Button>}
          {completed && recording.setup?.configured && <Button size="sm" variant="outline" onClick={() => { setOpenError(''); void start() }}>New recording</Button>}
          {!busy && (pending || job?.stage === 'failed') && <Button size="sm" onClick={() => void retry()}>Retry</Button>}
          {failed && !pending && !job && <Button size="sm" onClick={() => void start()}>Record again</Button>}
          {!busy && (pending || resumable || job?.stage === 'failed') && <Button size="sm" variant="outline" onClick={() => void discard()}>Discard</Button>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
