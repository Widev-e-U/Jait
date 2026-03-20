import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ConfirmDialogOptions {
  title?: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
}

interface PendingConfirm extends ConfirmDialogOptions {
  resolve: (value: boolean) => void
}

const ConfirmDialogContext = createContext<((options: ConfirmDialogOptions) => Promise<boolean>) | null>(null)

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const activeRef = useRef<PendingConfirm | null>(null)
  const queueRef = useRef<PendingConfirm[]>([])
  const [active, setActive] = useState<PendingConfirm | null>(null)

  const showNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null
    activeRef.current = next
    setActive(next)
  }, [])

  const resolveActive = useCallback((value: boolean) => {
    const current = activeRef.current
    if (!current) return
    current.resolve(value)
    showNext()
  }, [showNext])

  const confirm = useCallback((options: ConfirmDialogOptions) => (
    new Promise<boolean>((resolve) => {
      const pending: PendingConfirm = { ...options, resolve }
      if (activeRef.current) {
        queueRef.current.push(pending)
        return
      }
      activeRef.current = pending
      setActive(pending)
    })
  ), [])

  useEffect(() => () => {
    activeRef.current?.resolve(false)
    for (const pending of queueRef.current) pending.resolve(false)
    queueRef.current = []
    activeRef.current = null
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <Dialog open={!!active} onOpenChange={(open) => { if (!open) resolveActive(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{active?.title ?? 'Confirm action'}</DialogTitle>
            <DialogDescription asChild>
              <div>{active?.description}</div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => resolveActive(false)}>
              {active?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={active?.variant === 'destructive' ? 'destructive' : 'default'} onClick={() => resolveActive(true)}>
              {active?.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext)
  if (!context) {
    throw new Error('useConfirmDialog must be used within a ConfirmDialogProvider')
  }
  return context
}
