// Background services of the Node gateway, read with the TypeScript compiler API. A background site is a call the
// composition root (index.ts and server.ts) makes that starts work, a setInterval anywhere in the gateway source, a setTimeout that
// re-arms its own enclosing method, or a literal infinite loop. Each site must appear in a reviewed table below: as a
// service, or with the reason it is not one. An unlisted site, or a count that differs from the table, throws, so a
// new background loop cannot drop out of the inventory. Loops with a non-literal condition are not scanned.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { parseTs } from './ws-inventory.mjs';

// The nearest enclosing named function or method, qualified by its class when it has one.
export function enclosingName(node) {
  const names = [];
  for (let p = node.parent; p; p = p.parent) {
    if ((ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p)) && p.name) names.unshift(p.name.getText());
    else if (ts.isClassDeclaration(p) && p.name) names.unshift(p.name.getText());
    else if (
      ts.isVariableDeclaration(p) &&
      ts.isIdentifier(p.name) &&
      p.initializer &&
      (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))
    ) {
      names.unshift(p.name.text);
    }
  }
  return names.slice(-2).join('.') || '(top level)';
}

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
// startsWith is excluded by the lowercase letter after "start". Composition files are the entrypoint and the server
// builder: a start-like call in either must be reviewed, since neither may start work the table does not know about.
const START_CALL = /^(start|start[A-Z]\w*|watch|queue[A-Z]\w*Recovery)$/;
const COMPOSITION_FILES = new Set(['index.ts', 'server.ts']);

// A setTimeout whose callback calls the method that contains it re-arms itself, so it is a loop.
function rearms(call, sf) {
  const owner = enclosingName(call).split('.').pop();
  const callback = call.arguments[0];
  if (!callback || owner === '(top level)') return false;
  let found = false;
  const look = (node) => {
    if (found) return;
    if (ts.isCallExpression(node) && [`this.${owner}`, owner].includes(node.expression.getText(sf))) found = true;
    else ts.forEachChild(node, look);
  };
  look(callback);
  return found;
}

// Every background site in one gateway source file.
export function backgroundSitesIn(path, text) {
  const sf = parseTs(path, text);
  const sites = [];
  const add = (kind, callee, node) =>
    sites.push({ kind, callee, file: path, line: lineOf(sf, node), key: `${path}|${enclosingName(node)}` });
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : callee;
      if (COMPOSITION_FILES.has(path) && START_CALL.test(method)) add('composition-start', callee, node);
      if (callee === 'setInterval') add('setInterval', callee, node);
      if (callee === 'setTimeout' && rearms(node, sf)) add('rearming-timeout', callee, node);
    }
    if (ts.isWhileStatement(node) && node.expression.getText(sf) === 'true') add('loop', 'while (true)', node);
    if (ts.isForStatement(node) && !node.initializer && !node.condition && !node.incrementor) add('loop', 'for (;;)', node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

// Every non-test .ts file under the gateway source root, with its path relative to that root.
export function walkGatewaySource(root) {
  const out = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) visit(p);
      else if (name.endsWith('.ts') && !/\.test\.ts$/.test(name)) out.push({ path: relative(root, p), text: readFileSync(p, 'utf8') });
    }
  };
  visit(root);
  return out;
}

// Composition-root starts in index.ts: callee text, the number of sites expected, and the service it starts.
const COMPOSITION_STARTS = [
  ['primaryLink.start', 2, 'primaryLink'],
  ['threadService.queueRestartRecovery', 1, 'threadRestartRecovery'],
  ['emailService.startInboxRefresh', 1, 'emailInboxRefresh'],
  ['projectWatcher.watch', 1, 'projectWatcher'],
  ['scheduler.start', 1, 'scheduler'],
  ['threadReviewSync.start', 1, 'threadReviewSync'],
  ['ws.start', 1, 'wsHub'],
  ['databaseRetention.start', 1, 'databaseRetention'],
  ['diskJanitor.start', 1, 'diskJanitor'],
  ['jaitProvider.startSandboxMaintenance', 1, 'sandboxMaintenance'],
  ['channelManager.startEnabled', 1, 'channelAutoStart'],
];

