import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import type { JaitDB, SqliteDatabase } from "../db/index.js";
import { consentLog, nodePermissions, nodes } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  NodePermissionsService,
  NODE_CAPABILITIES,
  isNodeCapability,
} from "./node-permissions.js";
import type { NodeHelloPayload } from "@jait/shared";

let sqlite: SqliteDatabase;
let db: JaitDB;

async function freshDb(): Promise<void> {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
  migrateDatabase(sqlite);
}

beforeEach(async () => {
  await freshDb();
});

afterEach(() => {
  sqlite.close();
});

const hello: NodeHelloPayload = {
  id: "node-1",
  name: "test-node",
  platform: "linux",
  role: "remote",
};

function service(d: JaitDB | null = db): NodePermissionsService {
  return new NodePermissionsService(d);
}

describe("NodePermissionsService", () => {
  it("denies every capability for a node that has never been seen", () => {
    const svc = service();
    for (const cap of NODE_CAPABILITIES) {
      expect(svc.isGranted("ghost-node", cap)).toBe(false);
    }
  });

  it("ensureNodeSeen backfills deny-all rows and is idempotent", () => {
    const svc = service();
    svc.ensureNodeSeen(hello);

    // nodes row exists
    const nodeRows = db.select().from(nodes).where(eq(nodes.nodeId, hello.id)).all();
    expect(nodeRows).toHaveLength(1);

    // one deny-all row per capability
    const permRows = db
      .select()
      .from(nodePermissions)
      .where(eq(nodePermissions.nodeId, hello.id))
      .all();
    expect(permRows).toHaveLength(NODE_CAPABILITIES.length);
    for (const cap of NODE_CAPABILITIES) {
      expect(svc.isGranted(hello.id, cap)).toBe(false);
    }

    // second call must not throw and stays deny-all
    expect(() => svc.ensureNodeSeen(hello)).not.toThrow();
    const permRowsAfter = db
      .select()
      .from(nodePermissions)
      .where(eq(nodePermissions.nodeId, hello.id))
      .all();
    expect(permRowsAfter).toHaveLength(NODE_CAPABILITIES.length);
    for (const cap of NODE_CAPABILITIES) {
      expect(svc.isGranted(hello.id, cap)).toBe(false);
    }
  });

  it("grants and revokes a capability via updatePermissions", () => {
    const svc = service();
    svc.ensureNodeSeen(hello);

    expect(svc.isGranted(hello.id, "terminal")).toBe(false);

    svc.updatePermissions(hello.id, { terminal: true });
    expect(svc.isGranted(hello.id, "terminal")).toBe(true);

    svc.updatePermissions(hello.id, { terminal: false });
    expect(svc.isGranted(hello.id, "terminal")).toBe(false);
  });

  it("getPermissions and listNodePermissions reflect granted state", () => {
    const svc = service();
    svc.ensureNodeSeen(hello);
    svc.updatePermissions(hello.id, { terminal: true, browser: true });

    const perms = svc.getPermissions(hello.id);
    expect(Object.keys(perms).sort()).toEqual([...NODE_CAPABILITIES].sort());
    expect(perms.terminal).toBe(true);
    expect(perms.browser).toBe(true);
    expect(perms.filesystem).toBe(false);

    const listed = svc.listNodePermissions();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.nodeId).toBe(hello.id);
    expect(listed[0]!.permissions.terminal).toBe(true);
    expect(listed[0]!.permissions.browser).toBe(true);
  });

  it("logDenied writes a consent_log row with decision 'rejected'", () => {
    const svc = service();
    svc.logDenied(hello.id, "terminal", "terminal denied by policy");

    const rows = db.select().from(consentLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.decision).toBe("rejected");
    expect(rows[0]!.actionId).toBe(`node-permission:${hello.id}:terminal`);
    expect(rows[0]!.toolName).toBe("node.terminal");
  });

  it("no-DB mode is safe and deny-all", () => {
    const svc = service(null);
    expect(svc.isGranted("n", "terminal")).toBe(false);
    expect(svc.listNodePermissions()).toEqual([]);
    expect(() => svc.ensureNodeSeen(hello)).not.toThrow();
    expect(() => svc.updatePermissions("n", { terminal: true })).not.toThrow();
    expect(() => svc.logDenied("n", "terminal", "detail")).not.toThrow();
  });

  it("isNodeCapability validates capability names", () => {
    expect(isNodeCapability("terminal")).toBe(true);
    expect(isNodeCapability("filesystem")).toBe(true);
    expect(isNodeCapability("not-a-capability")).toBe(false);
    expect(isNodeCapability(42)).toBe(false);
  });
});
