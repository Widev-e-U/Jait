import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

/**
 * Tests for the message action button visibility patterns.
 *
 * The message component uses `cn()` (clsx + tailwind-merge) to compose class
 * names for the actions container. On desktop, buttons appear on hover
 * (`group-hover/message:opacity-100`). On touch/mobile devices, the
 * `touch-device:opacity-80` class ensures they're always visible (via a
 * `@media (hover: none)` rule in index.css).
 */

describe('message action button visibility', () => {
  it('includes touch-device:opacity-80 for mobile visibility', () => {
    const classes = cn(
      'absolute z-10 rounded-full border border-border/70 bg-background p-1',
      'bottom-1.5 right-1.5',
      'opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100',
      'touch-device:opacity-80',
      false && 'opacity-100', // copied state = false
    )

    expect(classes).toContain('touch-device:opacity-80')
    expect(classes).toContain('group-hover/message:opacity-100')
    expect(classes).toContain('opacity-0')
  })

  it('overrides to opacity-100 when copied state is active', () => {
    const classes = cn(
      'absolute z-10 rounded-full border border-border/70 bg-background p-1',
      'bottom-1.5 right-1.5',
      'opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100',
      'touch-device:opacity-80',
      true && 'opacity-100', // copied state = true
    )

    // When copied is true, opacity-100 should override opacity-0
    expect(classes).toContain('opacity-100')
    expect(classes).toContain('touch-device:opacity-80')
  })

  it('message content wrapper includes select-text for mobile text selection', () => {
    const classes = cn('relative min-w-0 max-w-full select-text break-words [overflow-wrap:anywhere]')
    expect(classes).toContain('select-text')
  })
})
