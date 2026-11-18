import type { NetworkResource } from '@jait/shared'

export const SANDBOX_GROUP_ID = 'group-jait-sandboxes'

/** Keep resources individually addressable while showing their ownership hierarchy. */
export function groupNetworkResources(resources: NetworkResource[], expanded: boolean): NetworkResource[] {
  const sandboxes = resources.filter(resource => resource.category === 'sandbox')
  if (sandboxes.length < 2) return resources
  const running = sandboxes.filter(resource => resource.online).length
  const group: NetworkResource = {
    id: SANDBOX_GROUP_ID, type: 'resource', kind: 'group', name: `Jait sandboxes · ${sandboxes.length}`,
    parentId: 'gateway', icon: 'jait', online: running > 0, status: `${running} running`,
    source: 'Local Docker inventory', observedAt: sandboxes[0]!.observedAt, addresses: [],
    facts: [{ label: 'Resources', value: String(sandboxes.length) }, { label: 'Running', value: String(running) }],
  }
  return [group, ...resources.flatMap(resource => resource.category === 'sandbox'
    ? (expanded ? [{ ...resource, parentId: group.id }] : [])
    : [resource])]
}
