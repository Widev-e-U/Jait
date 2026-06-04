import { describe, expect, it } from 'vitest'

import { matchSkills, matchExplicitSkillInvocations } from './thread-router.js'

describe('matchSkills', () => {
  it('returns an empty list for unrelated prompts', () => {
    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
      { id: 'research', name: 'Deep Research', description: 'Compare options, read docs, and synthesize findings.' },
    ]

    expect(matchSkills('test todo tool for me', skills)).toEqual([])
  })

  it('forces an explicit `/skill-id` invocation to the front', () => {
    const skills = [
      { id: 'deep-research', name: 'Deep Research', description: 'Compare options and synthesize findings.' },
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
    ]

    const matched = matchSkills('/deep-research find me the best option', skills)
    expect(matched[0]).toBe('deep-research')
  })

  it('does not treat file paths as slash invocations', () => {
    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes.' },
    ]
    expect(matchExplicitSkillInvocations('look at src/debugging/index.ts', skills)).toEqual([])
  })

  it('matches an explicit invocation by name slug', () => {
    const skills = [
      { id: 'deep-research', name: 'Deep Research', description: 'Compare options.' },
    ]
    expect(matchExplicitSkillInvocations('/deep-research please', skills)).toEqual(['deep-research'])
  })

  it('matches the named skill when the prompt references it directly', () => {
    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
      { id: 'research', name: 'Deep Research', description: 'Compare options, read docs, and synthesize findings.' },
    ]

    expect(matchSkills('Use the Debugging skill to inspect this error', skills)).toContain('debugging')
  })
})
