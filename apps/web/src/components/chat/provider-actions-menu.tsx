import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface ProviderActionsMenuProps {
  label: string
  className?: string
  children: ReactNode
  busy: boolean
  canRefresh: boolean
  canLogout: boolean
  onRefresh: () => void
  onLogout: () => void
}

export function ProviderActionsMenu({ label, className, children, busy, canRefresh, canLogout, onRefresh, onLogout }: ProviderActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  const heldRef = useRef(false)

  const cancelHold = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    originRef.current = null
  }

  useEffect(() => cancelHold, [])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <div
        ref={rowRef}
        className={className}
        style={{ position: 'relative', WebkitTouchCallout: 'none', userSelect: 'none' }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          cancelHold()
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            event.stopPropagation()
            setOpen(true)
          }
        }}
        onPointerDownCapture={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) return
          cancelHold()
          heldRef.current = false
          if (event.pointerType !== 'touch' || !event.isPrimary) return
          originRef.current = { x: event.clientX, y: event.clientY }
          timerRef.current = setTimeout(() => {
            heldRef.current = true
            setOpen(true)
          }, 500)
        }}
        onPointerMove={(event) => {
          const origin = originRef.current
          if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) cancelHold()
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onClickCapture={(event) => {
          if (!heldRef.current || !event.currentTarget.contains(event.target as Node)) return
          heldRef.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <DropdownMenuTrigger className="sr-only" aria-label={`Actions for ${label}`} />
        {children}
      </div>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          rowRef.current?.querySelector<HTMLElement>('[role="option"]')?.focus()
        }}
      >
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuItem disabled={busy || !canRefresh} onSelect={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh models
        </DropdownMenuItem>
        {canLogout && (
          <DropdownMenuItem disabled={busy} onSelect={onLogout} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
