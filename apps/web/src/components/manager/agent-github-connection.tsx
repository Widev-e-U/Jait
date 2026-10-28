import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, ExternalLink, GitBranch, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  agentsApi,
  type AgentGithubAppConnection,
  type AgentGithubAppState,
  type AgentGithubAppTestResult,
} from '@/lib/agents-api'

const STATUS_LABEL: Record<AgentGithubAppConnection['status'], string> = {
  awaiting_installation: 'App created · install it on GitHub',
  connected: 'Connected',
  error: 'Needs attention',
  revoked: 'Access revoked',
}

function statusTone(status: AgentGithubAppConnection['status']): string {
  if (status === 'connected') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'awaiting_installation') return 'text-amber-600 dark:text-amber-400'
  return 'text-destructive'
}

function defaultAppName(agentName: string): string {
  const base = agentName.trim() || 'Jait agent'
  return `${base} agent`.slice(0, 34)
}

/**
 * GitHub's manifest flow is a browser POST of the manifest JSON plus the state
 * token. It has to leave this app, so the form is built and submitted directly.
 */
function submitManifestFlow({ postUrl, state, manifest }: { postUrl: string; state: string; manifest: Record<string, unknown> }) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = postUrl
  const add = (name: string, value: string) => {
    const field = document.createElement('input')
    field.type = 'hidden'
    field.name = name
    field.value = value
    form.appendChild(field)
  }
  add('manifest', JSON.stringify(manifest))
  add('state', state)
  document.body.appendChild(form)
  form.submit()
}

