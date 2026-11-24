import ts from 'typescript';
import { enclosingName } from './services-inventory.mjs';

// Lexical URL candidates only: strings, comments and partial expressions can match.
// This scan is a review aid and does not establish an HTTP method or runtime usage.
export function clientPathCandidates(source) {
  const paths = new Set();
  for (const match of source.matchAll(/\/api\/(?:\$\{[^}]*\}|[A-Za-z0-9_.\-/:%?=&])+/g)) {
    const path = match[0].replace(/\$\{[^}]*\}/g, "{}")
      .split("?", 1)[0]
      .replace(/\/+$/, "");
    if (path) paths.add(path);
  }
  return [...paths].sort();
}

export function normalizeClientPath(path) {
  return path.replace(/:[A-Za-z_]\w*\??/g, "{}")
    .replace(/\{[^}/]*\}/g, "{}")
    .replace(/\*+/g, "{}")
    .replace(/\/+$/, "") || "/";
}

// Shape of a client candidate in normalizeClientPath's vocabulary. Adjacent placeholders form one
// dynamic segment, a placeholder glued to literal text (`/api/providers${query}`) is a suffix, and
// trailing punctuation is prose (`/api/chat:` in a comment). Literal text is kept as written.
export function clientRouteShape(candidate) {
  return candidate.replace(/[.:]+$/, "")
    .replace(/\{\}(?:\{\})+/g, "{}")
    .replace(/([^/{}])\{\}$/, "$1")
    .replace(/\/+$/, "") || "/";
}

// Routing semantics: a placeholder on either side matches any segment, and literals must agree. A client
// literal reaches a route parameter (`/api/security/findings` is served by `/api/security/:id`).
export function clientShapeMatchesRoute(shape, route) {
  const client = shape.split("/");
  const server = route.split("/");
  return client.length === server.length
    && client.every((segment, index) => segment === "{}" || server[index] === "{}" || segment === server[index]);
}

// Request paths. The lexical scan above keeps its rule, but it sees only /api literals, so a request whose path is computed
// or lacks /api (`${baseUrl}/surfaces`, this.request("/command")) is invisible to it. Each request call is read with the
// TypeScript compiler API: fetch, apiFetch, request and this.request, in the web, API-client, CLI and desktop sources.
// A path that is a string, or a template, whose literal text contains /api is literal, and the lexical scan covers it.
// Any other path is a non-literal request, and each one must appear in CLIENT_REQUEST_SITES with its count and the place
// its path is built, so no request path the lexical scan cannot see is taken on faith.
const REQUEST_FUNCTIONS = new Set(["fetch", "apiFetch", "request", "getJson"]);
const API_PATH = /\/api(?:\/|$)/;

