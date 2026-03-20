import type { NodeCapabilities, NodePlatform, NodeRegistrySnapshot, NodeRole, NodeState } from "@jait/shared";
import { NODE_PROTOCOL_VERSION } from "@jait/shared";

interface NodeRecord {
  state: NodeState;
  clientId: string;
  isGateway: boolean;
}

interface UpsertNodeInput {
  id: string;
  name: string;
  platform: NodePlatform;
  role: NodeRole;
  clientId: string;
  isGateway?: boolean;
  protocolVersion?: number;
  capabilities?: Partial<NodeCapabilities>;
}

function mergeCapabilities(capabilities?: Partial<NodeCapabilities>, previous?: NodeCapabilities): NodeCapabilities {
  return {
    providers: capabilities?.providers ?? previous?.providers ?? [],
    surfaces: capabilities?.surfaces ?? previous?.surfaces ?? [],
    tools: capabilities?.tools ?? previous?.tools ?? [],
    screenShare: capabilities?.screenShare ?? previous?.screenShare ?? false,
    voice: capabilities?.voice ?? previous?.voice ?? false,
    preview: capabilities?.preview ?? previous?.preview ?? false,
  };
}

export class NodeStateManager {
  private readonly records = new Map<string, NodeRecord>();

  upsertNode(input: UpsertNodeInput): NodeState {
    const now = new Date().toISOString();
    const existing = this.records.get(input.id);
    const state: NodeState = {
      id: input.id,
      name: input.name,
      platform: input.platform,
      role: input.role,
      lifecycle: "ready",
      protocolVersion: input.protocolVersion ?? existing?.state.protocolVersion ?? NODE_PROTOCOL_VERSION,
      capabilities: mergeCapabilities(input.capabilities, existing?.state.capabilities),
      connectedAt: existing?.state.connectedAt ?? now,
      lastSeenAt: now,
    };
    this.records.set(input.id, {
      state,
      clientId: input.clientId,
      isGateway: input.isGateway === true,
    });
    return state;
  }

  removeNode(id: string): NodeState | null {
    const existing = this.records.get(id);
    if (!existing) return null;
    this.records.delete(id);
    return { ...existing.state, lifecycle: "disconnected", lastSeenAt: new Date().toISOString() };
  }

  removeNodesByClientId(clientId: string): NodeState[] {
    const removed: NodeState[] = [];
    for (const [id, record] of this.records) {
      if (record.isGateway || record.clientId !== clientId) continue;
      this.records.delete(id);
      removed.push({
        ...record.state,
        lifecycle: "disconnected",
        lastSeenAt: new Date().toISOString(),
      });
    }
    return removed;
  }

  getNode(id: string): NodeState | null {
    return this.records.get(id)?.state ?? null;
  }

  listNodes(): NodeState[] {
    return [...this.records.values()]
      .map((record) => record.state)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getSnapshot(): NodeRegistrySnapshot {
    return {
      version: NODE_PROTOCOL_VERSION,
      serverTime: new Date().toISOString(),
      nodes: this.listNodes(),
    };
  }
}
