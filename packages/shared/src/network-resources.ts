/** Extensible resource details shared by inventory adapters and the network UI. */
export interface NetworkResource {
  id: string
  type: 'resource'
  kind: 'container' | 'group'
  name: string
  parentId: string
  icon: 'docker' | 'jait' | 'nginx' | 'redis' | 'postgresql' | 'homeassistant'
  online: boolean
  status: string
  source: string
  observedAt: string
  addresses: string[]
  category?: 'sandbox' | 'application'
  facts: Array<{ label: string; value: string }>
}

export interface NetworkResourceInventory {
  status: 'available' | 'unavailable'
  resources: NetworkResource[]
  truncated?: boolean
}
