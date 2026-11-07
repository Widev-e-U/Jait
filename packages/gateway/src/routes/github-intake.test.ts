import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import type { SqliteDatabase } from "../db/connection.js";
import type { AppConfig } from "../config.js";
import type { AgentGithubAppService } from "../services/agent-github-apps.js";
import { GithubIntakeService } from "../services/github-intake.js";
import { registerAgentGithubAppRoutes } from "./agent-github-apps.js";

let sqlite: SqliteDatabase;
let intake: GithubIntakeService;
let app: ReturnType<typeof Fastify>;
beforeEach(async () => {
  const opened = await openDatabase(":memory:"); sqlite = opened.sqlite; migrateDatabase(sqlite);
  intake = new GithubIntakeService(opened.db);
  const service = { findByAppId: () => ({ userId: "u", agentId: "a" }), webhookSecret: () => "secret" } as unknown as AgentGithubAppService;
  app = Fastify();
  registerAgentGithubAppRoutes(app, {} as AppConfig, { service, intake });
  await app.ready();
});
afterEach(async () => { await app.close(); sqlite.close(); });

describe("GitHub intake webhook", () => {
  it("only records signed deliveries and deduplicates retries", async () => {
    const body = JSON.stringify({ action: "opened", repository: { full_name: "org/repo" }, sender: { login: "alice" } });
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    const headers = { "content-type": "application/json", "x-github-hook-installation-target-id": "1", "x-github-event": "issues", "x-github-delivery": "delivery-1" };
    const send = (sig: string) => app.inject({ method: "POST", url: "/api/github/apps/webhook", headers: { ...headers, "x-hub-signature-256": sig }, payload: body });
    expect((await send("sha256=invalid")).statusCode).toBe(401);
    expect(intake.list("u", "a")).toHaveLength(0);
    expect((await send(signature)).statusCode).toBe(200);
    expect((await send(signature)).statusCode).toBe(200);
    expect(intake.list("u", "a")).toHaveLength(1);
  });
});
