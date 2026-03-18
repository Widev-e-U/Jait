/**
 * ForgeSetupDialog — guides the user through git forge authentication.
 *
 * Auto-detects the hosting provider (GitHub, GitLab, Gitea, Azure DevOps, Bitbucket)
 * from the remote URL and shows the appropriate setup instructions.
 *
 * Exported as both `ForgeSetupDialog` (new) and `GhSetupDialog` (backward compat).
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { gitApi, type ForgeStatusResult } from '@/lib/git-api'

type Step = 'checking' | 'not-installed' | 'not-authenticated' | 'authenticating' | 'success' | 'error'

const FORGE_TOKEN_HELP: Record<string, { placeholder: string; createUrl: string; createLabel: string; scopes: string; cliName?: string; cliUrl?: string }> = {
  github: {
    placeholder: 'ghp_... or github_pat_...',
    createUrl: 'https://github.com/settings/tokens/new?scopes=repo,read:org,workflow&description=Jait+CLI',
    createLabel: 'Create a GitHub token',
    scopes: 'repo, read:org, and workflow',
    cliName: 'gh',
    cliUrl: 'https://cli.github.com',
  },
  gitlab: {
    placeholder: 'glpat-...',
    createUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    createLabel: 'Create a GitLab token',
    scopes: 'api and write_repository',
    cliName: 'glab',
    cliUrl: 'https://gitlab.com/gitlab-org/cli',
  },
  gitea: {
    placeholder: 'your-gitea-token',
    createUrl: '',
    createLabel: 'Create a token in your Gitea settings',
    scopes: 'repo access',
    cliName: 'tea',
    cliUrl: 'https://gitea.com/gitea/tea',
  },
  'azure-devops': {
    placeholder: 'your-azure-devops-pat',
    createUrl: 'https://dev.azure.com/_usersSettings/tokens',
    createLabel: 'Create an Azure DevOps PAT',
    scopes: 'Code (Read & Write)',
    cliName: 'az',
    cliUrl: 'https://learn.microsoft.com/en-us/cli/azure/install-azure-cli',
  },
  bitbucket: {
    placeholder: 'your-bitbucket-app-password',
    createUrl: 'https://bitbucket.org/account/settings/app-passwords/',
    createLabel: 'Create a Bitbucket app password',
    scopes: 'Repositories (Read/Write) and Pull Requests (Read/Write)',
  },
}

interface ForgeSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cwd?: string
  remoteUrl?: string
  onReady?: () => void
}

export function ForgeSetupDialog({ open, onOpenChange, cwd, remoteUrl, onReady }: ForgeSetupDialogProps) {
  const [step, setStep] = useState<Step>('checking')
  const [forgeStatus, setForgeStatus] = useState<ForgeStatusResult | null>(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  const provider = forgeStatus?.provider ?? 'github'
  const forgeName = forgeStatus?.forgeName ?? 'Git Forge'
  const help = FORGE_TOKEN_HELP[provider] ?? FORGE_TOKEN_HELP.github!

  const checkStatus = useCallback(async () => {
    setStep('checking')
    setError(null)
    try {
      const result = await gitApi.forgeStatus(cwd, remoteUrl)
      setForgeStatus(result)
      if (!result.installed && !result.authenticated) {
        setStep('not-installed')
      } else if (!result.authenticated) {
        setStep('not-authenticated')
      } else {
        setStep('success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check forge status')
      setStep('error')
    }
  }, [cwd, remoteUrl])

  useEffect(() => {
    if (open) {
      void checkStatus()
      setToken('')
    }
  }, [open, checkStatus])

  const handleAuth = useCallback(async () => {
    if (!token.trim()) return
    setStep('authenticating')
    setError(null)
    try {
      const result = await gitApi.forgeAuth(token.trim(), cwd, remoteUrl)
      if (result.ok) {
        setForgeStatus((prev) => prev ? { ...prev, authenticated: true, username: result.username } : prev)
        setStep('success')
        setToken('')
      } else {
        setError(result.error ?? 'Authentication failed — check your token permissions.')
        setStep('not-authenticated')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
      setStep('not-authenticated')
    }
  }, [token, cwd, remoteUrl])

  const handleProceed = useCallback(() => {
    onOpenChange(false)
    onReady?.()
  }, [onOpenChange, onReady])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{forgeName} Setup</DialogTitle>
          <DialogDescription>
            Pull request creation requires authentication with {forgeName}.
          </DialogDescription>
        </DialogHeader>

        {step === 'checking' && (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking {forgeName} status…</span>
          </div>
        )}

        {(step === 'not-installed' || step === 'not-authenticated') && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <XCircle className={`h-5 w-5 mt-0.5 shrink-0 ${step === 'not-installed' ? 'text-red-500' : 'text-amber-500'}`} />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {step === 'not-installed' ? `${forgeName} CLI not detected` : `${forgeName} is not authenticated`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Paste a Personal Access Token with {help.scopes} scope to sign in.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="forge-token" className="text-xs">
                Personal Access Token
              </Label>
              <Input
                id="forge-token"
                type="password"
                placeholder={help.placeholder}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAuth() }}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                {help.createUrl ? (
                  <a href={help.createUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                    {help.createLabel}
                  </a>
                ) : (
                  <span>{help.createLabel}</span>
                )}
                {' '}with <code className="text-[10px]">{help.scopes}</code> permissions.
              </p>
            </div>
            {step === 'not-installed' && help.cliName && help.cliUrl && (
              <p className="text-[10px] text-muted-foreground">
                Optionally install the <code className="text-[10px]">{help.cliName}</code> CLI:{' '}
                <a href={help.cliUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                  {help.cliUrl}
                </a>
              </p>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        {step === 'authenticating' && (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Authenticating with {forgeName}…</span>
          </div>
        )}

        {step === 'success' && (
          <div className="flex items-start gap-3 py-4">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Authenticated{forgeStatus?.username ? ` as ${forgeStatus.username}` : ''} on {forgeName}
              </p>
              <p className="text-xs text-muted-foreground">
                You can now create pull requests.
              </p>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="flex items-start gap-3 py-4">
            <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Something went wrong</p>
              {error && <p className="text-xs text-muted-foreground">{error}</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          {(step === 'not-installed' || step === 'not-authenticated' || step === 'error') && (
            <>
              {step === 'error' && (
                <Button variant="outline" size="sm" onClick={() => void checkStatus()}>
                  Re-check
                </Button>
              )}
              <Button size="sm" disabled={!token.trim()} onClick={() => void handleAuth()}>
                Sign in
              </Button>
            </>
          )}
          {step === 'success' && (
            <Button size="sm" onClick={handleProceed}>
              Continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** @deprecated Use `ForgeSetupDialog` instead — this is a backward-compat alias. */
export const GhSetupDialog = ForgeSetupDialog
