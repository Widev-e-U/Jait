import { nanoid } from "nanoid";
import type { PreviewSession } from "./preview.js";
import type { JaitDB } from "../db/connection.js";
import { browserInterventions, browserSessions } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";

export type BrowserSessionMode = "shared" | "isolated";
export type BrowserSessionOrigin = "attached" | "managed" | "direct";
export type BrowserSessionController = "agent" | "user" | "observer";
export type BrowserSessionStatus = "ready" | "running" | "paused" | "intervention-required" | "closed";
export type BrowserInterventionKind =
  | "complete_login"
  | "enter_secret"
  | "dismiss_modal"
  | "confirm_external_prompt"
  | "custom";
export type BrowserInterventionStatus = "open" | "resolved" | "cancelled";

export interface BrowserSessionRecord {
  id: string;
  name: string;
  workspaceRoot: string | null;
  targetUrl: string | null;
  previewUrl: string | null;
  previewSessionId: string | null;
  browserId: string | null;
  mode: BrowserSessionMode;
  origin: BrowserSessionOrigin;
  controller: BrowserSessionController;
  status: BrowserSessionStatus;
  secretSafe: boolean;
  storageProfile: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserInterventionRecord {
  id: string;
  browserSessionId: string;
  threadId: string | null;
  chatSessionId: string | null;
  kind: BrowserInterventionKind;
  reason: string;
  instructions: string;
  status: BrowserInterventionStatus;
  secretSafe: boolean;
  allowUserNote: boolean;
  requestedBy: string | null;
  resolvedBy: string | null;
  userNote: string | null;
  requestedAt: string;
  resolvedAt: string | null;
}

type SessionListener = (session: BrowserSessionRecord) => void;
type InterventionListener = (intervention: BrowserInterventionRecord) => void;

export interface CreateBrowserSessionInput {
  name?: string | null;
  workspaceRoot?: string | null;
  targetUrl?: string | null;
  previewUrl?: string | null;
  previewSessionId?: string | null;
  browserId?: string | null;
  mode?: BrowserSessionMode;
  origin?: BrowserSessionOrigin;
  controller?: BrowserSessionController;
  status?: BrowserSessionStatus;
  secretSafe?: boolean;
  storageProfile?: Record<string, unknown> | null;
  createdBy?: string | null;
}

export interface RequestBrowserInterventionInput {
  browserSessionId: string;
  threadId?: string | null;
  chatSessionId?: string | null;
  kind?: BrowserInterventionKind;
  reason: string;
  instructions: string;
  secretSafe?: boolean;
  allowUserNote?: boolean;
  requestedBy?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class BrowserCollaborationService {
  private readonly sessionListeners = new Set<SessionListener>();
  private readonly interventionListeners = new Set<InterventionListener>();

  constructor(private readonly db: JaitDB) {}

  onSessionChanged(listener: SessionListener): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  onInterventionChanged(listener: InterventionListener): () => void {
    this.interventionListeners.add(listener);
    return () => this.interventionListeners.delete(listener);
  }

  listSessions(userId?: string | null): BrowserSessionRecord[] {
    const rows = this.db
      .select()
      .from(browserSessions)
      .orderBy(desc(browserSessions.updatedAt))
      .all();
    return rows
      .filter((r) => !userId || !r.createdBy || r.createdBy === userId)
      .map(this.rowToSession);
  }

  getSession(id: string, userId?: string | null): BrowserSessionRecord | null {
    const row = this.db.select().from(browserSessions).where(eq(browserSessions.id, id)).get();
    if (!row) return null;
    if (userId && row.createdBy && row.createdBy !== userId) return null;
    return this.rowToSession(row);
  }

  getSessionByBrowserId(browserId: string): BrowserSessionRecord | null {
    const row = this.db
      .select()
      .from(browserSessions)
      .where(eq(browserSessions.browserId, browserId))
      .get();
    return row ? this.rowToSession(row) : null;
  }

  createSession(input: CreateBrowserSessionInput): BrowserSessionRecord {
    const createdAt = nowIso();
    const id = `bs_${nanoid(10)}`;
    this.db.insert(browserSessions).values({
      id,
      name: input.name?.trim() || "browser-session",
      workspaceRoot: input.workspaceRoot?.trim() || null,
      targetUrl: input.targetUrl?.trim() || null,
      previewUrl: input.previewUrl?.trim() || null,
      previewSessionId: input.previewSessionId?.trim() || null,
      browserId: input.browserId?.trim() || null,
      mode: input.mode ?? "shared",
      origin: input.origin ?? "direct",
      controller: input.controller ?? "agent",
      status: input.status ?? "ready",
      secretSafe: input.secretSafe ? 1 : 0,
      storageProfile: input.storageProfile ? JSON.stringify(input.storageProfile) : null,
      createdBy: input.createdBy?.trim() || null,
      createdAt,
      updatedAt: createdAt,
    }).run();
    const created = this.getSession(id)!;
    this.emitSessionChanged(created);
    return created;
  }

  syncPreviewSession(preview: PreviewSession, options?: {
    userId?: string | null;
    workspaceRoot?: string | null;
    mode?: BrowserSessionMode;
    storageProfile?: Record<string, unknown> | null;
  }): BrowserSessionRecord {
    const current = nowIso();
    const targetUrl = preview.target?.trim() || preview.url?.trim() || null;
    const existing = this.db
      .select()
      .from(browserSessions)
      .where(preview.browserId
        ? eq(browserSessions.browserId, preview.browserId)
        : eq(browserSessions.previewSessionId, preview.sessionId))
      .get();
    if (existing) {
      const updated = {
        name: existing.name || `preview-${preview.sessionId}`,
        workspaceRoot: options?.workspaceRoot?.trim() || preview.workspaceRoot?.trim() || existing.workspaceRoot,
        targetUrl,
        previewUrl: preview.url?.trim() || existing.previewUrl,
        previewSessionId: preview.sessionId,
        browserId: preview.browserId?.trim() || existing.browserId,
        mode: options?.mode ?? existing.mode,
        origin: preview.mode === "url" ? "attached" : "managed",
        status: preview.status === "stopped" ? "closed" : (existing.status === "paused" ? "paused" : "ready"),
        storageProfile: options?.storageProfile ? JSON.stringify(options.storageProfile) : existing.storageProfile,
        createdBy: options?.userId?.trim() || existing.createdBy,
        updatedAt: current,
      } as const;
      this.db.update(browserSessions).set(updated).where(eq(browserSessions.id, existing.id)).run();
      const out = this.getSession(existing.id)!;
      this.emitSessionChanged(out);
      return out;
    }

    return this.createSession({
      name: `preview-${preview.sessionId}`,
      workspaceRoot: options?.workspaceRoot?.trim() || preview.workspaceRoot?.trim() || null,
      targetUrl,
      previewUrl: preview.url?.trim() || null,
      previewSessionId: preview.sessionId,
      browserId: preview.browserId?.trim() || null,
      mode: options?.mode ?? "shared",
      origin: preview.mode === "url" ? "attached" : "managed",
      controller: "agent",
      status: preview.status === "stopped" ? "closed" : "ready",
      storageProfile: options?.storageProfile ?? null,
      createdBy: options?.userId?.trim() || null,
    });
  }

  takeControl(id: string, userId?: string | null): BrowserSessionRecord | null {
    const session = this.getSession(id, userId);
    if (!session) return null;
    const status: BrowserSessionStatus =
      session.status === "ready" || session.status === "running" ? "paused" : session.status;
    const updatedAt = nowIso();
    this.db.update(browserSessions)
      .set({ controller: "user", status, updatedAt })
      .where(eq(browserSessions.id, id))
      .run();
    const out: BrowserSessionRecord = { ...session, controller: "user", status, updatedAt };
    this.emitSessionChanged(out);
    return out;
  }

  returnControl(id: string, userId?: string | null): BrowserSessionRecord | null {
    const session = this.getSession(id, userId);
    if (!session) return null;
    const status: BrowserSessionStatus = session.status !== "closed" ? "ready" : session.status;
    const updatedAt = nowIso();
    this.db.update(browserSessions)
      .set({ controller: "agent", status, updatedAt })
      .where(eq(browserSessions.id, id))
      .run();
    const out: BrowserSessionRecord = { ...session, controller: "agent", status, updatedAt };
    this.emitSessionChanged(out);
    return out;
  }

  pause(id: string, userId?: string | null): BrowserSessionRecord | null {
    const session = this.getSession(id, userId);
    if (!session) return null;
    const status: BrowserSessionStatus = session.status !== "closed" ? "paused" : session.status;
    const updatedAt = nowIso();
    this.db.update(browserSessions).set({ status, updatedAt }).where(eq(browserSessions.id, id)).run();
    const out: BrowserSessionRecord = { ...session, status, updatedAt };
    this.emitSessionChanged(out);
    return out;
  }

  resume(id: string, userId?: string | null): BrowserSessionRecord | null {
    const session = this.getSession(id, userId);
    if (!session) return null;
    const status: BrowserSessionStatus = session.status !== "closed" ? "ready" : session.status;
    const updatedAt = nowIso();
    this.db.update(browserSessions).set({ status, updatedAt }).where(eq(browserSessions.id, id)).run();
    const out: BrowserSessionRecord = { ...session, status, updatedAt };
    this.emitSessionChanged(out);
    return out;
  }

  setSecretSafe(id: string, secretSafe: boolean, userId?: string | null): BrowserSessionRecord | null {
    const session = this.getSession(id, userId);
    if (!session) return null;
    const updatedAt = nowIso();
    this.db.update(browserSessions).set({ secretSafe: secretSafe ? 1 : 0, updatedAt }).where(eq(browserSessions.id, id)).run();
    const out = { ...session, secretSafe, updatedAt };
    this.emitSessionChanged(out);
    return out;
  }

  closePreviewSession(previewSessionId: string): void {
    const row = this.db
      .select()
      .from(browserSessions)
      .where(eq(browserSessions.previewSessionId, previewSessionId))
      .get();
    if (!row) return;
    const updatedAt = nowIso();
    this.db.update(browserSessions)
      .set({ status: "closed", updatedAt })
      .where(eq(browserSessions.id, row.id))
      .run();
    const out = this.getSession(row.id);
    if (out) this.emitSessionChanged(out);
  }

  listInterventions(userId?: string | null, status?: BrowserInterventionStatus): BrowserInterventionRecord[] {
    const base = this.db.select().from(browserInterventions);
    const rows = status
      ? base.where(eq(browserInterventions.status, status)).orderBy(desc(browserInterventions.requestedAt)).all()
      : base.orderBy(desc(browserInterventions.requestedAt)).all();
    const interventions = rows.map(this.rowToIntervention);
    if (!userId) return interventions;
    // Filter by session.createdBy when provided
    const uniqueSessionIds = Array.from(new Set(interventions.map((i) => i.browserSessionId)));
    const createdByMap = new Map<string, string | null>();
    for (const sid of uniqueSessionIds) {
      const row = this.db.select({ id: browserSessions.id, createdBy: browserSessions.createdBy })
        .from(browserSessions)
        .where(eq(browserSessions.id, sid))
        .get();
      if (row) createdByMap.set(row.id, row.createdBy ?? null);
    }
    return interventions.filter((i) => {
      const createdBy = createdByMap.get(i.browserSessionId) ?? null;
      return !createdBy || createdBy === userId;
    });
  }

  requestIntervention(input: RequestBrowserInterventionInput): BrowserInterventionRecord {
    const session = this.getSession(input.browserSessionId);
    if (!session) throw new Error(`Unknown browser session: ${input.browserSessionId}`);
    const requestedAt = nowIso();
    const id = `bi_${nanoid(10)}`;
    this.db.insert(browserInterventions).values({
      id,
      browserSessionId: input.browserSessionId,
      threadId: input.threadId?.trim() || null,
      chatSessionId: input.chatSessionId?.trim() || null,
      kind: input.kind ?? "custom",
      reason: input.reason.trim(),
      instructions: input.instructions.trim(),
      status: "open",
      secretSafe: input.secretSafe ? 1 : 0,
      allowUserNote: input.allowUserNote === false ? 0 : 1,
      requestedBy: input.requestedBy?.trim() || null,
      resolvedBy: null,
      userNote: null,
      requestedAt,
      resolvedAt: null,
    }).run();
    this.db.update(browserSessions)
      .set({ controller: "user", status: "intervention-required", secretSafe: input.secretSafe ? 1 : 0, updatedAt: requestedAt })
      .where(eq(browserSessions.id, input.browserSessionId))
      .run();
    const out = this.getIntervention(id)!;
    this.emitInterventionChanged(out);
    const updatedSession = this.getSession(input.browserSessionId);
    if (updatedSession) this.emitSessionChanged(updatedSession);
    return out;
  }

  resolveIntervention(id: string, userId?: string | null, note?: string | null): BrowserInterventionRecord | null {
    const existing = this.getIntervention(id);
    if (!existing) return null;
    const session = this.getSession(existing.browserSessionId);
    if (userId && session?.createdBy && session.createdBy !== userId) return null;
    const resolvedAt = nowIso();
    this.db.update(browserInterventions)
      .set({ status: "resolved", resolvedBy: userId?.trim() || null, userNote: note?.trim() || null, resolvedAt })
      .where(eq(browserInterventions.id, id))
      .run();
    if (session) {
      this.db.update(browserSessions)
        .set({ controller: "agent", status: "ready", updatedAt: resolvedAt })
        .where(eq(browserSessions.id, session.id))
        .run();
      const updatedSession = this.getSession(session.id);
      if (updatedSession) this.emitSessionChanged(updatedSession);
    }
    const out = this.getIntervention(id);
    if (out) this.emitInterventionChanged(out);
    return out;
  }

  cancelIntervention(id: string, userId?: string | null): BrowserInterventionRecord | null {
    const existing = this.getIntervention(id);
    if (!existing) return null;
    const session = this.getSession(existing.browserSessionId);
    if (userId && session?.createdBy && session.createdBy !== userId) return null;
    const resolvedAt = nowIso();
    this.db.update(browserInterventions)
      .set({ status: "cancelled", resolvedBy: userId?.trim() || null, resolvedAt })
      .where(eq(browserInterventions.id, id))
      .run();
    if (session) {
      this.db.update(browserSessions)
        .set({ status: "ready", updatedAt: resolvedAt })
        .where(eq(browserSessions.id, session.id))
        .run();
      const updatedSession = this.getSession(session.id);
      if (updatedSession) this.emitSessionChanged(updatedSession);
    }
    const out = this.getIntervention(id);
    if (out) this.emitInterventionChanged(out);
    return out;
  }

  assertAgentControl(browserId?: string): void {
    if (!browserId) return;
    const session = this.getSessionByBrowserId(browserId);
    if (!session) return;
    if (session.controller === "user") {
      throw new Error("Browser session is currently controlled by the user. Request control or wait for resume.");
    }
    if (session.status === "paused" || session.status === "intervention-required") {
      throw new Error("Browser session is paused for user intervention. Resume the session before continuing.");
    }
  }

  private emitSessionChanged(session: BrowserSessionRecord): void {
    for (const listener of this.sessionListeners) listener(session);
  }

  private emitInterventionChanged(intervention: BrowserInterventionRecord): void {
    for (const listener of this.interventionListeners) listener(intervention);
  }

  private rowToSession = (row: typeof browserSessions.$inferSelect): BrowserSessionRecord => ({
    id: row.id,
    name: row.name,
    workspaceRoot: row.workspaceRoot ?? null,
    targetUrl: row.targetUrl ?? null,
    previewUrl: row.previewUrl ?? null,
    previewSessionId: row.previewSessionId ?? null,
    browserId: row.browserId ?? null,
    mode: (row.mode as BrowserSessionMode) ?? "shared",
    origin: (row.origin as BrowserSessionOrigin) ?? "direct",
    controller: (row.controller as BrowserSessionController) ?? "agent",
    status: (row.status as BrowserSessionStatus) ?? "ready",
    secretSafe: Boolean(row.secretSafe),
    storageProfile: row.storageProfile ? safeParseJSON(row.storageProfile) : null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  private rowToIntervention = (row: typeof browserInterventions.$inferSelect): BrowserInterventionRecord => ({
    id: row.id,
    browserSessionId: row.browserSessionId,
    threadId: row.threadId ?? null,
    chatSessionId: row.chatSessionId ?? null,
    kind: (row.kind as BrowserInterventionKind) ?? "custom",
    reason: row.reason,
    instructions: row.instructions,
    status: (row.status as BrowserInterventionStatus) ?? "open",
    secretSafe: Boolean(row.secretSafe),
    allowUserNote: Boolean(row.allowUserNote ?? 1),
    requestedBy: row.requestedBy ?? null,
    resolvedBy: row.resolvedBy ?? null,
    userNote: row.userNote ?? null,
    requestedAt: row.requestedAt,
    resolvedAt: row.resolvedAt ?? null,
  });

  private getIntervention(id: string): BrowserInterventionRecord | null {
    const row = this.db.select().from(browserInterventions).where(eq(browserInterventions.id, id)).get();
    return row ? this.rowToIntervention(row) : null;
  }
}

function safeParseJSON(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
