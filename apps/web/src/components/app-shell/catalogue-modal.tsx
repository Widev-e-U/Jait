import { lazy, Suspense, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const CatalogueGraph = lazy(() => import('./catalogue-graph'))

/** Keep canvas dependencies out of initial render and closed avatar menus. */
export function CatalogueModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [ready, setReady] = useState(false)
  // Radix restores focus to the dropdown trigger after it closes. Mount the
  // dialog on the next frame so that restoration cannot steal the modal focus.
  useEffect(() => {
    if (!open) { setReady(false); return }
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [open])
  return <Dialog open={open && ready} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[90dvh] w-[96vw] max-w-6xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
      <DialogHeader className="shrink-0 pr-7">
        <DialogTitle>Catalogue</DialogTitle>
        <DialogDescription>Explore Jait’s pages, features, and tools. Select a node for details, or focus on a page.</DialogDescription>
      </DialogHeader>
      {open && ready && <Suspense fallback={<div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading catalogue…</div>}>
        <CatalogueGraph onOpenPage={() => onOpenChange(false)} />
      </Suspense>}
    </DialogContent>
  </Dialog>
}
