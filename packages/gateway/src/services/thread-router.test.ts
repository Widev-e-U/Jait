import { describe, expect, it } from 'vitest'

import { matchSkills } from './thread-router.js'

describe('matchSkills', () => {
  it('returns an empty list for unrelated prompts', () => {
    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
      { id: 'research', name: 'Deep Research', description: 'Compare options, read docs, and synthesize findings.' },
    ]

    expect(matchSkills('test todo tool for me', skills)).toEqual([])
  })

  it('matches the named skill when the prompt references it directly', () => {
    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
      { id: 'research', name: 'Deep Research', description: 'Compare options, read docs, and synthesize findings.' },
    ]

    expect(matchSkills('Use the Debugging skill to inspect this error', skills)).toContain('debugging')
  })
})
