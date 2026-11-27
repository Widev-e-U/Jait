import { and, eq, isNull } from "drizzle-orm";
import { uuidv7 } from "../db/uuidv7.js";
import { consentLog, nodePermissions, nodes } from "../db/schema.js";
import type { JaitDB } from "../db/connection.js";
import { deviceNameKey, type NodeCapability, type NodeHelloPayload } from "@jait/shared";

export const NODE_CAPABILITIES: readonly NodeCapability[] = [
  "terminal",
  "filesystem",
  "screen",
  "input",
  "voice",
  "browser",
  "camera",
  "network",
  "agent",
  "update",
];

export function isNodeCapability(value: unknown): value is NodeCapability {
  return typeof value === "string" && (NODE_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * NodePermissionsService — gateway-side source of truth for which nodes are
 * allowed to perform which sensitive capabilities.
 *
 * Policy is DENY-ALL by default: a node has no rows in `node_permissions`
 * until the user explicitly grants them, so an unconfigured node can execute
 * nothing sensitive.
 */
export class NodePermissionsService {
  constructor(private db: JaitDB | null) {}

  private memoryNames = new Map<string, { userId: string | null; name: string }>();

  /** Reserve a name and persist the node identity before exposing it to clients. */
  ensureNodeSeen(
    hello: Pick<NodeHelloPayload, "id" | "name" | "platform" | "role">,
    userId: string | null = null,
    now = new Date().toISOString(),
  ): "DEVICE_NAME_TAKEN" | "DEVICE_REGISTRATION_FAILED" | null {
    const { id: nodeId, name, platform, role } = hello;
    const key = deviceNameKey(name);
    if (!this.db) {
      for (const [id, entry] of this.memoryNames) {
        if (id !== nodeId && entry.userId === userId && deviceNameKey(entry.name) === key) return "DEVICE_NAME_TAKEN";
      }
      this.memoryNames.set(nodeId, { userId, name });
      return null;
    }

    try {
      return this.db.transaction((tx) => {
        const existing = tx.select().from(nodes).where(eq(nodes.nodeId, nodeId)).get();
        if (existing?.userId && existing.userId !== userId) return "DEVICE_REGISTRATION_FAILED";
        const ownedNodes = tx.select({ nodeId: nodes.nodeId, name: nodes.name }).from(nodes)
          .where(userId === null ? isNull(nodes.userId) : eq(nodes.userId, userId)).all();
        if (ownedNodes.some(node => node.nodeId !== nodeId && node.name && deviceNameKey(node.name) === key)) {
          return "DEVICE_NAME_TAKEN";
        }
        if (existing) {
          tx.update(nodes).set({ userId, name, platform, role, lastSeenAt: now, updatedAt: now })
            .where(eq(nodes.nodeId, nodeId)).run();
        } else {
          tx.insert(nodes).values({
            nodeId, userId, name, platform, role: role ?? "remote",
            firstSeenAt: now, lastSeenAt: now, createdAt: now, updatedAt: now,
          }).run();
          tx.insert(nodePermissions).values(NODE_CAPABILITIES.map(capability => ({
            nodeId, capability, granted: 0, updatedAt: now,
          }))).onConflictDoNothing().run();
        }
        return null;
      });
    } catch {
      return "DEVICE_REGISTRATION_FAILED";
    }
  }

  /** Look up whether a node currently holds a grant for `capability`. */
  isGranted(nodeId: string, capability: NodeCapability): boolean {
    if (!this.db) return false;
    try {
      const rows = this.db
        .select({ granted: nodePermissions.granted })
        .from(nodePermissions)
        .where(
          and(
            eq(nodePermissions.nodeId, nodeId),
            eq(nodePermissions.capability, capability),
          ),
        )
        .all();
      // No row (or 0) => denied. Only an explicit 1 grants the capability.
      return rows.length > 0 && rows[0]?.granted === 1;
    } catch {
      return false;
    }
  }

  /** All capability grants for a single node, keyed by capability. */
  getPermissions(nodeId: string): Partial<Record<NodeCapability, boolean>> {
    const out: Partial<Record<NodeCapability, boolean>> = {};
    for (const capability of NODE_CAPABILITIES) {
      out[capability] = this.isGranted(nodeId, capability);
    }
    return out;
  }

  /** All nodes persisted in the DB along with their capability grants. */
  listNodePermissions(): Array<{
    nodeId: string;
    name: string | null;
    platform: string | null;
    role: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    permissions: Partial<Record<NodeCapability, boolean>>;
  }> {
    if (!this.db) return [];
    try {
      const rows = this.db
        .select({
          nodeId: nodes.nodeId,
          name: nodes.name,
          platform: nodes.platform,
          role: nodes.role,
          firstSeenAt: nodes.firstSeenAt,
          lastSeenAt: nodes.lastSeenAt,
        })
        .from(nodes)
        .all();
      return rows.map((row) => ({
        nodeId: row.nodeId,
        name: row.name,
        platform: row.platform,
        role: row.role,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        permissions: this.getPermissions(row.nodeId),
      }));
    } catch {
      return [];
    }
  }

  /** Forget an offline node and revoke its stored grants. */
  forgetNode(nodeId: string): boolean {
    if (!this.db) return false;
    return this.db.transaction((tx) => {
      const existing = tx.select({ nodeId: nodes.nodeId }).from(nodes).where(eq(nodes.nodeId, nodeId)).get();
      if (!existing) return false;
      tx.delete(nodePermissions).where(eq(nodePermissions.nodeId, nodeId)).run();
      tx.delete(nodes).where(eq(nodes.nodeId, nodeId)).run();
      return true;
    });
  }

  /** Update a node's capability grants (toggle). Returns the updated grant map. */
  updatePermissions(
    nodeId: string,
    grants: Partial<Record<NodeCapability, boolean>>,
    now = new Date().toISOString(),
  ): Partial<Record<NodeCapability, boolean>> {
    if (!this.db) return this.getPermissions(nodeId);
    for (const [capability, granted] of Object.entries(grants)) {
      if (!isNodeCapability(capability)) continue;
      const value = granted ? 1 : 0;
      try {
        this.db
          .insert(nodePermissions)
          .values({
            nodeId,
            capability,
            granted: value,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [nodePermissions.nodeId, nodePermissions.capability],
            set: {
              granted: value,
              updatedAt: now,
            },
          })
          .run();
      } catch {
        // Non-fatal: keep prior state on write failure.
      }
    }
    return this.getPermissions(nodeId);
  }

  /** Persist an audit record for a permission_denied enforcement rejection. */
  logDenied(nodeId: string, capability: NodeCapability, detail: string): void {
    if (!this.db) return;
    try {
      this.db
        .insert(consentLog)
        .values({
          id: uuidv7(),
          actionId: `node-permission:${nodeId}:${capability}`,
          toolName: `node.${capability}`,
          decision: "rejected",
          decidedAt: new Date().toISOString(),
          decidedVia: "auto", // automatic route-boundary enforcement
        })
        .run();
    } catch {
      // Audit log is best-effort; enforcement result is what matters.
    }
    // Surface to logs even without a DB.
    // eslint-disable-next-line no-console
    console.warn(`[node-permissions] ${detail}`);
  }
}
