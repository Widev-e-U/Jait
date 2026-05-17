import { describe, expect, it } from 'vitest'
import { formatModelDisplayLabel } from './model-labels'

describe('model display labels', () => {
  it('formats reasoning effort suffixes consistently', () => {
    expect(formatModelDisplayLabel('gpt-5.5[medium]')).toBe('gpt-5.5 (medium)')
  })
})
