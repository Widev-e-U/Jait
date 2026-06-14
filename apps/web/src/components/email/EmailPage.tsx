import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Inbox, Loader2, Mail, Paperclip, Pencil, RefreshCw, Reply, Search,
  Send, Star, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  emailApi, type EmailAccount, type EmailFolder, type EmailMessageFull,
  type EmailMessageSummary, type EmailProvider,
} from '@/lib/email-api'
import { cn } from '@/lib/utils'

interface EmailPageProps {
  isMobile?: boolean
}

const PROVIDER_LABEL: Record<EmailProvider, string> = { gmail: 'Gmail', outlook: 'Outlook' }

function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<.*>$/)
  return (m ? m[1] : from).trim() || from
}

function formatDate(raw: string): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function EmailPage({ isMobile = false }: EmailPageProps) {
  const [accounts, setAccounts] = useState<EmailAccount[] | null>(null)
  const [providers, setProviders] = useState<Record<EmailProvider, boolean>>({ gmail: false, outlook: false })
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [folders, setFolders] = useState<EmailFolder[]>([])
  const [activeFolder, setActiveFolder] = useState('inbox')
  const [messages, setMessages] = useState<EmailMessageSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openMessage, setOpenMessage] = useState<EmailMessageFull | null>(null)
  const [query, setQuery] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [connecting, setConnecting] = useState<EmailProvider | null>(null)

  const [compose, setCompose] = useState<null | { to: string; subject: string; body: string; replyToMessageId?: string }>(null)
  const [sending, setSending] = useState(false)

  const activeAccount = useMemo(
    () => accounts?.find((a) => a.id === activeAccountId) ?? accounts?.[0] ?? null,
    [accounts, activeAccountId],
  )

  const loadAccounts = useCallback(async () => {
    try {
      const [accs, cfg] = await Promise.all([emailApi.accounts(), emailApi.config()])
      setAccounts(accs)
      setProviders(cfg)
      if (accs.length > 0) setActiveAccountId((prev) => prev ?? accs[0].id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load email accounts')
      setAccounts([])
    }
  }, [])

  useEffect(() => { void loadAccounts() }, [loadAccounts])

  const loadMessages = useCallback(async (accountId: string, folder: string, q: string) => {
    setLoadingList(true)
    try {
      const res = await emailApi.listMessages({ accountId, folder, q: q || undefined, limit: 30 })
      setMessages(res.messages)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load messages')
      setMessages([])
    } finally {
      setLoadingList(false)
    }
  }, [])

  // Load folders + messages whenever the active account or folder changes.
  useEffect(() => {
    if (!activeAccount) return
    void emailApi.folders(activeAccount.id).then(setFolders).catch(() => setFolders([]))
  }, [activeAccount])

  useEffect(() => {
    if (!activeAccount) return
    void loadMessages(activeAccount.id, activeFolder, query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount, activeFolder])

  const connect = useCallback(async (provider: EmailProvider) => {
    setConnecting(provider)
    try {
      const authUrl = await emailApi.connectUrl(provider)
      const popup = window.open(authUrl, 'jait-email-oauth', 'width=520,height=680')
      const onMessage = (ev: MessageEvent) => {
        if (ev.data?.type === 'jait-email-oauth') {
          window.removeEventListener('message', onMessage)
          setConnecting(null)
          if (ev.data.ok) { toast.success('Mailbox connected'); void loadAccounts() }
          try { popup?.close() } catch { /* ignore */ }
        }
      }
      window.addEventListener('message', onMessage)
      // Fallback: clear the spinner if the popup is closed manually.
      const timer = setInterval(() => {
        if (popup?.closed) { clearInterval(timer); window.removeEventListener('message', onMessage); setConnecting(null); void loadAccounts() }
      }, 1000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start connection')
      setConnecting(null)
    }
  }, [loadAccounts])

  const openMsg = useCallback(async (id: string, accountId?: string) => {
    const acct = accountId ?? activeAccount?.id
    if (!acct) return
    setSelectedId(id)
    setLoadingMsg(true)
    try {
      const msg = await emailApi.getMessage(id, acct)
      setOpenMessage(msg)
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, unread: false } : m)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open message')
    } finally {
      setLoadingMsg(false)
    }
  }, [activeAccount])

  const toggleStar = useCallback(async (msg: EmailMessageSummary | EmailMessageFull) => {
    if (!activeAccount) return
    const starred = msg.labels.some((l) => l.toLowerCase() === 'starred')
    try {
      await emailApi.tag(msg.id, { accountId: activeAccount.id, add: starred ? [] : ['STARRED'], remove: starred ? ['STARRED'] : [] })
      const flip = (m: EmailMessageSummary) => m.id === msg.id
        ? { ...m, labels: starred ? m.labels.filter((l) => l.toLowerCase() !== 'starred') : [...m.labels, 'STARRED'] }
        : m
      setMessages((prev) => prev.map(flip))
      if (openMessage?.id === msg.id) setOpenMessage({ ...openMessage, labels: flip(openMessage).labels })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update star')
    }
  }, [activeAccount, openMessage])

  const remove = useCallback(async (id: string) => {
    if (!activeAccount) return
    try {
      await emailApi.remove(id, activeAccount.id)
      setMessages((prev) => prev.filter((m) => m.id !== id))
      if (selectedId === id) { setSelectedId(null); setOpenMessage(null) }
      toast.success('Moved to trash')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }, [activeAccount, selectedId])

  const send = useCallback(async () => {
    if (!activeAccount || !compose) return
    setSending(true)
    try {
      await emailApi.send({
        accountId: activeAccount.id,
        to: compose.to,
        subject: compose.subject,
        body: compose.body,
        replyToMessageId: compose.replyToMessageId,
      })
      toast.success('Email sent')
      setCompose(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }, [activeAccount, compose])

  // Agent-driven control of this page (email_view tool + refresh after mutations).
  useEffect(() => {
    const onControl = (ev: Event) => {
      const data = (ev as CustomEvent).detail as {
        action: 'navigate' | 'open' | 'compose' | 'refresh'
        accountId?: string; folder?: string; messageId?: string
        to?: string; subject?: string; body?: string; replyToMessageId?: string
      }
      if (!data) return
      if (data.accountId && data.accountId !== activeAccountId) setActiveAccountId(data.accountId)
      const acct = data.accountId ?? activeAccount?.id
      switch (data.action) {
        case 'navigate':
          if (data.folder) { setActiveFolder(data.folder); setSelectedId(null); setOpenMessage(null) }
          break
        case 'open':
          if (data.messageId) void openMsg(data.messageId, acct)
          break
        case 'compose':
          setCompose({ to: data.to ?? '', subject: data.subject ?? '', body: data.body ?? '', replyToMessageId: data.replyToMessageId })
          break
        case 'refresh':
          if (acct) void loadMessages(acct, activeFolder, query)
          break
      }
    }
    window.addEventListener('jait:email-control', onControl)
    return () => window.removeEventListener('jait:email-control', onControl)
  }, [activeAccount, activeAccountId, activeFolder, query, openMsg, loadMessages])

  const startReply = useCallback((msg: EmailMessageFull) => {
    setCompose({
      to: msg.from,
      subject: msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`,
      body: '',
      replyToMessageId: msg.id,
    })
  }, [])

  // ── Empty / connect state ─────────────────────────────────────────
  if (accounts === null) {
    return <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  if (accounts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="rounded-full bg-muted p-5"><Mail className="h-10 w-10 text-muted-foreground" /></div>
        <div>
          <h2 className="text-xl font-semibold">Connect your email</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Connect a Gmail or Outlook account to read, send, tag, and organize mail here — and let your agents do it too.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {(['gmail', 'outlook'] as EmailProvider[]).map((p) => (
            <Button key={p} size="lg" disabled={!providers[p] || connecting !== null} onClick={() => connect(p)} className="min-w-[200px]">
              {connecting === p ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Connect {PROVIDER_LABEL[p]}
            </Button>
          ))}
        </div>
        {(!providers.gmail || !providers.outlook) && (
          <p className="max-w-md text-xs text-muted-foreground">
            {!providers.gmail && !providers.outlook
              ? 'No provider is configured yet. Add OAuth client credentials via the GMAIL_OAUTH_CLIENT_ID / OUTLOOK_OAUTH_CLIENT_ID env vars (and secrets), then reload.'
              : `${providers.gmail ? 'Outlook' : 'Gmail'} needs OAuth credentials before it can be connected.`}
          </p>
        )}
      </div>
    )
  }

  const showDetailPane = !isMobile || selectedId !== null

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar: account + folders */}
      {(!isMobile && (
        <aside className="flex w-52 shrink-0 flex-col border-r">
          <div className="p-3">
            <Button className="w-full justify-start gap-2" onClick={() => setCompose({ to: '', subject: '', body: '' })}>
              <Pencil className="h-4 w-4" /> Compose
            </Button>
          </div>
          <div className="px-3 pb-2">
            <Select value={activeAccount?.id} onValueChange={(v) => { setActiveAccountId(v); setSelectedId(null); setOpenMessage(null) }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">{a.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <nav className="flex-1 overflow-y-auto px-2">
            {[{ id: 'inbox', name: 'Inbox' }, ...folders.filter((f) => f.name.toLowerCase() !== 'inbox')].map((f) => (
              <button
                key={f.id}
                onClick={() => { setActiveFolder(f.id === 'inbox' ? 'inbox' : f.id); setSelectedId(null); setOpenMessage(null) }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                  (activeFolder === f.id || (activeFolder === 'inbox' && f.id === 'inbox')) && 'bg-accent font-medium',
                )}
              >
                {f.id === 'inbox' ? <Inbox className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </nav>
        </aside>
      ))}

      {/* Message list */}
      {(!isMobile || selectedId === null) && (
        <section className={cn('flex min-h-0 flex-col border-r', isMobile ? 'flex-1' : 'w-80 shrink-0')}>
          <div className="flex items-center gap-2 border-b p-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && activeAccount) void loadMessages(activeAccount.id, activeFolder, query) }}
                placeholder="Search mail"
                className="h-8 pl-7 text-sm"
              />
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={loadingList}
              onClick={() => activeAccount && loadMessages(activeAccount.id, activeFolder, query)}>
              <RefreshCw className={cn('h-4 w-4', loadingList && 'animate-spin')} />
            </Button>
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCompose({ to: '', subject: '', body: '' })}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {messages.length === 0 && !loadingList && (
              <div className="p-6 text-center text-sm text-muted-foreground">No messages</div>
            )}
            {messages.map((m) => (
              <button
                key={m.id}
                onClick={() => openMsg(m.id)}
                className={cn(
                  'flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left hover:bg-accent/50',
                  selectedId === m.id && 'bg-accent',
                  m.unread && 'bg-primary/5',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-sm', m.unread && 'font-semibold')}>{senderName(m.from)}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(m.date)}</span>
                </div>
                <div className="flex items-center gap-1">
                  {m.labels.some((l) => l.toLowerCase() === 'starred') && <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" />}
                  <span className={cn('truncate text-xs', m.unread ? 'font-medium' : 'text-muted-foreground')}>{m.subject || '(no subject)'}</span>
                  {m.hasAttachments && <Paperclip className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />}
                </div>
                <span className="truncate text-[11px] text-muted-foreground">{m.snippet}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Reading pane */}
      {showDetailPane && (
        <section className="flex min-h-0 flex-1 flex-col">
          {loadingMsg ? (
            <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : openMessage ? (
            <>
              <div className="flex items-center gap-1 border-b p-2">
                {isMobile && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedId(null); setOpenMessage(null) }}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => startReply(openMessage)}>
                  <Reply className="h-4 w-4" /> Reply
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStar(openMessage)}>
                  <Star className={cn('h-4 w-4', openMessage.labels.some((l) => l.toLowerCase() === 'starred') && 'fill-yellow-400 text-yellow-400')} />
                </Button>
                <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-destructive" onClick={() => remove(openMessage.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <h1 className="text-lg font-semibold">{openMessage.subject || '(no subject)'}</h1>
                <div className="mt-2 text-sm">
                  <div className="font-medium">{senderName(openMessage.from)}</div>
                  <div className="text-xs text-muted-foreground">{openMessage.from}</div>
                  <div className="text-xs text-muted-foreground">To: {openMessage.to}</div>
                  {openMessage.cc && <div className="text-xs text-muted-foreground">Cc: {openMessage.cc}</div>}
                  <div className="mt-0.5 text-xs text-muted-foreground">{new Date(openMessage.date).toLocaleString()}</div>
                </div>
                {openMessage.labels.filter((l) => l.toLowerCase() !== 'unread').length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {openMessage.labels.filter((l) => !['unread', 'inbox'].includes(l.toLowerCase())).map((l) => (
                      <span key={l} className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{l}</span>
                    ))}
                  </div>
                )}
                <hr className="my-3" />
                {openMessage.bodyHtml ? (
                  // Untrusted email HTML is isolated in a sandboxed iframe: no script
                  // execution, no same-origin access, links open in a new tab.
                  <iframe
                    title="Email content"
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    className="h-[60vh] w-full border-0 bg-white"
                    srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>body{font-family:system-ui,Arial,sans-serif;margin:8px;color:#111;word-break:break-word}img{max-width:100%}</style>
</head><body>${openMessage.bodyHtml}</body></html>`}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm">{openMessage.bodyText}</pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Mail className="h-10 w-10" />
              <span className="text-sm">Select a message to read</span>
            </div>
          )}
        </section>
      )}

      {/* Compose / reply dialog */}
      <Dialog open={compose !== null} onOpenChange={(o) => { if (!o) setCompose(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{compose?.replyToMessageId ? 'Reply' : 'New message'}</DialogTitle>
          </DialogHeader>
          {compose && (
            <div className="flex flex-col gap-2">
              <Input placeholder="To" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} />
              <Input placeholder="Subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
              <Textarea placeholder="Write your message…" rows={10} value={compose.body}
                onChange={(e) => setCompose({ ...compose, body: e.target.value })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompose(null)}><X className="mr-1.5 h-4 w-4" /> Discard</Button>
            <Button onClick={send} disabled={sending || !compose?.body}>
              {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
