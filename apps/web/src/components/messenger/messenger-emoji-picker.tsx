import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { filterEmojiRows, type EmojiRow } from '@/lib/messenger/emoji-search'
import { cn } from '@/lib/utils'

/** WhatsApp Web shows a short hover row before letting you open the full picker. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

interface EmojiData { groups: string[]; emojis: EmojiRow[] }

let pending: Promise<EmojiData> | null = null

/** Big payload, so only fetch it once the picker is actually opened. */
export function loadEmojiData(): Promise<EmojiData> {
  pending ??= import('@/lib/messenger/emoji-data.json')
    .then(module => module.default as unknown as EmojiData)
    .catch(() => ({ groups: [], emojis: [] }))
  return pending
}

/**
 * The picker body. The reaction dialog and the composer's anchored popover
 * share it so both offer the same quick row, search and grouped grid — the
 * same way WhatsApp reuses one emoji panel for reactions and for the input.
 * Mounted only while open, so it always starts on a fresh search.
 */
export function EmojiPickerPanel({
  onSelect, actionLabel = 'React with', className,
}: {
  onSelect: (emoji: string) => void
  /** Leading words for the quick-row accessible labels. */
  actionLabel?: string
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [data, setData] = useState<EmojiData>({ groups: [], emojis: [] })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadEmojiData().then(next => { if (!cancelled) { setData(next); setLoaded(true) } })
    return () => { cancelled = true }
  }, [])

  const needle = query.trim().toLowerCase()
  const rows = useMemo(() => filterEmojiRows(data.emojis, query), [data, query])

  const grouped = useMemo(() => {
    const out: { name: string; items: EmojiRow[] }[] = []
    for (const row of rows) {
      const name = data.groups[row[2]] ?? 'Other'
      const last = out.at(-1)
      if (last?.name === name) last.items.push(row)
      else out.push({ name, items: [row] })
    }
    return out
  }, [data, rows])

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      {!needle && (
        <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
          {QUICK_REACTIONS.map(emoji => (
            <Button
              key={emoji} type="button" variant="ghost" size="icon"
              aria-label={actionLabel + ' ' + emoji} title={actionLabel + ' ' + emoji}
              className="h-8 w-8 rounded-full text-lg leading-none"
              onClick={() => onSelect(emoji)}
            >
              <span aria-hidden>{emoji}</span>
            </Button>
          ))}
        </div>
      )}
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Search emoji" aria-label="Search emoji" className="h-9 pl-8"
        />
      </div>
      <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
        {!loaded || (!data.emojis.length && !needle) ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading emojis…</p>
        ) : !rows.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No emoji matches “{query.trim()}”.</p>
        ) : (
          <div className="space-y-3 pb-1">
            {grouped.map(group => (
              <div key={group.name}>
                <p className="sticky top-0 z-10 bg-background/95 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                  {group.name}
                </p>
                <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-9">
                  {group.items.map(row => (
                    <Button
                      key={`${row[0]}-${row[1]}`} type="button" variant="ghost" size="icon"
                      aria-label={row[1]} title={row[1]}
                      className="h-8 w-8 text-lg leading-none"
                      onClick={() => onSelect(row[0])}
                    >
                      <span aria-hidden>{row[0]}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

export function EmojiPickerDialog({
  open, onOpenChange, onSelect, title = 'Pick a reaction',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (emoji: string) => void
  title?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(32rem,85dvh)] w-[min(26rem,calc(100vw-2rem))] flex-col gap-3 p-4 sm:p-5">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            Type to search emojis by name.
          </DialogDescription>
        </DialogHeader>
        <EmojiPickerPanel
          className="min-h-0 flex-1"
          onSelect={emoji => { onSelect(emoji); onOpenChange(false) }}
        />
      </DialogContent>
    </Dialog>
  )
}
