import { describe, expect, it } from 'vitest'

import { buttonVariants } from './button'

describe('buttonVariants', () => {
  it('uses mobile-friendly base sizes before desktop breakpoints', () => {
    expect(buttonVariants({ size: 'default' })).toContain('h-11')
    expect(buttonVariants({ size: 'sm' })).toContain('h-10')
    expect(buttonVariants({ size: 'lg' })).toContain('h-11')
    expect(buttonVariants({ size: 'icon' })).toContain('h-11')
    expect(buttonVariants({ size: 'icon' })).toContain('w-11')
  })

  it('keeps compact desktop sizes at sm and wider breakpoints', () => {
    expect(buttonVariants({ size: 'default' })).toContain('sm:h-9')
    expect(buttonVariants({ size: 'sm' })).toContain('sm:h-8')
    expect(buttonVariants({ size: 'lg' })).toContain('sm:h-10')
    expect(buttonVariants({ size: 'icon' })).toContain('sm:h-9')
    expect(buttonVariants({ size: 'icon' })).toContain('sm:w-9')
  })

  it('marks buttons for responsive touch handling', () => {
    expect(buttonVariants()).toContain('touch-manipulation')
  })
})
