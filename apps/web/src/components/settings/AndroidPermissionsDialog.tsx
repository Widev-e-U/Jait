import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ANDROID_PERMISSIONS, AndroidPermissions, type AndroidPermissionStates } from '@/lib/android-permissions'

export function AndroidPermissionsDialog() {
  const [open, setOpen] = useState(false)
  const [states, setStates] = useState<AndroidPermissionStates | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    void AndroidPermissions.getDevicePermissions().then((result) => {
      if (!active) return
      setStates(result)
      setLoadError(false)
    }).catch(() => {
      if (active) setLoadError(true)
    })
    return () => { active = false }
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') setRefresh(value => value + 1)
    }
    document.addEventListener('visibilitychange', refreshOnReturn)
    window.addEventListener('focus', refreshOnReturn)
    return () => {
      document.removeEventListener('visibilitychange', refreshOnReturn)
      window.removeEventListener('focus', refreshOnReturn)
    }
  }, [open])

  const manage = async (name: keyof AndroidPermissionStates) => {
    setBusy(true)
    setActionError(false)
    try {
      await AndroidPermissions.manageDevicePermission({ name })
    } catch {
      setActionError(true)
    } finally {
      setBusy(false)
      setRefresh(value => value + 1)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Manage permissions</Button></DialogTrigger>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg p-4 sm:p-6">
        <DialogHeader className="pr-7 text-left">
          <DialogTitle>Android permissions</DialogTitle>
          <DialogDescription>Choose which features Jait can use on this device.</DialogDescription>
        </DialogHeader>
        {loadError ? (
          <div className="space-y-2">
            <p role="status" className="text-sm text-muted-foreground">Could not read Android permissions.</p>
            <Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Retry</Button>
          </div>
        ) : states ? (
          <ul className="divide-y">
            {ANDROID_PERMISSIONS.map(({ name, label, description }) => {
              const state = states[name]
              const canAsk = state === 'prompt' || state === 'prompt-with-rationale'
              const action = canAsk ? 'Allow' : 'Settings'
              return (
                <li key={name} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                    <p className="mt-1 text-xs">{state === 'granted' ? 'Allowed' : state === 'not-required' ? 'Not required' : 'Off'}</p>
                  </div>
                  {state !== 'not-required' && (
                    <Button variant="outline" size="sm" disabled={busy} aria-label={`${action} for ${label}`}
                      onClick={() => void manage(name)}>
                      {action}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : <p role="status" className="text-sm text-muted-foreground">Loading Android permissions…</p>}
        {actionError && <p role="alert" className="text-sm text-destructive">Could not open this permission. You can manage it in the Android Settings app.</p>}
      </DialogContent>
    </Dialog>
  )
}
