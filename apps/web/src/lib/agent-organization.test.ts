import { describe, expect, it } from 'vitest'
import { teamMembers } from './agent-organization'

describe('teamMembers', () => {
  it('includes nested reports in any order and excludes other teams', () => {
    const agents = [
      { id: 'junior', reportsToId: 'senior' },
      { id: 'other', reportsToId: null },
      { id: 'senior', reportsToId: 'lead' },
      { id: 'lead', reportsToId: null },
    ]
    expect(teamMembers('lead', agents).map(agent => agent.id)).toEqual(['junior', 'senior', 'lead'])
    expect(teamMembers('missing', agents)).toEqual([])
  })

  it('terminates with malformed cyclic relationships', () => {
    const agents = [{ id: 'lead', reportsToId: 'report' }, { id: 'report', reportsToId: 'lead' }]
    expect(teamMembers('lead', agents)).toEqual(agents)
  })
})
