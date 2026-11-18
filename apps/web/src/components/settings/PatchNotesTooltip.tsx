import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import type { ReleaseNote } from './SettingsPage'

/**
 * Hover panel that shows the patch notes for a target release. The shared
 * `Tooltip` primitive renders no content in this shell, so the update button
 * gets its own lightweight hover card so users can see what a version changes
 * before committing to the update.
 */
export function PatchNotesTooltip({
  targetVersion,
  notes,
  children,
  align = 'right',
  side = 'bottom',
}: {
  targetVersion: string
  notes: ReleaseNote[] | null | undefined
  children: React.ReactNode
  align?: 'left' | 'right'
  side?: 'bottom' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Only show the hover card on devices that actually support hover. On touch
  // devices tapping the update button fires onMouseEnter/onFocus, which would
  // open the release card and cover the button — making it
  // impossible to click or read. So we gate the tooltip behind hover support.
  const [canHover, setCanHover] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    setCanHover(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setCanHover(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const release = notes?.find((n) => n.version === targetVersion)

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }
  const show = () => {
    cancelClose()
    if (canHover) setOpen(true)
  }
  // Allow crossing the gap between the button and the portaled card.
  const scheduleClose = () => {
    cancelClose()
    closeTimerRef.current = setTimeout(() => setOpen(false), 150)
  }
  const handleBlur = (event: React.FocusEvent) => {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && (wrapperRef.current?.contains(nextTarget) || contentRef.current?.contains(nextTarget))) return
    scheduleClose()
  }

  useEffect(() => () => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current)
  }, [])

  return (
    <Popover open={open && canHover && Boolean(release)} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          ref={wrapperRef}
          className="relative inline-flex"
          onMouseEnter={show}
          onMouseLeave={scheduleClose}
          onFocus={show}
          onBlur={handleBlur}
        >
          {children}
        </div>
      </PopoverAnchor>
      {release && (
        <PopoverContent
          ref={contentRef}
          side={side}
          align={side === 'right' || align === 'right' ? 'end' : 'start'}
          sideOffset={side === 'right' ? 16 : 8}
          collisionPadding={8}
          aria-label={`What's new in v${release.version}`}
          className="flex max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-lg p-0 shadow-lg"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onMouseEnter={show}
          onMouseLeave={scheduleClose}
          onFocus={show}
          onBlur={handleBlur}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="text-xs font-semibold">What&apos;s new in v{release.version}</span>
            {release.url && (
              <a
                href={release.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                GitHub
              </a>
            )}
          </div>
          <div className="min-h-0 max-h-64 overflow-y-auto px-3 py-2">
            {release.commits.length > 0 ? (
              <ul className="space-y-1.5">
                {release.commits.map((commit) => (
                  <li key={commit.sha || commit.message} className="flex items-start gap-1.5 text-xs leading-relaxed">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span className="[overflow-wrap:anywhere]">{commit.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No change details available for this release.</p>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  )
}
