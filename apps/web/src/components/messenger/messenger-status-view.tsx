import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { MessageText } from '@/components/ui/message-text'
import { dayDividerLabel } from '@/lib/messenger/dates'
import { MAX_ATTACHMENT_BYTES, type MessengerMessage } from '@/lib/messenger/model'
import { MessengerAttachment } from './messenger-message'
import { MessengerPeerAvatar } from './messenger-peer'
import { useMessenger } from './messenger-provider'

const STATUS_LIFETIME = 24 * 60 * 60 * 1000
const STATUS_DURATION = 7000

type StatusThread = { key: string; sender: string; items: MessengerMessage[]; avatarUrl?: string }
type Selection = { threadKey: string; messageId: string }

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StatusStory({ thread, index, onNext, onPrevious, onClose }: {
  thread: StatusThread
  index: number
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
}) {
  const { store } = useMessenger()
  const item = thread.items[index]!
  const attachment = item.attachment
  const video = !!attachment && ['video/mp4', 'video/webm', 'video/ogg'].includes(attachment.mime.toLowerCase())
  const audio = !!attachment && ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav'].includes(attachment.mime.toLowerCase())
  const timed = !video && !audio
  const previewable = !!attachment && (attachment.image || video || audio)
  const tooLarge = !!attachment?.size && attachment.size > MAX_ATTACHMENT_BYTES
  const [url, setUrl] = useState<string | null>(null)
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>(attachment && previewable ? 'loading' : 'ready')
  const [attempt, setAttempt] = useState(0)
  const [paused, setPaused] = useState(audio)
  const [muted, setMuted] = useState(video)
  const [progress, setProgress] = useState(0)
  const progressRef = useRef(0)
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const nextRef = useRef(onNext)
  nextRef.current = onNext

  useEffect(() => {
    if (!attachment || !previewable || tooLarge) return
    let cancelled = false
    let objectUrl: string | undefined
    setUrl(null)
    setLoad('loading')
    void store.attachmentBlob(attachment).then(blob => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(() => { if (!cancelled) setLoad('error') })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
    // Snapshot objects are replaced on every poll; the event's media identity is stable.
  }, [store, attachment?.url, attachment?.mime, attachment?.image, attachment?.size, previewable, tooLarge, attempt])

  useEffect(() => {
    if (!timed || paused || load !== 'ready' || (attachment && (!previewable || tooLarge))) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      progressRef.current = Math.min(1, progressRef.current + (now - last) / STATUS_DURATION)
      last = now
      setProgress(progressRef.current)
      if (progressRef.current >= 1) {
        window.clearInterval(timer)
        nextRef.current()
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [timed, paused, load, attachment?.url, previewable, tooLarge])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        setPaused(true)
        mediaRef.current?.pause()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    const media = mediaRef.current
    if (!media || load !== 'ready') return
    if (paused) media.pause()
    else void media.play().catch(() => setPaused(true))
  }, [paused, load])

  const togglePlayback = () => {
    if (paused && mediaRef.current) void mediaRef.current.play().catch(() => setPaused(true))
    else if (!paused) mediaRef.current?.pause()
    setPaused(!paused)
  }
  const updateMediaProgress = () => {
    const media = mediaRef.current
    if (media && Number.isFinite(media.duration) && media.duration > 0) {
      progressRef.current = Math.min(1, media.currentTime / media.duration)
      setProgress(progressRef.current)
    }
  }
  const caption = attachment && item.body.trim() === attachment.name.trim() ? '' : item.body.trim()
  const iconButton = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'
  return <div data-status-update-id={item.id} className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#17242b]">
    <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/75 to-transparent px-3 pb-8 pt-3">
      <div className="flex gap-1" aria-label={'Update ' + (index + 1) + ' of ' + thread.items.length}>
        {thread.items.map((story, i) => <span key={story.id} className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/30">
          <span className="block h-full rounded-full bg-white" style={{ width: (i < index ? 100 : i === index ? progress * 100 : 0) + '%' }} />
        </span>)}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <MessengerPeerAvatar name={thread.sender} mxcUrl={thread.avatarUrl} showPresence={false} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{thread.sender}</p><p className="text-xs text-white/75">{dayDividerLabel(item.timestamp)} · {timeLabel(item.timestamp)}</p></div>
        <button type="button" className={iconButton} aria-label={paused ? 'Resume status' : 'Pause status'} onClick={togglePlayback}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
        {video && <button type="button" className={iconButton} aria-label={muted ? 'Unmute status' : 'Mute status'} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>}
        <button type="button" className={iconButton} aria-label="Close status" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
    </div>
    <div className={'relative flex min-h-0 flex-1 items-center justify-center ' + (!attachment ? 'bg-gradient-to-br from-[#136e63] to-[#285387]' : 'bg-black')}>
      {!attachment && <p className="max-h-[65%] overflow-auto whitespace-pre-wrap break-words px-10 text-center text-xl font-medium leading-relaxed [overflow-wrap:anywhere]"><MessageText>{item.body || 'Media unavailable'}</MessageText></p>}
      {attachment && tooLarge && <p className="px-12 text-center text-sm text-white/80">This attachment exceeds the 20 MB preview limit.</p>}
      {attachment && !tooLarge && !previewable && <div className="space-y-2 px-12 text-center text-sm text-white/80"><p>This attachment cannot be previewed here.</p><MessengerAttachment attachment={attachment} /></div>}
      {attachment && !tooLarge && previewable && load === 'loading' && !url && <p role="status" className="px-12 text-center text-sm text-white/80">Loading status…</p>}
      {attachment && !tooLarge && previewable && load === 'error' && <div className="space-y-3 px-12 text-center text-sm"><p role="alert">Could not load this status.</p><button type="button" className="rounded-full border border-white/60 px-4 py-2" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
      {url && attachment?.image && <img src={url} alt={attachment.name} className="h-full w-full object-contain" onLoad={() => setLoad('ready')} onError={() => setLoad('error')} />}
      {url && video && <video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={url} className="h-full w-full object-contain" playsInline muted={muted} preload="auto" onCanPlay={() => setLoad('ready')} onTimeUpdate={updateMediaProgress} onEnded={onNext} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onError={() => setLoad('error')} />}
      {url && audio && <div className="px-12 text-center"><p className="mb-3 text-sm text-white/80">Voice status</p><audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={url} controls preload="auto" onCanPlay={() => setLoad('ready')} onTimeUpdate={updateMediaProgress} onEnded={onNext} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onError={() => setLoad('error')} /></div>}
      <button type="button" aria-label="Previous status" className={iconButton + ' absolute left-2 top-1/2 -translate-y-1/2'} onClick={onPrevious}><ChevronLeft className="h-6 w-6" /></button>
      <button type="button" aria-label="Next status" className={iconButton + ' absolute right-2 top-1/2 -translate-y-1/2'} onClick={onNext}><ChevronRight className="h-6 w-6" /></button>
      {attachment && caption && <p className="absolute inset-x-0 bottom-0 max-h-[25%] overflow-auto whitespace-pre-wrap break-words bg-gradient-to-t from-black/90 to-transparent px-12 pb-5 pt-8 text-center text-sm [overflow-wrap:anywhere]"><MessageText>{caption}</MessageText></p>}
    </div>
  </div>
}

/** Matrix bridges deliver statuses in one room; present active updates as stories per contact. */
export function MessengerStatusView({ messages, hasEarlier, loadingEarlier, onLoadEarlier }: {
  messages: MessengerMessage[]
  hasEarlier: boolean
  loadingEarlier: boolean
  onLoadEarlier: () => void
}) {
  const { snapshot } = useMessenger()
  const [now, setNow] = useState(() => Date.now())
  const [selection, setSelection] = useState<Selection | null>(null)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const threads = useMemo(() => {
    const bySender = new Map<string, MessengerMessage[]>()
    for (const message of messages) {
      if (message.timestamp <= now - STATUS_LIFETIME) continue
      const key = message.senderId || message.sender
      const items = bySender.get(key)
      if (items) items.push(message)
      else bySender.set(key, [message])
    }
    return [...bySender.entries()].map(([key, items]) => {
      items.sort((a, b) => a.timestamp - b.timestamp)
      const latest = items[items.length - 1]!
      const avatarUrl = snapshot.rooms.find(room => room.peer?.userId === latest.senderId)?.peer?.avatarUrl
      return { key, sender: latest.sender, items, ...(avatarUrl ? { avatarUrl } : {}) }
    }).sort((a, b) => b.items[b.items.length - 1]!.timestamp - a.items[a.items.length - 1]!.timestamp)
  }, [messages, now, snapshot.rooms])
  const threadIndex = threads.findIndex(thread => thread.key === selection?.threadKey)
  const thread = threads[threadIndex]
  const index = thread?.items.findIndex(item => item.id === selection?.messageId) ?? -1
  const item = index >= 0 ? thread?.items[index] : undefined
  useEffect(() => { if (selection && !item) setSelection(null) }, [selection, item])

  const select = (nextThread: StatusThread, nextIndex: number) => setSelection({ threadKey: nextThread.key, messageId: nextThread.items[nextIndex]!.id })
  const next = () => {
    if (!thread) return
    if (index + 1 < thread.items.length) select(thread, index + 1)
    else if (threads[threadIndex + 1]) select(threads[threadIndex + 1]!, 0)
    else setSelection(null)
  }
  const previous = () => {
    if (!thread) return
    if (index > 0) select(thread, index - 1)
    else if (threads[threadIndex - 1]) {
      const previousThread = threads[threadIndex - 1]!
      select(previousThread, previousThread.items.length - 1)
    }
  }

  return <div aria-label="Status updates" className="min-h-0 flex-1 overflow-y-auto">
    <div className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-5">
      <h3 className="px-2 text-sm font-semibold">Recent updates</h3>
      <p className="px-2 pb-3 pt-1 text-xs text-muted-foreground">Choose a contact to view their status.</p>
      {threads.map(entry => <button key={entry.key} type="button" aria-label={'View status from ' + entry.sender} onClick={event => { returnFocus.current = event.currentTarget; select(entry, 0) }} className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <span className="rounded-full border-2 border-emerald-500 p-0.5"><MessengerPeerAvatar name={entry.sender} mxcUrl={entry.avatarUrl} showPresence={false} /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{entry.sender}</span><span className="block text-xs text-muted-foreground">{entry.items.length} {entry.items.length === 1 ? 'update' : 'updates'} · {dayDividerLabel(entry.items[entry.items.length - 1]!.timestamp)} at {timeLabel(entry.items[entry.items.length - 1]!.timestamp)}</span></span>
        <ChevronRight aria-hidden className="h-4 w-4 text-muted-foreground" />
      </button>)}
      {threads.length === 0 && <div className="space-y-2 py-12 text-center text-sm text-muted-foreground"><ImageIcon className="mx-auto h-8 w-8 opacity-50" /><p>No recent status updates.</p><p className="text-xs">WhatsApp status updates are available for 24 hours.</p></div>}
      {hasEarlier && <button type="button" disabled={loadingEarlier} onClick={onLoadEarlier} className="mx-2 mt-4 rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50">{loadingEarlier ? 'Loading updates…' : 'Load more updates'}</button>}
    </div>
    <Dialog open={!!item} onOpenChange={open => { if (!open) setSelection(null) }}>
      <DialogContent showCloseButton={false} overlayClassName="bg-black/90" className="flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden rounded-none border-0 bg-black p-0 text-white sm:h-[min(88dvh,780px)] sm:w-[min(480px,90vw)] sm:rounded-2xl" onCloseAutoFocus={event => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus() } }} onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); next() } else if (event.key === 'ArrowLeft') { event.preventDefault(); previous() } }}>
        <DialogTitle className="sr-only">Status from {thread?.sender}</DialogTitle>
        <DialogDescription className="sr-only">Use the arrow keys or the previous and next buttons to move between updates.</DialogDescription>
        {thread && item && <StatusStory key={item.id} thread={thread} index={index} onNext={next} onPrevious={previous} onClose={() => setSelection(null)} />}
      </DialogContent>
    </Dialog>
  </div>
}
