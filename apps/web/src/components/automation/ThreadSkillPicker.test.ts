import { describe, expect, it } from 'vitest'
import { shouldAutoLoadThreadSkills } from './thread-skill-picker-state'

describe('shouldAutoLoadThreadSkills', () => {
  it('loads the first time the picker opens with no skills cached', () => {
    expect(shouldAutoLoadThreadSkills({
      open: true,
      attemptedLoad: false,
      skillsLength: 0,
      loading: false,
    })).toBe(true)
  })

  it('does not retry automatically after a failed load', () => {
    expect(shouldAutoLoadThreadSkills({
      open: true,
      attemptedLoad: true,
      skillsLength: 0,
      loading: false,
    })).toBe(false)
  })

  it('does not auto-load while a request is already in flight', () => {
    expect(shouldAutoLoadThreadSkills({
      open: true,
      attemptedLoad: false,
      skillsLength: 0,
      loading: true,
    })).toBe(false)
  })
})
