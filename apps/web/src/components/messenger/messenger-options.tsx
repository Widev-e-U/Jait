import { useState, type FormEvent } from 'react'
import { ArrowLeft, Bell, Link2, LogOut, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMessenger } from './messenger-provider'
import { messengerError } from '@/lib/messenger/model'
import { TeamsConnectionCard } from './teams-connection-card'

const BRIDGES = [
  ['WhatsApp', 'whatsappbot'], ['Telegram', 'telegrambot'], ['Signal', 'signalbot'], ['Teams', 'teamsbot'],
] as const

/** Messenger options live on their own page instead of a drawer above the conversation list. */
export function MessengerOptions({ onBack, onOpenConversation }: {
  onBack: () => void
  onOpenConversation: (roomId: string) => void
}) {
  const { store, snapshot } = useMessenger()
  const [recipient, setRecipient] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = snapshot.status === 'ready'
  const session = snapshot.session

  const act = async (action: () => Promise<unknown>, errorText?: string) => {
    setBusy(true)
    setError('')
    setNotice('')
    try { await action() }
    catch (failure) { setError(errorText ?? messengerError(failure)) }
    finally { setBusy(false) }
  }

  const openBridge = async (event: FormEvent) => {
    event.preventDefault()
    const target = recipient.trim()
    await act(async () => {
      const id = await store.openDirect(target)
      setRecipient('')
      onOpenConversation(id)
    })
  }

  const card = 'space-y-3 rounded-xl border bg-card p-4'

  return <div aria-label="Messenger options" className="min-h-0 flex-1 overflow-y-auto">
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Back to conversations" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-semibold"><Settings2 className="h-4 w-4 text-primary" />Messenger options</h2><p className="truncate text-xs text-muted-foreground">Connection, bridges and encryption for this account</p></div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}

      <section aria-label="Matrix account" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 text-sm"><h3 className="font-medium">Matrix account</h3><p className="break-all text-xs text-muted-foreground">{session?.userId}</p><p className="break-all text-xs text-muted-foreground">{session?.homeserver} · Device {session?.deviceId}</p></div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => store.enableNotifications(!snapshot.notifications), 'Allow notifications in your browser or device settings first.')}><Bell className="mr-2 h-4 w-4" />{snapshot.notifications ? 'Mute' : 'Notify'}</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => store.disconnect(), 'Disconnected locally. If server sign-out failed, revoke the Jait device in your Matrix account.')}><LogOut className="mr-2 h-4 w-4" />Disconnect</Button>
          </div>
        </div>
      </section>

      <section aria-label="Messaging accounts" className={card}>
        <div className="space-y-1"><h3 className="text-sm font-medium">Connect a messaging account</h3><p className="text-xs text-muted-foreground">Install a bridge on your homeserver, then open its setup conversation. Send “help” there to follow the bridge’s login steps. Bot IDs vary by server.</p></div>
        <div className="flex flex-wrap gap-2">{BRIDGES.map(([name, bot]) => <Button key={name} variant="outline" size="sm" onClick={() => setRecipient('@' + bot + ':' + (session?.userId.split(':').slice(1).join(':') ?? ''))}>{name}</Button>)}</div>
        <form className="flex gap-2" onSubmit={event => void openBridge(event)}>
          <Input aria-label="Matrix user or bridge bot ID" placeholder="@whatsappbot:your.server" value={recipient} onChange={event => setRecipient(event.target.value)} required />
          <Button type="submit" disabled={!ready || busy || !recipient.trim()}><Link2 className="mr-2 h-4 w-4" />Open</Button>
        </form>
        <p className="text-xs text-muted-foreground">Teams tenant coverage depends on the installed bridge and each organization’s policies.</p>
      </section>

      <TeamsConnectionCard className={card} />

      <section aria-label="Assistant access" className={card}>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={snapshot.assistantAccess} disabled={!ready} onChange={event => store.setAssistantAccess(event.target.checked)} />Allow assistant access</label>
        <p className="text-xs text-muted-foreground">When enabled, tools can read and search messages through the gateway and send with consent. Requested message text is shared with the gateway and your AI provider. Matrix credentials and encryption keys stay on the gateway. Assistant access resets when the gateway restarts or you disconnect.</p>
      </section>

      <section aria-label="Encrypted history" className={card}>
        <h3 className="text-sm font-medium">Recover encrypted history</h3>
        <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); const key = recoveryKey; setRecoveryKey(''); void act(async () => { await store.restoreKeys(key); setNotice('Encryption keys restored.') }, 'Could not restore keys. Check the recovery key and that this account has a server key backup.') }}>
          <Input className="min-w-0 flex-1" aria-label="Matrix recovery key" type="password" value={recoveryKey} onChange={event => setRecoveryKey(event.target.value)} placeholder="Matrix backup recovery key" autoComplete="off" required />
          <Button type="submit" disabled={!ready || busy}>Restore keys</Button>
        </form>
        <p className="text-xs text-muted-foreground">Use your Matrix message backup key. Device verification and cross-signing setup currently require another client such as Element.</p>
      </section>

      {notice && <p role="status" className="text-sm">{notice}</p>}
      <p className="px-1 text-xs text-muted-foreground">Notifications work while Jait is open. Calls and native service activity feeds are not supported.</p>
    </div>
  </div>
}
