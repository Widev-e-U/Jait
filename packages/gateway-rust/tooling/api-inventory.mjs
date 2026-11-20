#!/usr/bin/env node
// Derives the Node-gateway HTTP route inventory and diffs it against the Rust routers.
// Usage: node tooling/api-inventory.mjs [--write]   (writes docs/api-inventory.json + .md)
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientPathCandidates, clientRequestSites, clientRouteShape, clientShapeMatchesRoute, normalizeClientPath, reviewClientRequests } from './client-inventory.mjs';
import { applyBinaryEvidence } from './binary-test-evidence.mjs';
import { broadcastHelperLiterals, objectTypeValues, parseTs, switchArms, websocketCandidates } from './ws-inventory.mjs';
import { backgroundInventory } from './services-inventory.mjs';
import { gatewayRoutes } from './routes-inventory.mjs';

// Candidates only; they do not establish behavior or parity. The Node hub's WebSocket candidates are read by
// ws-inventory.mjs with the TypeScript compiler API, so this module imports them rather than keeping a second copy.

// Server-to-client WS types. Every gateway source is scanned, so frames sent outside ws.ts count, but only dotted
// names are read from the other sources; that keeps schema fields such as `type: "object"` out of the inventory.
// A template such as `thread.${event}` is expanded only from reviewed evidence: the literal union that types the
// `event` parameter in the same file, or else the literal event arguments of the helper that builds the frame.
// A template with neither throws, so an unreviewed frame type cannot silently drop out of the inventory.
const WS_TEMPLATE_HELPERS = { thread: 'broadcastThreadEvent', plan: 'broadcastPlanEvent', repo: 'broadcastRepoEvent' };
// Upstream protocols, not gateway frames. messenger-service.ts speaks Matrix and never reaches a socket. The voice
// assistant sends these OpenAI Realtime frames over its upstream socket (openaiWs.send); its client frames still count.
const WS_UPSTREAM_SOURCES = new Set(['services/messenger-service.ts']);
const WS_UPSTREAM_TYPES = new Set([
  'conversation.item.create', 'input_audio_buffer.append', 'input_audio_buffer.clear', 'input_audio_buffer.commit',
  'response.cancel', 'response.create', 'session.update',
]);
// Dynamic `type` values inside a send path are reviewed here by file and expression, with the reason. A send path is a
// call that sends, broadcasts or relays the frame (ws.send, this.send, broadcastToUser, relay*). Any other dynamic value
// in a send path throws, so a new unreviewed frame type cannot silently drop out of the inventory.
const REVIEWED_DYNAMIC_FRAMES = new Map([
  [
    'ws.ts|msg.type',
    'relayToDevice and relayShareSignal forward the frame type they receive; each caller builds that frame with a literal type, which the object-literal scan reads, and the relayed screen-share arms come from relayedWsTypes',
  ],
  [
    'tools/project-message-tool.ts|type',
    'broadcast helper parameter; its call sites pass literal types, read by broadcastHelperLiterals (chat.moved)',
  ],
]);
const SEND_PATH = /\b(send\w*|broadcast\w*|relay\w*)\b/i;
const FRAME_TYPE = /^[a-z][\w.:-]*$/;
const DOTTED_FRAME = /^[a-z][\w-]*\.[\w.:-]*$/;

