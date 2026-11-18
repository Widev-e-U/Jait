#!/usr/bin/env node
// Generates docs/gateway-rust-api-inventory.json, the parity checklist for the Rust gateway.
//
// Sources
//   Node routes:     packages/gateway/src/server.ts and routes/*.ts (non-test)
//   Rust routes:     packages/gateway-rust/src/**/*.rs (non-test)
//   Black-box tests: packages/gateway-rust/tests/*.rs (the only evidence that counts as "tested")
//   Clients:         apps/web, packages/cli, apps/desktop, packages/api-client (non-test, non-e2e)
//
// Status per Node HTTP route:
//   unreviewed: source matches and absent matches are leads, not parity classifications.
// No route is automatically classified: source references cannot establish mounting or behavior.
//
// Test and client references are path-level review leads, not proof of behavior. Catch-all Rust fallbacks ({*rest}) are excluded from the inventory.
//
// Usage: node scripts/gateway-rust-api-inventory.mjs [--check]
//   Writes docs/gateway-rust-api-inventory.json. With --check, exits 1 if the file is stale.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(repo, "docs", "gateway-rust-api-inventory.json");
const SKIP_DIRS = new Set(["node_modules", "target", "dist", "build", ".git", ".jait", ".turbo"]);

function walk(dir, accept, out = []) {
  const abs = join(repo, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = join(dir, name);
    if (statSync(join(repo, rel)).isDirectory()) walk(rel, accept, out);
    else if (accept(rel)) out.push(rel.split("\\").join("/"));
  }
  return out;
}

const read = (rel) => readFileSync(join(repo, rel), "utf8");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const isTsTest = (f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f);
const isRsTest = (f) => /_tests?\.rs$/.test(f);
const isE2e = (f) => f.includes("e2e");

// Canonical path: query stripped, every parameter (Node :id, ${} template, Rust {id}) becomes {},
// and a trailing wildcard (Node /*, Rust {*rest}) becomes *.
function normalize(raw) {
  let p = raw.split(/[?#]/)[0];
  p = p.replace(/\$\{[^}]*\}/g, "{}");
  p = p.replace(/\{\*[^}]*\}/g, "*");
  p = p.replace(/\{[^}]*\}/g, "{}");
  p = p.replace(/:[A-Za-z_]\w*/g, "{}");
  p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

const segments = (p) => (p === "/" ? [] : p.slice(1).split("/"));

// strict: a literal segment never matches a parameter. Fuzzy: a parameter on either side matches anything.
function matches(concrete, pattern, strict) {
  const a = segments(concrete);
  const b = segments(pattern);
  const wild = b.at(-1) === "*";
  const fixed = wild ? b.length - 1 : b.length;
  if (wild ? a.length < fixed : a.length !== fixed) return false;
  for (let i = 0; i < fixed; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (strict || (x !== "{}" && y !== "{}")) return false;
  }
  return true;
}

// Strict matches win; fuzzy matching applies only when no literal route fits the concrete path.
function matchPatterns(concrete, patterns) {
  const strict = patterns.filter((pattern) => matches(concrete, pattern, true));
  return strict.length ? strict : patterns.filter((pattern) => matches(concrete, pattern, false));
}

