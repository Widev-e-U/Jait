import { describe, expect, it } from 'vitest'
import { Blocks, Bug, Search } from 'lucide-react'

import { getSkillVisual } from './skill-icons'

describe('getSkillVisual', () => {
  it('maps debugging skills to a bug icon', () => {
    const visual = getSkillVisual({
      id: 'debugging',
      name: 'Debugging',
      description: 'Trace failures and fix bugs',
      source: 'bundled',
    })

    expect(visual.icon).toBe(Bug)
    expect(visual.className).toContain('sky')
  })

  it('maps research skills to a search icon', () => {
    const visual = getSkillVisual({
      id: 'deep-research',
      name: 'Deep Research',
      description: 'Investigate and search across sources',
      source: 'plugin',
    })

    expect(visual.icon).toBe(Search)
    expect(visual.className).toContain('fuchsia')
  })

  it('falls back to a generic blocks icon when there is no keyword match', () => {
    const visual = getSkillVisual({
      id: 'custom-skill',
      name: 'Custom Skill',
      description: 'Tailored helper for bespoke tasks',
      source: 'user',
    })

    expect(visual.icon).toBe(Blocks)
    expect(visual.className).toContain('amber')
  })
})
