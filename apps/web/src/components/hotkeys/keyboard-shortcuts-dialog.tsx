import { Keyboard, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import {
  HOTKEY_CATEGORIES,
  formatChordParts,
  getCommandsByCategory,
  type HotkeyBindings,
} from '@/lib/hotkeys'

interface KeyboardShortcutsDialogProps {
  open: boolean
  bindings: HotkeyBindings
  isMac: boolean
  onOpenChange: (open: boolean) => void
  /** Shown as a "Customize" action when the settings command is wired up. */
  onCustomize?: () => void
}

/** The app-wide shortcut cheat sheet, opened with the `app.shortcuts` command. */
export function KeyboardShortcutsDialog({ open, bindings, isMac, onOpenChange, onCustomize }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(46rem,calc(100vw-2rem))] max-w-none overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-4 w-4" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Every shortcut can be rebound in Settings → Shortcuts.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto px-6 py-4">
          {HOTKEY_CATEGORIES.map((category) => {
            const commands = getCommandsByCategory(category.id).filter((command) => bindings[command.id])
            if (commands.length === 0) return null
            return (
              <section key={category.id} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {category.label}
                </h3>
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {commands.map((command) => (
                    <li key={command.id} className="flex items-center justify-between gap-4 px-3 py-2">
                      <span className="min-w-0 truncate text-sm">{command.label}</span>
                      <Kbd keys={formatChordParts(bindings[command.id], isMac)} />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>

        {onCustomize && (
          <div className="flex justify-end border-t border-border px-6 py-3">
            <Button variant="outline" size="sm" onClick={onCustomize}>
              <Settings className="mr-2 h-4 w-4" />
              Customize
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