const NODE_ROUTE = /\b(?:app|fastify|server|router|instance|scope)\.(get|post|put|patch|delete|all)\(\s*(["'`])(\/[^"'`]*)\2/g;
const NODE_METHOD = { get: "GET", post: "POST", put: "PUT", patch: "PATCH", delete: "DELETE", all: "ANY" };

function matchParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") i++;
        i++;
      }
    } else if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

function rustRouteCalls(file, text) {
  const calls = [];
  for (const m of text.matchAll(/\.route\(\s*"([^"]*)"\s*,/g)) {
    const open = m.index + ".route".length;
    const expr = text.slice(open, matchParen(text, open));
    const methods = new Set();
    for (const mm of expr.matchAll(/\b(get|post|put|patch|delete|head|options|any)\(/g)) {
      methods.add(mm[1] === "any" ? "ANY" : mm[1].toUpperCase());
    }
    for (const mm of expr.matchAll(/MethodFilter::([A-Z]+)/g)) methods.add(mm[1]);
    if (methods.size === 0) methods.add("UNKNOWN");
    calls.push({ file, line: lineOf(text, m.index), rawPath: m[1], path: normalize(m[1]), methods: [...methods] });
  }
  return calls;
}

// String literals in Rust test code that name an API path. "/api/" may sit after a format prefix.
function testPathOf(literal) {
  const at = literal.indexOf("/api/");
  if (at >= 0) return literal.slice(at);
  if (/^\/[\w\-./{}*%:]+$/.test(literal)) return literal;
  return null;
}

// --- Node side -----------------------------------------------------------------------------
const nodeFiles = [
  "packages/gateway/src/server.ts",
  ...walk("packages/gateway/src/routes", (f) => f.endsWith(".ts") && !isTsTest(f)),
];
const nodeByKey = new Map();
for (const file of nodeFiles) {
  const text = read(file);
  for (const m of text.matchAll(NODE_ROUTE)) {
    const method = NODE_METHOD[m[1]];
    const path = normalize(m[3]);
    const key = `${method} ${path}`;
    if (!nodeByKey.has(key)) {
      nodeByKey.set(key, { method, path, node: { file, line: lineOf(text, m.index) }, rust: null, clients: new Set() });
    }
  }
}
const nodeEntries = [...nodeByKey.values()];
const nodePaths = [...new Set(nodeEntries.map((e) => e.path))];

// --- Rust side -----------------------------------------------------------------------------
let catchAllExcluded = 0;
const rustCalls = [];
for (const file of walk("packages/gateway-rust/src", (f) => f.endsWith(".rs") && !isRsTest(f))) {
  for (const call of rustRouteCalls(file, read(file))) {
    if (call.path.includes("*")) {
      catchAllExcluded++;
      continue;
    }
    rustCalls.push(call);
  }
}
// The project router dispatches literal paths behind a mounted wildcard. These
// are source leads only: the match arm does not establish the method or parity.
const projectDispatchFile = "packages/gateway-rust/src/routes/project.rs";
const projectDispatchSource = read(projectDispatchFile);
const projectDispatch = new Map([...projectDispatchSource.matchAll(/"(\/api\/project\/[a-z-]+)"\s*=>/g)]
  .map((m) => [normalize(m[1]), { file: projectDispatchFile, line: lineOf(projectDispatchSource, m.index) }]));
const rustPaths = [...new Set(rustCalls.map((c) => c.path))];

// Path literals are review leads only. A reference in a binary test file does not prove that
// the relevant request ran against the binary, and another test file may not mount the route.
const testedPaths = new Map(); // pattern -> { binary: Set<file>, inProcess: Set<file> }
for (const file of walk("packages/gateway-rust/tests", (f) => f.endsWith(".rs"))) {
  const text = read(file);
  const kind = text.includes("CARGO_BIN_EXE") ? "binary" : "inProcess";
  for (const m of text.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
    const testPath = testPathOf(m[1]);
    if (!testPath) continue;
    for (const pattern of matchPatterns(normalize(testPath), rustPaths)) {
      if (!testedPaths.has(pattern)) testedPaths.set(pattern, { binary: new Set(), inProcess: new Set() });
      testedPaths.get(pattern)[kind].add(file);
    }
  }
}

// --- Client references ---------------------------------------------------------------------
const CLIENT_SOURCES = [
  ["web", "apps/web/src"],
  ["cli", "packages/cli/src"],
  ["desktop", "apps/desktop"],
  ["api-client", "packages/api-client/src"],
];
const CLIENT_LITERAL = /(["'`])(\/(?:api|preview)\/[^"'`\s]*)\1/g;
const clientPaths = new Map();
for (const [source, dir] of CLIENT_SOURCES) {
  const files = walk(dir, (f) => /\.(tsx?|jsx?|mjs|cjs|rs)$/.test(f) && !isTsTest(f) && !isE2e(f));
  for (const file of files) {
    for (const m of read(file).matchAll(CLIENT_LITERAL)) {
      const path = normalize(m[2]);
      if (!clientPaths.has(path)) clientPaths.set(path, { sources: new Set(), files: new Set() });
      clientPaths.get(path).sources.add(source);
      clientPaths.get(path).files.add(file);
    }
  }
}
const clientUnmatched = [];
for (const [path, info] of [...clientPaths].sort(([a], [b]) => a.localeCompare(b))) {
  const hits = matchPatterns(path, nodePaths);
  if (hits.length === 0) {
    clientUnmatched.push({ path, sources: [...info.sources].sort(), files: [...info.files].sort() });
    continue;
  }
  for (const entry of nodeEntries) {
    if (hits.includes(entry.path)) for (const source of info.sources) entry.clients.add(source);
  }
}

// --- Join ----------------------------------------------------------------------------------
for (const entry of nodeEntries) {
  const rust = rustCalls.find((c) => c.path === entry.path && (entry.method === "ANY" || c.methods.includes("ANY") || c.methods.includes(entry.method)));
  if (!rust) continue;
  entry.rust = { file: rust.file, line: rust.line };
  const evidence = testedPaths.get(rust.path);
  entry.binaryTests = [...(evidence?.binary ?? [])].sort();
  entry.inProcessTests = [...(evidence?.inProcess ?? [])].sort();
}

const entries = nodeEntries
  .map((e) => {
    // A source match or its absence cannot establish mounting, behavior, or completeness.
    const status = "unreviewed";
    return {
      method: e.method,
      path: e.path,
      status,
      node: e.node,
      rust: e.rust,
      rustDispatchCandidate: projectDispatch.get(e.path) ?? null,
      binaryTests: e.binaryTests ?? [],
      inProcessTests: e.inProcessTests ?? [],
      clients: [...e.clients].sort(),
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const rustOnly = rustCalls
  .filter((c) => !nodeEntries.some((e) => e.path === c.path))
  .map((c) => ({ method: c.methods.join("|"), path: c.path, file: c.file, line: c.line }))
  .sort((a, b) => a.path.localeCompare(b.path));

const count = (status) => entries.filter((e) => e.status === status).length;
const total = entries.length;
const summary = {
  total,
  unreviewed: count("unreviewed"),
  rustSourceMatches: entries.filter((e) => e.rust).length,
  withoutRustSourceMatch: entries.filter((e) => !e.rust).length,
  percentNativeTested: null,
  rustOnlyRoutes: rustOnly.length,
  clientPathsWithoutNodeRoute: clientUnmatched.length,
  catchAllFallbacksExcluded: catchAllExcluded,
};

// Candidate inbound control messages from the main hub dispatch switch only.
// Other sockets, outbound events, dynamic dispatch and behavioral parity require review.
const wsFile = "packages/gateway/src/ws.ts";
const wsSource = read(wsFile);
const wsStart = wsSource.indexOf("    switch (msg.type) {");
const wsEnd = wsSource.indexOf("  /** Send an event to a specific client by ID */", wsStart);
if (wsStart < 0 || wsEnd < 0) throw new Error("main WebSocket dispatch boundaries changed");
const wsDispatch = wsSource.slice(wsStart, wsEnd);
const inboundWsCandidates = [...wsDispatch.matchAll(/\bcase\s+["']([^"']+)["']\s*:/g)]
  .map((m) => ({ type: m[1], node: { file: wsFile, line: lineOf(wsSource, wsStart + m.index) }, status: "unreviewed" }))
  .sort((a, b) => a.type.localeCompare(b.type));

// Literal type properties are review leads, not necessarily outbound envelopes:
// payload fields and local objects can have type properties too.
const wsTypeCandidates = [...wsSource.matchAll(/\btype\s*:\s*["']([^"']+)["']/g)]
  .map((m) => ({ type: m[1], node: { file: wsFile, line: lineOf(wsSource, m.index) }, status: "unreviewed" }));
// Startup calls and named intervals are leads; constructors and indirect starts also need review.
const startupFile = "packages/gateway/src/index.ts";
const startupSource = read(startupFile);
const backgroundCandidates = [
  ...[...startupSource.matchAll(/\b([A-Za-z_$][\w$]*)\.(start(?:[A-Z][\w$]*)?)\s*\(/g)]
    .map((m) => ({ expression: `${m[1]}.${m[2]}`, node: { file: startupFile, line: lineOf(startupSource, m.index) }, status: "unreviewed" })),
  ...[...startupSource.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*setInterval\s*\(/g)]
    .map((m) => ({ expression: `${m[1]} = setInterval`, node: { file: startupFile, line: lineOf(startupSource, m.index) }, status: "unreviewed" })),
];

const inventory = {
  generatedBy: "scripts/gateway-rust-api-inventory.mjs",
  scope: "HTTP routes from packages/gateway. WS and background entries are incomplete review leads.",
  inboundWsCandidates,
  wsTypeCandidates,
  backgroundCandidates,
  backgroundEvidence: "Literal start calls and named intervals in index.ts are review leads only; constructor-started and indirect services are not covered.",
  wsEvidence: "Only literal cases in the main hub dispatch are candidates; outbound events and other sockets are not inventoried. Status requires review.",
  testEvidence: "Source and test references are review leads only, not proof of mounting, absence, execution, or parity; all route statuses require review.",
  summary,
  entries,
  rustOnly,
  clientPathsWithoutNodeRoute: clientUnmatched,
};

const text = `${JSON.stringify(inventory, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const committed = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
  if (committed !== text) {
    console.error(`${outPath} is stale; run node scripts/gateway-rust-api-inventory.mjs`);
    process.exit(1);
  }
  console.log("inventory is current");
} else {
  writeFileSync(outPath, text);
  console.log(JSON.stringify(summary, null, 2));
}