export function AgentGithubConnection({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [state, setState] = useState<AgentGithubAppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<AgentGithubAppTestResult | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [manualAppId, setManualAppId] = useState('')
  const [manualSlug, setManualSlug] = useState('')
  const [manualKey, setManualKey] = useState('')
  const [installationId, setInstallationId] = useState('')
  const alive = useRef(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await agentsApi.getAgentGithubApp(agentId)
      if (alive.current) { setState(next); setError(null) }
    } catch (loadError) {
      if (alive.current) setError(loadError instanceof Error ? loadError.message : 'Could not read the GitHub connection')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    alive.current = true
    setTest(null)
    void load()
    return () => { alive.current = false }
  }, [load])

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label)
    try { await action() } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : 'Something went wrong'
      setError(message)
      toast.error(message)
    } finally { setBusy(null) }
  }

  const connection = state?.connection ?? null

  const connectWithManifest = () => run('setup', async () => {
    const setup = await agentsApi.startAgentGithubAppSetup(agentId, {
      appName: defaultAppName(agentName),
      description: `Jait agent ${agentName.trim() || agentId}. Commits, pull requests and reviews are authored by this App.`,
    })
    setError(null)
    submitManifestFlow(setup)
  })

  const saveManual = () => run('manual', async () => {
    if (!manualAppId.trim() || !manualKey.trim()) { toast.error('App id and private key are required'); return }
    await agentsApi.saveAgentGithubAppManual(agentId, {
      appId: manualAppId.trim(),
      privateKey: manualKey,
      appSlug: manualSlug.trim() || null,
      appName: manualSlug.trim() || null,
    })
    setManualKey(''); setShowManual(false)
    toast.success('GitHub App saved for this agent')
    await load()
  })

  const bindInstallation = () => run('installation', async () => {
    if (!/^\d+$/.test(installationId.trim())) { toast.error('Installation id must be numeric'); return }
    await agentsApi.attachAgentGithubAppInstallation(agentId, installationId.trim())
    setInstallationId('')
    toast.success('Installation bound to this agent')
    await load()
  })

  const verify = () => run('verify', async () => {
    const result = await agentsApi.verifyAgentGithubApp(agentId)
    setState((previous) => ({ ...previous, connection: result.connection, webhookSecretAvailable: previous?.webhookSecretAvailable ?? false }))
    toast.success(result.connection.status === 'connected' ? `Verified as ${result.connection.botLogin ?? 'the App bot'}` : 'Credentials checked')
  })

  const runTest = () => run('test', async () => {
    const result = await agentsApi.testAgentGithubApp(agentId)
    setTest(result)
    toast.success(`Token works · ${result.repositoryCount} repositories reachable`)
  })

  const disconnect = () => run('disconnect', async () => {
    await agentsApi.disconnectAgentGithubApp(agentId)
    setTest(null)
    toast.success('GitHub App disconnected')
    await load()
  })

  const install = () => run('install', async () => {
    setError(null)
    const result = await agentsApi.startAgentGithubAppInstallation(agentId)
    window.location.assign(result.installUrl)
  })

  const installUrl = connection?.appSlug ? `https://github.com/apps/${connection.appSlug}/installations/new` : null

  return <section aria-label="GitHub App connection" className="rounded-lg border p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-2 font-medium"><GitBranch className="h-4 w-4" />GitHub</span>
      {connection && <span className={`flex items-center gap-1 ${statusTone(connection.status)}`}>
        {connection.status === 'connected' ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
        {STATUS_LABEL[connection.status]}
      </span>}
    </div>

    <p className="mt-2 text-muted-foreground">
      Connect this agent to its own GitHub App so its commits, pull requests and reviews are authored by the agent instead of your personal account.
    </p>

    {loading && <p className="mt-3 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking connection…</p>}

    {!loading && error && <p className="mt-3 text-destructive">{error}</p>}

    {!loading && connection && <dl className="mt-3 grid gap-1">
      <div className="flex flex-wrap gap-2"><dt className="text-muted-foreground">App</dt><dd>{connection.appName || connection.appSlug || connection.appId || 'Unknown'}{connection.appSlug && <span className="ml-1 text-muted-foreground">· {connection.appSlug}</span>}</dd></div>
      {connection.botLogin && <div className="flex flex-wrap gap-2"><dt className="text-muted-foreground">Bot identity</dt><dd className="font-mono text-xs">{connection.botLogin}</dd></div>}
      <div className="flex flex-wrap gap-2"><dt className="text-muted-foreground">Installation</dt><dd>{connection.installationId ?? 'Not installed yet'}{connection.accountLogin ? ` · ${connection.accountLogin}` : ''}</dd></div>
      {connection.repositorySelection && <div className="flex flex-wrap gap-2"><dt className="text-muted-foreground">Repositories</dt><dd>{connection.repositorySelection === 'all' ? 'All repositories' : connection.repositorySelection}</dd></div>}
      {connection.lastError && <div className="flex flex-wrap gap-2"><dt className="text-muted-foreground">Last error</dt><dd className="text-destructive">{connection.lastError}</dd></div>}
      {!connection.hasPrivateKey && <div><dd className="text-destructive">Private key missing — reconnect this agent.</dd></div>}
    </dl>}

    {test && <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
      <strong className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-4 w-4" />Token check passed</strong>
      <p className="mt-1 text-muted-foreground">{test.botLogin ?? 'App bot'} can reach {test.repositoryCount} repositories{test.sampleRepositories.length ? `: ${test.sampleRepositories.join(', ')}` : ''}. Token {test.tokenPrefix}… expires {new Date(test.tokenExpiresAt).toLocaleTimeString()}.</p>
    </div>}

    <div className="mt-3 flex flex-wrap gap-2">
      {!connection && <Button size="sm" disabled={busy !== null} onClick={() => void connectWithManifest()}>{busy === 'setup' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}Create GitHub App for this agent</Button>}
      {connection && connection.status !== 'connected' && installUrl && (state?.installationFlow === 'stateful'
        ? <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void install()}>{busy === 'install' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}Install on GitHub</Button>
        : <Button size="sm" asChild variant="secondary"><a href={installUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Install on GitHub</a></Button>)}
      {connection && <Button size="sm" variant="outline" disabled={busy !== null || !connection.hasPrivateKey} onClick={() => void verify()}>{busy === 'verify' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Verify with GitHub</Button>}
      {connection?.status === 'connected' && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void runTest()}>{busy === 'test' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Test token</Button>}
      {connection && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void disconnect()}>{busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}</Button>}
      <Button size="sm" variant="ghost" onClick={() => setShowManual((value) => !value)}>{showManual ? 'Hide manual setup' : 'Use an existing GitHub App'}</Button>
    </div>

    {connection && connection.status !== 'connected' && <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border p-3">
      <label className="text-sm">Installation id<input aria-label="GitHub App installation id" value={installationId} onChange={(event) => setInstallationId(event.target.value)} placeholder="12345678" className="mt-1 w-40 rounded-md border bg-background px-3 py-2 text-sm" /></label>
      <Button size="sm" disabled={busy !== null || !installationId.trim()} onClick={() => void bindInstallation()}>{busy === 'installation' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Bind installation</Button>
      <p className="w-full text-xs text-muted-foreground">Open the install link above, then paste the installation id from the GitHub URL (…/installations/&lt;id&gt;).</p>
    </div>}

    {showManual && <div className="mt-3 space-y-2 rounded-md border p-3">
      <p className="text-xs text-muted-foreground">For an App you already registered in GitHub. The private key is encrypted at rest and never returned by the API.</p>
      <label className="block text-sm">App id<input aria-label="GitHub App id" value={manualAppId} onChange={(event) => setManualAppId(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label>
      <label className="block text-sm">App slug (optional)<input aria-label="GitHub App slug" value={manualSlug} onChange={(event) => setManualSlug(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label>
      <label className="block text-sm">Private key (PEM)<textarea aria-label="GitHub App private key" value={manualKey} onChange={(event) => setManualKey(event.target.value)} rows={4} className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" /></label>
      <Button size="sm" disabled={busy !== null || !manualAppId.trim() || !manualKey.trim()} onClick={() => void saveManual()}>{busy === 'manual' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save App</Button>
    </div>}
  </section>
}
