/**
 * Deterministic tool-evidence acceptance checks; no provider/scanner requests.
 * Measures model-visible characters and recovery calls, never claims token cost.
 * Run with: bun scripts/benchmark-tool-evidence.ts
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ContextEvidence } from "../packages/gateway/src/tools/context-evidence.ts";

const scope = { sessionId: "benchmark", userId: "fixture-owner" };
const fixtures = [
  { name: "terminal-tail-failure", result: { ok: false, message: "Command failed", data: {
    output: "Build started\n" + "compiling module\n".repeat(3000) + "ERROR: fixture dependency unavailable",
    executionId: "fixture-execution", exitCode: 1, status: "failed",
  } }, needle: "ERROR: fixture dependency unavailable" },
  { name: "partial-check-coverage", result: { ok: true, message: "Partial fixture check", data: {
    output: "Fixture observations\n" + "observation\n".repeat(3000) + "coverage gap: fixture timeout",
    coverage: { complete: false, skipped: 1 }, warnings: ["Fixture target timed out"],
  } }, needle: "coverage gap: fixture timeout" },
];
const scenarios = fixtures.map(fixture => {
  const store = new ContextEvidence();
  const start = performance.now();
  const projected = store.project(fixture.result, scope, 8000);
  const projectionMs = performance.now() - start;
  const parsed = JSON.parse(projected.content);
  assert.ok(projected.reference);
  assert.ok(projected.content.length <= 8000);
  assert.ok(parsed.data.preview.includes(fixture.needle));
  const recovered = store.read(scope, projected.reference, 0, 1000, fixture.needle);
  assert.equal(recovered.ok, true);
  const match = recovered.data as { content: string; matchOffset: number };
  assert.ok(match.content.includes(fixture.needle));
  let paginationCalls = 0, offset = 0, found = false;
  while (!found) {
    const page = store.read(scope, projected.reference, offset, 1000);
    const data = page.data as { content: string; nextOffset: number; hasMore: boolean };
    paginationCalls++;
    found = data.content.includes(fixture.needle);
    if (!data.hasMore) break;
    offset = data.nextOffset;
  }
  assert.ok(found);
  assert.equal(store.read({ ...scope, userId: "other" }, projected.reference, 0, 1000, fixture.needle).ok, false);
  return { name: fixture.name, fullChars: JSON.stringify(fixture.result).length,
    projectedChars: projected.content.length, projectionMs, paginationRecoveryCalls: paginationCalls,
    searchRecoveryCalls: 1, completionDiagnosticVisible: true };
});
const directory = path.resolve(import.meta.dirname, "../.jait/artifacts");
await mkdir(directory, { recursive: true });
const report = path.join(directory, "tool-evidence-benchmark.json");
await writeFile(report, JSON.stringify({ version: 1, scenarios,
  limits: "Synthetic evidence only. Provider/cache tokens, model latency, retries and task success require whole-task evaluation; no cost saving is asserted.",
}, null, 2) + "\n");
console.log(report);
