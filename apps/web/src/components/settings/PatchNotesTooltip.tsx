import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
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
}: {
  targetVersion: string
  notes: ReleaseNote[] | null | undefined
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  // Only show the hover card on devices that actually support hover. On touch
  // devices tapping the update button fires onMouseEnter/onFocus, which would
  // open this full-width bottom sheet and cover the button — making it
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

  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open])

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => canHover && setOpen(true)}
      onMouseLeave={() => canHover && setOpen(false)}
      onFocus={() => canHover && setOpen(true)}
      onBlur={() => canHover && setOpen(false)}
    >
      {children}
      {open && release && (
        <div
          className={`fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-50 max-h-[calc(100dvh-1rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-1rem)] ${
            align === 'right' ? 'sm:right-0' : 'sm:left-0'
          }`}
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
          <div className="max-h-64 overflow-y-auto px-3 py-2">
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
        </div>
      )}
    </div>
  )
}
