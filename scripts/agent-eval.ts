import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runEvaluation, suiteSchema } from "../packages/gateway/src/evaluation/agent-eval.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: {
    run: { type: "boolean" }, list: { type: "boolean" }, help: { type: "boolean" },
    report: { type: "string" },
    suite: { type: "string", default: path.join(root, "evaluations/basic.json") },
    model: { type: "string" }, "judge-model": { type: "string" },
    gateway: { type: "string", default: "http://127.0.0.1:8000" },
    tasks: { type: "string" }, concurrency: { type: "string", default: "3" },
    repeat: { type: "string", default: "1" }, timeout: { type: "string", default: "300" },
    "max-tool-calls": { type: "string", default: "60" },
    "max-trace-bytes": { type: "string", default: "524288" },
    output: { type: "string" }, "reasoning-effort": { type: "string" },
    "shared-workspace": { type: "boolean" },
  }, strict: true,
});
function emit(update: Record<string, unknown>) { process.stdout.write(JSON.stringify(update) + "\n"); }
function integer(name: string, value: string, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(name + " must be " + min + ".." + max);
  return number;
}
async function main() {
  if (values.help) {
    emit({ state: "help", message: "Use --list (free) or --run --model MODEL. JAIT_EVAL_TOKEN supplies a token to read backend settings; runs always use a fresh private gateway/database. Optional: --judge-model, --tasks id,id, --concurrency 3, --repeat 1, --timeout 300, --output PATH, --reasoning-effort. Run on the gateway host or use --shared-workspace only with the same mounted absolute path. See docs/agent-evaluations.md." });
    return;
  }
  if (values.report) {
    if (values.run) throw new Error("--report cannot be combined with --run");
    const saved = JSON.parse(await readFile(values.report, "utf8")) as { reports?: unknown; cancelled?: boolean };
    if (!Array.isArray(saved.reports)) throw new Error("Not an aggregate evaluation report");
    const counts = { pass: 0, issues: 0, fail: 0, error: 0 };
    for (const entry of saved.reports as { id: string; status: keyof typeof counts; error?: string; verdict?: { summary: string; findings: unknown[] } }[]) {
      if (!Object.hasOwn(counts, entry.status)) throw new Error("Unknown report status");
      counts[entry.status]++;
      emit({ id: entry.id, state: "finished", status: entry.status,
        summary: entry.error ?? entry.verdict?.summary, findings: entry.verdict?.findings ?? [] });
    }
    emit({ state: "summary", output: path.dirname(path.resolve(values.report)), counts,
      cancelled: saved.cancelled ?? false });
    return;
  }
  const suite = suiteSchema.parse(JSON.parse(await readFile(values.suite!, "utf8")));
  const selected = values.tasks?.split(",").map((id) => id.trim()).filter(Boolean);
  if (selected?.some((id) => !suite.tasks.some((task) => task.id === id))) throw new Error("Unknown task id");
  const tasks = selected ? suite.tasks.filter((task) => selected.includes(task.id)) : suite.tasks;
  if (!tasks.length) throw new Error("No tasks selected");
  if (!values.run || values.list) {
    for (const task of tasks) emit({ state: "listed", id: task.id, title: task.title, rubric: task.rubric });
    return;
  }
  const model = values.model?.trim();
  if (!model) throw new Error("--model is required for paid runs");
  const token = process.env.JAIT_EVAL_TOKEN;
  if (!token) throw new Error("Set JAIT_EVAL_TOKEN to a Jait authentication token");
  const url = new URL(values.gateway!);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid gateway URL");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !values["shared-workspace"]) {
    throw new Error("Run on the gateway host, or explicitly use --shared-workspace for matching absolute paths");
  }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Remote gateways require HTTPS");
  const output = path.resolve(values.output ?? path.join(root, "evaluations/runs", new Date().toISOString().replace(/[:.]/g, "-")));
  // Never reuse a run directory: old evidence must not contaminate a new evaluation.
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output, { recursive: false });
  await writeFile(path.join(output, "suite.json"), JSON.stringify({ version: 1, tasks }, null, 2));
  const controller = new AbortController();
  const cancel = () => { emit({ state: "cancelling" }); controller.abort(); };
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try {
    const reports = await runEvaluation(tasks, {
      gateway: url.toString(), token, model, judgeModel: values["judge-model"]?.trim() || model,
      reasoningEffort: values["reasoning-effort"],
      concurrency: integer("concurrency", values.concurrency!, 1, 8),
      repeat: integer("repeat", values.repeat!, 1, 20),
      timeoutSeconds: integer("timeout", values.timeout!, 1, 3600),
      maxToolCalls: integer("max-tool-calls", values["max-tool-calls"]!, 1, 1000),
      maxTraceBytes: integer("max-trace-bytes", values["max-trace-bytes"]!, 1024, 10_000_000),
      output, signal: controller.signal, onProgress: emit,
    });
    const counts = { pass: 0, issues: 0, fail: 0, error: 0 };
    for (const report of reports) counts[report.status]++;
    emit({ state: "summary", output, counts, cancelled: controller.signal.aborted });
    process.exitCode = controller.signal.aborted ? 130 : reports.every((report) => report.status === "pass") ? 0 : 1;
  } finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
}
main().catch((error: unknown) => {
  emit({ state: "fatal", message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 2;
});
