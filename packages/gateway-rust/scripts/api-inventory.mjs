#!/usr/bin/env node
// Regenerates packages/gateway-rust/API-INVENTORY.md.
// Node side: every `app.<method>("<path>")` in packages/gateway/src/{server.ts,routes/*.ts}.
// Rust side: every `.route("<path>", get(..).post(..))` under packages/gateway-rust/src.
// Heuristic path and method references; dispatch matching ignores the method:
//   no-route-reference       - no matching route or dispatch reference found
//   route-reference          - matching route or dispatch reference found
//   route-and-test-reference - matching route and test path references found
// These labels are heuristic leads, not verified parity: a matching path can occur in
// an unmounted router, a stub, or a test that exercises different behavior.
import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const crate = join(here, "..");
const repo = join(crate, "..", "..");
const nodeSrc = join(repo, "packages", "gateway", "src");

const walk = (dir, keep) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, keep) : keep(path) ? [path] : [];
  });

const norm = (path) =>
  path
    .split("?")[0]
    .replace(/:[A-Za-z0-9_]+\??/g, "{}")
    .replace(/\{\*?[A-Za-z0-9_]*\}/g, "{}")
    .replace(/\/\*$/, "/{}")
    .replace(/\/+$/, "") || "/";

// ---- Node routes
const nodeFiles = [join(nodeSrc, "server.ts"), ...walk(join(nodeSrc, "routes"), (p) => p.endsWith(".ts") && !p.endsWith(".test.ts"))];
const routeRe = /\b(?:app|fastify|server)\.(get|post|put|patch|delete|all)\s*(?:<[^()]*?>)?\(\s*["'`]([^"'`]+)["'`]/g;
const nodeRoutes = [];
for (const file of nodeFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(routeRe)) {
    if (!m[2].startsWith("/")) continue;
    nodeRoutes.push({ method: m[1].toUpperCase(), path: m[2], key: norm(m[2]), file: relative(nodeSrc, file) });
  }
}

// ---- Rust routes
const rustFiles = walk(join(crate, "src"), (p) => p.endsWith(".rs"));
const rustRoutes = new Map(); // key -> Set(method)
const rustRouteRe = /\.route\(\s*"([^"]+)"\s*,\s*([^;]*?)\)\s*(?=\.route\(|\.with_state|\.layer|\.merge|\.fallback|;|,\s*\)|\n\s*\))/gs;
for (const file of rustFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(rustRouteRe)) {
    const key = norm(m[1]);
    const methods = rustRoutes.get(key) ?? new Set();
    for (const h of m[2].matchAll(/\b(get|post|put|patch|delete|any)\s*\(/g)) methods.add(h[1].toUpperCase());
    rustRoutes.set(key, methods);
  }
}

// Catch-all routes (`/api/project/{*rest}`) dispatch on literal paths inside the handler;
// treat a literal path string in non-test source as a registration with any method.
const dispatched = new Set();
for (const file of rustFiles.filter((p) => !/tests?\.rs$/.test(p))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/"(\/(?:api|preview)\/[A-Za-z0-9_\-./{}:*]+)"/g)) dispatched.add(norm(m[1]));
}

// Catch-all dispatchers also match with `mid(&path, "/api/x/", "/suffix")`, which names `/api/x/{}/suffix`.
// Handlers that only answer a fixed "unavailable" body are not counted as native.
const STUBS = new Set(["/api/projects/{}/repository"]);
for (const file of rustFiles.filter((p) => !/tests?\.rs$/.test(p))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\bmid\(\s*&?path\s*,\s*"(\/api\/[A-Za-z0-9_\-./]*)"\s*,\s*"([A-Za-z0-9_\-./]*)"\s*\)/g)) {
    const key = norm(`${m[1]}{}${m[2]}`);
    if (!STUBS.has(key)) dispatched.add(key);
  }
}

// ---- Test references
const testFiles = [
  ...walk(join(crate, "tests"), (p) => p.endsWith(".rs")),
  ...rustFiles.filter((p) => /tests?\.rs$/.test(p) || /_tests\.rs$/.test(p)),
];
const tested = new Set();
for (const file of testFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/"(?:\{base\})?(\/(?:api|preview|mcp|health|ws)[^"\s]*)"/g)) {
    tested.add(norm(m[1].replace(/\{[^}]*\}/g, "{}")));
  }
}

// The Node `GET /` JSON stub only answers when no web UI is built; Rust serves the web UI there through
// `fallback_service` (invisible to the `.route(..)` scan). Tested by the web_ui_is_served_* black-box test.
const appText = readFileSync(join(crate, "src", "runtime", "application.rs"), "utf8");
const webUiFallback = /fallback_service\(\s*crate::runtime::web_ui::service/.test(appText);
const webUiTested = testFiles.some((f) => /web_ui_is_served/.test(readFileSync(f, "utf8")));

const status = (route) => {
  if (route.key === "/" && route.method === "GET" && webUiFallback) return webUiTested ? "route-and-test-reference" : "route-reference";
  const methods = rustRoutes.get(route.key);
  if (!methods && !dispatched.has(route.key)) return "no-route-reference";
  if (methods && route.method !== "ALL" && !methods.has(route.method) && !methods.has("ANY") && !dispatched.has(route.key)) return "no-route-reference";
  return tested.has(route.key) ? "route-and-test-reference" : "route-reference";
};

// ---- WebSocket client->server messages
// Node: `case "<type>":` arms of the message switch in ws.ts. Rust: `"<type>" =>` arms of
// `handle_message` in ws.rs, plus the pre-dispatch `authenticate` handshake. A message is tested
// only when a test literal sends `"type":"<type>"` (escaped or raw) after `#[cfg(test)]` in ws.rs
// or in tests/*.rs.
const wsNodeText = readFileSync(join(nodeSrc, "ws.ts"), "utf8");
const wsTypes = [...new Set([...wsNodeText.matchAll(/^\s*case "([A-Za-z][A-Za-z0-9.:_-]*)":/gm)].map((m) => m[1]))];
const wsRustText = readFileSync(join(crate, "src", "ws.rs"), "utf8");
const handlerStart = wsRustText.indexOf("async fn handle_message(");
const handlerEnd = wsRustText.indexOf("\n}\n", handlerStart);
const handlerText = handlerStart >= 0 ? wsRustText.slice(handlerStart, handlerEnd) : "";
const wsNative = new Set([...handlerText.matchAll(/^\s*"([A-Za-z][A-Za-z0-9.:_-]*)"\s*(?:\|[^=]*)?=>/gm)].map((m) => m[1]));
if (/authenticate_user_with|"authenticate"/.test(wsRustText)) wsNative.add("authenticate");
const testStart = wsRustText.indexOf("#[cfg(test)]");
const wsTestText = [wsRustText.slice(testStart), ...walk(join(crate, "tests"), (p) => p.endsWith(".rs")).map((p) => readFileSync(p, "utf8"))].join("\n");
const wsRows = wsTypes.map((type) => {
  const native = wsNative.has(type);
  const tested = native && new RegExp(`\\\\?"type\\\\?"\\s*:\\s*\\\\?"${type.replace(/[.:]/g, "\\$&")}\\\\?"`).test(wsTestText);
  return { type, status: !native ? "no-message-reference" : tested ? "message-and-test-reference" : "message-reference" };
});

const rows = nodeRoutes.map((r) => ({ ...r, status: status(r) }));
rows.sort((a, b) => a.file.localeCompare(b.file) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const counts = { "route-and-test-reference": 0, "route-reference": 0, "no-route-reference": 0 };
for (const r of rows) counts[r.status]++;
const pct = (n) => ((100 * n) / rows.length).toFixed(1);

const out = [];
out.push("# Gateway Rust API inventory", "");
out.push("Generated by `node packages/gateway-rust/scripts/api-inventory.mjs`; do not edit by hand.");
out.push("Source: `app.<method>(\"/path\")` registrations in `packages/gateway/src/server.ts` and `routes/*.ts`.");
out.push("**These statuses are heuristic leads, not verified parity.** Matching source strings can belong to unmounted routers, stubs, or unrelated code; matching test strings do not establish composed-binary coverage, method, behavior, or a passing test. Dispatch detection also ignores method. Audit each entry against the production composition and test evidence before relying on it.", "");
out.push("This scan covers literal Node HTTP registrations only; the WebSocket section below covers client-to-server message types only; client calls and background services are not yet inventoried. It is incomplete as a replacement checklist.", "");
out.push("| Heuristic match | Routes | Share |", "|---|---|---|");
for (const [k, v] of Object.entries(counts)) out.push(`| ${k} | ${v} | ${pct(v)}% |`);
out.push(`| total Node HTTP routes | ${rows.length} | 100% |`, "");
out.push("## Routes", "", "| Method | Path | Node file | Heuristic match |", "|---|---|---|---|");
for (const r of rows) out.push(`| ${r.method} | \`${r.path}\` | ${r.file} | ${r.status} |`);
out.push("");
const wsCounts = { "message-and-test-reference": 0, "message-reference": 0, "no-message-reference": 0 };
for (const r of wsRows) wsCounts[r.status]++;
out.push("## WebSocket client-to-server messages", "");
out.push("Source: `case \"<type>\":` arms in `packages/gateway/src/ws.ts`. A matching Rust handler arm and test string are heuristic references only; they do not establish mounting, behavior, a passing test, or parity. Server-to-client events and client-side message senders are not yet inventoried.", "");
out.push("| Status | Messages |", "|---|---|");
for (const [k, v] of Object.entries(wsCounts)) out.push(`| ${k} | ${v} |`);
out.push(`| total | ${wsRows.length} |`, "", "| Message type | Heuristic match |", "|---|---|");
for (const r of wsRows) out.push(`| \`${r.type}\` | ${r.status} |`);
out.push("");
writeFileSync(join(crate, "API-INVENTORY.md"), out.join("\n"));
console.log(JSON.stringify({ ws: wsCounts }));
console.log(JSON.stringify({ total: rows.length, ...counts, routeAndTestReferencePct: pct(counts["route-and-test-reference"]) }));