export function nodeWsOutboundTypes(allFiles, wsSource = '') {
  const files = allFiles.filter((file) => !WS_UPSTREAM_SOURCES.has(file.path));
  const wsLiterals = objectTypeValues(parseTs('ws.ts', wsSource)).literals.map((literal) => literal.value);
  const types = new Set(wsLiterals.filter((value) => FRAME_TYPE.test(value)));
  const templates = [];
  for (const { path, text } of files) {
    const sf = parseTs(path, text);
    const found = objectTypeValues(sf);
    for (const { value } of found.literals) if (DOTTED_FRAME.test(value)) types.add(value);
    for (const { prefix, variable } of found.templates) templates.push({ prefix, variable, text });
    for (const { text: expression, calls } of found.dynamic) {
      if (!calls.some((call) => SEND_PATH.test(call))) continue;
      if (!REVIEWED_DYNAMIC_FRAMES.has(`${path}|${expression}`)) {
        throw new Error(`unreviewed WebSocket frame type "${expression}" in ${path} (sent by ${calls.join(' < ')})`);
      }
    }
    for (const { value } of broadcastHelperLiterals(sf)) if (DOTTED_FRAME.test(value)) types.add(value);
  }
  for (const { prefix, variable, text } of templates) {
    const union = new RegExp(String.raw`\b${variable}\s*:\s*((?:"[a-z]+"\s*\|\s*)*"[a-z]+")(?=\s*[,)])`, 'g');
    let events = Array.from(text.matchAll(union), (match) => Array.from(match[1].matchAll(/"([a-z]+)"/g), (m) => m[1])).flat();
    const helper = WS_TEMPLATE_HELPERS[prefix];
    if (events.length === 0 && helper) {
      const calls = new RegExp(String.raw`\b${helper}\(\s*(?:[^,()]+,\s*)?["']([a-z]+)["']`, 'g');
      events = files.flatMap(({ text: source }) => Array.from(source.matchAll(calls), (match) => match[1]));
    }
    if (events.length === 0) throw new Error(`unexpanded WebSocket template ${prefix}.\${${variable}}`);
    for (const event of events) types.add(`${prefix}.${event}`);
  }
  for (const type of WS_UPSTREAM_TYPES) types.delete(type);
  return types;
}

// Client-to-server types are the ws.ts switch cases plus the voice-assistant socket's switch arms. Server-to-client
// types are the Node emitters, the voice-assistant frames and the screen-share relays, and each client-only literal
// (see clientOnlyWsEntries) is added in its direction. Rust evidence for a client-to-server type is a handler arm in
// the Rust hub; for a server-to-client type it is the quoted name anywhere in the Rust sources (a lexical hint).
export function websocketInventory(wsSource, nodeFiles, rust, clientFiles = []) {
  const voice = nodeFiles.find((file) => file.path === VOICE_SOURCE);
  const frames = voice ? voiceSocketFrames(voice.text) : { emitted: [], handled: [] };
  const inbound = new Set([
    ...websocketCandidates(wsSource, rust.ws).filter((entry) => entry.direction === 'client-to-server-candidate').map((entry) => entry.type),
    ...frames.handled,
  ]);
  const outbound = new Set([...nodeWsOutboundTypes(nodeFiles, wsSource), ...frames.emitted, ...relayedWsTypes(wsSource)]);
  const armed = rustInboundArms(rust.ws);
  return [
    ...[...inbound].map((type) => ({ type, direction: 'client-to-server-candidate' })),
    ...[...outbound].map((type) => ({ type, direction: 'server-to-client-candidate' })),
    ...clientOnlyWsEntries(clientFiles, outbound, inbound),
  ]
    .map(({ type, direction, ...rest }) => ({
      type,
      direction,
      rustReference: direction === 'client-to-server-candidate' ? armed.has(type) : rust.all.includes(`"${type}"`),
      ...rest,
    }))
    .sort((a, b) => a.direction.localeCompare(b.direction) || a.type.localeCompare(b.type));
}

// Rust handler arms named by a client-to-server type: `"type" =>` or `"a" | "b" =>` in the Rust hub.
function rustInboundArms(rustSource) {
  const arms = new Set();
  for (const match of rustSource.matchAll(/("(?:[a-z][\w.:-]*)"(?:\s*\|\s*"(?:[a-z][\w.:-]*)")*)\s*=>/g)) {
    for (const name of match[1].matchAll(/"([a-z][\w.:-]*)"/g)) arms.add(name[1]);
  }
  return arms;
}

