import { MessageText } from '@/components/ui/message-text'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Forward, Reply, Search, Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { MessageReadStatus } from '@/components/chat/message-read-status'
import { MAX_ATTACHMENT_BYTES, type MessengerMessage, type MessengerPresence } from '@/lib/messenger/model'
import { isStandaloneEmoji, isStandaloneImage } from '@/lib/messenger/standalone'
import { EmojiPickerDialog, QUICK_REACTIONS } from './messenger-emoji-picker'
import { MessengerPeerAvatar } from './messenger-peer'
import { CenteredBadgeText } from './centered-badge-text'
import { ForwardDialog } from './messenger-forward-dialog'
import { useMessenger } from './messenger-provider'
import { TooltipHint } from '@/components/ui/tooltip'

export function MessengerAttachment({ attachment, large = false }: {
  attachment: NonNullable<MessengerMessage['attachment']>
  /** Sent on its own: the photo fills the bubble instead of sitting in a padding box. */
  large?: boolean
}) {
  const { store } = useMessenger()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const tooLarge = !!attachment.size && attachment.size > MAX_ATTACHMENT_BYTES
  useEffect(() => {
    if (!container.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '200px' })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (tooLarge || !(attempt > 0 || attachment.image && visible)) return
    let cancelled = false
    let objectUrl: string | undefined
    setBusy(true); setError('')
    void store.attachmentBlob(attachment).then(blob => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(() => { if (!cancelled) setError('Could not load attachment. Try again.') })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [store, attachment.url, attachment.image, tooLarge, visible, attempt]) // Snapshot objects change every poll; media identity does not.
  return <div ref={container} data-large={large ? 'true' : 'false'} className={large ? 'w-full max-w-full' : 'mt-1 max-w-full'}>
    {url ? attachment.image ? <>
      <button type="button" aria-label={'Open image ' + attachment.name} onClick={() => setExpanded(true)} className={(large ? 'block w-full' : 'block max-w-full') + ' overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-primary'}>
        <img src={url} alt={attachment.name} className={large ? 'max-h-[70vh] w-full object-contain' : 'max-h-80 max-w-full object-contain'} />
      </button>
      <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="max-w-4xl"><DialogTitle className="truncate">{attachment.name}</DialogTitle><img src={url} alt={attachment.name} className="max-h-[75vh] w-full object-contain" /><a href={url} download={attachment.name} className="text-sm underline">Download image</a></DialogContent></Dialog>
    </> : <a href={url} download={attachment.name} className="break-all text-sm underline">Download {attachment.name}</a>
      : <div className={attachment.image ? 'flex items-center justify-center rounded-lg bg-background/40 p-3 ' + (large ? 'min-h-40 w-full' : 'min-h-28 min-w-32') : ''}>
        {busy ? <span role="status" className="text-xs text-muted-foreground">Loading {attachment.image ? 'image' : 'attachment'}…</span>
          : <Button size="sm" variant="outline" disabled={tooLarge} onClick={() => setAttempt(n => n + 1)}>{tooLarge ? 'Attachment exceeds 20 MB' : error ? 'Retry attachment' : attachment.image ? 'Load image' : 'Load attachment'}</Button>}
      </div>}
    {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
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
    className="fixed z-50 rounded-xl border bg-popover p-1 shadow-md"
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

export function MessengerBubble({ message, roomId, disabled, variant = 'chat', groupStart = true, groupEnd = true, avatar, onReply }: {
  message: MessengerMessage
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const longPress = useRef<number | null>(null)
  const held = useRef(false)
  const replyingFromMenu = useRef(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const hoverTimer = useRef<number | null>(null)
  const root = useRef<HTMLElement>(null)
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
  const emojiOnly = !standaloneImage && !editing && isStandaloneEmoji(message.body)
  const wide = standaloneImage || emojiOnly
  const showSenderName = (!message.own || channel) && groupStart
  /** Direct chats get a gutter; only the bubble that opens a run fills it. */
  const showAvatar = !channel && !message.own
  const corner = channel
    ? 'rounded-lg'
    : 'rounded-xl'
      + (groupStart ? (message.own ? ' rounded-tr-sm' : ' rounded-tl-sm') : '')
      + (groupEnd ? (message.own ? ' rounded-br-sm' : ' rounded-bl-sm') : '')
  const react = (emoji: string) => { if (store.react) void run(() => store.react!(roomId, message.id, emoji)) }

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

  // WhatsApp keeps reactions in a small pill row that sits on the bubble's
  // bottom edge instead of inside the timestamp line.
  const hasReactions = !!message.reactions?.length
  const pillsOverlap = hasReactions && !emojiOnly

  return <article
    ref={root}
    data-message-id={message.id}
    aria-label={(message.own ? 'Your message' : 'Message from ' + message.sender)}
    className={'group/message flex min-w-0 gap-1.5 [-webkit-touch-callout:none] ' + (!channel && message.own ? 'justify-end' : 'justify-start')}
  >
    {showAvatar && <div data-avatar-gutter className="w-9 shrink-0 select-none pt-0.5">
      {groupStart
        ? <MessengerPeerAvatar
            name={avatar?.name ?? message.sender}
            presence={avatar?.presence ?? 'unknown'}
            {...(avatar?.mxcUrl ? { mxcUrl: avatar.mxcUrl } : {})}
          />
        : <span aria-hidden className="block h-9 w-9" />}
    </div>}
    <div
      onPointerEnter={event => {
        if (event.pointerType !== 'mouse' || unavailable || editing) return
        const bounds = event.currentTarget.getBoundingClientRect()
        hoverTimer.current = window.setTimeout(() => { setPosition({ x: bounds.left, y: bounds.top }); hoverTimer.current = null }, 600)
      }}
      onPointerLeave={() => { if (hoverTimer.current !== null) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null } }}
      onPointerDown={event => {
        if (hoverTimer.current !== null) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null }
        held.current = false
        if (event.pointerType === 'mouse' || unavailable || editing || (event.target as HTMLElement).closest('button:not([aria-label^="Open image "]), a, textarea, input')) return
        swipeStart.current = { x: event.clientX, y: event.clientY }
        clearLongPress()
        const point = { x: event.clientX, y: event.clientY }
        touchStart.current = point
        longPress.current = window.setTimeout(() => { held.current = true; swipeStart.current = null; setPosition(point); longPress.current = null }, LONG_PRESS_MS)
      }}
      onPointerMove={event => {
        const start = touchStart.current
        if (start && (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8)) clearLongPress()
      }}
      onPointerUp={event => {
        const start = swipeStart.current
        swipeStart.current = null
        clearLongPress()
        if (start && onReply && !message.own && !unavailable && event.clientX - start.x >= 60 && Math.abs(event.clientY - start.y) < (event.clientX - start.x)) {
          held.current = true
          onReply(message)
        }
      }}
      onPointerCancel={() => { swipeStart.current = null; clearLongPress() }}
      onClickCapture={event => { if (held.current) { event.preventDefault(); event.stopPropagation(); held.current = false } }}
      onContextMenu={event => {
        if (unavailable || !store.react || editing || (event.target as HTMLElement).closest('button:not([aria-label^="Open image "]), a, textarea, input')) return
        event.preventDefault()
        clearLongPress()
        setPosition({ x: event.clientX, y: event.clientY })
      }}
      className={'relative min-w-0 [touch-action:pan-y] ' + (wide
      ? (channel ? 'max-w-[92%] sm:max-w-[86%]' : 'max-w-[92%] sm:max-w-[420px]')
      : (channel ? 'max-w-[92%] sm:max-w-[86%]' : 'max-w-[88%] sm:max-w-[74%]'))}>
      <div
        data-messenger-bubble
        data-message-style={variant}
        data-standalone={standaloneImage ? 'image' : emojiOnly ? 'emoji' : undefined}
        className={'relative min-w-0 transition-colors ' +
          (emojiOnly
            ? 'border-transparent bg-transparent px-1 py-1'
            : standaloneImage
              ? 'p-0.5 ' + corner + (channel ? ' border border-transparent' : ' border shadow-sm ' + (message.own ? 'border-primary/20 bg-primary/10' : 'border-border bg-muted'))
              : 'px-2.5 py-1.5 ' + corner + (channel
                ? ' border ' + (message.own ? 'border-primary/15 bg-primary/10' : 'border-transparent hover:bg-muted/40')
                : ' shadow-sm border ' + (message.own ? 'border-primary/20 bg-primary/10' : 'border-border bg-muted')))
          }
      >
        {showSenderName && <p className="mb-0.5 truncate text-[11px] font-semibold leading-4 text-primary">{message.sender}</p>}
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
          <textarea autoFocus aria-label="Edit message" className="min-h-24 w-full min-w-40 resize-y rounded-md border bg-background p-2 text-sm" maxLength={10000} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !busy) setEditing(false) }} />
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={busy || !text.trim()}>Save</Button><Button size="sm" variant="ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button></div>
        </form> : standaloneImage ? null : <p className={'whitespace-pre-wrap break-words [overflow-wrap:anywhere] ' + (emojiOnly ? 'text-5xl leading-tight' : 'text-sm leading-[1.35]') + ' ' + (message.unableToDecrypt ? 'italic text-muted-foreground' : '')}><MessageText>{message.body}</MessageText></p>}
        {message.attachment && <MessengerAttachment key={message.attachment.url} attachment={message.attachment} large={standaloneImage} />}
        <div className={standaloneImage
          ? 'absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] leading-4 text-white shadow-sm'
          : 'mt-0.5 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 text-[10px] leading-4 text-muted-foreground'}>
          {message.edited && <span>Edited</span>}
          {message.pending && <span>Sending…</span>}{message.failed && <span className="text-destructive">Not sent</span>}
          <TooltipHint content={new Date(message.timestamp).toLocaleString()}><time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></TooltipHint>
          {message.own && !message.pending && !message.failed && <MessageReadStatus inline readers={message.readBy ?? []} />}
          <DropdownMenu><DropdownMenuTrigger asChild>
            <button type="button" disabled={unavailable} aria-label="Message options" className="-mr-1 mt-px rounded p-0.5 text-muted-foreground/70 transition hover:bg-background/60 hover:text-muted-foreground disabled:opacity-40"><ChevronDown className="h-3.5 w-3.5" /></button>
          </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (replyingFromMenu.current) { event.preventDefault(); replyingFromMenu.current = false } }}><DropdownMenuItem onSelect={() => void run(() => navigator.clipboard.writeText(message.body))}>Copy text</DropdownMenuItem>
              {onReply && !message.own && !message.unableToDecrypt && <DropdownMenuItem onSelect={() => { replyingFromMenu.current = true; onReply(message) }}><Reply className="mr-2 h-4 w-4" />Reply</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setForwardOpen(true)}><Forward className="mr-2 h-4 w-4" />Forward</DropdownMenuItem>
              {store.react && <DropdownMenuItem onSelect={() => setPickerOpen(true)}><Smile className="mr-2 h-4 w-4" />React…</DropdownMenuItem>}
              {store.edit && message.own && !message.attachment && <DropdownMenuItem onSelect={() => { setText(message.body); setEditing(true) }}>Edit message</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      {hasReactions && <div
        data-reaction-pills
        className={'relative z-10 flex max-w-full flex-wrap items-center gap-1 ' +
          (standaloneImage ? 'justify-center ' : message.own ? 'justify-end pr-1 ' : 'justify-start pl-1 ') +
          (pillsOverlap ? '-mt-3 ' : 'mt-1 ')}
      >
        {(message.reactions ?? []).map(reaction => <TooltipHint key={reaction.key} content={reaction.senders.join(', ')}><button

          type="button"
          disabled={unavailable || !store.react}
          aria-pressed={reaction.own}
          aria-label={`${reaction.key} reaction${reaction.count === 1 ? '' : 's'}${reaction.senders.length ? ` by ${reaction.senders.join(', ')}` : ''}`}
          onClick={() => react(reaction.key)}
          className={'inline-flex h-6 shrink-0 select-none items-center justify-center rounded-full border text-center text-[11px] shadow-sm backdrop-blur transition active:scale-95 ' +
            (reaction.count > 1 ? 'min-w-6 gap-1 px-1.5 ' : 'w-6 p-0 ') +
            (reaction.own
              ? 'border-primary/40 bg-primary/15 hover:bg-primary/25'
              : 'border-border/70 bg-background/95 hover:bg-muted')}
        >
          {/* Canvas ink metrics are unreliable for colour emoji; centre a fixed square box instead of the glyph's own advance width. */}
          <span
            aria-hidden
            data-reaction-emoji
            className="relative -top-px grid size-4 shrink-0 place-items-center overflow-visible text-center text-[13px] leading-none"
            style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}
          >{reaction.key}</span>
          {reaction.count > 1 && <CenteredBadgeText
            text={reaction.count}
            className={'font-medium tabular-nums ' + (reaction.own ? 'text-foreground/80' : 'text-muted-foreground')}
          />}
        </button></TooltipHint>)}
      </div>}
      {position && <ReactionBar
        position={position} barRef={barRef} disabled={unavailable || !store.react}
        onPick={react} onSearch={() => { setPosition(null); setPickerOpen(true) }}
        actions={<>
          {onReply && !message.own && <button type="button" className="rounded px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setPosition(null); onReply(message) }}>Reply</button>}
          <button type="button" className="rounded px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => void run(() => navigator.clipboard.writeText(message.body))}>Copy text</button>
          <button type="button" className="rounded px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setPosition(null); setForwardOpen(true) }}>Forward</button>
          {store.edit && message.own && !message.attachment && <button type="button" className="rounded px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setPosition(null); setText(message.body); setEditing(true) }}>Edit message</button>}
        </>}
      />}
      <EmojiPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={react} />
      <ForwardDialog open={forwardOpen} onOpenChange={setForwardOpen} message={message} roomId={roomId} />
    </div>
  </article>
}
