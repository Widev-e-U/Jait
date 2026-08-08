import { cn } from '@/lib/utils'

interface KbdProps {
  /** Display tokens, e.g. `['⌘', '⇧', 'O']`. */
  keys: readonly string[]
  className?: string
  /** Rendered when `keys` is empty. */
  emptyLabel?: string
}

/** Renders a shortcut as a row of keycaps. */
export function Kbd({ keys, className, emptyLabel = 'Not set' }: KbdProps) {
  if (keys.length === 0) {
    return <span className={cn('text-xs text-muted-foreground', className)}>{emptyLabel}</span>
  }
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1.5 font-sans text-[0.6875rem] font-medium leading-none text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]"
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}
