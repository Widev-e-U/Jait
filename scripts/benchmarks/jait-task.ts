// One Harbor task through the native Jait provider in a fresh evaluation gateway.
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EventParser, type EvalEvent } from "../../packages/gateway/src/evaluation/agent-eval.js";

const runtime = import.meta.dirname;
const artifacts = path.resolve(runtime, "../../.jait/artifacts");
const state = path.join(artifacts, "state");
const logs = path.join(artifacts, "run");
const model = process.env.JAIT_BENCH_MODEL;
const baseUrl = process.env.JAIT_BENCH_BASE_URL;
if (!model || !baseUrl) throw new Error("Explicit benchmark model and base URL required");
const prompt = await readFile(process.argv[2]!, "utf8");
const workspace = process.cwd();
await mkdir(state, { recursive: true });
await mkdir(logs, { recursive: true });
const child = spawn(process.execPath, [path.join(runtime, "gateway.js")], {
  env: {
    ...process.env, __JAIT_CLI: "1",
    JAIT_STATE_DIR: state, JAIT_DB_PATH: path.join(state, "data/jait.db"),
    HOST: "127.0.0.1", PORT: "0", WS_PORT: "0", JWT_SECRET: randomUUID(),
    LOG_LEVEL: "warn", LLM_PROVIDER: "openai", OPENAI_API_KEY: process.env.JAIT_BENCH_API_KEY ?? "ollama",
    OPENAI_BASE_URL: baseUrl, OPENAI_MODEL: model, CONTEXT_WINDOW: "131072",
    JAIT_PRIMARY_GATEWAY: "", JAIT_PRIMARY_TOKEN: "", JAIT_NODE_ONLY: "false",
  },
  stdio: ["pipe", "pipe", "pipe"],
});
const closed = new Promise<void>(resolve => {
  child.once("close", () => resolve()); child.once("error", () => resolve());
});
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), Number(process.env.JAIT_BENCH_TIMEOUT ?? 900) * 1000);
const cancel = () => controller.abort();
process.once("SIGTERM", cancel); process.once("SIGINT", cancel);
const gatewayLog: string[] = [];
child.stderr.on("data", chunk => gatewayLog.push(String(chunk)));
const events: EvalEvent[] = [];
let sessionId = "", gateway = "", token = "", error: string | undefined;
const started = Date.now();
async function request(endpoint: string, body: unknown, signal = controller.signal) {
  const response = await fetch(new URL(endpoint, gateway), {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal, redirect: "error",
  });
  if (!response.ok) throw new Error(endpoint + ": HTTP " + response.status + " " + (await response.text()).slice(0, 1000));
  return response;
}
try {
  const ready = await new Promise<{ port: number; token: string }>((resolve, reject) => {
    let buffer = "";
    const failed = () => reject(new Error("Isolated gateway exited before readiness"));
    child.once("close", failed); child.once("error", reject);
    controller.signal.addEventListener("abort", () => reject(new Error("Gateway startup timed out")), { once: true });
    child.stdout.on("data", chunk => {
      buffer += String(chunk);
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (line.startsWith("JAIT_EVAL_READY ")) {
          child.removeListener("close", failed);
          resolve(JSON.parse(line.slice(16)));
        } else gatewayLog.push(line + "\n");
      }
      if (buffer.length > 64_000) buffer = buffer.slice(-64_000);
    });
    child.stdin.end(JSON.stringify({ jait_backend: "openai", reasoning_effort: "high" }));
  });
  gateway = "http://127.0.0.1:" + ready.port; token = ready.token;
  const session = await (await request("/api/sessions", { name: "Harbor benchmark", projectPath: workspace })).json() as { id: string };
  sessionId = session.id;
  const response = await request("/api/chat", {
    sessionId, content: prompt, provider: "jait", mode: "agent", model, reasoningEffort: "high",
  });
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("Expected Jait SSE");
  const parser = new EventParser(), decoder = new TextDecoder();
  const reader = response.body.getReader();
  let done = false, bytes = 0;
  const accept = (event: EvalEvent) => {
    events.push(event);
    if (event.type === "error") throw new Error(String(event.message ?? "Provider error"));
    if (event.type === "approval_required" || event.type === "user_question") throw new Error("Task requires user input");
    if (event.type === "done") done = true;
  };
  try {
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) {
        for (const event of parser.push(decoder.decode(), true)) accept(event);
        break;
      }
      bytes += chunk.value.byteLength;
      if (bytes > 20_000_000) throw new Error("Trace budget exceeded");
      for (const event of parser.push(decoder.decode(chunk.value, { stream: true }))) accept(event);
    }
    if (!done) throw new Error("Stream ended without done");
  } finally { await reader.cancel().catch(() => {}); }
} catch (cause) {
  error = cause instanceof Error ? cause.message : String(cause);
  if (sessionId) await request("/api/sessions/" + encodeURIComponent(sessionId) + "/cancel", {}, AbortSignal.timeout(5000)).catch(() => {});
} finally {
  clearTimeout(timer); process.removeListener("SIGTERM", cancel); process.removeListener("SIGINT", cancel);
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
  await closed; clearTimeout(killTimer);
  await writeFile(path.join(logs, "jait-events.jsonl"), events.map(event => JSON.stringify(event)).join("\n") + "\n");
  await writeFile(path.join(logs, "jait-gateway.log"), gatewayLog.join("").slice(-200_000));
  await writeFile(path.join(logs, "jait-result.json"), JSON.stringify({
    model, provider: "jait", durationMs: Date.now() - started, error,
    toolCalls: events.filter(event => event.type === "tool_start").length,
    toolErrors: events.filter(event => event.type === "tool_result" && event.isError === true).length,
  }, null, 2));
}
if (error) { console.error(error); process.exitCode = 1; }
