#!/usr/bin/env node
// Derives the Node-gateway HTTP route inventory and diffs it against the Rust routers.
// Usage: node tooling/api-inventory.mjs [--write]   (writes docs/api-inventory.json + .md)
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientPathCandidates, normalizeClientPath } from './client-inventory.mjs';
import { applyBinaryEvidence } from './binary-test-evidence.mjs';

// These lexical matches are candidates only; they do not establish behavior or parity.
export function websocketCandidates(nodeSource, rustSource) {
  const values = (text, pattern) => new Set(Array.from(text.matchAll(pattern), (match) => match[1]));
  const inbound = values(nodeSource, /\bcase\s+["']([a-z][\w.:-]*)["']\s*:/g);
  const outbound = values(nodeSource, /\btype\s*:\s*["'`]([a-z][\w.:-]*)["'`]/g);
  const rustInbound = new Set();
  for (const match of rustSource.matchAll(/("(?:[a-z][\w.:-]*)"(?:\s*\|\s*"(?:[a-z][\w.:-]*)")*)\s*=>/g)) {
    for (const name of match[1].matchAll(/"([a-z][\w.:-]*)"/g)) rustInbound.add(name[1]);
  }
  const rustOutbound = values(rustSource, /["']type["']\s*:\s*["']([a-z][\w.:-]*)["']/g);
  return [
    ...[...inbound].map((type) => ({ type, direction: 'client-to-server-candidate', rustReference: rustInbound.has(type) })),
    ...[...outbound].map((type) => ({ type, direction: 'server-to-client-candidate', rustReference: rustOutbound.has(type) })),
  ].sort((a, b) => a.direction.localeCompare(b.direction) || a.type.localeCompare(b.type));
}

const here = dirname(fileURLToPath(import.meta.url));
const pkgs = join(here, '..', '..');
const nodeSrc = join(pkgs, 'gateway', 'src');
const rustSrc = join(here, '..', 'src');
const rustTests = join(here, '..', 'tests');
const contractTests = join(here, '..', '..', '..', 'tests', 'contract');

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === 'dist') continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, ext, out);
    else if (ext.some((e) => name.endsWith(e)) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const norm = (p) =>
  p.replace(/\/+$/, '').replace(/:([A-Za-z_]\w*)\??/g, '{}').replace(/\{[^}/]*\}/g, '{}').replace(/\*+/g, '{}') || '/';

// --- Node routes (Fastify) ---
const nodeRoutes = new Map();
const nodeRe = new RegExp(
  String.raw`\b(?:app|server|fastify|router|instance)\.(get|post|put|patch|delete|all)(?:<[^()]*?>)?\(\s*([\"'\`])(/[^\"'\`]*)\2`,
  'g',
);
for (const f of walk(nodeSrc, ['.ts'])) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(nodeRe)) {
    const key = `${m[1].toUpperCase()} ${norm(m[3])}`;
    if (!nodeRoutes.has(key)) nodeRoutes.set(key, { method: m[1].toUpperCase(), path: m[3], files: [] });
    nodeRoutes.get(key).files.push(relative(nodeSrc, f));
  }
}

// Modules whose routers the production composition root (runtime/application.rs, Gateway
// mount_* helpers) actually serves. Everything else is a library router no binary serves yet.
const MOUNTED = new Set(['routes/auth.rs', 'routes/sessions.rs', 'routes/terminals.rs', 'routes/projects.rs', 'routes/project.rs', 'routes/chat.rs', 'routes/store.rs', 'routes/threads.rs', 'routes/reminders.rs', 'routes/filesystem.rs', 'routes/secrets.rs', 'routes/git.rs', 'routes/plans.rs', 'routes/repo_proposals.rs', 'routes/repositories.rs', 'routes/assistant_profiles.rs', 'routes/architecture.rs', 'routes/user_questions.rs', 'routes/code_graph.rs', 'routes/update.rs', 'routes/environment.rs', 'routes/calendar.rs', 'routes/voice.rs', 'routes/skills.rs', 'routes/consent.rs', 'routes/providers.rs', 'routes/pull_requests.rs', 'routes/jobs.rs', 'routes/maintenance.rs', 'routes/trust.rs', 'routes/network.rs', 'routes/channels.rs', 'routes/plugins.rs', 'routes/screen_share.rs', 'routes/hooks.rs', 'routes/email.rs', 'routes/agent_github_apps.rs', 'routes/agent_control.rs', 'routes/preview.rs', 'routes/mobile.rs', 'routes/security_assessments.rs', 'routes/security_workbench.rs', 'routes/mcp_server.rs', 'routes/browser_devtools.rs', 'routes/node_credentials.rs', 'routes/preview_file.rs', 'routes/browser_screenshot.rs', 'routes/preview_proxy.rs', 'runtime/tools_mount.rs', 'runtime/application.rs', 'runtime/team_chat_mount.rs']);
// Mounted, but the production host behind them refuses the effect (no connector, loader, device or backend
// yet). They are served and tested black-box as fail-closed, and are NOT counted native.
// preview_proxy.rs: production passes empty port registries, so every proxied request is refused.
const FAIL_CLOSED = new Set(['routes/channels.rs', 'routes/plugins.rs', 'routes/screen_share.rs', 'routes/hooks.rs', 'routes/email.rs', 'routes/agent_github_apps.rs', 'routes/agent_control.rs', 'routes/preview.rs', 'routes/security_workbench.rs', 'routes/mcp_server.rs', 'routes/browser_devtools.rs', 'routes/preview_proxy.rs']);
// Individual routes inside an otherwise native file whose effect the production authority refuses.
const FAIL_CLOSED_ROUTES = new Set([
  'POST /api/git/fetch', 'POST /api/git/pull', 'POST /api/git/create-worktree', 'POST /api/git/remove-worktree',
  // The composed mobile router has no push or scheduler adapter.
  'DELETE /api/mobile/push-devices/{}', 'POST /api/mobile/push-devices/test', 'PUT /api/mobile/routines/{}',
]);
// Mounted endpoints with a working subset and missing production collaborators. An empty
// success is not evidence that the omitted backend has no data. Keys use normalized paths.
const INCOMPLETE_ROUTES = new Set([
  // Push registration is silently omitted; these list endpoints have no backing adapter.
  'POST /api/mobile/devices/register', 'GET /api/mobile/push-devices',
  'GET /api/mobile/routines', 'GET /api/mobile/os-tool/sessions',
  // The environment mount has no node control plane for nodes and repositories.
  'GET /api/environment/snapshot',
  // The composed reminder router lacks memory and thread integrations.
  'GET /api/reminders', 'DELETE /api/reminders/{}',
]);

// --- Rust routes (axum) ---
const rustRoutes = new Set();
const rustFile = new Map();
// When several Rust files register the same route, attribute it to the one production mounts.
const setRustFile = (key, file) => {
  if (!rustFile.has(key) || (!MOUNTED.has(rustFile.get(key)) && MOUNTED.has(file))) rustFile.set(key, file);
};
for (const f of walk(rustSrc, ['.rs'])) {
  const text = readFileSync(f, 'utf8');
  const re = /\.route\(\s*(?:"([^"]+)"|([A-Za-z_][\w:]*))\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    const path = m[1];
    if (!path) continue;
    // read balanced call body
    let depth = 1;
    let i = re.lastIndex;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
    }
    const body = text.slice(re.lastIndex, i);
    for (const mm of body.matchAll(/\b(get|post|put|patch|delete)\s*\(/g)) {
      const key = `${mm[1].toUpperCase()} ${norm(path)}`;
      rustRoutes.add(key);
      setRustFile(key, relative(rustSrc, f));
    }
  }
}

// --- Path-dispatch routers: one axum `any()` handler that matches the path and method itself.
// Each `path == "/lit"` or `mid(&path, "/prefix/", "/suffix")` marker opens a segment; the
// `Method::X` tokens inside that segment (up to the next marker) are the methods it serves.
for (const rel of ['routes/projects.rs']) {
  const text = readFileSync(join(rustSrc, rel), 'utf8');
  const markers = [
    ...text.matchAll(/path\s*==\s*"(\/[^"]+)"|mid\(\s*&path\s*,\s*"([^"]+)"\s*,\s*"([^"]*)"\s*\)/g),
  ];
  markers.forEach((m, i) => {
    const path = m[1] ?? `${m[2]}{}${m[3]}`;
    const seg = text.slice(m.index, markers[i + 1]?.index ?? text.length);
    for (const mm of seg.matchAll(/Method::(GET|POST|PUT|PATCH|DELETE)/g)) {
      const key = `${mm[1]} ${norm(path)}`;
      rustRoutes.add(key);
      rustFile.set(key, rel);
    }
  });
  // the collection root is dispatched on its exact path
  for (const [method, path] of [['GET', '/api/projects'], ['POST', '/api/projects'], ['GET', '/api/projects/archived'], ['DELETE', '/api/projects/archived']]) {
    if (new RegExp(String.raw`"${path}"`).test(text)) {
      rustRoutes.add(`${method} ${norm(path)}`);
      rustFile.set(`${method} ${norm(path)}`, rel);
    }
  }
}

