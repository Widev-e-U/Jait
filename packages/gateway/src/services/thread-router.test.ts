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


  it('does not auto-activate weak one-word skill matches', () => {
    const skills = [
      { id: 'openhue', name: 'openhue', description: 'Control Philips Hue lights and scenes via the OpenHue CLI.' },
      { id: 'eightctl', name: 'eightctl', description: 'Control Eight Sleep pods status, temperature, alarms, schedules.' },
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
    ]

    expect(matchSkills('implement keyboard controls for every button in my app', skills)).toEqual([])
  })

  it('caps automatic skill matches while preserving explicit invocations', () => {
    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, broken failures, and unexpected behavior.' },
      { id: 'review', name: 'Code Review', description: 'Review code quality, errors, bugs, and maintainability.' },
      { id: 'security', name: 'Security Audit', description: 'Audit code for security errors, bugs, auth, and vulnerabilities.' },
      { id: 'deep-research', name: 'Deep Research', description: 'Compare options and synthesize findings.' },
    ]

    const matched = matchSkills('/deep-research review this broken security auth error for bugs', skills)
    expect(matched[0]).toBe('deep-research')
    expect(matched).toHaveLength(3)
    expect(matched.slice(1)).toEqual(['review', 'security'])
  })

  it('matches the named skill when the prompt references it directly', () => {
    const skills = [
      { id: 'debugging', name: 'Debugging', description: 'Diagnose crashes, errors, and broken behavior.' },
      { id: 'research', name: 'Deep Research', description: 'Compare options, read docs, and synthesize findings.' },
    ]

    expect(matchSkills('Use the Debugging skill to inspect this error', skills)).toContain('debugging')
  })
})
