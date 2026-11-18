import { useState } from 'react'
import { toast } from 'sonner'
import { Mail, Plus, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { emailApi, type EmailAccount, type OAuthEmailProvider, type ConnectMailboxInput } from '@/lib/email-api'

function AccountEditor({ account, onSaved }: { account: EmailAccount; onSaved: () => Promise<void> }) {
  const [signature, setSignature] = useState(account.signature || '')
  const [enabled, setEnabled] = useState(account.signatureEnabled !== false)
  const [name, setName] = useState(account.displayName)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  async function save() {
    setSaving(true)
    try { await emailApi.updateAccount(account.id, { signature, signatureEnabled: enabled, displayName: name }); await onSaved(); toast.success('Signature saved') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save signature') }
    finally { setSaving(false) }
  }
  async function disconnect() {
    setDisconnecting(true)
    try { await emailApi.disconnect(account.id); await onSaved(); toast.success('Mailbox disconnected') }
    catch { toast.error('Could not disconnect mailbox') }
    finally { setDisconnecting(false) }
  }
  return (
    <section className="space-y-3 rounded-xl border p-4" aria-label={`Settings for ${account.email}`}>
      <div className="flex flex-wrap items-center gap-2"><Mail className="h-4 w-4" /><strong className="min-w-0 break-all text-sm">{account.email}</strong><span className="text-xs text-muted-foreground">{account.provider === 'imap' ? 'IMAP / SMTP' : account.provider === 'gmail' ? 'Gmail' : 'Outlook'}</span></div>
      <Label className="block space-y-1"><span>Sender name</span><Input value={name} onChange={event => setName(event.target.value)} maxLength={200} /></Label>
      <Label className="block space-y-1"><span>Signature for {account.email}</span><Textarea value={signature} onChange={event => setSignature(event.target.value)} rows={4} maxLength={10000} placeholder="Your name, role, phone, website…" /></Label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Automatically include this signature</label>
      <p className="text-xs text-muted-foreground">Applies to new messages and replies from this account, including messages sent through chat.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => { void save() }} disabled={saving}>{saving ? 'Saving…' : 'Save signature'}</Button>
        {!confirmDisconnect ? <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(true)}>Disconnect…</Button> : <>
          <Button size="sm" variant="destructive" onClick={() => { void disconnect() }} disabled={disconnecting}>Disconnect {account.email}</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(false)}>Cancel</Button>
        </>}
      </div>
    </section>
  )
}

