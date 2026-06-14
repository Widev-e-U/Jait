import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react'
import { emailApi, type EmailProvider } from '@/lib/email-api'

const PROVIDER_LABEL: Record<EmailProvider, string> = {gmail: 'Gmail', outlook: 'Outlook'}
const PROVIDER_CONFIG_URL: Record<EmailProvider, string> = {
  gmail: 'https://console.cloud.google.com/apis/credentials',
  outlook: 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps',
}

interface ProviderState {
  configured: boolean
  clientId: string
  clientSecret: string
  saving: boolean
  status: string | null
  error: string | null
  visible: Record<string, boolean>
}

export function EmailSettings({ token }: { token: string | null }) {
  const [providers, setProviders] = useState<Record<EmailProvider, boolean>>({gmail: false, outlook: false})
  const [drafts, setDrafts] = useState<{[K in EmailProvider]: ProviderState}>({
    gmail: buildState(false),
    outlook: buildState(false),
  })

  function buildState(configured: boolean): ProviderState {
    return {configured, clientId: '', clientSecret: '', saving: false, status: null, error: null, visible: {}}
  }

  const loadConfig = useCallback(async () => {
    if (!token) return
    try {
      const cfg = await emailApi.config()
      setProviders(cfg)
      setDrafts((prev) => ({
        gmail: {...prev.gmail, configured: cfg.gmail},
        outlook: {...prev.outlook, configured: cfg.outlook},
      }))
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => { void loadConfig() }, [loadConfig])

  const handleChange = useCallback((provider: EmailProvider, field: 'clientId' | 'clientSecret', value: string) => {
    setDrafts((prev) => ({...prev, [provider]: {...prev[provider], [field]: value}}))
  }, [])

  const toggleVisible = useCallback((provider: EmailProvider, field: string) => {
    setDrafts((prev) => ({...prev, [provider]: {...prev[provider], visible: {...prev[provider].visible, [field]: !prev[provider].visible[field]}}}))
  }, [])

  const save = useCallback(async (provider: EmailProvider) => {
    const d = drafts[provider]
    if (!d.clientId.trim() || !d.clientSecret.trim()) return
    setDrafts((prev) => ({...prev, [provider]: {...prev[provider], saving: true, status: null, error: null}}))
    try {
      await emailApi.saveAppCredentials(provider, d.clientId.trim(), d.clientSecret.trim())
      setDrafts((prev) => ({...prev, [provider]: {...prev[provider], saving: false, configured: true, status: 'Credentials saved. Reload the Email page.', error: null}}))
      loadConfig()
    } catch (err) {
      setDrafts((prev) => ({...prev, [provider]: {...prev[provider], saving: false, status: null, error: err instanceof Error ? err.message : 'Failed to save'}}))
    }
  }, [drafts, loadConfig])

  const clear = useCallback(async (provider: EmailProvider) => {
    setDrafts((prev) => ({...prev, [provider]: {...prev[provider], saving: true, status: null, error: null}}))
    try {
      // Store empty credentials to remove user overrides and fall back to env
      await emailApi.saveAppCredentials(provider, '', '')
      setDrafts((prev) => ({...prev, [provider]: {...prev[provider], saving: false, configured: false, clientId: '', clientSecret: '', status: 'Cleared — will use .env credentials.', error: null}}))
      loadConfig()
    } catch (err) {
      setDrafts((prev) => ({...prev, [provider]: {...prev[provider], saving: false, status: null, error: err instanceof Error ? err.message : 'Failed to clear'}}))
    }
  }, [loadConfig])

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Configure OAuth credentials for Gmail or Outlook here. When set via the UI they persist in your account's encrypted secrets store.
        Env vars (GMAIL_OAUTH_CLIENT_ID, etc.) are used as a fallback when no user-level credentials exist.
      </p>
      {(['gmail', 'outlook'] as EmailProvider[]).map((provider) => {
        const d = drafts[provider]
        const configured = providers[provider] || (d.clientId && !d.configured)
        return (
          <Card key={provider} className="space-y-4 p-5">
            <div>
              <h2 className="flex items-baseline gap-2 text-base font-medium">
                {PROVIDER_LABEL[provider]} OAuth
                {d.configured && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure the OAuth client credentials for {PROVIDER_LABEL[provider]}.
                {' '}<a href={PROVIDER_CONFIG_URL[provider]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{`Configure on ${PROVIDER_LABEL[provider]} →`}</a>
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`email-client-id-${provider}`} className="text-xs">Client ID</Label>
                <Input
                  id={`email-client-id-${provider}`}
                  type={d.visible.clientId ? 'text' : 'password'}
                  value={d.clientId}
                  onChange={(e) => handleChange(provider, 'clientId', e.target.value)}
                  placeholder="Paste your OAuth client ID here"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`email-secret-${provider}`} className="text-xs">Client Secret</Label>
                <div className="relative">
                  <Input
                    id={`email-secret-${provider}`}
                    type={d.visible.clientSecret ? 'text' : 'password'}
                    value={d.clientSecret}
                    onChange={(e) => handleChange(provider, 'clientSecret', e.target.value)}
                    placeholder="Paste your OAuth client secret here"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => toggleVisible(provider, 'clientSecret')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={d.visible.clientSecret ? 'Hide value' : 'Show value'}
                  >
                    {d.visible.clientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {d.status && <span className="text-sm">{d.status}</span>}
              {d.error && <span className="text-sm text-destructive">{d.error}</span>}
              <Button size="sm" onClick={() => save(provider)} disabled={d.saving || !d.clientId.trim() || !d.clientSecret.trim()}>
                {d.saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {d.saving ? 'Saving...' : 'Save'}
              </Button>
              {d.configured && (
                <Button size="sm" variant="outline" onClick={() => clear(provider)} disabled={d.saving}>
                  Clear UI credentials
                </Button>
              )}
            </div>

            {!d.clientId && !d.configured && (
              <p className="text-xs text-muted-foreground">
                {d.configured
                  ? 'Credentials are configured.'
                  : provider === 'gmail'
                    ? 'See the Gmail OAuth quickstart to create a Web OAuth client and get your Client ID + Secret.'
                    : 'See the Microsoft Entra portal to register an app, add redirect URI ' + `"http://localhost:8000/api/email/oauth/callback"`,
                }
              </p>
            )}

            {!providers[provider] && !d.clientId && (
              <div className="w-full rounded-md border-l-4 border-yellow-400 bg-yellow-50 p-3 dark:bg-yellow-950/20">
                <p className="text-xs text-yellow-800 dark:text-yellow-300">
                  This provider is not configured yet. You can set credentials in your <code className="rounded bg-yellow-100 px-1 py-0.5 dark:bg-yellow-900/40">.env</code> file, or use this form to store them securely.
                </p>
              </div>
            )}
          </Card>
        )
      })}

      {!providers.gmail && !providers.outlook && (
        <div className="rounded-md border border-dashed p-5 text-center">
          <p className="text-sm text-muted-foreground">No provider is configured yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Add Gmail or Outlook OAuth credentials above, or set the environment variables, then reload</p>
        </div>
      )}
    </div>
  )
}
