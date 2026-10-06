import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { runEvaluation, suiteSchema } from "./agent-eval.js";
import { startIsolatedEvaluationGateway } from "./isolated-gateway.js";

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No bound address");
  return "http://127.0.0.1:" + address.port;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
it("creates eval sessions only in a fresh private gateway and removes its database", async () => {
  const requests: string[] = [];
  let modelCalls = 0;
  const llm = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk.toString();
    const body = JSON.parse(raw || "{}");
    modelCalls++;
    const judging = body.messages?.some((m: { content?: string }) => typeof m.content === "string" && m.content.includes("You are an independent evaluator"));
    const content = judging ? JSON.stringify({ outcome: "pass", process: "pass", summary: "Verified", findings: [] }) : "Verified the fixture.";
    if (!body.stream) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] })); return; }
    res.setHeader("content-type", "text/event-stream");
    res.end('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + '\n\ndata: [DONE]\n\n');
  });
  const llmUrl = await listen(llm);
  const source = createServer((req, res) => {
    requests.push(req.method + " " + req.url);
    if (req.method !== "GET" || req.url !== "/api/auth/settings") { res.statusCode = 500; res.end("No writes allowed on source gateway"); return; }
    expect(req.headers.authorization).toBe("Bearer source-token");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ api_keys: { OPENAI_API_KEY: "fixture-key", OPENAI_BASE_URL: llmUrl + "/v1" }, disabled_tools: [], jait_backend: "openai", selected_model: "fixture-model", reasoning_effort: null }));
  });
  const gateway = await listen(source);
  const output = await mkdtemp(path.join(tmpdir(), "jait-eval-isolation-test-"));
  let privateState = "";
  const previousDbPath = process.env.JAIT_DB_PATH;
  const sentinel = path.join(output, "source-sentinel.db");
  await writeFile(sentinel, "source database must stay untouched");
  process.env.JAIT_DB_PATH = sentinel;
  try {
    // Boot and create a project without model calls to verify API persistence is local.
    const isolated = await startIsolatedEvaluationGateway({ gateway, token: "source-token" });
    privateState = isolated.state;
    try {
      expect((await stat(path.join(privateState, "data/jait.db"))).isFile()).toBe(true);
      const headers = { authorization: "Bearer " + isolated.token, "content-type": "application/json" };
      const before = await fetch(isolated.gateway + "/api/projects", { headers }).then(r => r.json());
      expect(before.projects).toEqual([]);
      const session = await fetch(isolated.gateway + "/api/sessions", { method: "POST", headers, body: JSON.stringify({ name: "Eval isolation", projectPath: output }) });
      expect(session.status).toBe(201);
      const projects = await fetch(isolated.gateway + "/api/projects", { headers }).then(r => r.json());
      expect(projects.projects).toHaveLength(1);
    } finally { await isolated.stop(); }
    await expect(stat(privateState)).rejects.toMatchObject({ code: "ENOENT" });
    const tasks = suiteSchema.parse({ version: 1, tasks: [{ id: "isolation", title: "Isolation", prompt: "Read the fixture and report completion.", fixtures: { "fixture.txt": "fixture" }, checks: [{ type: "file", path: "fixture.txt", equals: "fixture" }], rubric: ["Report completion"] }] }).tasks;
    const reports = await runEvaluation(tasks, { gateway, token: "source-token", output, model: "fixture-model", judgeModel: "fixture-model", concurrency: 1, repeat: 1, timeoutSeconds: 20, maxToolCalls: 5, maxTraceBytes: 200_000 });
    expect(reports[0]?.status, JSON.stringify(reports)).toBe("pass");
    expect(modelCalls).toBeGreaterThanOrEqual(2);
    expect(requests).toEqual(["GET /api/auth/settings", "GET /api/auth/settings"]);
    const saved = JSON.parse(await readFile(path.join(output, "report.json"), "utf8"));
    expect(saved.gateway).not.toBe(gateway);
    expect(saved.databaseIsolation).toBe("temporary");
    expect(await readFile(sentinel, "utf8")).toBe("source database must stay untouched");
    await rm(path.dirname(reports[0]!.workspace), { recursive: true, force: true });
  } finally {
    if (previousDbPath === undefined) delete process.env.JAIT_DB_PATH;
    else process.env.JAIT_DB_PATH = previousDbPath;
    await close(source); await close(llm); await rm(output, { recursive: true, force: true }); }
}, 90_000);