export function clientRequestSites(path, text) {
  const kind = /\.tsx$/.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const sites = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && isRequestCallee(node.expression) && node.arguments.length > 0) {
      const argument = node.arguments[0];
      sites.push({
        key: `${path}|${enclosingName(node)}`,
        literal: isLiteralRequestPath(argument),
        expression: argument.getText(sf).slice(0, 120),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

function isRequestCallee(callee) {
  if (ts.isIdentifier(callee)) return REQUEST_FUNCTIONS.has(callee.text);
  return ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword && callee.name.text === "request";
}

function isLiteralRequestPath(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return API_PATH.test(node.text);
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].some((text) => API_PATH.test(text));
  }
  return false;
}

// Every non-literal request call must be reviewed with its exact count. Literal calls need no entry.
export function reviewClientRequests(sites, table = CLIENT_REQUEST_SITES) {
  const counts = new Map();
  for (const site of sites) {
    if (!site.literal) counts.set(site.key, (counts.get(site.key) ?? 0) + 1);
  }
  const reviewed = new Map();
  for (const entry of table) {
    if (reviewed.has(entry.key)) throw new Error(`duplicate reviewed client request site ${entry.key}`);
    reviewed.set(entry.key, entry);
  }
  for (const [key, count] of counts) {
    const entry = reviewed.get(key);
    if (!entry) throw new Error(`unreviewed non-literal request path in ${key} (${count} call(s))`);
    if (entry.count !== count) throw new Error(`client request site ${key}: reviewed ${entry.count}, found ${count}`);
  }
  for (const entry of table) {
    if (!counts.has(entry.key)) throw new Error(`client request site ${entry.key} is reviewed but absent`);
  }
  return table;
}

// Reviewed non-literal request calls: file|enclosing function, the number of such calls there, and where the path comes from.
// Health probes (/health) are gateway routes outside /api. A Matrix homeserver URL is not a gateway route at all.
export const CLIENT_REQUEST_SITES = [
  { key: "apps/web/src/components/project/project-members.tsx|ProjectMembers.change", count: 1, reason: "forwards the project members endpoint or endpoint plus an encoded user ID from component handlers" },
  { key: "apps/web/src/components/project/project-members.tsx|ProjectMembers", count: 3, reason: "fetch forwards the helper URL; two request calls use the project members endpoint built in this component" },
  { key: "apps/web/src/App.tsx|App", count: 1, reason: "health probe of the configured gateway (${getApiUrl()}/health)" },
  { key: "apps/web/src/components/consent/action-card.tsx|consentFetch", count: 1, reason: "helper; the url it receives is ${GATEWAY}/api/consent/pending[/id] built in the caller" },
  { key: "apps/web/src/components/messenger/teams-connection-card.tsx|TeamsConnectionCard", count: 1, reason: "REAUTH_URL, the constant '/api/messenger/bridge-reauth/teams' in this file" },
  { key: "apps/web/src/components/network/network-panel.tsx|NodeDetail", count: 1, reason: "health probe of a node's own gateway address (/health), outside the local /api" },
  { key: "apps/web/src/components/network/service-checks.tsx|ServiceChecks.api", count: 1, reason: "helper; callers pass literal /api/security paths in this file" },
  { key: "apps/web/src/components/onboarding/DesktopGatewaySetup.tsx|DesktopGatewaySetup.apply", count: 1, reason: "health probe of the remote gateway the user entered (/health)" },
  { key: "apps/web/src/components/project/folder-picker-dialog.tsx|FolderPickerDialog", count: 2, reason: "url is ${API_URL}/api/filesystem/browse or /roots, built in the same function" },
  { key: "apps/web/src/components/project/project-panel.tsx|(top level)", count: 1, reason: "url is ${API_URL}/api/project/search, built in the same callback" },
  { key: "apps/web/src/components/project/project-panel.tsx|fetchRemoteDirEntries", count: 1, reason: "url is ${API_URL}/api/project/list, built in the same function" },
  { key: "apps/web/src/components/project/project-panel.tsx|remoteReadBackup", count: 1, reason: "url is ${API_URL}/api/project/backup, built in the same function" },
  { key: "apps/web/src/components/project/project-panel.tsx|remoteReadFile.read", count: 1, reason: "url is ${API_URL}/api/project/read, built in the same function" },
  { key: "apps/web/src/components/project/project-panel.tsx|remoteStatFile", count: 1, reason: "url is ${API_URL}/api/project/stat, built in the same function" },
  { key: "apps/web/src/hooks/useGatewayConnection.ts|useGatewayConnection", count: 1, reason: "health probe of the gateway URL the user entered (/health)" },
  { key: "apps/web/src/hooks/useGatewayImage.ts|useGatewayImage", count: 1, reason: "source is the caller's image URL; only the gateway's /api/browser/screenshot path is fetched with auth" },
  { key: "apps/web/src/hooks/useGatewayReachable.ts|useGatewayReachable", count: 1, reason: "health probe (${getApiUrl()}/health)" },
  { key: "apps/web/src/hooks/useModelInfo.ts|useModelInfo", count: 1, reason: "health probe (${getApiUrl()}/health)" },
  { key: "apps/web/src/hooks/useProjects.ts|useProjects", count: 1, reason: "url is ${API_URL}/api/projects/{id}/sessions or ${API_URL}/api/sessions, both literal here" },
  { key: "apps/web/src/hooks/useUpdateChecker.ts|useUpdateChecker", count: 1, reason: "health probe (${apiUrl}/health)" },
  { key: "apps/web/src/lib/agent-control-api.ts|request", count: 1, reason: "helper; callers pass literal /api/agent-control paths in this file" },
  { key: "apps/web/src/lib/agents-api.ts|AgentsApi.attachAgentGithubAppInstallation", count: 1, reason: "githubAppPath builds ${API_URL}/api/agents/{id}/github-app in this file, plus a suffix" },
  { key: "apps/web/src/lib/agents-api.ts|AgentsApi.disconnectAgentGithubApp", count: 1, reason: "githubAppPath builds ${API_URL}/api/agents/{id}/github-app in this file" },
  { key: "apps/web/src/lib/agents-api.ts|AgentsApi.getAgentGithubApp", count: 1, reason: "githubAppPath builds ${API_URL}/api/agents/{id}/github-app in this file" },
  { key: "apps/web/src/lib/agents-api.ts|AgentsApi.getGithubIntake", count: 1, reason: "githubAppPath builds ${API_URL}/api/agents/{id}/github-app in this file, plus /intake" },
  { key: "apps/web/src/lib/agents-api.ts|AgentsApi.saveAgentGithubAppManual", count: 1, reason: "githubAppPath builds ${API_URL}/api/agents/{id}/github-app in this file, plus /manual" },
  { key: "apps/web/src/lib/agents-api.ts|AgentsApi.saveGithubIntake", count: 1, reason: "githubAppPath builds ${API_URL}/api/agents/{id}/github-app in this file, plus /intake" },
  { key: "apps/web/src/lib/agents-api.ts|AgentsApi.startAgentGithubAppInstallation", count: 1, reason: "githubAppPath builds ${API_URL}/api/agents/{id}/github-app in this file, plus /installation-url" },
  { key: "apps/web/src/lib/agents-api.ts|AgentsApi.startAgentGithubAppSetup", count: 1, reason: "githubAppPath builds ${API_URL}/api/agents/{id}/github-app in this file, plus /setup" },
  { key: "apps/web/src/lib/agents-api.ts|AgentsApi.testAgentGithubApp", count: 1, reason: "githubAppPath builds ${API_URL}/api/agents/{id}/github-app in this file, plus /test" },
  { key: "apps/web/src/lib/agents-api.ts|AgentsApi.verifyAgentGithubApp", count: 1, reason: "githubAppPath builds ${API_URL}/api/agents/{id}/github-app in this file, plus /verify" },
  { key: "apps/web/src/lib/api-fetch.ts|apiFetch", count: 1, reason: "wrapper; adds auth only to gateway /api/ URLs and forwards the caller's input" },
  { key: "apps/web/src/lib/chat-prewarm.ts|prewarmChatSession", count: 1, reason: "request from the builder in this file: ${apiUrl}/api/chat/prewarm" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.action", count: 1, reason: "request() suffix '/command' under /api/messenger" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.attachmentBlob", count: 1, reason: "request() suffix '/media' under /api/messenger" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.avatarBlob", count: 1, reason: "request() suffix '/media' under /api/messenger" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.browserNotificationImage", count: 1, reason: "fetch(getApiUrl() + '/api/messenger/notification-image'): a literal /api path, concatenated rather than templated, so POST /api/messenger/notification-image is read from this file" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.connect", count: 1, reason: "request() empty suffix: the /api/messenger root" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.disconnect", count: 1, reason: "request() empty suffix: the /api/messenger root" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.prefetchRecent", count: 1, reason: "request() query suffix '?roomId=' under /api/messenger" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.refreshRemote", count: 1, reason: "request() query suffix under /api/messenger" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.refreshSearch", count: 1, reason: "request() suffix '/search?query=' under /api/messenger" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.remove", count: 1, reason: "request() suffix '/command' under /api/messenger" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.request", count: 1, reason: "helper; joins getApiUrl() + '/api/messenger' + path in this file" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.restoreKeys", count: 1, reason: "request() suffix '/keys' under /api/messenger" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.send", count: 1, reason: "request() suffix '/command' under /api/messenger" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.sendAttachment", count: 1, reason: "request() suffix '/command' under /api/messenger" },
  { key: "apps/web/src/lib/messenger/gateway-store.ts|GatewayMessengerStore.setHidden", count: 1, reason: "request() suffix '/command' under /api/messenger" },
  { key: "apps/web/src/lib/messenger/store.ts|MessengerStore.avatarBlob", count: 1, reason: "Matrix homeserver media URL from mxcUrlToHttp; not a gateway route" },
  { key: "apps/web/src/lib/messenger/store.ts|MessengerStore.fetchAttachmentBlob", count: 1, reason: "Matrix homeserver attachment URL; not a gateway route" },
  { key: "apps/web/src/lib/pull-requests-api.ts|comment", count: 1, reason: "repoPath suffix; repoPath builds /api/repos/{id}/pull-requests in this file" },
  { key: "apps/web/src/lib/pull-requests-api.ts|diff", count: 1, reason: "repoPath suffix; repoPath builds /api/repos/{id}/pull-requests in this file" },
  { key: "apps/web/src/lib/pull-requests-api.ts|get", count: 1, reason: "repoPath suffix; repoPath builds /api/repos/{id}/pull-requests in this file" },
  { key: "apps/web/src/lib/pull-requests-api.ts|list", count: 1, reason: "repoPath with a query suffix; repoPath builds /api/repos/{id}/pull-requests in this file" },
  { key: "apps/web/src/lib/pull-requests-api.ts|merge", count: 1, reason: "repoPath suffix; repoPath builds /api/repos/{id}/pull-requests in this file" },
  { key: "apps/web/src/lib/pull-requests-api.ts|request", count: 1, reason: "helper; callers pass repoPath paths built in this file" },
  { key: "apps/web/src/lib/pull-requests-api.ts|resolveConflicts", count: 1, reason: "repoPath suffix; repoPath builds /api/repos/{id}/pull-requests in this file" },
  { key: "apps/web/src/lib/pull-requests-api.ts|review", count: 1, reason: "repoPath suffix; repoPath builds /api/repos/{id}/pull-requests in this file" },
  { key: "apps/web/src/lib/pull-requests-api.ts|update", count: 1, reason: "repoPath suffix; repoPath builds /api/repos/{id}/pull-requests in this file" },
  { key: "apps/web/src/lib/team-chat-api.ts|(top level)", count: 2, reason: "'/api/team-rooms/' + id, with a query or /messages suffix, in the same expression" },
  { key: "apps/web/src/lib/team-chat-api.ts|request", count: 1, reason: "helper; callers pass literal /api/team-rooms paths in this file" },
  { key: "apps/web/src/lib/terminal-snapshot.ts|loadTerminalSnapshot", count: 1, reason: "getApiUrl() + '/api/terminals' in the same expression" },
  { key: "apps/web/src/lib/usage-summary-store.ts|refreshUsageSummary", count: 2, reason: "local request(mode) builds ${getApiUrl()}/api/provider-usage/summary?refresh=mode in this file" },
  { key: "apps/web/src/lib/version-watchdog.ts|currentBuildStamp", count: 1, reason: "the web origin's own root document for the build stamp; not a gateway route" },
  { key: "packages/api-client/src/client.ts|JaitClient.assessmentRequest", count: 1, reason: "helper; callers pass literal /api/security paths in this file" },
  { key: "packages/api-client/src/client.ts|JaitClient.health", count: 1, reason: "health probe (${baseUrl}/health)" },
  { key: "packages/cli/src/commands/resources.ts|runCronList", count: 1, reason: "GET ${baseUrl}/jobs from the gateway root; the Node gateway serves no /jobs route (see the report)" },
  { key: "packages/cli/src/commands/resources.ts|runSurfacesList", count: 1, reason: "GET ${baseUrl}/surfaces from the gateway root; the Node gateway serves no /surfaces route (see the report)" },
  { key: "packages/cli/src/lib/doctor.ts|checkPort", count: 1, reason: "health probe of the local gateway port (/health)" },
  { key: "packages/cli/src/lib/http.ts|getJson", count: 1, reason: "helper; callers in resources.ts build the URL, and this file's fetch(url) is the only send" },
];