// The voice-assistant socket (/ws/voice-assistant) speaks its own protocol and never passes through ws.ts. Its server
// frames are `send(clientWs, { type })` calls and its client frames are the arms of `switch (msg.type)`. A send whose
// type is not a literal throws, so an unreviewed frame cannot drop out of the inventory.
export const VOICE_SOURCE = 'voice-assistant/service.ts';
export function voiceSocketFrames(text) {
  const sends = text.match(/\bsend\(\s*clientWs\b/g)?.length ?? 0;
  const emitted = [...text.matchAll(/\bsend\(\s*clientWs\s*,\s*\{\s*type\s*:\s*["'`]([a-z][\w.-]*)["'`]/g)].map((m) => m[1]);
  if (emitted.length !== sends) {
    throw new Error(`unexpanded voice-assistant frame: ${sends - emitted.length} send(clientWs, ...) call(s) without a literal type`);
  }
  const start = text.indexOf('switch (msg.type)');
  if (start < 0) throw new Error('voice-assistant client switch (msg.type) not found');
  let depth = 0;
  let end = start;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const handled = [...text.slice(start, end).matchAll(/\bcase\s+["']([a-z][\w.-]*)["']\s*:/g)].map((m) => m[1]);
  return { emitted: [...new Set(emitted)], handled: [...new Set(handled)] };
}

// A screen-share signal is relayed rather than built: its case arm calls this.relayShareSignal(..., msg), which forwards
// the same type to the other peers, so that type is also a server-to-client frame. Only the call form counts.
export function relayedWsTypes(wsSource) {
  return new Set(switchArms(parseTs('ws.ts', wsSource), 'msg.type').relayed);
}

// Client WebSocket literals, read from the web, API-client, CLI and desktop sources. A file counts only when it opens or
// reads a socket, so HTTP and DOM `type` fields are not read. Consumed literals are `.type ===` tests and `case` arms;
// sent literals are the objects passed to JSON.stringify. WS_NON_FRAME_LITERALS match the same shape but name no socket
// frame; each entry is a reviewed exclusion with its reason.
export const WS_CLIENT_ROOTS = [
  'apps/web/src', 'packages/api-client/src', 'packages/cli/src', 'packages/screen-share/src', 'apps/desktop/src-tauri/src', 'apps/desktop/crates',
];
const WS_NON_FRAME_LITERALS = new Map([
  ['dir', 'file-browser tree entry type (useUICommands)'],
  ['directory', 'file-browser tree entry type (useUICommands)'],
  ['done', 'end-of-stream event of the chat HTTP stream (api-client)'],
  ['token', 'token event of the chat HTTP stream (api-client)'],
  ['keydown', 'DOM KeyboardEvent type (terminal-view)'],
  ['provider.event-from-child', 'desktop IPC relay from a child process (useUICommands)'],
  ['terminal.output-from-child', 'desktop IPC relay from a child process (useUICommands)'],
  ['terminal.exit-from-child', 'desktop IPC relay from a child process (useUICommands)'],
  ['tool.background-complete-from-child', 'desktop IPC relay from a child process (useUICommands)'],
]);
const WS_CLIENT_SOCKET = /new WebSocket\(|onmessage|\bws\.send\(|socket\.send\(|\.send\(JSON\.stringify|Message::Text|tungstenite|connect_async/;
export function clientWsLiterals(files) {
  const consumed = new Map();
  const sent = new Map();
  const add = (map, type, path) => {
    if (!map.has(type)) map.set(type, new Set());
    map.get(type).add(path);
  };
  for (const { path, text } of files) {
    if (!WS_CLIENT_SOCKET.test(text)) continue;
    for (const m of text.matchAll(/\.type\s*(?:===?|!==?)\s*["'`]([a-z][\w.:-]*)["'`]/g)) add(consumed, m[1], path);
    for (const m of text.matchAll(/\bcase\s+["'`]([a-z][\w.:-]*)["'`]\s*:/g)) add(consumed, m[1], path);
    for (const m of text.matchAll(/JSON\.stringify\(\s*\{\s*type\s*:\s*["'`]([a-z][\w.:-]*)["'`]/g)) add(sent, m[1], path);
  }
  return { consumed, sent };
}

// A client literal with no gateway entry in its direction is a candidate, marked clientOnly. A consumed literal is a
// server-to-client frame; a sent literal is a client-to-server frame. None is native without a mapped binary test.
export function clientOnlyWsEntries(files, serverOutbound, serverInbound) {
  const { consumed, sent } = clientWsLiterals(files);
  const entries = [];
  for (const [type, paths] of consumed) {
    if (serverOutbound.has(type) || WS_NON_FRAME_LITERALS.has(type)) continue;
    entries.push({ type, direction: 'server-to-client-candidate', clientOnly: true, clientFiles: [...paths].sort() });
  }
  for (const [type, paths] of sent) {
    if (serverInbound.has(type) || WS_NON_FRAME_LITERALS.has(type)) continue;
    entries.push({ type, direction: 'client-to-server-candidate', clientOnly: true, clientFiles: [...paths].sort() });
  }
  return entries;
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
// Every non-test gateway source, read once. The route, registration and service scans all use this list.
const nodeSources = walk(nodeSrc, ['.ts']).map((f) => ({ path: relative(nodeSrc, f), text: readFileSync(f, 'utf8') }));
// tooling/routes-inventory.mjs reads each route call and registration with the TypeScript compiler API. It throws on any
// call or registration that its reviewed tables do not list, so every route below comes from reviewed sites.
const nodeRoutes = new Map();
for (const route of gatewayRoutes(nodeSources)) {
  const key = `${route.method} ${norm(route.path)}`;
  if (!nodeRoutes.has(key)) nodeRoutes.set(key, { method: route.method, path: route.path, files: [] });
  nodeRoutes.get(key).files.push(...route.files);
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
  // The production maintenance authority (ReadOnlyAuthority) refuses every repository, so no run starts.
  'POST /api/maintenance/run',
  // Generation routes share one generate() helper that answers 503 when no generator is wired. The composed
  // application wires none (every router defaults to generator: None), so each of these refuses the effect.
  'POST /api/plans/{}/generate', 'POST /api/repos/{}/strategy/generate', 'POST /api/repos/{}/todos/generate',
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
    // axum's any() serves every method, so it is ALL, the same as Fastify's app.all().
    for (const mm of body.matchAll(/\b(get|post|put|patch|delete|any)\s*\(/g)) {
      const key = `${mm[1] === 'any' ? 'ALL' : mm[1].toUpperCase()} ${norm(path)}`;
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

// --- WS message candidates. Client-to-server types come from the ws.ts switch; server-to-client types come from
// every gateway source, with templated `${event}` frames expanded from reviewed evidence. This is still lexical,
// so a missing entry is possible; native status still needs a mapped binary test.
// Client-side WebSocket sources: each root that exists, without test files.
const wsClientFiles = WS_CLIENT_ROOTS.flatMap((root) => {
  const dir = join(pkgs, '..', root);
  if (!existsSync(dir)) return [];
  return walk(dir, ['.ts', '.tsx', '.rs'])
    .filter((file) => !/\.(test|spec)\.[^.]+$/.test(file))
    .map((file) => ({ path: relative(join(pkgs, '..'), file), text: readFileSync(file, 'utf8') }));
});
const wsEntries = websocketInventory(
  readFileSync(join(nodeSrc, 'ws.ts'), 'utf8'),
  nodeSources,
  {
    ws: readFileSync(join(rustSrc, 'ws.rs'), 'utf8'),
    all: walk(rustSrc, ['.rs']).map((f) => readFileSync(f, 'utf8')).join('\n'),
  },
  wsClientFiles,
);
// The only Rust evidence for a WS type is a lexical handler arm or emitted type in the Rust hub:
// native-untested until a reviewed binary test is mapped in binary-test-evidence.json.
// A WS control the composed runtime leaves unmounted (inert, fail-closed) is listed here and can never count
// as native, whatever the manifest says. The composed runtime now mounts the supervised, owner-scoped terminal
// controls and the consent decision handler (runtime/application.rs), both exercised by
// tests/binary_ws_messages.rs, so nothing is listed. Add a `<direction> <type>` key again if a control is
// ever mounted fail-closed.
const WS_FAIL_CLOSED = new Set();
for (const w of wsEntries) w.status = w.rustReference && !WS_FAIL_CLOSED.has(`${w.direction} ${w.type}`) ? 'native-untested' : 'missing';

// Node and client-only routes share one status ladder: an unmounted, fail-closed or incomplete Rust
// router is reported as such, and only a mounted, complete router is native-untested.
const routeStatus = (key) => {
  if (!rustRoutes.has(key)) return 'missing';
  const file = rustFile.get(key);
  if (!MOUNTED.has(file)) return 'router-unmounted';
  if (FAIL_CLOSED.has(file) || FAIL_CLOSED_ROUTES.has(key)) return 'mounted-fail-closed';
  if (INCOMPLETE_ROUTES.has(key)) return 'mounted-incomplete';
  return 'native-untested';
};
const nodeEntries = [...nodeRoutes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, r]) => ({
  method: r.method,
  path: r.path,
  nodeFiles: [...new Set(r.files)],
  status: routeStatus(key),
  testPathReference: isTested(r.path),
  rustFile: rustRoutes.has(key) ? rustFile.get(key) : undefined,
}));
// Client-side lexical references complement the server scan. They include comments and
// partial expressions, do not identify HTTP methods, and require manual review. Request calls are read with the
// TypeScript compiler API, and each non-literal request path must be reviewed in tooling/client-inventory.mjs.
const repo = join(pkgs, '..');
const clientFiles = new Map();
const requestSites = [];
for (const root of ['apps/web/src', 'apps/desktop/src', 'apps/desktop/src-tauri/src', 'packages/cli/src', 'packages/api-client/src']) {
  const directory = join(repo, root);
  if (!existsSync(directory)) continue;
  for (const file of walk(directory, ['.ts', '.tsx', '.rs'])) {
    if (/\.(test|spec)\.[^.]+$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const path of clientPathCandidates(text)) {
      const shape = clientRouteShape(path);
      if (!shape.startsWith('/api/')) continue;
      if (!clientFiles.has(shape)) clientFiles.set(shape, new Set());
      clientFiles.get(shape).add(relative(repo, file));
    }
    if (/\.tsx?$/.test(file)) requestSites.push(...clientRequestSites(relative(repo, file), text));
  }
}
const clientRequests = reviewClientRequests(requestSites);
const nonLiteralRequestCalls = requestSites.filter((site) => !site.literal).length;
// Each client route shape is one inventory row. A shape the Node gateway registers references that route;
// any other shape is a client-only row, counted as missing unless a Rust route has the same shape.
const clientCandidates = [...clientFiles.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([shape, files]) => {
  const serverRoutes = nodeEntries
    .filter((entry) => clientShapeMatchesRoute(shape, normalizeClientPath(entry.path)))
    .map((entry) => `${entry.method} ${entry.path}`);
  return { path: shape, files: [...files].sort(), serverPathReference: serverRoutes.length > 0, serverRoutes };
});
const clientOnlyEntries = clientCandidates.filter((candidate) => !candidate.serverPathReference).map((candidate) => {
  // A client call names no method; take the status of the first Rust route with the same shape, if any.
  const rustKey = [...rustRoutes].sort().find((key) => clientShapeMatchesRoute(candidate.path, key.slice(key.indexOf(' ') + 1)));
  return {
    method: rustKey ? rustKey.slice(0, rustKey.indexOf(' ')) : 'ANY',
    path: candidate.path,
    clientOnly: true,
    nodeFiles: [],
    clientFiles: candidate.files,
    status: rustKey ? routeStatus(rustKey) : 'missing',
    testPathReference: isTested(candidate.path),
    rustFile: rustKey ? rustFile.get(rustKey) : undefined,
  };
});
const entries = [...nodeEntries, ...clientOnlyEntries];
const extraRust = [...rustRoutes].filter((k) => !nodeRoutes.has(k)).sort();
const manifest = JSON.parse(readFileSync(join(here, 'binary-test-evidence.json'), 'utf8'));
const evidence = applyBinaryEvidence(entries, wsEntries, manifest, (file) => readFileSync(join(here, '..', file), 'utf8'));
// A fail-closed WS control must never count as native, even if a manifest entry names a test for it.
const mappedFailClosed = wsEntries.filter((w) => WS_FAIL_CLOSED.has(`${w.direction} ${w.type}`) && w.status === 'native-tested');
if (mappedFailClosed.length) throw new Error(`fail-closed WS controls cannot be native-tested: ${mappedFailClosed.map((w) => w.type).join(', ')}`);
const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] ?? 0) + 1), a), {});
// Three-way Rust status for the parity checklist. Unmounted, fail-closed and incomplete routers do not
// implement the feature natively, so they are reported as missing; `status` keeps the detail.
const threeWay = (status) => (status === 'native-tested' || status === 'native-untested' ? status : 'missing');
for (const e of entries) e.rustStatus = threeWay(e.status);
for (const w of wsEntries) w.rustStatus = threeWay(w.status);

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
  clientOnlyRoutes: clientOnlyEntries.length,
  rustOnlyRoutes: extraRust.length,
  clientRequestCalls: requestSites.length,
  clientNonLiteralRequestCalls: nonLiteralRequestCalls,
  clientReviewedRequestSites: clientRequests.length,
};
// Background services of the Node gateway, from tooling/services-inventory.mjs. Every composition-root start and every
// timer or loop site is reviewed there, so an unlisted one throws. A keyword hit in Rust source is only a hint.
const rustAll = walk(rustSrc, ['.rs']).map((f) => readFileSync(f, 'utf8')).join('\n');
const background = backgroundInventory(nodeSources);
// A service is native only once the composed binary starts it and a reviewed binary test covers it; no such
// evidence is recorded yet, so every service is missing.
const services = background.services.map((service) => ({
  name: service.name,
  kind: service.kind,
  nodeSites: service.nodeSites,
  rustKeywordHint: service.hint.test(rustAll),
  rustStatus: 'missing',
}));
const reviewedTimers = background.excluded;
const rustStatusCounts = (items) => {
  const out = { 'native-tested': 0, 'native-untested': 0, missing: 0 };
  for (const item of items) out[item.rustStatus] += 1;
  return out;
};
summary.backgroundServices = services.length;
summary.backgroundServicesMissing = services.filter((s) => s.rustStatus === 'missing').length;
summary.httpRustStatus = rustStatusCounts(entries);
summary.wsRustStatus = rustStatusCounts(wsEntries);
summary.serviceRustStatus = rustStatusCounts(services);
// The completion measure covers every inventory entry: HTTP routes, WS message types and background services.
summary.nativeTested += summary.serviceRustStatus['native-tested'];
summary.nativeTestedDenominator = entries.length + wsEntries.length + services.length;
summary.nativeTestedPct = +((100 * summary.nativeTested) / summary.nativeTestedDenominator).toFixed(2);
const result = { summary, http: entries, ws: wsEntries, services, reviewedTimers, clientCandidates, clientRequestReviews: clientRequests, rustOnly: extraRust };
const json = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const committedPath = join(here, '..', 'docs', 'api-inventory.json');
  const committed = existsSync(committedPath) ? readFileSync(committedPath, 'utf8') : '';
  if (committed !== json) {
    console.error('docs/api-inventory.json is stale; run: node tooling/api-inventory.mjs --write');
    process.exit(1);
  }
}
console.log(JSON.stringify(summary, null, 2));

if (process.argv.includes('--write')) {
  const out = join(here, '..', 'docs');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'api-inventory.json'), json);
  const md = [
    '# Gateway API inventory (generated by tooling/api-inventory.mjs)',
    '',
    'rustStatus is the parity value: native-tested (a reviewed black-box test is mapped and exists), native-untested (a Rust router or handler reference exists but no mapped test), or missing (no verified native implementation: unmounted, fail-closed, incomplete, or absent). Detail keeps the source status. Mounted-incomplete routes serve a subset but lack production collaborators; mounted-fail-closed routes refuse the unavailable effect. Neither counts as native.',
    '',
    'HTTP routes are read with the TypeScript compiler API from every Node gateway source (tooling/routes-inventory.mjs). Every route call and registration must be listed in its reviewed tables, so an unlisted one fails generation; prefixes come from register calls and mounts, and a computed path must expand from literal evidence in its file. Background services are read the same way (tooling/services-inventory.mjs). Rust routes are still a lexical scan of axum .route calls, so a Rust status is a lead until the composed binary serves the route and a mapped black-box test covers it. Client paths are lexical; every request call whose path is not literal /api text in the web, CLI, desktop and API-client sources is reviewed in tooling/client-inventory.mjs. WS messages are read with the TypeScript compiler API (tooling/ws-inventory.mjs), and their client side is lexical. nativeTestedPct counts the HTTP routes and WS messages mapped in tooling/binary-test-evidence.json, divided by all HTTP, WS and service entries. The manifest requires manually reviewed tests that exercise the production binary over HTTP or WS and have passed; a source path match alone never counts. A mapped test is limited evidence, not full behavioral parity or proof that it still passes on the current snapshot. Services have no mapping mechanism yet, so none count as native-tested.',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    '',
    '| Method | Path | Rust status | Detail | Binary tests | Node source |',
    '|---|---|---|---|---|---|',
    ...entries.map((e) => `| ${e.method} | \`${e.path}\` | ${e.rustStatus} | ${e.status} | ${e.binaryTests.map((t) => `\`${t.file}::${t.name}\``).join(', ')} | ${e.nodeFiles.join(', ')} |`),
    '',
    '## Background services (reviewed)',
    '',
    'Every background site in the Node gateway source is listed in tooling/services-inventory.mjs: the composition-root starts in index.ts and server.ts, each setInterval, each self re-arming timer and each literal loop. A site that is per request or per tool call is listed under reviewed timers, not as a service. A keyword hit in Rust source does not show the service is wired into the composed binary, so every service stays missing until a test-backed entry exists.',
    '',
    ...services.map((s) => `- \`${s.name}\` (${s.kind}) — ${s.rustStatus}; Rust keyword hint ${s.rustKeywordHint ? 'present' : 'absent'}; Node: ${s.nodeSites.join(', ')}`),
    '',
    '## Reviewed timers and loops (not services)',
    '',
    ...reviewedTimers.map((t) => `- \`${t.key}\` — ${t.sites.join(', ')} — ${t.reason}`),
    '',
    '## Client path candidates (heuristic)',
    '',
    'Lexical `/api/` references from web, desktop, CLI and API-client source may include comments, partial expressions and non-requests. Shapes are normalized (glued query suffixes and trailing punctuation dropped). A shape that matches a Node route references it; any other shape has its own row in the HTTP table with an empty Node source. A matching path does not identify a method or establish parity. Dynamic constructions that are not literal may still be omitted.',
    '',
    ...clientCandidates.map((candidate) => `- \`${candidate.path}\` — ${candidate.serverPathReference ? candidate.serverRoutes.join(', ') : 'client-only row (see HTTP table)'} — ${candidate.files.join(', ')}`),
    '',
    '## Client request reviews (non-literal request paths)',
    '',
    'Each request call (fetch, apiFetch, request, this.request, getJson) whose path is not a literal containing /api is listed here with the place its path is built. Reviewed in tooling/client-inventory.mjs; the table must match the source exactly.',
    '',
    ...clientRequests.map((entry) => `- \`${entry.key}\` (${entry.count}) — ${entry.reason}`),
    '',
    '## WS message candidates (heuristic)',
    '',
    'Client-to-server candidates come from the string arms of the Node hub switch on msg.type and of the voice-assistant socket. Server-to-client candidates come from the literal `type` values of object literals in every Node gateway source (read as an AST), literal types passed to broadcast helpers, the voice-assistant frames and the screen-share relays, which forward the type they receive. clientOnly candidates are literals that a web, API-client, CLI or desktop WebSocket handler reads or sends and that no Node source has in that direction. Both lists can include unrelated switches or objects, and dynamic types are omitted. A Rust reference is only a lexical match: a client-to-server reference is a handler arm in the Rust hub, and a server-to-client reference is the quoted type name anywhere in the Rust sources, so an unrelated quoted word (for example the voice-assistant frame "status") can match. It does not establish mounting, behavior, coverage, or parity.',
    '',
    ...wsEntries.map((w) => `- ${w.direction}: \`${w.type}\` — ${w.rustStatus} — ${w.binaryTests.map((t) => `\`${t.file}::${t.name}\``).join(', ') || 'no binary test'}${w.clientOnly ? ' — clientOnly' : ''}`),
    '',
  ].join('\n');
  writeFileSync(join(out, 'api-inventory.md'), md);
}
