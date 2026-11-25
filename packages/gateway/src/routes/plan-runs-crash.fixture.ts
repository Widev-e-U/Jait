// Child process for the isolated abrupt-restart regression. Never connects to a model provider.
import { writeFile } from "node:fs/promises";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { createServer } from "../server.js";
import { PlanService } from "../services/plans.js";
import { RepositoryService } from "../services/repositories.js";
import type { UserService } from "../services/users.js";
import { ToolRegistry } from "../tools/registry.js";

const [dbPath, planId, readyPath] = process.argv.slice(2);
if (!dbPath || !planId || !readyPath) throw new Error("Missing fixture arguments");
const config = { ...loadConfig(), jwtSecret: "workflow-restart-test-secret" };
const userService = {
  findById: (id: string) => ["owner", "outsider"].includes(id) ? { id } : undefined,
  getSettings: () => ({ chatProvider: "jait", jaitBackend: "openai", selectedModel: "fixture-model",
    apiKeys: { OPENAI_API_KEY: "fixture", OPENAI_BASE_URL: "https://fixture.example.test/v1" } }),
} as unknown as UserService;
const database = await openDatabase(dbPath);
migrateDatabase(database.sqlite);
const repos = new RepositoryService(database.db);
const plans = new PlanService(database.db);
let started!: () => void;
const requestStarted = new Promise<void>((resolve) => { started = resolve; });
globalThis.fetch = async () => {
  started();
  return new Promise<Response>(() => {});
};
const app = await createServer(config, { db: database.db, repoService: repos, planService: plans, userService, toolRegistry: new ToolRegistry() });
const headers = { authorization: `Bearer ${await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret)}` };
const start = await app.inject({ method: "POST", url: `/api/plans/${planId}/runs`, headers, payload: {} });
if (start.statusCode !== 201) throw new Error(`Start failed: ${start.statusCode} ${start.body}`);
const runId: string = start.json().run.id;
await requestStarted;
const attempts = await app.inject({ url: `/api/plan-runs/${runId}/tasks/analyze/attempts`, headers });
if (attempts.json().attempts[0]?.state !== "running") throw new Error("Worker was not running");
await writeFile(readyPath, runId);
// Keep the process alive until the parent deliberately kills it.
setInterval(() => {}, 1000);
