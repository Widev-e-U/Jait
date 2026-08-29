import { and, eq } from "drizzle-orm";
import { uuidv7 } from "../db/uuidv7.js";
import { consentLog, nodePermissions, nodes } from "../db/schema.js";
import type { JaitDB } from "../db/connection.js";
import type { NodeCapability, NodeHelloPayload } from "@jait/shared";

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

  /**
   * Persist a node's identity on first-seen and backfill zero-grant rows for
   * every capability (deny-all). On subsequent hellos only `last_seen_at` is
   * refreshed. Safe to call on every `node.hello`.
   */
  ensureNodeSeen(hello: NodeHelloPayload, now = new Date().toISOString()): void {
    if (!this.db) return;
    const nodeId = hello.id;
    const name = hello.name ?? null;
    const platform = hello.platform ?? null;
    const role = hello.role ?? "remote";

    try {
      const existing = this.db
        .select({ nodeId: nodes.nodeId })
        .from(nodes)
        .where(eq(nodes.nodeId, nodeId))
        .all();

      if (existing.length === 0) {
        this.db
          .insert(nodes)
          .values({
            nodeId,
            name,
            platform,
            role,
            firstSeenAt: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        // Backfill deny-all rows. Insert individually so each upsert is
        // independent; a partial failure still leaves deny-by-default intact.
        for (const capability of NODE_CAPABILITIES) {
          try {
            this.db
              .insert(nodePermissions)
              .values({
                nodeId,
                capability,
                granted: 0,
                updatedAt: now,
              })
              .run();
          } catch {
            // Non-fatal: default (no row / 0) is deny anyway.
          }
        }
      } else {
        this.db
          .update(nodes)
          .set({ lastSeenAt: now, updatedAt: now })
          .where(eq(nodes.nodeId, nodeId))
          .run();
      }
    } catch {
      // Persistence is best-effort at registration time; live registry and
      // enforcement continue to work off the DB state when it is available.
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
