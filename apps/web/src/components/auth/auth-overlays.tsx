import type { CSSProperties } from 'react'

import { AuthForm, type AuthFormProps } from '@/components/auth/auth-form'
import { Dialog, DialogContent } from '@/components/ui/dialog'

interface AuthOverlaysProps {
  requiresAuthGate: boolean
  isElectron: boolean
  showLoginDialog: boolean
  onShowLoginDialogChange: (open: boolean) => void
  authFormProps: Omit<AuthFormProps, 'variant'>
}

export function AuthOverlays({
  requiresAuthGate,
  isElectron,
  showLoginDialog,
  onShowLoginDialogChange,
  authFormProps,
}: AuthOverlaysProps) {
  return (
    <>
      {requiresAuthGate && isElectron && (
        <div
          className="fixed top-0 left-0 right-0 h-10 z-[60]"
          style={{ WebkitAppRegion: 'drag' } as CSSProperties}
        />
      )}

      {requiresAuthGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(220,17%,10%)]">
          <div className="w-full max-w-md border bg-background p-6 shadow-sm rounded-lg">
            <AuthForm {...authFormProps} variant="gate" />
          </div>
        </div>
      )}

      <Dialog
        open={showLoginDialog && !requiresAuthGate}
        onOpenChange={onShowLoginDialogChange}
      >
        <DialogContent className="sm:max-w-md">
          <AuthForm {...authFormProps} variant="dialog" />
        </DialogContent>
      </Dialog>
    </>
  )
}
