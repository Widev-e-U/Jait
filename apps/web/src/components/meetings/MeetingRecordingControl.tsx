import { CircleCheck, Loader2, Mic, TriangleAlert } from 'lucide-react'
import { useContext } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MeetingRecordingContext } from '@/hooks/useMeetingRecording'

export function MeetingRecordingControl({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  const recording = useContext(MeetingRecordingContext)
  if (!recording?.nativeApp) return null
  const { phase, seconds, job, pending, error } = recording
  if (!recording.setup?.configured && !job && !pending && phase === 'idle') return null
  const active = phase === 'recording'
  const busy = phase === 'starting' || phase === 'uploading' || ['transcribing', 'summarizing', 'saving'].includes(job?.stage ?? '')
  const failed = !!(error || job?.error)
  const canStart = !busy && !failed && !job && !pending && phase === 'idle'
  const label = active ? 'View meeting recording' : phase === 'starting' ? 'Starting microphone'
    : job?.stage === 'reviewing' ? 'Review meeting transcript' : failed ? 'Recording needs attention'
      : job?.stage === 'complete' && !busy ? 'Meeting saved' : pending && !busy ? 'Resume meeting upload'
        : busy || job ? 'View meeting recording' : 'Record meeting'
  const Icon = busy ? Loader2 : failed ? TriangleAlert : job?.stage === 'complete' && !active ? CircleCheck : Mic
  const className = mobile ? 'h-9 min-w-9 shrink-0 gap-1 px-2' : compact ? 'h-9 w-full px-0' : 'h-9 w-full justify-start gap-3 px-3'
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" className={`${className} ${active ? 'text-red-600 dark:text-red-400' : ''}`} aria-label={label}
          onClick={() => { if (canStart) void recording.start(); else recording.setOpen(true) }}>
          <Icon className={`h-4 w-4 shrink-0 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
          {active && !compact ? <span className="text-xs tabular-nums">{time}</span> : !compact && !mobile && <span className="truncate">{label}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={mobile ? 'bottom' : 'right'}>{label}</TooltipContent>
    </Tooltip>
  )
}