// setInterval sites and self re-arming timers, keyed by file and enclosing function. `services` lists the services of
// the sites in source order. A key with `reason` instead is a per-request or per-tool timer, reviewed as not a service.
const TIMER_SITES = [
  { key: 'routes/plan-runs-crash.fixture.ts|(top level)', reason: 'test-only child process stays alive until the restart regression kills it' },
  { key: 'index.ts|main', services: ['terminalReaper', 'browserReaper'] },
  { key: 'providers/jait-provider.ts|JaitProvider.startSandboxMaintenance', services: ['sandboxMaintenance'] },
  { key: 'providers/session-idle.ts|CliSessionIdleTracker.watch', services: ['cliSessionIdleReaper'] },
  { key: 'routes/browser-devtools.ts|registerBrowserDevToolsRoutes', services: ['browserDevtoolsGrantCleanup'] },
  { key: 'routes/threads.ts|registerThreadRoutes', services: ['threadRecoverySweep'] },
  { key: 'scheduler/service.ts|SchedulerService.start', services: ['scheduler'] },
  { key: 'services/bridge-reauth.ts|TeamsReauthService.start', services: ['teamsReauthFlowPoll'] },
  { key: 'services/database-retention.ts|DatabaseRetentionService.schedule', services: ['databaseRetention'] },
  { key: 'services/disk-janitor.ts|start.tick', services: ['diskJanitor'] },
  { key: 'services/email/service.ts|EmailService.startInboxRefresh', services: ['emailInboxRefresh'] },
  { key: 'services/messenger-service.ts|Connection.start', services: ['messengerConnection'] },
  { key: 'services/messenger-service.ts|Connection.startPresenceTimer', services: ['messengerPresence'] },
  { key: 'services/orchestration/orchestrator.ts|OrchestrationService.startStandby', services: ['orchestratorStandby'] },
  { key: 'services/provider-updates.ts|ProviderUpdateService.start', services: ['providerUpdateChecks'] },
  { key: 'services/thread-review-sync.ts|ThreadReviewSyncService.start', services: ['threadReviewSync'] },
  { key: 'ws.ts|WsControlPlane.start', services: ['wsHub'] },
  { key: 'channels/telegram/connector.ts|TelegramConnector.startTyping', reason: 'typing indicator while one chat reply is pending' },
  { key: 'routes/browser-devtools.ts|registerBrowserDevToolsRoutes.upgrade', reason: 'validity check on one devtools transport, cleared with that transport' },
  { key: 'routes/chat.ts|registerChatRoutes', count: 8, reason: 'per-stream SSE keepalive, heartbeat and access rechecks, cleared on stream close' },
  { key: 'routes/mcp-server.ts|registerMcpRoutes', count: 2, reason: 'keepalive on one MCP connection' },
  { key: 'tools/browser-handoff.ts|createBrowserHandoffTool.wait', reason: 'poll inside one browser handoff tool call' },
  { key: 'tools/terminal-tools.ts|executeInTerminal', reason: 'poll inside one terminal tool execution' },
];

// Literal loops, keyed like timers. Each is per request, per session drain or bounded, so none is a service.
const LOOP_SITES = [
  { key: 'index.ts|listenWithRetryOnConflict', reason: 'startup bind retry, bounded by maxWaitMs' },
  { key: 'routes/threads.ts|registerThreadRoutes.drainQueuedThreadMessages', reason: 'drains one session queue until it is empty' },
  { key: 'services/email/connection.ts|discoverMailSettings', reason: 'reads one HTTP response body' },
  { key: 'services/git-forge.ts|GitHubForge.prFileDiffsViaApi', reason: 'pages through one pull request request' },
  { key: 'services/git.ts|mapWithConcurrency', reason: 'worker loop bounded by the item list' },
  { key: 'services/messenger-service.ts|SafeMatrixClient.doRequest', reason: 'reads one HTTP response body' },
  { key: 'services/preview-runner.ts|detectPackageManager', reason: 'walks up to the filesystem root' },
  { key: 'services/subscription-usage-fetchers.ts|fetchOllamaSettingsUsage', reason: 'reads one HTTP response body' },
  { key: 'tools/agent-loop.ts|parseOllamaStream', reason: 'parses one provider stream' },
  { key: 'tools/agent-loop.ts|parseOpenAIStream', reason: 'parses one provider stream' },
];

