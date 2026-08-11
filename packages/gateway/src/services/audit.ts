/**
 * Audit log writer — records every tool call / action to SQLite.
 */
import { eq } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { auditLog } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import { serializeBoundedJson } from "../lib/bounded-json.js";

const MAX_AUDIT_FIELD_BYTES = 128_000;

export interface AuditEntry {
  sessionId?: string;
  surfaceType?: string;
  deviceId?: string;
  actionId: string;
  actionType: string;
  toolName?: string;
  inputs?: unknown;
  outputs?: unknown;
  sideEffects?: unknown;
  parentActionId?: string;
  status: string;
  consentMethod?: string;
}

export class AuditWriter {
  constructor(private db: JaitDB) {}

  /** Write a new audit log entry. Returns the entry's id. */
  write(entry: AuditEntry): string {
    const id = uuidv7();
    const now = new Date().toISOString();

    this.db.insert(auditLog).values({
      id,
      timestamp: now,
      sessionId: entry.sessionId ?? null,
      surfaceType: entry.surfaceType ?? null,
      deviceId: entry.deviceId ?? null,
      actionId: entry.actionId,
      actionType: entry.actionType,
      toolName: entry.toolName ?? null,
      inputs: entry.inputs != null ? serializeBoundedJson(entry.inputs, MAX_AUDIT_FIELD_BYTES) : null,
      outputs: entry.outputs != null ? serializeBoundedJson(entry.outputs, MAX_AUDIT_FIELD_BYTES) : null,
      sideEffects: entry.sideEffects != null ? serializeBoundedJson(entry.sideEffects, MAX_AUDIT_FIELD_BYTES) : null,
      signature: null,
      parentActionId: entry.parentActionId ?? null,
      status: entry.status,
      consentMethod: entry.consentMethod ?? null,
    }).run();

    return id;
  }

  /** Check if an action ID already exists (idempotency guard). */
  hasAction(actionId: string): boolean {
    const row = this.db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.actionId, actionId))
      .get();
    return row !== undefined;
  }

  /** Get all audit entries for a session, newest first. */
  getBySession(sessionId: string) {
    return this.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.sessionId, sessionId))
      .orderBy(auditLog.timestamp)
      .all();
  }

  /** Get all audit entries (newest first). */
  getAll() {
    return this.db.select().from(auditLog).orderBy(auditLog.timestamp).all();
  }
}
