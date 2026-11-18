import { describe, expect, it } from 'vitest'
import type { NetworkResource } from '@jait/shared'
import { groupNetworkResources, SANDBOX_GROUP_ID } from './network-resources'

const resource = (id: string, category: NetworkResource['category'] = 'sandbox'): NetworkResource => ({
  id, type: 'resource', kind: 'container', name: id, parentId: 'gateway', icon: 'docker', online: true,
  status: 'running', source: 'Docker', observedAt: 'now', addresses: [], facts: [], category,
})
describe('network resource grouping', () => {
  it('collapses sandboxes while preserving applications and resource counts', () => {
    const result = groupNetworkResources([resource('a'), resource('b'), resource('app', 'application')], false)
    expect(result.map(node => node.id)).toEqual([SANDBOX_GROUP_ID, 'app'])
    expect(result[0]).toMatchObject({ name: 'Jait sandboxes · 2', status: '2 running', kind: 'group' })
  })
  it('expands stable identities under their group without changing inventory', () => {
    const inventory = [resource('a'), resource('b')]
    const result = groupNetworkResources(inventory, true)
    expect(result.map(node => node.id)).toEqual([SANDBOX_GROUP_ID, 'a', 'b'])
    expect(result[1]?.parentId).toBe(SANDBOX_GROUP_ID)
    expect(inventory[0]?.parentId).toBe('gateway')
  })
  it('keeps single sandboxes visible and shows stopped groups truthfully', () => {
    expect(groupNetworkResources([resource('a')], false)).toHaveLength(1)
    const result = groupNetworkResources([{ ...resource('a'), online: false }, { ...resource('b'), online: false }], false)
    expect(result[0]).toMatchObject({ online: false, status: '0 running' })
  })
})
