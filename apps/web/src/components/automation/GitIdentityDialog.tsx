import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { gitApi } from '@/lib/git-api'
import { toast } from 'sonner'

interface GitIdentityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cwd: string
  onReady?: () => void
}

export function GitIdentityDialog({ open, onOpenChange, cwd, onReady }: GitIdentityDialogProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setIsLoading(true)
    gitApi.identity(cwd)
      .then((identity) => {
        if (cancelled) return
        setName(identity.name ?? '')
        setEmail(identity.email ?? '')
      })
      .catch(() => {
        if (cancelled) return
        setName('')
        setEmail('')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, cwd])

  const save = async () => {
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    if (!trimmedName || !trimmedEmail) {
      toast.error('Name and email are required')
      return
    }

    setIsSaving(true)
    try {
      await gitApi.setIdentity(cwd, trimmedName, trimmedEmail)
      toast.success('Git identity saved')
      onOpenChange(false)
      onReady?.()
    } catch (err) {
      toast.error('Failed to save git identity', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Git Author Identity</DialogTitle>
          <DialogDescription>
            Git cannot create commits until this repository has a `user.name` and `user.email`.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jakob Winkler"
              disabled={isLoading || isSaving}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isLoading || isSaving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isLoading || isSaving}>
            {isLoading || isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
