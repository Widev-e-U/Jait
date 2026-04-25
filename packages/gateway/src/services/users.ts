import { and, eq } from "drizzle-orm";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { JaitDB } from "../db/connection.js";
import { messages, sessions, userSettings, users } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

export type ThemeMode = "light" | "dark" | "system";
export type SttProvider = "wyoming" | "whisper" | "gpt" | "elevenlabs";
export type ChatProvider = "jait" | "codex" | "claude-code";
export type JaitBackend = "openai" | "openrouter" | "ollama";

function normalizeSttProvider(value: string | null | undefined): SttProvider {
  if (value === "gpt") return "gpt";
  if (value === "elevenlabs") return "elevenlabs";
  return value === "wyoming" ? "wyoming" : "whisper";
}

export interface UserRecord {
  id: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettingsRecord {
  userId: string;
  theme: ThemeMode;
  apiKeys: Record<string, string>;
  disabledTools: string[];
  sttProvider: SttProvider;
  chatProvider: ChatProvider;
  jaitBackend: JaitBackend;
  recentModels: string[];
  workspacePickerPath: string | null;
  workspacePickerNodeId: string | null;
  updatedAt: string;
}

const HASH_PREFIX = "scrypt";

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function parseApiKeys(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${HASH_PREFIX}$${salt}$${digest}`;
}

function verifyPasswordHash(password: string, encoded: string): boolean {
  const [prefix, salt, digest] = encoded.split("$");
  if (prefix !== HASH_PREFIX || !salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = scryptSync(password, salt, expected.length);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export class UserService {
  constructor(private readonly db: JaitDB) {}

  countUsers(): number {
    const row = this.db.select({ count: users.id }).from(users).all();
    return row.length;
  }

  findByUsername(username: string): UserRecord | null {
    const normalized = normalizeUsername(username);
    const row = this.db.select().from(users).where(eq(users.username, normalized)).get();
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  findById(id: string): UserRecord | null {
    const row = this.db.select().from(users).where(eq(users.id, id)).get();
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  createUser(username: string, password: string): UserRecord {
    const normalized = normalizeUsername(username);
    const now = new Date().toISOString();
    const id = uuidv7();
    this.db.insert(users).values({
      id,
      username: normalized,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    }).run();
    this.db.insert(userSettings).values({
      userId: id,
      theme: "system",
      apiKeys: JSON.stringify({}),
      sttProvider: "whisper",
      workspacePickerPath: null,
      workspacePickerNodeId: null,
      updatedAt: now,
    }).run();
    return this.findById(id)!;
  }

  verifyCredentials(username: string, password: string): UserRecord | null {
    const normalized = normalizeUsername(username);
    const row = this.db.select().from(users).where(eq(users.username, normalized)).get();
    if (!row) return null;
    if (!verifyPasswordHash(password, row.passwordHash)) return null;
    return {
      id: row.id,
      username: row.username,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  getSettings(userId: string): UserSettingsRecord {
    const row = this.db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
    if (!row) {
      const now = new Date().toISOString();
      this.db.insert(userSettings).values({
        userId,
        theme: "system",
        apiKeys: JSON.stringify({}),
        disabledTools: JSON.stringify([]),
        sttProvider: "whisper",
        chatProvider: "jait",
        jaitBackend: "openai",
        recentModels: JSON.stringify([]),
        workspacePickerPath: null,
        workspacePickerNodeId: null,
        updatedAt: now,
      }).run();
      return {
        userId,
        theme: "system",
        apiKeys: {},
        disabledTools: [],
        sttProvider: "whisper",
        chatProvider: "jait",
        jaitBackend: "openai",
        recentModels: [],
        workspacePickerPath: null,
        workspacePickerNodeId: null,
        updatedAt: now,
      };
    }
    return {
      userId: row.userId,
      theme: (row.theme as ThemeMode) || "system",
      apiKeys: parseApiKeys(row.apiKeys),
      disabledTools: parseStringArray((row as any).disabledTools ?? null),
      sttProvider: normalizeSttProvider(typeof (row as any).sttProvider === "string" ? (row as any).sttProvider : null),
      chatProvider: ((row as any).chatProvider as ChatProvider) || "jait",
      jaitBackend: ((row as any).jaitBackend as JaitBackend) || "openai",
      recentModels: parseStringArray((row as any).recentModels ?? null),
      workspacePickerPath: typeof (row as any).workspacePickerPath === "string" ? (row as any).workspacePickerPath : null,
      workspacePickerNodeId: typeof (row as any).workspacePickerNodeId === "string" ? (row as any).workspacePickerNodeId : null,
      updatedAt: row.updatedAt,
    };
  }

  updateSettings(
    userId: string,
    patch: {
      theme?: ThemeMode;
      apiKeys?: Record<string, string>;
      disabledTools?: string[];
      sttProvider?: SttProvider;
      chatProvider?: ChatProvider;
      jaitBackend?: JaitBackend;
      recentModels?: string[];
      workspacePickerPath?: string | null;
      workspacePickerNodeId?: string | null;
    },
  ): UserSettingsRecord {
    const existing = this.getSettings(userId);
    const theme = patch.theme ?? existing.theme;
    const apiKeys = patch.apiKeys ?? existing.apiKeys;
    const disabledTools = patch.disabledTools ?? existing.disabledTools;
    const sttProvider = patch.sttProvider ?? existing.sttProvider;
    const chatProvider = patch.chatProvider ?? existing.chatProvider;
    const jaitBackend = patch.jaitBackend ?? existing.jaitBackend;
    const recentModels = patch.recentModels ?? existing.recentModels;
    const workspacePickerPath = patch.workspacePickerPath !== undefined
      ? patch.workspacePickerPath
      : existing.workspacePickerPath;
    const workspacePickerNodeId = patch.workspacePickerNodeId !== undefined
      ? patch.workspacePickerNodeId
      : existing.workspacePickerNodeId;
    const now = new Date().toISOString();
    this.db
      .update(userSettings)
      .set({
        theme,
        apiKeys: JSON.stringify(apiKeys),
        disabledTools: JSON.stringify(disabledTools),
        sttProvider,
        chatProvider,
        jaitBackend,
        recentModels: JSON.stringify(recentModels),
        workspacePickerPath,
        workspacePickerNodeId,
        updatedAt: now,
      } as any)
      .where(eq(userSettings.userId, userId))
      .run();
    return this.getSettings(userId);
  }

  bindSessionToUser(userId: string, sessionId: string): boolean {
    const session = this.db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!session) return false;
    this.db
      .update(sessions)
      .set({ userId })
      .where(eq(sessions.id, sessionId))
      .run();
    return true;
  }

  clearArchivedSessions(userId: string): number {
    const archived = this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, "archived")))
      .all();
    if (archived.length === 0) return 0;

    const ids = archived.map((row) => row.id);
    for (const id of ids) {
      this.db.delete(messages).where(eq(messages.sessionId, id)).run();
      this.db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, userId))).run();
    }
    return ids.length;
  }
}
