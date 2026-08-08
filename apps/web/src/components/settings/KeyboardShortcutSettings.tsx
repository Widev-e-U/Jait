import { useMemo } from 'react'
import { AlertTriangle, Keyboard, RotateCcw, X } from 'lucide-react'

import { ShortcutRecorder, useHotkeys } from '@/components/hotkeys'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DEFAULT_HOTKEY_BINDINGS,
  HOTKEY_CATEGORIES,
  commandMatchesQuery,
  formatChord,
  getCommandsByCategory,
  getHotkeyCommand,
  type HotkeyCommand,
  type HotkeyCommandId,
} from '@/lib/hotkeys'

interface KeyboardShortcutSettingsProps {
  /** Shared settings search box — filters the shortcut list too. */
  search?: string
}

/** Settings → Shortcuts: rebind, unbind or reset every hotkey in the web UI. */
export function KeyboardShortcutSettings({ search = '' }: KeyboardShortcutSettingsProps) {
  const { bindings, overrides, conflicts, isMac, setBinding, resetBinding, resetAllBindings } = useHotkeys()

  const groups = useMemo(() => HOTKEY_CATEGORIES
    .map((category) => ({
      category,
      commands: getCommandsByCategory(category.id).filter((command) => commandMatchesQuery(command, search)),
    }))
    .filter((group) => group.commands.length > 0), [search])

  const customizedCount = Object.keys(overrides).length

  const conflictPartners = (command: HotkeyCommand): HotkeyCommandId[] => {
    const chord = bindings[command.id]
    if (!chord) return []
    return (conflicts.get(chord) ?? []).filter((id) => id !== command.id)
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-medium">
            <Keyboard className="h-4 w-4" />
            Keyboard shortcuts
          </h2>
          <p className="text-sm text-muted-foreground">
            Click a shortcut and press the keys you want. Escape cancels, Backspace clears.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={customizedCount === 0}
          onClick={resetAllBindings}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset all{customizedCount > 0 ? ` (${customizedCount})` : ''}
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shortcuts match your search.</p>
      ) : groups.map(({ category, commands }) => (
        <section key={category.id} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {category.label}
          </h3>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {commands.map((command) => {
              const id = command.id
              const chord = bindings[id]
              const isCustom = id in overrides
              const partners = conflictPartners(command)
              return (
                <li key={id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">{command.label}</span>
                      {isCustom && <Badge variant="secondary" className="text-[0.625rem]">Custom</Badge>}
                      {partners.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="destructive" className="gap-1 text-[0.625rem]">
                              <AlertTriangle className="h-3 w-3" />
                              Conflict
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Also bound to {partners.map((partner) => getHotkeyCommand(partner)?.label ?? partner).join(', ')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{command.description}</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <ShortcutRecorder
                      value={chord}
                      ariaLabel={`Change shortcut for ${command.label}`}
                      onChange={(next) => setBinding(id, next)}
                      onClear={() => setBinding(id, null)}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={!chord}
                          aria-label={`Unbind ${command.label}`}
                          onClick={() => setBinding(id, null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Unbind</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={!isCustom}
                          aria-label={`Reset shortcut for ${command.label}`}
                          onClick={() => resetBinding(id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Reset to {formatChord(DEFAULT_HOTKEY_BINDINGS[id], isMac) || 'unbound'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </Card>
  )
}