// --- routes/project.rs: `"/api/project/x" => "name"` plus `("name", "METHOD")` match arms.
// Arms with a `_` method (the 501 surface-state stubs) are not counted as served.
{
  const text = readFileSync(join(rustSrc, 'routes/project.rs'), 'utf8');
  const names = new Map([...text.matchAll(/"(\/api\/project\/[a-z-]+)"\s*=>\s*"([a-z-]+)"/g)].map((m) => [m[2], m[1]]));
  for (const m of text.matchAll(/\(\s*"([a-z-]+)"\s*,\s*"(GET|POST|PUT|PATCH|DELETE)"\s*\)/g)) {
    const path = names.get(m[1]);
    if (!path) continue;
    const key = `${m[2]} ${norm(path)}`;
    rustRoutes.add(key);
    rustFile.set(key, 'routes/project.rs');
  }
}

// --- GET / is the built web UI, served by the composition root's static fallback service.
if (/web_ui::service\(/.test(readFileSync(join(rustSrc, 'runtime/application.rs'), 'utf8'))) {
  rustRoutes.add('GET /');
  setRustFile('GET /', 'runtime/application.rs');
}

// --- "tested" heuristic: path literal appears in a Rust test file or contract test ---
let testText = '';
for (const root of [rustTests, contractTests]) {
  if (!existsSync(root)) continue;
  for (const f of walk(root, ['.rs', '.mjs', '.ts'])) {
    if (f.includes('node_modules')) continue;
    testText += readFileSync(f, 'utf8') + '\n';
  }
}
for (const f of walk(rustSrc, ['.rs'])) {
  if (/(_tests?\.rs|tests\.rs)$/.test(f)) testText += readFileSync(f, 'utf8') + '\n';
}
const testedCache = new Map();
function isTested(path) {
  // The root has no distinctive literal; count a request built as `format!("{base}/")`.
  if (path === '/') return /\{base\}\/"\)/.test(testText);
  const staticPrefix = path.split(/[:{*]/)[0].replace(/\/$/, '');
  if (!testedCache.has(staticPrefix)) testedCache.set(staticPrefix, staticPrefix.length > 1 && new RegExp(staticPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_-])').test(testText));
  return testedCache.get(staticPrefix);
}

// --- WS message candidates in the gateway hubs. This lexical scan is incomplete;
// in particular, events emitted outside ws.ts and dynamically named types are absent.
const wsEntries = websocketCandidates(
  readFileSync(join(nodeSrc, 'ws.ts'), 'utf8'),
  readFileSync(join(rustSrc, 'ws.rs'), 'utf8'),
);

const entries = [...nodeRoutes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, r]) => {
  const native = rustRoutes.has(key);
  return {
    method: r.method,
    path: r.path,
    nodeFiles: [...new Set(r.files)],
    status: !native
      ? 'missing'
      : !MOUNTED.has(rustFile.get(key))
        ? 'router-unmounted'
        : FAIL_CLOSED.has(rustFile.get(key)) || FAIL_CLOSED_ROUTES.has(key)
        ? 'mounted-fail-closed'
        : INCOMPLETE_ROUTES.has(key)
          ? 'mounted-incomplete'
          : 'native-untested',
    testPathReference: isTested(r.path),
    rustFile: native ? rustFile.get(key) : undefined,
  };
});
// Client-side lexical references complement the server scan. They include comments and
// partial expressions, do not identify HTTP methods, and require manual review.
const repo = join(pkgs, '..');
const clientPaths = new Map();
for (const root of ['apps/web/src', 'apps/desktop/src', 'apps/desktop/src-tauri/src', 'packages/cli/src', 'packages/api-client/src']) {
  const directory = join(repo, root);
  if (!existsSync(directory)) continue;
  for (const file of walk(directory, ['.ts', '.tsx', '.rs'])) {
    if (/\.(test|spec)\.[^.]+$/.test(file)) continue;
    for (const path of clientPathCandidates(readFileSync(file, 'utf8'))) {
      const key = normalizeClientPath(path);
      if (!clientPaths.has(key)) clientPaths.set(key, new Set());
      clientPaths.get(key).add(relative(repo, file));
    }
  }
}
const serverPaths = new Set(entries.map((entry) => normalizeClientPath(entry.path)));
const clientCandidates = [...clientPaths.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, files]) => ({
  path, files: [...files].sort(), serverPathReference: serverPaths.has(path),
}));
const extraRust = [...rustRoutes].filter((k) => !nodeRoutes.has(k)).sort();
const manifest = JSON.parse(readFileSync(join(here, 'binary-test-evidence.json'), 'utf8'));
const evidence = applyBinaryEvidence(entries, wsEntries, manifest, (file) => readFileSync(join(here, '..', file), 'utf8'));
const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] ?? 0) + 1), a), {});

