import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlanTask } from "@jait/shared";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { createServer } from "../server.js";
import { PlanService } from "../services/plans.js";
import { RepositoryService } from "../services/repositories.js";
import type { UserService } from "../services/users.js";
import { createFileListTool, createFilePatchTool, createFileReadTool, createFileWriteTool } from "../tools/file-tools.js";
import { ToolRegistry } from "../tools/registry.js";
import { FileSystemSurfaceFactory } from "../surfaces/filesystem.js";
import { SurfaceRegistry } from "../surfaces/registry.js";

/**
 * Live check, not part of the normal suite. It runs one approved writing
 * workflow through the real in-process worker against a real model endpoint,
 * in a scratch repository with synthetic content only.
 *
 * Enable with JAIT_LIVE_WORKFLOW_MODEL, for example deepseek-v4.1-flash:cloud.
 * JAIT_LIVE_WORKFLOW_BASE_URL overrides the OpenAI-compatible endpoint, which
 * defaults to the local Ollama API. Cloud-tagged models send the request
 * content to their hosted service.
 */
const model = process.env["JAIT_LIVE_WORKFLOW_MODEL"];
const baseUrl = process.env["JAIT_LIVE_WORKFLOW_BASE_URL"] ?? "http://127.0.0.1:11434/v1";
const owner = "owner";
const config = { ...loadConfig(), jwtSecret: "plan-runs-live-secret" };
const GREETING = "hello from a live workflow check";

async function auth(userId: string) {
  const token = await signAuthToken({ id: userId, username: userId }, config.jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe.skipIf(!model)("plan run against a live model", () => {
  it("runs one approved writing workflow through the real worker and integrates its file", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "workflow-live-state-"));
    const repoDir = await mkdtemp(join(tmpdir(), "workflow-live-repo-"));
    const previousStateDir = process.env["JAIT_STATE_DIR"];
    process.env["JAIT_STATE_DIR"] = stateDir;
    const database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    // The real filesystem surface factory, so the file tools run the way they do in the gateway.
    const surfaces = new SurfaceRegistry();
    surfaces.register(new FileSystemSurfaceFactory());
    let app: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
      await writeFile(join(repoDir, "README.md"), "scratch repository for a live workflow check\n");
      execFileSync("git", ["add", "README.md"], { cwd: repoDir });
      execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "base"], { cwd: repoDir });
      const mainBefore = execFileSync("git", ["rev-parse", "main"], { cwd: repoDir, encoding: "utf8" }).trim();

      const repoService = new RepositoryService(database.db);
      const planService = new PlanService(database.db);
      const repo = repoService.create({ userId: owner, name: "repo", localPath: repoDir });
      const task: PlanTask = {
        id: "hello",
        title: "Write the greeting",
        description: `Create the file out/hello.txt containing exactly this line: ${GREETING}. Then reply with the JSON report only.`,
        status: "approved",
        resources: { writes: ["out"] },
        verification: [{ id: "file", label: "Greeting file exists", check: { kind: "artifact", path: "out/hello.txt" } }],
      };
      const plan = planService.create({ userId: owner, repoId: repo.id, title: "Live check", tasks: [task] });

      const toolRegistry = new ToolRegistry();
      for (const tool of [createFileReadTool(surfaces), createFileListTool(surfaces), createFileWriteTool(surfaces), createFilePatchTool(surfaces)]) {
        toolRegistry.register(tool);
      }
      const userService = {
        findById: (id: string) => (id === owner ? { id } : undefined),
        getSettings: () => ({
          chatProvider: "jait", jaitBackend: "openai", selectedModel: model,
          apiKeys: { OPENAI_API_KEY: "local", OPENAI_BASE_URL: baseUrl },
        }),
      } as unknown as UserService;
      const gateway = await createServer(config, {
        db: database.db, repoService, planService, userService, toolRegistry,
        toolExecutor: (name, input, context) => toolRegistry.execute(name, input, context),
      });
      app = gateway;
      const headers = await auth(owner);
      const start = await gateway.inject({ method: "POST", url: `/api/plans/${plan.id}/runs`, headers, payload: {} });
      expect(start.statusCode, start.body).toBe(201);
      const runId = start.json().run.id as string;
      const url = `/api/plan-runs/${runId}`;

      const terminal = /^(passed|failed|interrupted|cancelled)$/;
      await expect.poll(async () => (await gateway.inject({ url, headers })).json().run.status, { timeout: 900_000, interval: 2_000 })
        .toMatch(terminal);
      const view = (await gateway.inject({ url, headers })).json().run;
      const attempts = (await gateway.inject({ url: `${url}/tasks/${task.id}/attempts`, headers })).json().attempts;
      console.info(JSON.stringify({ model, baseUrl, status: view.status, error: view.error, tasks: view.tasks, attempts }, null, 2));

      expect(view.status, JSON.stringify({ error: view.error, tasks: view.tasks })).toBe("passed");
      expect(attempts.at(-1)).toMatchObject({ state: "passed", agentRef: expect.any(String) });

      // The change reached the integration branch, and the user's branch did not move.
      const branch = execFileSync("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads/"], { cwd: repoDir, encoding: "utf8" })
        .split("\n").find((name) => name.startsWith("jait/wf/") && name.includes(runId));
      expect(branch, "integration branch for the run").toBeDefined();
      expect(execFileSync("git", ["show", `${branch}:out/hello.txt`], { cwd: repoDir, encoding: "utf8" }).trim()).toBe(GREETING);
      expect(execFileSync("git", ["rev-parse", "main"], { cwd: repoDir, encoding: "utf8" }).trim()).toBe(mainBefore);
    } finally {
      for (const surface of surfaces.listSurfaces()) await surfaces.stopSurface(surface.id, "live check finished").catch(() => {});
      await app?.close();
      database.sqlite.close();
      if (previousStateDir === undefined) delete process.env["JAIT_STATE_DIR"];
      else process.env["JAIT_STATE_DIR"] = previousStateDir;
      await rm(stateDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  }, 1_000_000);
});
