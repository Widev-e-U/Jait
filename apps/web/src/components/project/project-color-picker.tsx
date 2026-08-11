/**
 * Colour picker for chat folders — the nine palette defaults plus a free
 * `#rrggbb` choice via the native colour input.
 */
import { Check, Pipette, Ban } from 'lucide-react'
import { PROJECT_COLORS, resolveProjectColor } from '@jait/shared'
import { cn } from '@/lib/utils'

interface ProjectColorPickerProps {
  value: string | null
  onChange: (color: string | null) => void
  className?: string
}

export function ProjectColorPicker({ value, onChange, className }: ProjectColorPickerProps) {
  const resolved = resolveProjectColor(value)
  const isCustom = Boolean(resolved) && !PROJECT_COLORS.some((c) => c.token === value)

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="group" aria-label="Folder colour">
      <button
        type="button"
        aria-label="No colour"
        aria-pressed={!resolved}
        title="No colour"
        onClick={() => onChange(null)}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full border transition-transform',
          'hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          !resolved ? 'border-foreground' : 'border-border',
        )}
      >
        <Ban className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {PROJECT_COLORS.map((color) => {
        const selected = value === color.token
        return (
          <button
            key={color.token}
            type="button"
            aria-label={color.label}
            aria-pressed={selected}
            title={color.label}
            onClick={() => onChange(color.token)}
            style={{ backgroundColor: color.value }}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full transition-transform',
              'hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
            )}
          >
            {selected && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
          </button>
        )
      })}

      {/* Native picker: the label is the visible control, the input stays
          off-screen so the swatch matches the palette buttons. */}
      <label
        title="Custom colour"
        className={cn(
          'relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border transition-transform hover:scale-110',
          isCustom ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'border-border',
        )}
        style={isCustom && resolved ? { backgroundColor: resolved } : undefined}
      >
        <Pipette className={cn('h-3.5 w-3.5', isCustom ? 'text-white drop-shadow' : 'text-muted-foreground')} />
        <input
          type="color"
          aria-label="Custom colour"
          value={resolved ?? '#3b82f6'}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}

/** Small round colour dot used in the sidebar rows. */
export function ProjectColorDot({ color, className }: { color: string | null; className?: string }) {
  const resolved = resolveProjectColor(color)
  if (!resolved) return null
  return (
    <span
      aria-hidden="true"
      className={cn('h-2 w-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: resolved }}
    />
  )
}