function ConnectMailboxForm({ onConnected }: { onConnected: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [settings, setSettings] = useState({ imap: { host: '', port: 993, secure: true, user: '' }, smtp: { host: '', port: 465, secure: true, user: '' } })
  const [busy, setBusy] = useState<'detect' | 'connect' | null>(null)
  const [status, setStatus] = useState('')
  async function detect() {
    setBusy('detect'); setStatus('')
    try {
      const result = await emailApi.discover(email)
      setSettings({ imap: result.imap, smtp: result.smtp })
      setStatus(`Settings found for ${result.name}. Review them below.`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Enter server settings manually.') }
    finally { setBusy(null) }
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault()
    setBusy('connect'); setStatus('')
    const config: ConnectMailboxInput = { email, displayName: name,
      imap: { ...settings.imap, user: settings.imap.user || email, password },
      smtp: { ...settings.smtp, user: settings.smtp.user || email, password: smtpPassword || password } }
    try {
      await emailApi.connectMailbox(config)
      setPassword(''); setSmtpPassword('')
      await onConnected()
      toast.success('Mailbox connected')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Connection failed') }
    finally { setBusy(null) }
  }
  return (
    <form onSubmit={event => { void connect(event) }} className="space-y-3 rounded-xl border p-4">
      <h3 className="font-medium">Other provider · IMAP / SMTP</h3>
      <p className="text-xs text-muted-foreground">Yahoo, iCloud, Fastmail, GMX, Zoho, mailbox.org, hosted domains and other providers offering IMAP/SMTP. Use an app password when required. Provider access rules still apply.</p>
      <Label className="block space-y-1"><span>Email address</span><Input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></Label>
      <Button type="button" size="sm" variant="outline" disabled={!email.includes('@') || busy !== null} onClick={() => { void detect() }}>{busy === 'detect' ? 'Looking up settings…' : 'Find server settings'}</Button>
      <p className="text-xs text-muted-foreground">Automatic setup sends only the email domain to Thunderbird’s provider database.</p>
      <Label className="block space-y-1"><span>Sender name</span><Input value={name} onChange={event => setName(event.target.value)} /></Label>
      <Label className="block space-y-1"><span>Password or app password</span><Input type="password" required autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Label>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['imap', 'smtp'] as const).map(kind => (
          <fieldset key={kind} className="min-w-0 space-y-2"><legend className="text-sm font-medium">{kind.toUpperCase()}</legend>
            <Label className="block space-y-1"><span>Server hostname</span><Input required value={settings[kind].host} placeholder={kind + '.example.com'} onChange={event => setSettings(previous => ({ ...previous, [kind]: { ...previous[kind], host: event.target.value } }))} /></Label>
            <Label className="block space-y-1"><span>Port</span><Input type="number" required min={1} max={65535} value={settings[kind].port} onChange={event => setSettings(previous => ({ ...previous, [kind]: { ...previous[kind], port: Number(event.target.value) } }))} /></Label>
            <Label className="block space-y-1"><span>Encryption</span><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={settings[kind].secure ? 'tls' : 'starttls'} onChange={event => setSettings(previous => ({ ...previous, [kind]: { ...previous[kind], secure: event.target.value === 'tls' } }))}><option value="tls">TLS</option><option value="starttls">STARTTLS (required)</option></select></Label>
            <Label className="block space-y-1"><span>Username</span><Input value={settings[kind].user} placeholder={email || 'you@example.com'} onChange={event => setSettings(previous => ({ ...previous, [kind]: { ...previous[kind], user: event.target.value } }))} /></Label>
          </fieldset>
        ))}
      </div>
      <Label className="block space-y-1"><span>Separate SMTP password (optional)</span><Input type="password" autoComplete="new-password" value={smtpPassword} onChange={event => setSmtpPassword(event.target.value)} placeholder="Uses the same password if blank" /></Label>
      {status && <p role="status" className="text-sm">{status}</p>}
      <Button type="submit" disabled={busy !== null}>{busy === 'connect' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify and add account</Button>
    </form>
  )
}

export function EmailAccountManager({ open, onOpenChange, accounts, providers, connecting, onConnect, onChanged }: {
  open: boolean; onOpenChange: (open: boolean) => void; accounts: EmailAccount[];
  providers: Record<OAuthEmailProvider, boolean>; connecting: OAuthEmailProvider | null;
  onConnect: (provider: OAuthEmailProvider) => void; onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Email accounts & signatures</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {accounts.map(account => <AccountEditor key={account.id} account={account} onSaved={onChanged} />)}
          <div className="space-y-3 rounded-xl border p-4">
            <h3 className="flex items-center gap-2 font-medium"><Plus className="h-4 w-4" />Add another account</h3>
            <div className="flex flex-wrap gap-2">{(['gmail', 'outlook'] as const).map(provider => <Button key={provider} size="sm" variant="outline" disabled={!providers[provider] || connecting !== null} onClick={() => onConnect(provider)}>{connecting === provider ? 'Connecting…' : `Connect ${provider === 'gmail' ? 'Gmail / Google Workspace' : 'Outlook / Microsoft 365'}`}</Button>)}</div>
            {(!providers.gmail || !providers.outlook) && <p className="text-xs text-muted-foreground">OAuth connections need app credentials in Settings → Email. You can also connect a provider below if it supports app-password access.</p>}
            <Button size="sm" variant="secondary" onClick={() => setAdding(value => !value)}>{adding ? 'Hide server settings' : 'Connect another provider'}</Button>
          </div>
          {(adding || accounts.length === 0) && <ConnectMailboxForm onConnected={onChanged} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
