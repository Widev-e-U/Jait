import { describe, expect, it } from 'vitest'
import { layoutAgentGraph } from './agent-graph-layout'

const team = [
  { id: 'lead' }, { id: 'research', reportsToId: 'lead' }, { id: 'design', reportsToId: 'lead' },
  { id: 'ops', reportsToId: 'research' }, { id: 'support', reportsToId: 'design' },
]
const card = { cardWidth: 128, cardHeight: 132, anchorY: 28 }

describe('agent graph layout', () => {
  for (const [width, height] of [[390, 760], [1440, 800], [1020, 640]]) {
    it(`keeps a reporting tree readable with margins at ${width}x${height}`, () => {
      const points = layoutAgentGraph(team, { width, height, ...card })
      const byId = new Map(points.map(point => [point.id, point]))
      for (const member of team) {
        const point = byId.get(member.id)!
        expect(point.x - card.cardWidth / 2).toBeGreaterThanOrEqual(24)
        expect(width - point.x - card.cardWidth / 2).toBeGreaterThanOrEqual(24)
        expect(point.y - card.anchorY).toBeGreaterThanOrEqual(24)
        expect(height - point.y - card.cardHeight + card.anchorY).toBeGreaterThanOrEqual(24)
        if (member.reportsToId) expect(point.y).toBeGreaterThan(byId.get(member.reportsToId)!.y)
      }
      expect(byId.get('lead')!.x).toBe(width / 2)
      expect(byId.get('ops')!.x).toBe(byId.get('research')!.x)
      expect(byId.get('support')!.x).toBe(byId.get('design')!.x)
      for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) {
        expect(Math.abs(points[a].x - points[b].x) >= card.cardWidth + 16
          || Math.abs(points[a].y - points[b].y) >= card.cardHeight + 16).toBe(true)
      }
    })
  }
  it('preserves positions when polling changes profile order', () => {
    const area = { width: 1280, height: 800, ...card }
    expect(layoutAgentGraph([...team].reverse(), area)).toEqual(layoutAgentGraph(team, area))
  })
  it('wraps a wide team into separated rows below its manager', () => {
    const members = [{ id: 'lead' }, ...Array.from({ length: 7 }, (_, index) => ({ id: String(index), reportsToId: 'lead' }))]
    const points = layoutAgentGraph(members, { width: 1000, height: 720, ...card })
    expect(points).toHaveLength(8)
    const lead = points.find(point => point.id === 'lead')!
    for (const point of points.filter(point => point !== lead)) expect(point.y).toBeGreaterThan(lead.y)
    for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) {
      expect(Math.abs(points[a].x - points[b].x) >= card.cardWidth + 16
        || Math.abs(points[a].y - points[b].y) >= card.cardHeight + 16).toBe(true)
    }
  })
  it('handles missing managers, self references, and cycles without dropping people', () => {
    const members = [
      { id: 'orphan', reportsToId: 'missing' }, { id: 'self', reportsToId: 'self' },
      { id: 'a', reportsToId: 'b' }, { id: 'b', reportsToId: 'a' },
    ]
    const points = layoutAgentGraph(members, { width: 1000, height: 800, ...card })
    expect(new Set(points.map(point => point.id))).toEqual(new Set(members.map(member => member.id)))
    expect(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })
  it('centres a single agent and accepts an empty team', () => {
    const area = { width: 1000, height: 800, ...card }
    expect(layoutAgentGraph([], area)).toEqual([])
    expect(layoutAgentGraph([{ id: 'lead' }], area)).toEqual([{ id: 'lead', x: 500, y: (800 - card.cardHeight) / 2 + card.anchorY }])
  })
})
