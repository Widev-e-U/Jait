import { MessageText } from '@/components/ui/message-text'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Forward, Play, Reply, Search, Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { MessageReadStatus } from '@/components/chat/message-read-status'
import { DeliveryIndicator } from '@/components/chat/delivery-indicator'
import { MAX_ATTACHMENT_BYTES, type MessengerMessage, type MessengerPresence } from '@/lib/messenger/model'
import { peekCachedBlob } from '@/lib/messenger/blob-cache'
import { isStandaloneEmoji, isStandaloneImage } from '@/lib/messenger/standalone'
import { EmojiPickerDialog, QUICK_REACTIONS } from './messenger-emoji-picker'
import { MessengerPeerAvatar } from './messenger-peer'
import { CenteredBadgeText } from './centered-badge-text'
import { CenteredEmoji } from './centered-emoji'
import { ForwardDialog } from './messenger-forward-dialog'
import { useMessenger } from './messenger-provider'
import { TooltipHint } from '@/components/ui/tooltip'

export function MessengerMessageTime({ timestamp }: { timestamp: number }) {
  const date = new Date(timestamp)
  return <TooltipHint content={date.toLocaleString()}>
    <time dateTime={date.toISOString()}>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
  </TooltipHint>
}

type MessengerAttachmentData = NonNullable<MessengerMessage['attachment']>

function useAttachmentMedia(attachment: MessengerAttachmentData, enabled: boolean, attempt = 0, cacheOnly = false) {
  const { store } = useMessenger()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  useLayoutEffect(() => {
    if (!enabled) return
    let cancelled = false
    let objectUrl: string | undefined
    const show = (blob: Blob) => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }
    const cached = peekCachedBlob(`att:${attachment.url}`)
    if (cached) show(cached)
    else if (!cacheOnly) {
      setBusy(true)
      setError(false)
      void store.attachmentBlob(attachment).then(show, () => { if (!cancelled) setError(true) })
        .finally(() => { if (!cancelled) setBusy(false) })
    }
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // Snapshot objects change every poll. The attachment URL identifies the media.
  }, [store, attachment.url, enabled, attempt, cacheOnly])
  return { url, busy, error }
}

function isVideoAttachment(attachment: MessengerAttachmentData): boolean {
  return attachment.mime.toLowerCase().startsWith('video/')
}

function AlbumSlide({ attachment, active }: { attachment: MessengerAttachmentData; active: boolean }) {
  const tooLarge = !!attachment.size && attachment.size > MAX_ATTACHMENT_BYTES
  const video = isVideoAttachment(attachment)
  const [attempt, setAttempt] = useState(0)
  const [playbackError, setPlaybackError] = useState(false)
  const { url, error } = useAttachmentMedia(attachment, !tooLarge, attempt)
  return <>
    <div className="grid h-[min(65dvh,42rem)] place-items-center">
      {url ? video
        ? <video controls playsInline preload="metadata" src={url} aria-label={attachment.name}
            className="h-full min-h-0 w-full bg-black object-contain" onError={() => setPlaybackError(true)} />
        : <img src={url} alt={attachment.name} className="h-full min-h-0 w-full object-contain" />
        : tooLarge ? <p role="alert" className="text-sm text-muted-foreground">Attachment exceeds 20 MB</p>
        : error && active ? <Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Retry attachment</Button>
        : <p role="status" className="text-sm text-muted-foreground">Loading {video ? 'video' : 'image'}…</p>}
    </div>
    <div className="mt-3 flex h-5 items-center gap-3">
      {url && <a href={url} download={attachment.name} tabIndex={active ? undefined : -1} className="text-sm underline">Download {video ? 'video' : 'image'}</a>}
      {playbackError && <p role="alert" className="text-sm text-destructive">Could not play this video in your browser.</p>}
    </div>
  </>
}

