import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function startIsolatedEvaluationGateway(source: { gateway: string; token: string; signal?: AbortSignal }) {
  source.signal?.throwIfAborted();
  const response = await fetch(new URL("/api/auth/settings", source.gateway), {
    headers: { Authorization: "Bearer " + source.token }, redirect: "error",
    signal: source.signal ? AbortSignal.any([source.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Cannot read evaluation backend settings: HTTP " + response.status);
  const settings = await response.json();
  const state = await mkdtemp(path.join(tmpdir(), "jait-eval-state-"));
  await chmod(state, 0o700);
  const child = spawn("bun", [fileURLToPath(new URL("./isolated-gateway-child.ts", import.meta.url))], {
    env: { ...process.env, __JAIT_CLI: "1", JAIT_STATE_DIR: state, JAIT_DB_PATH: path.join(state, "data/jait.db"),
      PORT: "0", WS_PORT: "0", HOST: "127.0.0.1", JWT_SECRET: randomUUID(), LOG_LEVEL: "warn",
      JAIT_PRIMARY_GATEWAY: "", JAIT_PRIMARY_TOKEN: "", JAIT_NODE_ONLY: "false" },
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
  const closed = new Promise<void>(resolve => { child.once("close", () => resolve()); child.once("error", () => resolve()); });
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    try { await closed; } finally { clearTimeout(timer); await rm(state, { recursive: true, force: true }); }
  };
  child.stdin.on("error", () => {});
  let stderr = "";
  child.stderr.on("data", chunk => { stderr = (stderr + String(chunk)).slice(-4_000); });
  try {
    const ready = await new Promise<{ port: number; token: string }>((resolve, reject) => {
      let buffer = "";
      const fail = () => reject(new Error("Isolated evaluation gateway did not start. " + stderr));
      const timer = setTimeout(fail, 60_000);
      const abort = () => reject(new Error("Evaluation cancelled during isolated gateway startup"));
      source.signal?.addEventListener("abort", abort, { once: true });
      const cleanup = () => { clearTimeout(timer); source.signal?.removeEventListener("abort", abort); };
      child.once("error", error => { cleanup(); reject(error); });
      child.once("close", () => { cleanup(); fail(); });
      child.stdout.on("data", chunk => {
        buffer += String(chunk);
        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          if (!line.startsWith("JAIT_EVAL_READY ")) continue;
          try {
            const info = JSON.parse(line.slice(16));
            if (!Number.isInteger(info.port) || info.port <= 0 || typeof info.token !== "string") throw new Error("Invalid isolated gateway readiness");
            cleanup(); resolve(info);
          } catch (error) { cleanup(); reject(error); }
        }
        if (buffer.length > 64_000) buffer = buffer.slice(-64_000);
      });
      child.stdin.end(JSON.stringify(settings));
    });
    return { gateway: "http://127.0.0.1:" + ready.port, token: ready.token, state, stop };
  } catch (error) { await stop(); throw error; }
}
