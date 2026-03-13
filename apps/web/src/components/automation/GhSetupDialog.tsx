/**
 * GhSetupDialog — guides the user through GitHub CLI installation and authentication.
 *
 * Shown when a PR creation is attempted but `gh` is either not installed or not authenticated.
 * Allows inline token-based auth without leaving the app.
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
import { gitApi, type GhStatusResult } from '@/lib/git-api'

type Step = 'checking' | 'not-installed' | 'not-authenticated' | 'authenticating' | 'success' | 'error'

interface GhSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Working directory — used to target the correct machine (local or remote). */
  cwd?: string
  /** Called when setup completes successfully so the caller can proceed with PR creation. */
  onReady?: () => void
}

export function GhSetupDialog({ open, onOpenChange, cwd, onReady }: GhSetupDialogProps) {
  const [step, setStep] = useState<Step>('checking')
  const [status, setStatus] = useState<GhStatusResult | null>(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  const checkStatus = useCallback(async () => {
    setStep('checking')
    setError(null)
    try {
      const result = await gitApi.ghStatus(cwd)
      setStatus(result)
      if (!result.installed) {
        setStep('not-installed')
      } else if (!result.authenticated) {
        setStep('not-authenticated')
      } else {
        setStep('success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check GitHub CLI status')
      setStep('error')
    }
  }, [cwd])

  useEffect(() => {
    if (open) {
      checkStatus()
      setToken('')
    }
  }, [open, checkStatus])

  const handleAuth = useCallback(async () => {
    if (!token.trim()) return
    setStep('authenticating')
    setError(null)
    try {
      const result = await gitApi.ghAuth(token.trim(), cwd)
      if (result.ok) {
        setStatus({ installed: true, authenticated: true, username: result.username })
        setStep('success')
        setToken('')
      } else {
        setError('Authentication failed — check that your token has the "repo" scope.')
        setStep('not-authenticated')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
      setStep('not-authenticated')
    }
  }, [token, cwd])

  const handleProceed = useCallback(() => {
    onOpenChange(false)
    onReady?.()
  }, [onOpenChange, onReady])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>GitHub CLI Setup</DialogTitle>
          <DialogDescription>
            Pull request creation requires the GitHub CLI ({'\u200B'}<code className="text-xs">gh</code>).
          </DialogDescription>
        </DialogHeader>

        {/* Checking */}
        {step === 'checking' && (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking GitHub CLI status…</span>
          </div>
        )}

        {/* Not installed or not authenticated — show token input for both */}
        {(step === 'not-installed' || step === 'not-authenticated') && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <XCircle className={`h-5 w-5 mt-0.5 shrink-0 ${step === 'not-installed' ? 'text-red-500' : 'text-amber-500'}`} />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {step === 'not-installed' ? 'GitHub CLI not detected' : 'GitHub CLI is not authenticated'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Paste a Personal Access Token with <code className="text-xs">repo</code> scope to sign in.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gh-token" className="text-xs">
                Personal Access Token
              </Label>
              <Input
                id="gh-token"
                type="password"
                placeholder="ghp_... or github_pat_..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAuth() }}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:org,workflow&description=Jait+CLI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Create a token
                </a>
                {' '}with <code className="text-[10px]">repo</code>, <code className="text-[10px]">read:org</code>, and <code className="text-[10px]">workflow</code> scopes.
                For fine-grained tokens, grant Contents + Pull Requests read/write access.
              </p>
            </div>
            {step === 'not-installed' && (
              <p className="text-[10px] text-muted-foreground">
                If <code className="text-[10px]">gh</code> is not installed,{' '}
                <a
                  href="https://cli.github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  download it here
                </a>.
              </p>
            )}
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </div>
        )}

        {/* Authenticating */}
        {step === 'authenticating' && (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Authenticating…</span>
          </div>
        )}

        {/* Success */}
        {step === 'success' && (
          <div className="flex items-start gap-3 py-4">
            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Authenticated{status?.username ? ` as ${status.username}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                GitHub CLI is ready. You can now create pull requests.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
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
                <Button variant="outline" size="sm" onClick={checkStatus}>
                  Re-check
                </Button>
              )}
              <Button
                size="sm"
                disabled={!token.trim()}
                onClick={handleAuth}
              >
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
