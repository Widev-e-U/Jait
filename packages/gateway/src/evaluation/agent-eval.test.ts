import { execFileSync } from "node:child_process";
import { searchProject } from "../services/project-search.js";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  judgePrompt, EventParser, suiteSchema, parseVerdict, classify, verifyTask, evaluateTask, runChat, runEvaluation,
  type EvalOptions, type EvalTask,
} from "./agent-eval.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-token");
    expect(init?.redirect).toBe("error");
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}

describe("manual agent evaluations (offline)", () => {
  it("isolates fixture search from the parent repository's ignored run folder", async () => {
    const root = await directory();
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    await writeFile(path.join(root, ".gitignore"), "runs/\n");
    const output = path.join(root, "runs"); await mkdir(output);
    const mock = gateway();
    const report = await evaluateTask(task(), "read-evidence-1", options(output, mock.fetchImpl));
    const result = await searchProject({ root: report.workspace, query: "fixture.json", mode: "files" }, { rgCommand: "jait-missing-rg" });
    expect(result.mode === "files" && result.files.map(f => f.name)).toEqual(["fixture.json"]);
  });
  it("retries malformed judge format once and preserves both traces", async () => {
    const mock = gateway(); let judges = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (new URL(String(input)).pathname === "/api/chat" && body.mode === "ask" && ++judges === 1) {
        return stream([{ type: "token", content: "Evidence reviewed.\n" + JSON.stringify(verdict) }, { type: "done" }]);
      }
      return mock.fetchImpl(input, init);
    };
    const output = await directory();
    const report = await evaluateTask(task(), "read-evidence-1", options(output, fetchImpl));
    expect(report.status).toBe("pass"); expect(judges).toBe(2);
    expect(report.judge?.content).toContain("Evidence reviewed.");
    expect(JSON.parse(await readFile(path.join(output, "read-evidence-1/judge-retry-trace.json"), "utf8")).content).toBe(JSON.stringify(verdict));
  });
  it("validates citations even after a format retry", async () => {
    const mock = gateway({ ...verdict, findings: [{ severity: "warning", category: "tool_failure", message: "Invented", callIds: ["unknown"] }] });
    let judges = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (new URL(String(input)).pathname === "/api/chat" && body.mode === "ask" && ++judges === 1) {
        return stream([{ type: "token", content: "not JSON" }, { type: "done" }]);
      }
      return mock.fetchImpl(input, init);
    };
    const report = await evaluateTask(task(), "read-evidence-1", options(await directory(), fetchImpl));
    expect(report.status).toBe("error"); expect(report.error).toContain("unknown tool call");
  });
  it("stops after one malformed judge retry", async () => {
    const mock = gateway("invalid verdict");
    const report = await evaluateTask(task(), "read-evidence-1", options(await directory(), mock.fetchImpl));
    expect(report.status).toBe("error");
    expect(mock.bodies.filter(body => body.mode === "ask")).toHaveLength(2);
  });

  it("rejects duplicate ids, fixture traversal and absolute paths", () => {
    const example = task();
    expect(() => suiteSchema.parse({ version: 1, tasks: [example, example] })).toThrow("Duplicate");
    for (const name of ["../escape", "/absolute", "C:/absolute", "folder/../escape", "folder\\escape"]) {
      expect(() => suiteSchema.parse({ version: 1, tasks: [{ ...example, fixtures: { [name]: "bad" } }] })).toThrow();
    }
  });
  it("decodes split and CRLF SSE frames including a final unclosed line", () => {
    const parser = new EventParser();
    expect(parser.push('data: {"ty')).toEqual([]);
    expect(parser.push('pe":"token","content":"héllo"}\r\n\r\n: keepalive\n')).toEqual([{ type: "token", content: "héllo" }]);
    expect(parser.push('data: {"type":"done"}', true)).toEqual([{ type: "done" }]);
    expect(() => parser.push("data: not-json\n")).toThrow();
  });
  it("requires structured verdicts and rejects extra fields or unsupported outcomes", () => {
    const ticks = String.fromCharCode(96).repeat(3);
    expect(parseVerdict(ticks + "json\n" + JSON.stringify(verdict) + "\n" + ticks).outcome).toBe("pass");
    expect(() => parseVerdict('{"outcome":"success"}')).toThrow();
    expect(() => parseVerdict(JSON.stringify({ ...verdict, fabricatedScore: 100 }))).toThrow();
  });
  it("keeps deterministic failures and process concerns separate", () => {
    const passed = [{ name: "fixture", passed: true, detail: "matches" }];
    expect(classify(passed, { ...verdict, findings: [] })).toBe("pass");
    expect(classify([{ ...passed[0]!, passed: false }], { ...verdict, findings: [] })).toBe("fail");
    expect(classify(passed, { ...verdict, process: "issues", findings: [] })).toBe("issues");
    expect(classify(passed, { ...verdict, outcome: "uncertain", findings: [] })).toBe("issues");
  });
  it("compares JSON structurally and contains verifier failures", async () => {
    const output = await directory();
    await writeFile(path.join(output, "fixture.json"), '{"port":8080}');
    const example = task();
    example.checks.push({ type: "command", executable: process.execPath, args: ["-e", "process.exit(7)"], timeoutSeconds: 3 });
    const results = await verifyTask(example, output);
    expect(results.map((result) => result.passed)).toEqual([true, false]);
    expect(results[1]?.detail).toContain("Exit 7");
    await writeFile(path.join(output, "fixture.json"), '{"b":2,"a":1}');
    example.checks = [{ type: "json", path: "fixture.json", equals: { a: 1, b: 2 } }];
    expect((await verifyTask(example, output))[0]?.passed).toBe(true);
  });
  it("rejects symlink escapes in independent file checks", async () => {
    const output = await directory(), outside = await directory();
    await writeFile(path.join(outside, "secret"), "outside");
    await symlink(path.join(outside, "secret"), path.join(output, "fixture.json"));
    const result = await verifyTask(task(), output);
    expect(result[0]?.passed).toBe(false); expect(result[0]?.detail).toContain("escaped");
  });
  it("runs through chat with pinned models and a read-only judge, saving full evidence", async () => {
    const mock = gateway(), output = await directory();
    const report = await evaluateTask(task(), "read-evidence-1", options(output, mock.fetchImpl));
    expect(report.status).toBe("pass");
    const chats = mock.bodies.filter((body) => body.provider === "jait");
    expect(chats.map((body) => [body.mode, body.model])).toEqual([["agent", "pinned-model"], ["ask", "pinned-judge"]]);
    expect(chats[1]?.content).toContain('"call_id":"read-1"');
    const evidence = JSON.parse(await readFile(path.join(output, "read-evidence-1/judge/evidence.json"), "utf8"));
    expect(evidence.worker.events).toHaveLength(3);
    expect(evidence.worker.content).toBe("Verified the fixture.");
    expect(JSON.parse(await readFile(path.join(output, "read-evidence-1/worker-trace.json"), "utf8")).events).toHaveLength(4);
    expect(await readFile(path.join(output, "read-evidence-1/judge/subject/fixture.json"), "utf8")).toBe('{"port":8080}');
    expect(JSON.parse(await readFile(path.join(output, "read-evidence-1/report.json"), "utf8")).status).toBe("pass");
  });
  it("preserves successful tasks with failed tools as process issues", async () => {
    const mock = gateway({ ...verdict, process: "issues", findings: [{
      severity: "warning", category: "workaround", message: "Unexpected retry.", callIds: ["read-1"],
    }] });
    const report = await evaluateTask(task(), "read-evidence-1", options(await directory(), mock.fetchImpl));
    expect(report.status).toBe("issues");
  });
  it("refuses invented judge citations", async () => {
    const mock = gateway({ ...verdict, findings: [{
      severity: "warning", category: "tool_failure", message: "Invented.", callIds: ["nonexistent"],
    }] });
    const report = await evaluateTask(task(), "read-evidence-1", options(await directory(), mock.fetchImpl));
    expect(report.status).toBe("error"); expect(report.error).toContain("unknown tool call");
  });
  it("cancels an incomplete stream and saves its error", async () => {
    const mock = gateway();
    const fetchImpl: typeof fetch = async (input, init) => new URL(String(input)).pathname === "/api/chat"
      ? stream([{ type: "token", content: "unfinished" }]) : mock.fetchImpl(input, init);
    const result = await runChat(options(await directory(), fetchImpl), "/fixture", "task", "worker", "case");
    expect(result.error).toContain("without a done"); expect(mock.cancelled).toBe(1);
  });
  it("stops for approval, enforces tool limits and honors cancellation", async () => {
    for (const events of [
      [{ type: "approval_required", request_id: "approval-1" }],
      Array.from({ length: 11 }, (_, i) => ({ type: "tool_start", call_id: String(i) })),
    ]) {
      const mock = gateway();
      const fetchImpl: typeof fetch = async (input, init) => new URL(String(input)).pathname === "/api/chat"
        ? stream(events) : mock.fetchImpl(input, init);
      const result = await runChat(options(await directory(), fetchImpl), "/fixture", "task", "worker", "case");
      expect(result.error).toBeDefined(); expect(mock.cancelled).toBe(1);
    }
    const mock = gateway(), controller = new AbortController();
    controller.abort();
    const result = await runChat({ ...options(await directory(), mock.fetchImpl), signal: controller.signal },
      "/fixture", "task", "worker", "case");
    expect(result.error).toBeDefined(); expect(mock.bodies).toHaveLength(0);
  });
  it("does not grade a clipped worker trace", async () => {
    const mock = gateway(), settings = options(await directory(), mock.fetchImpl);
    settings.maxTraceBytes = 5;
    const report = await evaluateTask(task(), "read-evidence-1", settings);
    expect(report.status).toBe("error"); expect(report.judge).toBeUndefined();
    expect(mock.cancelled).toBe(1);
  });
  it("handles actual HTTP SSE and timeout cancellation without any model calls", async () => {
    let cancelled = false;
    const server = createServer((request, response) => {
      if (request.url === "/api/sessions") {
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ id: "http-fixture" }));
      } else if (request.url === "/api/sessions/http-fixture/cancel") {
        cancelled = true;
        response.writeHead(200, { "content-type": "application/json" }); response.end("{}");
      } else {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write('data: {"type":"token","content":"waiting"}\n\n');
        // Keep the connection open to exercise actual fetch abort/body cancellation.
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    try {
      const settings = options(await directory(), globalThis.fetch);
      settings.gateway = "http://127.0.0.1:" + address.port;
      settings.timeoutSeconds = 0.05;
      const result = await runChat(settings, "/fixture", "task", "worker", "case");
      expect(result.error).toBeDefined(); expect(cancelled).toBe(true);
      expect(result.content).toBe("waiting");
    } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("runs repetitions in isolated directories with bounded concurrency and an aggregate report", async () => {
    const mock = gateway(), settings = options(await directory(), mock.fetchImpl);
    settings.repeat = 3;
    const reports = await runEvaluation([task()], settings);
    expect(reports).toHaveLength(3);
    expect(new Set(reports.map((report) => report.workspace)).size).toBe(3);
    expect(mock.maximum).toBe(2);
    const aggregate = JSON.parse(await readFile(path.join(settings.output, "report.json"), "utf8"));
    expect(aggregate.model).toBe("pinned-model"); expect(aggregate.reports).toHaveLength(3);
    expect(JSON.stringify(aggregate)).not.toContain("fixture-token");
  });
});