export function AlbumViewer({ attachments, index, onIndexChange, onClose }: {
  attachments: MessengerAttachmentData[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const attachment = attachments[index]
  const hasPrev = index > 0
  const hasNext = index < attachments.length - 1
  if (!attachment) return null
  const slideLabel = attachments.some(isVideoAttachment) ? 'attachment' : 'image'
  const arrow = 'absolute top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-background/80 shadow ring-1 ring-border transition hover:bg-background'
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent
      className="max-w-4xl"
      onKeyDown={event => {
        if (event.target instanceof HTMLVideoElement) return
        if (event.key === 'ArrowLeft' && hasPrev) { event.preventDefault(); onIndexChange(index - 1) }
        if (event.key === 'ArrowRight' && hasNext) { event.preventDefault(); onIndexChange(index + 1) }
      }}
    >
      <DialogTitle className="truncate">{attachment.name} <span className="text-sm font-normal text-muted-foreground">({index + 1} / {attachments.length})</span></DialogTitle>
      <div className="relative h-[calc(min(65dvh,42rem)+2rem)]">
        <div className="h-full overflow-hidden">
          <div className="flex h-full transition-transform duration-200 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }}>
            {attachments.map((item, slide) => <div key={slide} aria-hidden={slide !== index} className="h-full w-full shrink-0">
              {(slide === index || (!isVideoAttachment(item) && Math.abs(slide - index) === 1))
                && <AlbumSlide key={item.url} attachment={item} active={slide === index} />}
            </div>)}
          </div>
        </div>
        <button type="button" aria-label={'Previous ' + slideLabel} aria-disabled={!hasPrev} onClick={() => { if (hasPrev) onIndexChange(index - 1) }} className={arrow + ' left-1 aria-disabled:opacity-40'}><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" aria-label={'Next ' + slideLabel} aria-disabled={!hasNext} onClick={() => { if (hasNext) onIndexChange(index + 1) }} className={arrow + ' right-1 aria-disabled:opacity-40'}><ChevronRight className="h-5 w-5" /></button>
      </div>
    </DialogContent>
  </Dialog>
}

export function MessengerAttachment({ attachment, large = false, moreAttachments = 0, onOpen }: {
  attachment: MessengerAttachmentData
  /** Sent on its own: the photo fills the bubble instead of sitting in a padding box. */
  large?: boolean
  moreAttachments?: number
  /** When set, opening the attachment is delegated so the viewer can page through siblings. */
  onOpen?: () => void
}) {
  const video = isVideoAttachment(attachment)
  const [playbackError, setPlaybackError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const tooLarge = !!attachment.size && attachment.size > MAX_ATTACHMENT_BYTES
  const cachedOnly = attempt === 0 && (!attachment.image || !visible)
  const { url, busy, error } = useAttachmentMedia(attachment, !tooLarge && !(onOpen && video), attempt, cachedOnly)
  useEffect(() => {
    if (!container.current || !attachment.image || url || tooLarge) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '200px' })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [attachment.image, url, tooLarge])
  if (onOpen) return <div ref={container}>
    <button type="button" onClick={onOpen}
      aria-label={moreAttachments ? `Open album with ${moreAttachments} more attachments` : `Open ${video ? 'video' : 'image'} ${attachment.name}`}
      className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-background/60 focus-visible:outline focus-visible:outline-primary">
      {video ? <Play aria-hidden="true" className="size-7" />
        : url ? <img src={url} alt={attachment.name} className="absolute inset-0 size-full object-cover" />
        : <span className="truncate px-2 text-xs text-muted-foreground">{attachment.name}</span>}
      {moreAttachments > 0 && <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/60 text-3xl font-semibold text-white">+{moreAttachments}</span>}
    </button>
  </div>

  return <div ref={container} data-large={large ? 'true' : 'false'} className={large ? 'w-full max-w-full' : 'mt-1 max-w-full'}>
    {url ? attachment.image ? <>
      <button type="button" aria-label={'Open image ' + attachment.name} onClick={() => setExpanded(true)} className={(large ? 'block w-full' : 'block max-w-full') + ' overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-primary'}>
        <img src={url} alt={attachment.name} className={large ? 'max-h-[70vh] w-full object-contain' : 'max-h-80 max-w-full object-contain'} />
      </button>
      <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="max-w-4xl"><DialogTitle className="truncate">{attachment.name}</DialogTitle><img src={url} alt={attachment.name} className="max-h-[75vh] w-full object-contain" /><a href={url} download={attachment.name} className="text-sm underline">Download image</a></DialogContent></Dialog>
    </> : <div className="space-y-1">
      {video && <video controls playsInline preload="metadata" src={url} aria-label={attachment.name}
        className="aspect-video max-h-80 w-full rounded-lg bg-black object-contain" onError={() => setPlaybackError(true)} />}
      <a href={url} download={attachment.name} className="break-all text-sm underline">Download {attachment.name}</a>
    </div>
      : <div className={attachment.image ? 'flex items-center justify-center rounded-lg bg-background/40 p-3 ' + (large ? 'min-h-40 w-full' : 'min-h-28 min-w-32') : ''}>
        {busy ? <span role="status" className="text-xs text-muted-foreground">Loading {attachment.image ? 'image' : 'attachment'}…</span>
          : <Button size="sm" variant="outline" disabled={tooLarge} onClick={() => setAttempt(n => n + 1)}>{tooLarge ? 'Attachment exceeds 20 MB' : error ? 'Retry attachment' : attachment.image ? 'Load image' : video ? 'Load video' : 'Load attachment'}</Button>}
      </div>}
    {(error || playbackError) && <p role="alert" className="mt-1 text-xs text-destructive">
      {error ? 'Could not load attachment. Try again.' : 'Could not play this video in your browser.'}
    </p>}
  </div>
}

const LONG_PRESS_MS = 420

function ReactionBar({ position, onPick, onSearch, disabled, barRef, actions }: {
  position: { x: number; y: number }
  onPick: (emoji: string) => void
  onSearch: () => void
  disabled: boolean
  barRef: React.RefObject<HTMLDivElement | null>
  actions: React.ReactNode
}) {
  return createPortal(<div
    ref={barRef}
    data-reaction-bar
    style={{ left: Math.max(4, Math.min(position.x, window.innerWidth - 242)), top: Math.max(4, Math.min(position.y, window.innerHeight - 180)) }}
    className="fixed z-50 select-none rounded-xl border bg-popover p-1 shadow-md [-webkit-touch-callout:none]"
  >
    <div role="toolbar" aria-label="Message reactions" className="flex items-center gap-0.5">
    {QUICK_REACTIONS.map(emoji => <button
      key={emoji} type="button" disabled={disabled} aria-label={'React with ' + emoji}
      onClick={() => onPick(emoji)}
      className="grid h-7 w-7 place-items-center rounded-full text-base leading-none transition hover:scale-110 hover:bg-muted disabled:opacity-40"
    >{emoji}</button>)}
    <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
    <TooltipHint content="Search emoji">
      <button
        type="button" disabled={disabled} aria-label="React to message"
        onClick={onSearch}
        className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition hover:bg-muted disabled:opacity-40"
      ><Search className="h-3.5 w-3.5" /></button>
    </TooltipHint>
    </div>
    <div aria-label="Message actions" className="mt-1 grid border-t pt-1">{actions}</div>
  </div>, document.body)
}

export function MessengerBubble({ message, roomId, disabled, variant = 'chat', groupStart = true, groupEnd = true, avatar, onReply, albumTile = false, moreAttachments = 0, onOpenAttachment, takeArrival }: {
  message: MessengerMessage
  albumTile?: boolean
  moreAttachments?: number
  takeArrival?: (id: string) => boolean
  /** Open this tile in the shared album viewer. */
  onOpenAttachment?: () => void
  messageId?: string
  /** Offered on other people's messages only. */
  onReply?: (message: MessengerMessage) => void
  roomId: string
  disabled: boolean
  variant?: 'chat' | 'channel'
  /** Opens a run from this sender: carries the name and the avatar. */
  groupStart?: boolean
  /** Closes a run, so the following run gets extra breathing room. */
  groupEnd?: boolean
  /** Profile picture of the run's sender, when the conversation exposes one. */
  avatar?: { name: string; mxcUrl?: string; presence?: MessengerPresence }
}) {
  const channel = variant === 'channel'
  const { store } = useMessenger()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(message.body)
  /** Bubble width when editing began; the edit box keeps it so the message doesn't resize. */
  const [editWidth, setEditWidth] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const bubbleFrame = useRef<HTMLDivElement>(null)
  const longPress = useRef<number | null>(null)
  const held = useRef(false)
  const replyingFromMenu = useRef(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const swipeFeedback = useRef(false)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const isMobile = useIsMobile()
  const hoverTimer = useRef<number | null>(null)
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!takeArrival?.(message.id) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    root.current?.animate(
      [{ opacity: 0.65, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 180, easing: 'ease-out' },
    )
  }, [message.id, takeArrival])

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await action() }
    catch { setError('Could not update this message. Please try again.') }
    finally { setBusy(false); setPosition(null) }
  }
  const unavailable = disabled || busy || message.pending || message.failed || message.unableToDecrypt
  /** A photo sent on its own fills the bubble; with a caption it stays normal size. */
  const standaloneImage = isStandaloneImage(message)
  /** A body made only of a short emoji run gets the jumbo treatment. */
  const emojiOnly = !albumTile && !standaloneImage && !editing && isStandaloneEmoji(message.body)
  const wide = standaloneImage || emojiOnly
  const showTimestamp = !albumTile && groupStart
  const showSenderName = showTimestamp && (!message.own || channel)
  const showHeader = showTimestamp || message.edited || message.pending || message.failed
  /** Direct chats get a gutter; only the bubble that opens a run fills it. */
  const showAvatar = !albumTile && !channel && !message.own
  const corner = channel
    ? 'rounded-lg'
    : 'rounded-xl'
      + (groupStart ? (message.own ? ' rounded-tr-sm' : ' rounded-tl-sm') : '')
      + (groupEnd ? (message.own ? ' rounded-br-sm' : ' rounded-bl-sm') : '')
  const react = (emoji: string) => { if (store.react) void run(() => store.react!(roomId, message.id, emoji)) }
  const startEditing = () => {
    setEditWidth(bubbleFrame.current?.getBoundingClientRect().width ?? null)
    setText(message.body)
    setEditing(true)
  }

  const clearLongPress = () => {
    if (longPress.current !== null) { window.clearTimeout(longPress.current); longPress.current = null }
    touchStart.current = null
  }
  useEffect(() => () => { clearLongPress(); if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current) }, [])
  useEffect(() => {
    if (!position) return
    const closeOthers = (event: Event) => { if ((event as CustomEvent).detail !== root.current) setPosition(null) }
    document.addEventListener('messenger-actions-open', closeOthers)
    document.dispatchEvent(new CustomEvent('messenger-actions-open', { detail: root.current }))
    const dismiss = (event: PointerEvent) => {
      if (barRef.current?.contains(event.target as Node)) return
      setPosition(null)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPosition(null) }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    const close = () => setPosition(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('messenger-actions-open', closeOthers); document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [position])

  const hasReactions = !!message.reactions?.length

  return <article
    ref={root}
    data-message-id={message.id}
    aria-label={(message.own ? 'Your message' : 'Message from ' + message.sender)}
    className={'group/message flex min-w-0 gap-1.5 [-webkit-touch-callout:none] ' + (!channel && message.own ? 'justify-end' : 'justify-start')}
  >
    {showAvatar && <div data-avatar-gutter className="w-9 shrink-0 select-none pt-0.5">
      {groupStart && <MessengerPeerAvatar
        name={avatar?.name ?? message.sender}
        presence={avatar?.presence ?? 'unknown'}
        {...(avatar?.mxcUrl ? { mxcUrl: avatar.mxcUrl } : {})}
      />}
    </div>}
    <div
      ref={bubbleFrame}
      onPointerEnter={event => {
        if (!isMobile || event.pointerType !== 'mouse' || unavailable || editing) return
        const bounds = event.currentTarget.getBoundingClientRect()
        hoverTimer.current = window.setTimeout(() => { setPosition({ x: bounds.left, y: bounds.bottom + 4 }); hoverTimer.current = null }, 600)
      }}
      onPointerLeave={() => { if (hoverTimer.current !== null) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null } }}
      onPointerDown={event => {
        if (hoverTimer.current !== null) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null }
        held.current = false
        if (event.pointerType === 'mouse' || unavailable || editing || (event.target as HTMLElement).closest('button:not([aria-label^="Open image "]), a, textarea, input')) return
        swipeStart.current = { x: event.clientX, y: event.clientY }
        swipeFeedback.current = false
        clearLongPress()
        const point = { x: event.clientX, y: event.clientY }
        touchStart.current = point
        longPress.current = window.setTimeout(() => { held.current = true; swipeStart.current = null; setPosition(point); longPress.current = null }, LONG_PRESS_MS)
      }}
      onPointerMove={event => {
        const start = touchStart.current
        if (start && (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8)) clearLongPress()
        const swipe = swipeStart.current
        if (!swipe || !onReply || message.own || unavailable) return
        const dx = event.clientX - swipe.x
        const dy = Math.abs(event.clientY - swipe.y)
        if (dy > 8 && dy >= Math.abs(dx)) { swipeStart.current = null; setSwipeOffset(0); return }
        if (dx > 0 && dx > dy) {
          setSwipeOffset(Math.min(dx * 0.55, 48))
          if (dx >= 60 && !swipeFeedback.current) {
            swipeFeedback.current = true
            navigator.vibrate?.(10)
          }
        } else setSwipeOffset(0)
      }}
      onPointerUp={event => {
        const start = swipeStart.current
        swipeStart.current = null
        setSwipeOffset(0)
        clearLongPress()
        if (start && onReply && !message.own && !unavailable && event.clientX - start.x >= 60 && Math.abs(event.clientY - start.y) < (event.clientX - start.x)) {
          held.current = true
          onReply(message)
        }
      }}
      onPointerCancel={() => { swipeStart.current = null; setSwipeOffset(0); clearLongPress() }}
      onClickCapture={event => { if (held.current) { event.preventDefault(); event.stopPropagation(); held.current = false } }}
      onContextMenu={event => {
        if (unavailable || !store.react || editing || (event.target as HTMLElement).closest('button:not([aria-label^="Open image "]), a, textarea, input')) return
        event.preventDefault()
        clearLongPress()
        setPosition({ x: event.clientX, y: event.clientY })
      }}
      style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeOffset ? 'none' : 'transform 180ms ease-out', width: editing && editWidth ? editWidth : undefined }}
      className={'relative grid grid-cols-[minmax(0,1fr)_auto] [touch-action:pan-y] ' + (message.own ? 'gap-x-1 ' : '') + (editing ? 'min-w-44 ' : 'min-w-0 ') + (albumTile ? 'w-full max-w-full' : wide
      ? (channel ? 'max-w-[92%] sm:max-w-[86%]' : 'max-w-[92%] sm:max-w-[420px]')
      : (channel ? 'max-w-[92%] sm:max-w-[86%]' : 'max-w-[88%] sm:max-w-[74%]'))}>
      <div className={showHeader
        ? 'col-start-1 flex min-w-0 items-baseline justify-end gap-x-1.5 text-[11px] leading-4 text-muted-foreground'
        : 'absolute z-10 ' + (albumTile ? 'right-0.5 top-0.5' : channel ? 'left-full top-0 ml-0.5' : 'right-full top-0 mr-0.5')}>
        {showSenderName && <p className="mr-auto min-w-0 truncate font-semibold text-primary">{message.sender}</p>}
        <div className="flex flex-wrap items-center justify-end gap-x-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" disabled={unavailable} aria-label="Message options" className={'rounded p-0.5 text-muted-foreground/70 transition hover:bg-background/60 hover:text-muted-foreground disabled:opacity-40 '
                + (!showHeader && albumTile ? 'bg-background/80 ' : '')
                + (!showHeader ? '[@media(hover:hover)]:opacity-0 group-hover/message:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100' : '')}><ChevronDown className="h-3.5 w-3.5" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (replyingFromMenu.current) { event.preventDefault(); replyingFromMenu.current = false } }}><DropdownMenuItem onSelect={() => void run(() => navigator.clipboard.writeText(message.body))}>Copy text</DropdownMenuItem>
              {onReply && !message.own && !message.unableToDecrypt && <DropdownMenuItem onSelect={() => { replyingFromMenu.current = true; onReply(message) }}><Reply className="mr-2 h-4 w-4" />Reply</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setForwardOpen(true)}><Forward className="mr-2 h-4 w-4" />Forward</DropdownMenuItem>
              {store.react && <DropdownMenuItem onSelect={() => setPickerOpen(true)}><Smile className="mr-2 h-4 w-4" />React…</DropdownMenuItem>}
              {store.edit && message.own && !message.attachment && <DropdownMenuItem onSelect={startEditing}>Edit message</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          {message.edited && <span>Edited</span>}
          {message.pending && <span>Sending…</span>}
          {message.failed && <span className="text-destructive">Not sent</span>}
          {showTimestamp && <MessengerMessageTime timestamp={message.timestamp} />}
        </div>
      </div>
      <div
        data-messenger-bubble
        data-message-style={variant}
        data-standalone={standaloneImage ? 'image' : emojiOnly ? 'emoji' : undefined}
        className={'relative col-start-1 row-start-2 min-w-0 select-text transition-colors ' +
          (emojiOnly
            ? 'border-transparent bg-transparent px-1 py-1'
            : standaloneImage || albumTile
              ? 'p-0.5 ' + corner + (channel ? ' border border-transparent' : ' border shadow-sm ' + (message.own ? 'border-primary/20 bg-primary/10' : 'border-border bg-muted'))
              : 'px-2.5 py-1.5 ' + corner + (channel
                ? ' border ' + (message.own ? 'border-primary/15 bg-primary/10' : 'border-transparent hover:bg-muted/40')
                : ' shadow-sm border ' + (message.own ? 'border-primary/20 bg-primary/10' : 'border-border bg-muted')))
          }
      >
        {message.replyTo && <button
          type="button"
          data-reply-quote
          aria-label={'Jump to replied message from ' + message.replyTo.sender}
          onClick={() => document.querySelector('[data-message-id="' + CSS.escape(message.replyTo!.id) + '"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
          className="mb-1 block w-full min-w-0 rounded-md border-l-2 border-primary bg-background/50 px-2 py-1 text-left"
        >
          <span className="block truncate text-[11px] font-semibold leading-4 text-primary">{message.replyTo.sender}</span>
          <span className="line-clamp-2 break-words text-xs leading-4 text-muted-foreground">{message.replyTo.body || 'Attachment'}</span>
        </button>}
        {editing ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (text.trim()) void run(async () => { await store.edit!(roomId, message.id, text); setEditing(false) }) }}>
          <textarea autoFocus aria-label="Edit message" className="min-h-24 w-full resize-y rounded-md border bg-background p-2 text-sm" maxLength={10000} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !busy) setEditing(false) }} />
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={busy || !text.trim()}>Save</Button><Button size="sm" variant="ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button></div>
        </form> : standaloneImage || albumTile ? null : <p className={'whitespace-pre-wrap break-words [overflow-wrap:anywhere] ' + (emojiOnly ? 'text-5xl leading-tight' : 'text-sm leading-[1.35]') + ' ' + (message.unableToDecrypt ? 'italic text-muted-foreground' : '')}><MessageText>{message.linkedBody ?? message.body}</MessageText></p>}
        {message.attachment && <MessengerAttachment key={message.attachment.url} attachment={message.attachment} large={standaloneImage} moreAttachments={moreAttachments} {...(onOpenAttachment ? { onOpen: onOpenAttachment } : {})} />}
      </div>
      {message.own && <div className="col-start-2 row-start-2 mb-0.5 flex items-center self-end">
        {message.pending ? <DeliveryIndicator state="sending" /> : message.failed ? <DeliveryIndicator state="failed" /> : <MessageReadStatus inline readers={message.readBy ?? []} bridgeStatus={message.bridgeStatus} />}
      </div>}
      {hasReactions && <div
        data-reaction-pills
        className={'relative z-10 col-start-1 flex max-w-full flex-wrap items-center gap-1 ' +
          (message.own ? 'justify-end pr-1 ' : 'justify-start pl-1 ') +
          (standaloneImage ? '-mt-3.5' : emojiOnly ? 'mt-1' : '-mt-1.5')}
      >
        {(message.reactions ?? []).map(reaction => <TooltipHint key={reaction.key} content={reaction.senders.join(', ')}><button

          type="button"
          disabled={unavailable || !store.react}
          aria-pressed={reaction.own}
          aria-label={`${reaction.key} reaction${reaction.count === 1 ? '' : 's'}${reaction.senders.length ? ` by ${reaction.senders.join(', ')}` : ''}`}
          onClick={() => react(reaction.key)}
          className={'inline-flex h-7 shrink-0 select-none items-center justify-center rounded-full border text-center text-[11px] shadow-sm backdrop-blur transition active:scale-95 ' +
            (reaction.count > 1 ? 'min-w-7 gap-1 px-1.5 ' : 'w-7 p-0 ') +
            (reaction.own
              ? 'border-primary/40 bg-primary/15 hover:bg-primary/25'
              : 'border-border/70 bg-background/95 hover:bg-muted')}
        >
          {/* Centre the glyph's rendered pixels; line-box and advance-width centring is always a bit off for colour emoji. */}
          <span className="flex size-4 shrink-0 items-center justify-center overflow-visible">
            <CenteredEmoji
              emoji={reaction.key}
              className="text-[15px]"
              fontFamily='"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
            />
          </span>
          {reaction.count > 1 && <CenteredBadgeText
            text={reaction.count}
            className={'font-medium tabular-nums ' + (reaction.own ? 'text-foreground/80' : 'text-muted-foreground')}
          />}
        </button></TooltipHint>)}
      </div>}
      {error && <p role="alert" className="col-start-1 mt-1 text-xs text-destructive">{error}</p>}
      {position && <ReactionBar
        position={position} barRef={barRef} disabled={unavailable || !store.react}
        onPick={react} onSearch={() => { setPosition(null); setPickerOpen(true) }}
        actions={<>
          {onReply && !message.own && <button type="button" className="rounded px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setPosition(null); onReply(message) }}>Reply</button>}
          <button type="button" className="rounded px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => void run(() => navigator.clipboard.writeText(message.body))}>Copy text</button>
          <button type="button" className="rounded px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setPosition(null); setForwardOpen(true) }}>Forward</button>
          {store.edit && message.own && !message.attachment && <button type="button" className="rounded px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setPosition(null); startEditing() }}>Edit message</button>}
        </>}
      />}
      <EmojiPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={react} />
      <ForwardDialog open={forwardOpen} onOpenChange={setForwardOpen} message={message} roomId={roomId} />
    </div>
  </article>
}