// Each service: its kind and a lexical hint for Rust source. A hint match is a hint only, never a wired service.
export const SERVICES = {
  primaryLink: { kind: 'service', hint: /primary_link/i },
  threadRestartRecovery: { kind: 'boot-task', hint: /recover_interrupted|restart_recovery/i },
  emailInboxRefresh: { kind: 'service', hint: /inbox_refresh|email.*refresh/i },
  projectWatcher: { kind: 'service', hint: /project_watch/i },
  scheduler: { kind: 'service', hint: /scheduler/i },
  threadReviewSync: { kind: 'service', hint: /thread_review_sync|review_sync/i },
  wsHub: { kind: 'service', hint: /ws_hub|WsHub/ },
  databaseRetention: { kind: 'service', hint: /retention/i },
  diskJanitor: { kind: 'service', hint: /janitor/i },
  sandboxMaintenance: { kind: 'service', hint: /sandbox.*maint|maint.*sandbox/i },
  channelAutoStart: { kind: 'service', hint: /channel.*(start|enabled)|auto_?start/i },
  terminalReaper: { kind: 'service', hint: /reaper|idle_reap/i },
  browserReaper: { kind: 'service', hint: /browser.*reap|reap.*browser/i },
  browserDevtoolsGrantCleanup: { kind: 'service', hint: /devtools.*grant|grant.*expir/i },
  threadRecoverySweep: { kind: 'service', hint: /recover_interrupted|interrupted_thread/i },
  cliSessionIdleReaper: { kind: 'service', hint: /session_idle|idle_reap/i },
  messengerConnection: { kind: 'service', hint: /messenger.*(sync|reconnect)|matrix.*(sync|reconnect)/i },
  messengerPresence: { kind: 'service', hint: /presence/i },
  orchestratorStandby: { kind: 'service', hint: /standby/i },
  providerUpdateChecks: { kind: 'service', hint: /provider_update|update_check/i },
  teamsReauthFlowPoll: { kind: 'flow-poll', hint: /reauth/i },
};

const push = (map, key, value) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
};

// The reviewed background inventory for the gateway source files. Throws on any site the tables do not cover.
export function backgroundInventory(files) {
  const byCallee = new Map();
  const byKey = new Map();
  for (const file of files) {
    for (const site of backgroundSitesIn(file.path, file.text)) {
      if (site.kind === 'composition-start') push(byCallee, site.callee, site);
      else push(byKey, site.key, site);
    }
  }
  const services = new Map();
  const addSite = (name, site) => {
    if (!SERVICES[name]) throw new Error(`service ${name} is not declared in SERVICES`);
    if (!services.has(name)) services.set(name, { name, ...SERVICES[name], nodeSites: [] });
    services.get(name).nodeSites.push(`${site.file}:${site.line} ${site.callee}`);
  };
  for (const [callee, expected, name] of COMPOSITION_STARTS) {
    const found = byCallee.get(callee) ?? [];
    if (found.length !== expected) throw new Error(`index.ts start ${callee}: expected ${expected} site(s), found ${found.length}`);
    byCallee.delete(callee);
    for (const site of found) addSite(name, site);
  }
  if (byCallee.size) throw new Error(`unreviewed composition start: ${[...byCallee.keys()].join(', ')}`);

  const excluded = [];
  for (const entry of [...TIMER_SITES, ...LOOP_SITES]) {
    const found = byKey.get(entry.key) ?? [];
    const expected = entry.services?.length ?? entry.count ?? 1;
    if (found.length !== expected) throw new Error(`background site ${entry.key}: expected ${expected}, found ${found.length}`);
    byKey.delete(entry.key);
    if (entry.services) {
      found.forEach((site, i) => addSite(entry.services[i], site));
    } else {
      excluded.push({ key: entry.key, sites: found.map((site) => `${site.file}:${site.line} ${site.callee}`), reason: entry.reason });
    }
  }
  if (byKey.size) throw new Error(`unreviewed background site: ${[...byKey.keys()].join(', ')}`);
  return { services: [...services.values()], excluded };
}
