import { and, desc, eq } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { assistantProfiles } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

type AssistantProfileRow = typeof assistantProfiles.$inferSelect;
export interface AssistantProfileRecord {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  runtimeMode: "full-access" | "supervised" | null;
  toolProfile: string | null;
  enabledSkills: string[];
  enabledPlugins: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssistantProfileInput {
  name: string;
  description?: string | null;
  systemPrompt?: string | null;
  runtimeMode?: "full-access" | "supervised" | null;
  toolProfile?: string | null;
  enabledSkills?: string[];
  enabledPlugins?: string[];
  isDefault?: boolean;
}

export interface UpdateAssistantProfileInput {
  name?: string;
  description?: string | null;
  systemPrompt?: string | null;
  runtimeMode?: "full-access" | "supervised" | null;
  toolProfile?: string | null;
  enabledSkills?: string[];
  enabledPlugins?: string[];
  isDefault?: boolean;
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function serializeStringArray(value?: string[]): string {
  return JSON.stringify((value ?? []).filter((item) => typeof item === "string" && item.trim().length > 0));
}

function toAssistantProfile(row: AssistantProfileRow): AssistantProfileRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    systemPrompt: row.systemPrompt,
    runtimeMode: row.runtimeMode as AssistantProfileRecord["runtimeMode"],
    toolProfile: row.toolProfile,
    enabledSkills: parseJsonArray(row.enabledSkills),
    enabledPlugins: parseJsonArray(row.enabledPlugins),
    isDefault: row.isDefault === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class AssistantProfileService {
  constructor(private db: JaitDB) {}

  list(userId?: string): AssistantProfileRecord[] {
    const query = this.db.select().from(assistantProfiles);
    const rows = userId
      ? query.where(eq(assistantProfiles.userId, userId)).orderBy(desc(assistantProfiles.updatedAt)).all()
      : query.orderBy(desc(assistantProfiles.updatedAt)).all();
    return rows.map(toAssistantProfile);
  }

  getById(id: string, userId?: string): AssistantProfileRecord | undefined {
    const row = userId
      ? this.db.select().from(assistantProfiles).where(and(eq(assistantProfiles.id, id), eq(assistantProfiles.userId, userId))).get()
      : this.db.select().from(assistantProfiles).where(eq(assistantProfiles.id, id)).get();
    return row ? toAssistantProfile(row) : undefined;
  }

  create(userId: string, params: CreateAssistantProfileInput): AssistantProfileRecord {
    const id = uuidv7();
    const now = new Date().toISOString();
    const existing = this.list(userId);
    const shouldBeDefault = params.isDefault === true || existing.length === 0;
    if (shouldBeDefault) this.clearDefault(userId);
    this.db.insert(assistantProfiles).values({
      id,
      userId,
      name: params.name.trim(),
      description: params.description ?? null,
      systemPrompt: params.systemPrompt ?? null,
      runtimeMode: params.runtimeMode ?? null,
      toolProfile: params.toolProfile ?? null,
      enabledSkills: serializeStringArray(params.enabledSkills),
      enabledPlugins: serializeStringArray(params.enabledPlugins),
      isDefault: shouldBeDefault ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    }).run();
    return this.getById(id, userId)!;
  }

  update(id: string, userId: string, params: UpdateAssistantProfileInput): AssistantProfileRecord | undefined {
    const existing = this.getById(id, userId);
    if (!existing) return undefined;
    if (params.isDefault === true) this.clearDefault(userId);
    const now = new Date().toISOString();
    this.db.update(assistantProfiles).set({
      name: params.name !== undefined ? params.name.trim() : undefined,
      description: params.description !== undefined ? params.description : undefined,
      systemPrompt: params.systemPrompt !== undefined ? params.systemPrompt : undefined,
      runtimeMode: params.runtimeMode !== undefined ? params.runtimeMode : undefined,
      toolProfile: params.toolProfile !== undefined ? params.toolProfile : undefined,
      enabledSkills: params.enabledSkills !== undefined ? serializeStringArray(params.enabledSkills) : undefined,
      enabledPlugins: params.enabledPlugins !== undefined ? serializeStringArray(params.enabledPlugins) : undefined,
      isDefault: params.isDefault !== undefined ? (params.isDefault ? 1 : 0) : undefined,
      updatedAt: now,
    }).where(and(eq(assistantProfiles.id, id), eq(assistantProfiles.userId, userId))).run();
    const updated = this.getById(id, userId);
    if (!updated) return undefined;
    if (!this.list(userId).some((profile) => profile.isDefault)) {
      this.db.update(assistantProfiles).set({ isDefault: 1, updatedAt: now }).where(and(eq(assistantProfiles.id, id), eq(assistantProfiles.userId, userId))).run();
    }
    return this.getById(id, userId);
  }

  delete(id: string, userId: string): boolean {
    const existing = this.getById(id, userId);
    if (!existing) return false;
    this.db.delete(assistantProfiles).where(and(eq(assistantProfiles.id, id), eq(assistantProfiles.userId, userId))).run();
    if (existing.isDefault) {
      const next = this.list(userId)[0];
      if (next) {
        this.db.update(assistantProfiles).set({ isDefault: 1, updatedAt: new Date().toISOString() }).where(eq(assistantProfiles.id, next.id)).run();
      }
    }
    return true;
  }

  private clearDefault(userId: string): void {
    this.db.update(assistantProfiles).set({ isDefault: 0, updatedAt: new Date().toISOString() }).where(eq(assistantProfiles.userId, userId)).run();
  }
}
