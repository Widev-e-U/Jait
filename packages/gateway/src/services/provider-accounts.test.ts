import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ProviderRegistry } from "../providers/registry.js";
import { ProviderAccountService } from "./provider-accounts.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ProviderAccountService", () => {
  it("creates isolated Codex adapters per user account", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(tmpdir(), "jait-provider-accounts-"));
    roots.push(root);
    const service = new ProviderAccountService(db, registry, [{
      id: "codex",
      name: "Codex",
      description: "Codex test provider",
      command: process.execPath,
      args: [],
    }], root);

    const personal = service.create("user-1", "codex", "Personal");
    const work = service.create("user-1", "codex", "Work");

    expect(personal.id).not.toBe(work.id);
    expect(service.list("user-1").map((account) => account.label).sort()).toEqual(["Personal", "Work"]);
    expect(registry.getForUser(personal.id, "user-1")?.providerType).toBe("codex");
    expect(registry.getForUser(personal.id, "user-2")).toBeUndefined();

    const personalAdapter = registry.get(personal.id) as unknown as { config: { env?: Record<string, string> } };
    const workAdapter = registry.get(work.id) as unknown as { config: { env?: Record<string, string> } };
    expect(personalAdapter.config.env?.CODEX_HOME).toBe(join(root, personal.id));
    expect(workAdapter.config.env?.CODEX_HOME).toBe(join(root, work.id));
    expect(personalAdapter.config.env?.CODEX_HOME).not.toBe(workAdapter.config.env?.CODEX_HOME);
    expect(existsSync(join(root, personal.id))).toBe(true);

    sqlite.close();
  });

  it("creates isolated adapters for every login-capable ACP provider", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(tmpdir(), "jait-provider-accounts-"));
    roots.push(root);
    const service = new ProviderAccountService(db, registry, [
      {
        id: "codex",
        name: "Codex",
        description: "Codex test provider",
        command: process.execPath,
      },
      {
        id: "claude-code",
        name: "Claude Code",
        description: "Claude Code test provider",
        command: process.execPath,
      },
      {
        id: "local-acp",
        name: "Local ACP",
        description: "ACP provider without Jait-managed login",
        command: process.execPath,
        auth: false,
      },
    ], root);

    expect(service.listTypes()).toEqual([
      expect.objectContaining({ providerType: "codex", name: "Codex" }),
      expect.objectContaining({ providerType: "claude-code", name: "Claude Code" }),
    ]);

    const personal = service.create("user-1", "claude-code", "Personal");
    const work = service.create("user-1", "claude-code", "Work");
    const personalAdapter = registry.get(personal.id) as unknown as { config: { env?: Record<string, string> } };
    const workAdapter = registry.get(work.id) as unknown as { config: { env?: Record<string, string> } };

    expect(personalAdapter.config.env?.HOME).toBe(join(root, personal.id));
    expect(workAdapter.config.env?.HOME).toBe(join(root, work.id));
    expect(personalAdapter.config.env?.CLAUDE_CONFIG_DIR).not.toBe(workAdapter.config.env?.CLAUDE_CONFIG_DIR);
    expect(personalAdapter.config.env?.NPM_CONFIG_CACHE).toBe(workAdapter.config.env?.NPM_CONFIG_CACHE);
    expect(personalAdapter.config.env?.ANTHROPIC_API_KEY).toBe("");
    expect(() => service.create("user-1", "local-acp", "Local")).toThrow(
      "Provider accounts are not supported for local-acp",
    );

    sqlite.close();
  });

  it("removes only the selected account and credential directory", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(tmpdir(), "jait-provider-accounts-"));
    roots.push(root);
    const service = new ProviderAccountService(db, registry, [{
      id: "codex",
      name: "Codex",
      description: "Codex test provider",
      command: process.execPath,
    }], root);

    const first = service.create("user-1", "codex", "First");
    const second = service.create("user-1", "codex", "Second");
    expect(await service.delete(first.id, "user-2")).toBe(false);
    expect(await service.delete(first.id, "user-1")).toBe(true);

    expect(registry.get(first.id)).toBeUndefined();
    expect(existsSync(join(root, first.id))).toBe(false);
    expect(registry.get(second.id)).toBeDefined();
    expect(existsSync(join(root, second.id))).toBe(true);

    sqlite.close();
  });

  it("rejects duplicate labels and unknown account types", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(tmpdir(), "jait-provider-accounts-"));
    roots.push(root);
    const service = new ProviderAccountService(db, registry, [{
      id: "codex",
      name: "Codex",
      description: "Codex test provider",
      command: process.execPath,
    }], root);

    service.create("user-1", "codex", "Work");
    expect(() => service.create("user-1", "codex", "Work")).toThrow();
    expect(() => service.create("user-1", "claude-code", "Work")).toThrow(
      "Provider accounts are not supported for claude-code",
    );

    sqlite.close();
  });
});