const summary = {
  httpTotal: entries.length,
  ...counts,
  nativeRouteReferencePct: +((((counts['native-untested'] ?? 0) + (counts['native-tested'] ?? 0)) / entries.length) * 100).toFixed(1),
  nativeTested: evidence.tested,
  nativeTestedDenominator: evidence.total,
  nativeTestedPct: evidence.nativeTestedPct,
  wsTotal: wsEntries.length,
  wsInbound: wsEntries.filter((w) => w.direction === 'client-to-server-candidate').length,
  wsOutboundCandidates: wsEntries.filter((w) => w.direction === 'server-to-client-candidate').length,
  wsWithoutDirectionalRustReference: wsEntries.filter((w) => !w.rustReference).length,
  clientPathCandidates: clientCandidates.length,
  clientCandidatesWithoutServerPathReference: clientCandidates.filter((candidate) => !candidate.serverPathReference).length,
  rustOnlyRoutes: extraRust.length,
};
// Background services started from packages/gateway/src/index.ts. Rust status is a lexical
// check for the Rust module/keyword; it never implies a tested or wired-in service.
const SERVICE_SPECS = [
  ['scheduler', /scheduler\.start\(/, /scheduler/i],
  ['threadReviewSync', /threadReviewSync\.start\(/, /thread_review_sync|review_sync/i],
  ['databaseRetention', /databaseRetention\.start\(/, /retention/i],
  ['diskJanitor', /diskJanitor\.start\(/, /janitor/i],
  ['primaryLink', /primaryLink\.start\(/, /primary_link/i],
  ['terminalReaper', /terminalReaperInterval\s*=\s*setInterval/, /reaper|idle_reap/i],
  ['browserReaper', /browserReaperInterval\s*=\s*setInterval/, /browser.*reap|reap.*browser/i],
  ['wsHub', /ws\.start\(/, /ws_hub|WsHub/],
];
const indexSrc = readFileSync(join(nodeSrc, 'index.ts'), 'utf8');
const rustAll = walk(rustSrc, ['.rs']).map((f) => readFileSync(f, 'utf8')).join('\n');
const services = SERVICE_SPECS.map(([name, nodeRe, rustRe]) => ({
  name,
  nodeStart: nodeRe.test(indexSrc),
  rustStatus: rustRe.test(rustAll) ? 'rust-reference-untested' : 'missing',
}));
summary.backgroundServices = services.length;
summary.backgroundServicesMissing = services.filter((s) => s.rustStatus === 'missing').length;
const result = { summary, http: entries, ws: wsEntries, services, clientCandidates, rustOnly: extraRust };
console.log(JSON.stringify(summary, null, 2));

if (process.argv.includes('--write')) {
  const out = join(here, '..', 'docs');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'api-inventory.json'), JSON.stringify(result, null, 2) + '\n');
  const md = [
    '# Gateway API inventory (generated by tooling/api-inventory.mjs)',
    '',
    'Mounted-incomplete routes serve a subset but lack production collaborators. Mounted-fail-closed routes refuse the unavailable effect. Neither status counts as native-tested.',
    '',
    'HTTP routes and WS messages are heuristic candidates, not a complete parity inventory. nativeTestedPct counts HTTP and directional WS candidates mapped in tooling/binary-test-evidence.json, divided by all HTTP and WS candidates. The manifest requires manually reviewed tests that exercise the production binary over HTTP or WS and have passed; a source path match alone never counts. A mapped test is limited evidence, not full behavioral parity or proof that it still passes on the current snapshot. Background services and unenumerated API entries are excluded.',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    '',
    '| Method | Path | Status | Binary tests | Node source |',
    '|---|---|---|---|---|',
    ...entries.map((e) => `| ${e.method} | \`${e.path}\` | ${e.status} | ${e.binaryTests.map((t) => `\`${t.file}::${t.name}\``).join(', ')} | ${e.nodeFiles.join(', ')} |`),
    '',
    '## Background services (heuristic)',
    '',
    'Services started from the Node composition root. `rust-reference-untested` is only a lexical match in Rust source; it does not show the service is wired in or tested.',
    '',
    ...services.map((s) => `- \`${s.name}\` — ${s.rustStatus}${s.nodeStart ? '' : ' (Node start pattern not found)'}`),
    '',
    '## Client path candidates (heuristic)',
    '',
    'Lexical `/api/` references from web, desktop, CLI and API-client source may include comments, partial expressions and non-requests. A matching server path does not identify a method or establish parity. Dynamic constructions may be omitted.',
    '',
    ...clientCandidates.map((candidate) => `- \`${candidate.path}\` — ${candidate.serverPathReference ? 'server path reference' : 'no server path reference'} — ${candidate.files.join(', ')}`),
    '',
    '## WS message candidates (heuristic)',
    '',
    'Client-to-server candidates come from all case arms in the Node hub; server-to-client candidates come from literal type properties there. Both can include unrelated switches or objects, and events emitted elsewhere or dynamic types are omitted. A directional Rust reference is only a lexical match in the Rust hub; it does not establish mounting, behavior, coverage, or parity.',
    '',
    ...wsEntries.map((w) => `- ${w.direction}: \`${w.type}\` — ${w.status ?? (w.rustReference ? 'Rust reference (untested)' : 'no Rust reference')} — ${w.binaryTests.map((t) => `\`${t.file}::${t.name}\``).join(', ') || 'no binary test'}`),
    '',
  ].join('\n');
  writeFileSync(join(out, 'api-inventory.md'), md);
}