it("sends judges complete tool evidence without streaming or reasoning duplication", () => {
  const events = [
    ...Array.from({ length: 1000 }, () => ({ type: "thinking", content: "private reasoning fragment" })),
    { type: "tool_call_delta", call_id: "c", args_delta: "fragment" },
    { type: "tool_start", call_id: "c", tool: "file.write", args: { content: "é\r\n" } },
    { type: "tool_result", call_id: "c", tool: "file.write", ok: false, message: "exact failure" },
    { type: "token", content: "Verified." }, { type: "done" },
  ];
  const prompt = judgePrompt(task(), { sessionId: "s", events, content: "Verified.", durationMs: 1 }, []);
  expect(prompt).not.toContain("private reasoning fragment");
  expect(prompt).not.toContain('"type":"tool_call_delta"');
  expect(prompt).toContain("exact failure");
  expect(prompt).toContain(JSON.stringify({ content: "é\r\n" }));
  expect(prompt.length).toBeLessThan(10000);
});
it("keeps reports and verification manifests outside worker workspace ancestry", async () => {
  const output = await directory(), mock = gateway();
  await writeFile(path.join(output, "suite.json"), "hidden-verifier");
  const report = await evaluateTask(task(), "read-evidence-1", options(output, mock.fetchImpl));
  temporary.push(path.dirname(report.workspace));
  expect(report.workspace.startsWith(output + path.sep)).toBe(false);
  expect(mock.bodies.find(body => body.mode === "agent")?.content).toContain("Stay inside");
});
