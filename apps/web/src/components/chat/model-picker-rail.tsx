import { useCallback } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Vertical jump rail for the model picker: one square tile per section
 * (Favorites + one per provider instance). Clicking a tile scrolls the
 * virtualized list to that section's start index. Hidden on mobile.
 */
export type ModelPickerRailSection = {
  key: string
  /** Absolute row index of the section header in the flattened row list. */
  startIndex: number
  label: string
  kind: 'favorites' | 'instance'
}

type ModelPickerRailProps = {
  sections: ModelPickerRailSection[]
  /** Absolute row index of the currently active (selected) model row, if any. */
  activeRowIndex: number | null
  onJump: (startIndex: number) => void
  className?: string
}

export function ModelPickerRail({ sections, activeRowIndex, onJump, className }: ModelPickerRailProps) {
  const scrollToSection = useCallback(
    (section: ModelPickerRailSection) => onJump(section.startIndex),
    [onJump],
  )

  if (sections.length === 0) return null

  return (
    <div
      className={cn(
        'flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-l bg-muted/30 p-1 py-2',
        className,
      )}
      aria-hidden="true"
    >
      {sections.map((section) => {
        const active =
          activeRowIndex !== null && activeRowIndex >= section.startIndex && (sections[sections.findIndex((s) => s.key === section.key) + 1]?.startIndex ?? Number.POSITIVE_INFINITY) > activeRowIndex
        return (
          <button
            key={section.key}
            type="button"
            tabIndex={-1}
            title={section.label}
            aria-label={section.label}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              scrollToSection(section)
            }}
            className={cn(
              'group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            )}
          >
            {section.kind === 'favorites'
              ? <Star className="h-4 w-4" aria-hidden="true" />
              : (
                <span className="flex h-5 w-5 items-center justify-center text-[10px] font-semibold uppercase leading-none">
                  {section.label.slice(0, 2)}
                </span>
              )}
            {active && (
              <span className="absolute right-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" aria-hidden="true" />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function railSectionAtRow(sections: ModelPickerRailSection[], rowIndex: number): ModelPickerRailSection | null {
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    if (rowIndex >= sections[i]!.startIndex) return sections[i]!
  }
  return null
}