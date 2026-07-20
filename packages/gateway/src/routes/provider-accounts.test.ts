import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { ProviderAccountService } from "../services/provider-accounts.js";
import { UserService } from "../services/users.js";
import { registerProviderRoutes } from "./providers.js";

async function authHeader(jwtSecret: string, userId: string, username: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("provider account routes", () => {
  it("keeps Codex accounts scoped to their owning user", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const config = { ...loadConfig(), jwtSecret: "provider-account-test", logLevel: "silent" };
    const users = new UserService(db);
    const firstUser = users.createUser("first-user", "password123");
    const secondUser = users.createUser("second-user", "password123");
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(tmpdir(), "jait-provider-route-"));
    const accounts = new ProviderAccountService(db, registry, [
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
    ], root);
    const app = Fastify({ logger: false });
    registerProviderRoutes(app, config, {
      providerRegistry: registry,
      providerAccountService: accounts,
      userService: users,
    });

    const firstHeaders = await authHeader(config.jwtSecret, firstUser.id, firstUser.username);
    const secondHeaders = await authHeader(config.jwtSecret, secondUser.id, secondUser.username);
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/provider-accounts",
      headers: firstHeaders,
      payload: { providerType: "codex", label: "Work" },
    });

    expect(createdResponse.statusCode).toBe(201);
    const accountId = createdResponse.json().account.id as string;
    expect(registry.getForUser(accountId, firstUser.id)).toBeDefined();
    expect(registry.getForUser(accountId, secondUser.id)).toBeUndefined();

    const firstList = await app.inject({ method: "GET", url: "/api/provider-accounts", headers: firstHeaders });
    const secondList = await app.inject({ method: "GET", url: "/api/provider-accounts", headers: secondHeaders });
    expect(firstList.json().accounts).toHaveLength(1);
    expect(secondList.json().accounts).toHaveLength(0);
    expect(firstList.json().providerTypes).toEqual([
      expect.objectContaining({ providerType: "codex", name: "Codex" }),
      expect.objectContaining({ providerType: "claude-code", name: "Claude Code" }),
    ]);

    const forbiddenDelete = await app.inject({
      method: "DELETE",
      url: `/api/provider-accounts/${accountId}`,
      headers: secondHeaders,
    });
    expect(forbiddenDelete.statusCode).toBe(404);
    expect(registry.get(accountId)).toBeDefined();

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/provider-accounts/${accountId}`,
      headers: firstHeaders,
    });
    expect(deleted.statusCode).toBe(200);
    expect(registry.get(accountId)).toBeUndefined();

    await app.close();
    sqlite.close();
    rmSync(root, { recursive: true, force: true });
  });
});
