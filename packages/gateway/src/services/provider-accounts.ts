import { and, eq } from "drizzle-orm";
import { mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { JaitDB } from "../db/connection.js";
import { providerAccounts } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import { AcpProvider, type AcpProviderConfig } from "../providers/acp-provider.js";
import type { ProviderRegistry } from "../providers/registry.js";

export interface ProviderAccountRecord {
  id: string;
  userId: string;
  providerType: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderAccountType {
  providerType: string;
  name: string;
  description: string;
}

export class ProviderAccountService {
  private readonly definitions: Map<string, AcpProviderConfig>;

  constructor(
    private readonly db: JaitDB,
    private readonly registry: ProviderRegistry,
    definitions: AcpProviderConfig[],
    private readonly accountsRoot = join(homedir(), ".jait", "provider-accounts"),
  ) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  load(): void {
    for (const account of this.db.select().from(providerAccounts).all()) {
      this.register(account);
    }
  }

  list(userId: string): ProviderAccountRecord[] {
    return this.db.select().from(providerAccounts).where(eq(providerAccounts.userId, userId)).all();
  }

  listTypes(): ProviderAccountType[] {
    return [...this.definitions.values()]
      .filter((definition) => definition.auth !== false)
      .map((definition) => ({
        providerType: definition.id,
        name: definition.name,
        description: definition.description,
      }));
  }

  get(id: string, userId: string): ProviderAccountRecord | null {
    return this.db.select().from(providerAccounts).where(and(
      eq(providerAccounts.id, id),
      eq(providerAccounts.userId, userId),
    )).get() ?? null;
  }

  create(userId: string, providerType: string, label: string): ProviderAccountRecord {
    const definition = this.definitions.get(providerType);
    if (!definition || definition.auth === false) {
      throw new Error(`Provider accounts are not supported for ${providerType}`);
    }
    const normalizedLabel = this.normalizeLabel(label);
    const now = new Date().toISOString();
    const account: ProviderAccountRecord = {
      id: `${providerType}-${uuidv7()}`,
      userId,
      providerType,
      label: normalizedLabel,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(providerAccounts).values(account).run();
    this.register(account);
    return account;
  }

  async rename(id: string, userId: string, label: string): Promise<ProviderAccountRecord | null> {
    const account = this.get(id, userId);
    if (!account) return null;
    const normalizedLabel = this.normalizeLabel(label);
    const updatedAt = new Date().toISOString();
    this.db.update(providerAccounts).set({ label: normalizedLabel, updatedAt })
      .where(and(eq(providerAccounts.id, id), eq(providerAccounts.userId, userId))).run();
    const updated = { ...account, label: normalizedLabel, updatedAt };
    const provider = this.registry.getForUser(id, userId);
    const definition = this.definitions.get(account.providerType);
    if (provider && definition) provider.info.name = `${definition.name} — ${normalizedLabel}`;
    return updated;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const account = this.get(id, userId);
    if (!account) return false;
    await this.registry.unregister(id);
    this.db.delete(providerAccounts).where(and(
      eq(providerAccounts.id, id),
      eq(providerAccounts.userId, userId),
    )).run();
    rmSync(this.accountHome(id), { recursive: true, force: true });
    return true;
  }

  private register(account: ProviderAccountRecord): void {
    const definition = this.definitions.get(account.providerType);
    if (!definition) return;
    const accountHome = this.accountHome(account.id);
    mkdirSync(accountHome, { recursive: true, mode: 0o700 });
    const env = {
      ...definition.env,
      HOME: accountHome,
      USERPROFILE: accountHome,
      XDG_CONFIG_HOME: join(accountHome, ".config"),
      XDG_DATA_HOME: join(accountHome, ".local", "share"),
      XDG_CACHE_HOME: join(accountHome, ".cache"),
      NPM_CONFIG_CACHE: definition.env?.NPM_CONFIG_CACHE
        ?? process.env.NPM_CONFIG_CACHE
        ?? process.env.npm_config_cache
        ?? join(homedir(), ".npm"),
      ...(account.providerType === "codex"
        ? { CODEX_HOME: accountHome, OPENAI_API_KEY: "" }
        : {}),
      ...(account.providerType === "claude-code"
        ? { CLAUDE_CONFIG_DIR: join(accountHome, ".claude"), ANTHROPIC_API_KEY: "" }
        : {}),
    };
    this.registry.register(new AcpProvider({
      ...definition,
      id: account.id,
      providerType: account.providerType,
      ownerUserId: account.userId,
      name: `${definition.name} — ${account.label}`,
      env,
    }));
  }

  private accountHome(id: string): string {
    return join(this.accountsRoot, id);
  }

  private normalizeLabel(label: string): string {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) throw new Error("Account label is required");
    if (normalizedLabel.length > 80) throw new Error("Account label must be 80 characters or fewer");
    return normalizedLabel;
  }
}
