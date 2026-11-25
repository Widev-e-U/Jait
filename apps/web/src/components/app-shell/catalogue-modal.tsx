import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Loader2, Maximize, Minimize, Network, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const CatalogueGraph = lazy(() => import('./catalogue-graph'))

export function useCatalogueDialog() {
  const [open, setOpen] = useState(false)
  const openAfterMenu = useRef(false)
  return {
    open,
    setOpen,
    selectFromMenu: () => { openAfterMenu.current = true },
    onMenuCloseAutoFocus: () => {
      if (!openAfterMenu.current) return
      openAfterMenu.current = false
      setOpen(true)
    },
  }
}

export function CatalogueLauncher({ compact, onClick }: { compact?: boolean; onClick: () => void }) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button type="button" variant="ghost" size={compact ? 'icon' : 'sm'} aria-label="Open catalogue"
        className={compact ? 'h-9 w-9 shrink-0 text-muted-foreground' : 'h-9 w-full justify-start gap-3 px-3 text-muted-foreground'}
        onClick={onClick}>
        <Network aria-hidden="true" />{!compact && 'Catalogue'}
      </Button>
    </TooltipTrigger>
    {compact && <TooltipContent>Catalogue</TooltipContent>}
  </Tooltip>
}

/** Keep canvas dependencies out of the initial app render. */
export function CatalogueModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [ready, setReady] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const openerRef = useRef<HTMLElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Capture the active trigger after the account menu hands back focus.
  useEffect(() => {
    if (!open) {
      setReady(false)
      setFullscreen(false)
      return
    }
    const frame = requestAnimationFrame(() => {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setReady(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  const fullscreenLabel = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
  return <Dialog open={open && ready} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false}
      className={cn('flex max-w-none flex-col gap-3 overflow-hidden p-3 motion-reduce:animate-none sm:p-5',
        fullscreen ? 'h-dvh w-dvw rounded-none border-0 sm:rounded-none' : 'h-[94dvh] w-[96vw] rounded-xl sm:h-[90dvh] sm:max-w-6xl')}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        titleRef.current?.focus()
      }}
      onCloseAutoFocus={(event) => {
        if (openerRef.current?.isConnected) {
          event.preventDefault()
          openerRef.current.focus()
        }
      }}
      onEscapeKeyDown={(event) => {
        if (fullscreen) {
          event.preventDefault()
          setFullscreen(false)
        }
      }}>
      <header className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">Catalogue</DialogTitle>
          <DialogDescription>Explore Jait’s pages, features, tools, and installed skills.</DialogDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={fullscreenLabel} onClick={() => setFullscreen(!fullscreen)}>
                {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{fullscreenLabel}</TooltipContent>
          </Tooltip>
          <DialogClose asChild><Button type="button" variant="ghost" size="icon" aria-label="Close catalogue"><X aria-hidden="true" /></Button></DialogClose>
        </div>
      </header>
      {open && ready && <Suspense fallback={<div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />Loading catalogue…
      </div>}>
        <CatalogueGraph onNavigate={() => onOpenChange(false)} />
      </Suspense>}
    </DialogContent>
  </Dialog>
}
