#!/usr/bin/env node
// Derives the Node-gateway HTTP route inventory and diffs it against the Rust routers.
// Usage: node tooling/api-inventory.mjs [--write]   (writes docs/api-inventory.json + .md)
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  String.raw`\b(?:app|server|fastify|router|instance)\.(get|post|put|patch|delete)(?:<[^()]*?>)?\(\s*([\"'\`])(/[^\"'\`]*)\2`,
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
const FAIL_CLOSED_ROUTES = new Set(['POST /api/git/fetch', 'POST /api/git/pull', 'POST /api/git/create-worktree', 'POST /api/git/remove-worktree']);

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

// --- WS message types ---
const wsTypes = new Set();
for (const f of walk(nodeSrc, ['.ts']).filter((x) => /(^|\/)ws[^/]*\.ts$|ws\//.test(x))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/type:\s*["'`]([a-z][\w.:-]*)["'`]/g)) wsTypes.add(m[1]);
}
const rustWs = new Set();
for (const f of walk(rustSrc, ['.rs'])) {
  const t = readFileSync(f, 'utf8');
  for (const m of t.matchAll(/"type"\s*:\s*"([a-z][\w.:-]*)"|"([a-z][\w.:-]*)"\s*=>/g)) rustWs.add(m[1] ?? m[2]);
}

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
        : 'native-untested',
    testPathReference: isTested(r.path),
    rustFile: native ? rustFile.get(key) : undefined,
  };
});
const extraRust = [...rustRoutes].filter((k) => !nodeRoutes.has(k)).sort();
const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] ?? 0) + 1), a), {});
const wsEntries = [...wsTypes].sort().map((t) => ({ type: t, status: rustWs.has(t) ? 'native-untested' : 'missing' }));
const summary = {
  httpTotal: entries.length,
  ...counts,
  nativeRouteReferencePct: +(((counts['native-untested'] ?? 0) / entries.length) * 100).toFixed(1),
  nativeTestedPct: null,
  wsTotal: wsEntries.length,
  wsMissing: wsEntries.filter((w) => w.status === 'missing').length,
  rustOnlyRoutes: extraRust.length,
};
const result = { summary, http: entries, ws: wsEntries, rustOnly: extraRust };
console.log(JSON.stringify(summary, null, 2));

if (process.argv.includes('--write')) {
  const out = join(here, '..', 'docs');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'api-inventory.json'), JSON.stringify(result, null, 2) + '\n');
  const md = [
    '# Gateway API inventory (generated by tooling/api-inventory.mjs)',
    '',
    'This is a heuristic route inventory, not evidence of native behavior or tested parity. Mounted route references are classified as native-untested until per-route evidence is reviewed; a test path reference alone does not establish coverage. The tested percentage is unknown.',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    '',
    '| Method | Path | Status | Node source |',
    '|---|---|---|---|',
    ...entries.map((e) => `| ${e.method} | \`${e.path}\` | ${e.status} | ${e.nodeFiles.join(', ')} |`),
    '',
    '## WS message types (heuristic)',
    '',
    ...wsEntries.map((w) => `- \`${w.type}\`: ${w.status}`),
    '',
  ].join('\n');
  writeFileSync(join(out, 'api-inventory.md'), md);
}
