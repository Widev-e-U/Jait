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

// --- Rust routes (axum) ---
const rustRoutes = new Set();
const rustFile = new Map();
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
      rustFile.set(key, relative(rustSrc, f));
    }
  }
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
  const staticPrefix = path.split(/[:{*]/)[0].replace(/\/$/, '');
  if (!testedCache.has(staticPrefix)) testedCache.set(staticPrefix, staticPrefix.length > 1 && testText.includes(staticPrefix));
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

// Modules whose routers the production composition root (runtime/application.rs, Gateway
// mount_* helpers) actually serves. Everything else is a library router no binary serves yet.
const MOUNTED = new Set(['routes/auth.rs', 'routes/sessions.rs', 'routes/terminals.rs', 'routes/projects.rs', 'routes/chat.rs', 'routes/store.rs']);
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
        : isTested(r.path)
          ? 'native-tested'
          : 'native-untested',
    rustFile: native ? rustFile.get(key) : undefined,
  };
});
const extraRust = [...rustRoutes].filter((k) => !nodeRoutes.has(k)).sort();
const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] ?? 0) + 1), a), {});
const wsEntries = [...wsTypes].sort().map((t) => ({ type: t, status: rustWs.has(t) ? 'native-untested' : 'missing' }));
const summary = {
  httpTotal: entries.length,
  ...counts,
  nativeTestedPct: +(((counts['native-tested'] ?? 0) / entries.length) * 100).toFixed(1),
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
    'Heuristic: "tested" means the route prefix appears in a Rust test or contract test. It is not a substitute for black-box tests through the composed binary.',
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
