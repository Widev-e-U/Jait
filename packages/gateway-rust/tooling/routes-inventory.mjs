// Node gateway HTTP routes, read with the TypeScript compiler API. A route is a get, post, put, patch, delete, head,
// options or all call whose first argument is a path literal, on any receiver, or the same call on a Fastify receiver
// with a path that is an expression, or app.route({ method, url }). Literal evidence in the same file expands the rest:
// a template's ${name} is a :name parameter, an identifier bound by a for-of over a literal array takes each element, a
// const literal array is iterated the same way, and a method array lists each method. Any other path throws, so a route
// cannot drop out of the inventory unread.
//
// Registrations: a register call on a Fastify receiver adds the prefix in its options to the plugin it names. A gateway
// function that receives a Fastify receiver, such as registerAuthRoutes(app, ...), is a mount and inherits the prefix of
// its call site. A route takes the prefix of its innermost enclosing plugin, composed through the call sites that reach it.
// A package plugin (cors, fastifyStatic) adds no route unless PLUGIN_SITES says what it serves.
//
// Every route site and every registration must appear in ROUTE_SITES or PLUGIN_SITES, keyed like services-inventory.mjs
// (file|enclosing function) with its count. An unlisted registration, or a count that differs, throws during generation.
import { posix } from 'node:path';
import ts from 'typescript';
import { enclosingName } from './services-inventory.mjs';
import { parseTs } from './ws-inventory.mjs';

const ROUTE_METHODS = new Map([
  ['get', 'GET'], ['post', 'POST'], ['put', 'PUT'], ['patch', 'PATCH'], ['delete', 'DELETE'],
  ['head', 'HEAD'], ['options', 'OPTIONS'], ['all', 'ALL'],
]);
// Receivers that hold a Fastify instance, as an identifier or as the last name of a property access (this.app).
// A non-literal path is a route only on one of these; a Map, a Set or a prepared statement with a computed key is not.
const FASTIFY_RECEIVERS = new Set(['app', 'server', 'scope', 'instance', 'fastify', 'router']);
const receiverName = (node) => (ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? node.name.text : undefined);
const isFastifyReceiver = (node) => FASTIFY_RECEIVERS.has(receiverName(node));
const isFunctionNode = (node) => ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);

// Reviewed route call sites. count is the number of route calls in that function; an expanded array or route object
// is one call. Keys use file paths relative to packages/gateway/src.
export const ROUTE_SITES = [
  { key: 'routes/agent-control.ts|registerAgentControlRoutes', count: 3 },
  { key: 'routes/agent-github-apps.ts|registerAgentGithubAppRoutes', count: 12 },
  { key: 'routes/architecture.ts|registerArchitectureRoutes', count: 2 },
  { key: 'routes/assistant-profiles.ts|registerAssistantProfileRoutes', count: 5 },
  { key: 'routes/auth.ts|registerAuthRoutes', count: 13 },
  { key: 'routes/browser-devtools.ts|registerBrowserDevToolsRoutes', count: 3 },
  { key: 'routes/calendar.ts|registerCalendarRoutes', count: 9 },
  { key: 'routes/channels.ts|registerChannelRoutes', count: 7 },
  { key: 'routes/chat.ts|registerChatRoutes', count: 21 },
  { key: 'routes/code-graph.ts|registerCodeGraphRoutes', count: 6 },
  { key: 'routes/consent.ts|registerConsentRoutes', count: 12 },
  { key: 'routes/email.ts|registerEmailRoutes', count: 16 },
  { key: 'routes/environment.ts|registerEnvironmentRoutes', count: 1 },
  { key: 'routes/filesystem.ts|registerFilesystemRoutes', count: 3 },
  { key: 'routes/git.ts|registerGitRoutes', count: 26 },
  { key: 'routes/health.ts|registerHealthRoutes', count: 1 },
  { key: 'routes/hooks.ts|registerHookRoutes', count: 2 },
  { key: 'routes/jobs.ts|registerJobRoutes', count: 8 },
  { key: 'routes/maintenance.ts|registerMaintenanceRoutes', count: 3 },
  { key: 'routes/mcp-server.ts|registerMcpRoutes', count: 6 },
  { key: 'routes/messenger.ts|registerMessengerRoutes', count: 17 },
  { key: 'routes/mobile.ts|registerMobileRoutes', count: 13 },
  { key: 'routes/network.ts|registerNetworkRoutes', count: 10 },
  { key: 'routes/plan-runs.ts|registerPlanRunRoutes', count: 6 },
  { key: 'routes/plans.ts|registerPlanRoutes', count: 8 },
  { key: 'routes/plugins.ts|registerPluginRoutes', count: 8 },
  { key: 'routes/preview.ts|registerPreviewRoutes', count: 12 },
  { key: 'routes/project.ts|registerProjectRoutes', count: 18 },
  { key: 'routes/projects.ts|registerProjectEntityRoutes', count: 18 },
  { key: 'routes/providers.ts|registerProviderRoutes', count: 19 },
  { key: 'routes/pull-requests.ts|registerPullRequestRoutes', count: 8 },
  { key: 'routes/reminders.ts|registerReminderRoutes', count: 5 },
  { key: 'routes/repo-proposals.ts|registerRepoProposalRoutes', count: 9 },
  { key: 'routes/repositories.ts|registerRepoRoutes', count: 7 },
  { key: 'routes/screen-share.ts|registerScreenShareRoutes', count: 14 },
  { key: 'routes/secrets.ts|registerSecretRoutes', count: 6 },
  { key: 'routes/security-assessments.ts|registerSecurityAssessmentRoutes', count: 5 },
  { key: 'routes/security-workbench.ts|registerSecurityWorkbenchRoutes', count: 12 },
  { key: 'routes/sessions.ts|registerSessionRoutes', count: 15 },
  { key: 'routes/skills.ts|registerSkillRoutes', count: 3 },
  { key: 'routes/store.ts|registerStoreRoutes', count: 5 },
  { key: 'routes/team-chat.ts|registerTeamChatRoutes', count: 4 },
  { key: 'routes/terminals.ts|registerTerminalRoutes', count: 11 },
  { key: 'routes/threads.ts|registerThreadRoutes', count: 18 },
  { key: 'routes/trust.ts|registerTrustRoutes', count: 3 },
  { key: 'routes/update.ts|registerUpdateRoutes', count: 6 },
  { key: 'routes/user-questions.ts|registerUserQuestionRoutes', count: 3 },
  { key: 'routes/voice.ts|registerVoiceRoutes', count: 6 },
  { key: 'server.ts|createServer', count: 5 },
  { key: 'server.ts|registerBrowserAssetRoutes', count: 1 },
  { key: 'server.ts|registerDevProxyRoutes', count: 4 },
  { key: 'server.ts|registerLiveViewProxyRoutes', count: 2 },
  { key: 'server.ts|registerProjectPreviewRoutes', count: 4 },
];

// Reviewed registrations: a register call on a Fastify receiver, or a mount (a direct call that passes one). Inline
// plugins are keyed <inline>. serves lists the routes a package plugin serves, for example the built web UI at GET /.
export const PLUGIN_SITES = [
  { key: 'routes/agent-github-apps.ts|registerAgentGithubAppRoutes|<inline>', count: 1, reason: 'scoped plugin for the GitHub App webhook, registered without a prefix' },
  { key: 'routes/plans.ts|registerPlanRoutes|registerPlanRunRoutes', count: 1, reason: 'plan-run router mounted inside the plan router' },
  { key: 'server.ts|createServer|cors', count: 1, reason: 'CORS headers; the plugin adds no route' },
  { key: 'server.ts|createServer|fastifyCookie', count: 1, reason: 'cookie parsing; the plugin adds no route' },
  { key: 'server.ts|createServer|fastifyStatic', count: 1, serves: ['GET /'], reason: 'the built web UI under prefix /; the SPA fallback set on the same instance is not a route row' },
  { key: 'server.ts|createServer|registerAgentControlRoutes', count: 1 },
  { key: 'server.ts|createServer|registerAgentGithubAppRoutes', count: 1 },
  { key: 'server.ts|createServer|registerArchitectureRoutes', count: 1 },
  { key: 'server.ts|createServer|registerAssistantProfileRoutes', count: 1 },
  { key: 'server.ts|createServer|registerAuthRoutes', count: 1 },
  { key: 'server.ts|createServer|registerBrowserAssetRoutes', count: 1 },
  { key: 'server.ts|createServer|registerBrowserDevToolsRoutes', count: 1 },
  { key: 'server.ts|createServer|registerCalendarRoutes', count: 1 },
  { key: 'server.ts|createServer|registerChannelRoutes', count: 1 },
  { key: 'server.ts|createServer|registerChatRoutes', count: 1 },
  { key: 'server.ts|createServer|registerCodeGraphRoutes', count: 1 },
  { key: 'server.ts|createServer|registerConsentRoutes', count: 1 },
  { key: 'server.ts|createServer|registerDevProxyRoutes', count: 1 },
  { key: 'server.ts|createServer|registerEmailRoutes', count: 1 },
  { key: 'server.ts|createServer|registerEnvironmentRoutes', count: 1 },
  { key: 'server.ts|createServer|registerFilesystemRoutes', count: 1 },
  { key: 'server.ts|createServer|registerGitRoutes', count: 1 },
  { key: 'server.ts|createServer|registerHealthRoutes', count: 1 },
  { key: 'server.ts|createServer|registerHookRoutes', count: 1 },
  { key: 'server.ts|createServer|registerJobRoutes', count: 1 },
  { key: 'server.ts|createServer|registerLiveViewProxyRoutes', count: 1 },
  { key: 'server.ts|createServer|registerMaintenanceRoutes', count: 1 },
  { key: 'server.ts|createServer|registerMcpRoutes', count: 1 },
  { key: 'server.ts|createServer|registerMessengerRoutes', count: 1 },
  { key: 'server.ts|createServer|registerMobileRoutes', count: 1 },
  { key: 'server.ts|createServer|registerNetworkRoutes', count: 1 },
  { key: 'server.ts|createServer|registerPlanRoutes', count: 1 },
  { key: 'server.ts|createServer|registerPluginRoutes', count: 1 },
  { key: 'server.ts|createServer|registerPreviewRoutes', count: 1 },
  { key: 'server.ts|createServer|registerProjectEntityRoutes', count: 1 },
  { key: 'server.ts|createServer|registerProjectPreviewRoutes', count: 1 },
  { key: 'server.ts|createServer|registerProjectRoutes', count: 1 },
  { key: 'server.ts|createServer|registerProviderRoutes', count: 1 },
  { key: 'server.ts|createServer|registerPullRequestRoutes', count: 1 },
  { key: 'server.ts|createServer|registerReminderRoutes', count: 1 },
  { key: 'server.ts|createServer|registerRepoProposalRoutes', count: 1 },
  { key: 'server.ts|createServer|registerRepoRoutes', count: 1 },
  { key: 'server.ts|createServer|registerScreenShareRoutes', count: 1 },
  { key: 'server.ts|createServer|registerSecretRoutes', count: 1 },
  { key: 'server.ts|createServer|registerSecurityAssessmentRoutes', count: 1 },
  { key: 'server.ts|createServer|registerSecurityWorkbenchRoutes', count: 1 },
  { key: 'server.ts|createServer|registerSessionRoutes', count: 1 },
  { key: 'server.ts|createServer|registerSkillRoutes', count: 1 },
  { key: 'server.ts|createServer|registerStaticAssetCache', count: 1, reason: 'cache headers for the static web UI; adds no route' },
  { key: 'server.ts|createServer|registerStoreRoutes', count: 1 },
  { key: 'server.ts|createServer|registerTeamChatRoutes', count: 1 },
  { key: 'server.ts|createServer|registerTerminalRoutes', count: 1 },
  { key: 'server.ts|createServer|registerThreadRoutes', count: 1 },
  { key: 'server.ts|createServer|registerTrustRoutes', count: 1 },
  { key: 'server.ts|createServer|registerUpdateRoutes', count: 1 },
  { key: 'server.ts|createServer|registerUserQuestionRoutes', count: 1 },
  { key: 'server.ts|createServer|registerVoiceRoutes', count: 1 },
];

const propertyName = (property) => (property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : undefined);
const propertyValueNode = (property) => (ts.isShorthandPropertyAssignment(property) ? property.name : ts.isPropertyAssignment(property) ? property.initializer : undefined);

// The text of a literal path. A template's ${name} becomes :name, so a route keeps its parameter.
function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans
      .map((span) => `:${ts.isIdentifier(span.expression) ? span.expression.text : 'param'}${span.literal.text}`)
      .join('');
  }
  return null;
}

// Every string an expression can take, or null when literal evidence in this file does not establish them.
function valuesOf(node, info) {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return valuesOf(node.expression, info);
  const literal = literalText(node);
  if (literal !== null) return [literal];
  if (ts.isArrayLiteralExpression(node)) {
    const out = [];
    for (const element of node.elements) {
      const values = valuesOf(element, info);
      if (!values) return null;
      out.push(...values);
    }
    return out;
  }
  if (ts.isIdentifier(node)) return identifierValues(node, info);
  return null;
}

// An identifier is read from the for-of that binds it, or else from the single const of the same name in this file.
function identifierValues(id, info) {
  const loop = loopBinding(id);
  if (loop) return loopValues(loop, id.text, info);
  const initializer = info.consts.get(id.text);
  return initializer ? valuesOf(initializer, info) : null;
}

// The for-of statement whose declaration binds the identifier, or null.
function loopBinding(id) {
  for (let p = id.parent; p; p = p.parent) {
    if (ts.isForOfStatement(p) && ts.isVariableDeclarationList(p.initializer) && bindsName(p.initializer, id.text)) return p;
  }
  return null;
}

function bindsName(declarationList, name) {
  const binding = declarationList.declarations[0]?.name;
  if (ts.isIdentifier(binding)) return binding.text === name;
  return ts.isArrayBindingPattern(binding) && binding.elements.some((el) => ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === name);
}

// `for (const p of [...])` takes each element. `for (const [method, url] of [[...], ...])` takes the element at the name's index.
function loopValues(loop, name, info) {
  const items = iterableItems(loop.expression, info);
  if (!items) return null;
  const binding = loop.initializer.declarations[0].name;
  const out = [];
  if (ts.isIdentifier(binding)) {
    for (const item of items) {
      const values = valuesOf(item, info);
      if (!values) return null;
      out.push(...values);
    }
    return out;
  }
  const index = binding.elements.findIndex((el) => ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === name);
  for (const item of items) {
    if (!ts.isArrayLiteralExpression(item) || !item.elements[index]) return null;
    const values = valuesOf(item.elements[index], info);
    if (!values) return null;
    out.push(...values);
  }
  return out;
}

function iterableItems(expression, info) {
  if (ts.isArrayLiteralExpression(expression)) return expression.elements;
  if (ts.isIdentifier(expression)) {
    const initializer = info.consts.get(expression.text);
    return initializer && ts.isArrayLiteralExpression(initializer) ? initializer.elements : null;
  }
  return null;
}

function routeObjectRoutes(object, info, call) {
  const field = (name) => {
    const property = object.properties.find((p) => propertyName(p) === name);
    return property ? propertyValueNode(property) : undefined;
  };
  const methodNode = field('method');
  const urlNode = field('url') ?? field('path');
  if (!methodNode || !urlNode) throw new Error(`route object without method or url in ${info.path} (${enclosingName(call)})`);
  // Each row is one iteration's method and url. Without a shared destructured loop, each takes all of its values.
  const rows = pairedRows(methodNode, urlNode, info) ?? [{ method: methodNode, url: urlNode }];
  return rows.flatMap(({ method, url }) => {
    const methods = valuesOf(method, info);
    const paths = valuesOf(url, info);
    if (!methods || !paths || methods.some((m) => !/^[a-z]+$/i.test(m)) || paths.some((p) => !p.startsWith('/'))) {
      throw new Error(`unexpanded route object in ${info.path} (${enclosingName(call)})`);
    }
    return methods.flatMap((m) => paths.map((path) => ({ method: m.toUpperCase(), path })));
  });
}

// `for (const [method, url] of [["GET", "/a"], ["PUT", "/b"]])` pairs each method with its own url. Returns the rows of
// such a loop when both identifiers come from it, or null.
function pairedRows(methodNode, urlNode, info) {
  if (!ts.isIdentifier(methodNode) || !ts.isIdentifier(urlNode)) return null;
  const loop = loopBinding(methodNode);
  if (!loop || loop !== loopBinding(urlNode)) return null;
  const binding = loop.initializer.declarations[0].name;
  const items = iterableItems(loop.expression, info);
  if (!ts.isArrayBindingPattern(binding) || !items) return null;
  const position = (name) => binding.elements.findIndex((el) => ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === name);
  const methodAt = position(methodNode.text);
  const urlAt = position(urlNode.text);
  if (methodAt < 0 || urlAt < 0) return null;
  return items.map((item) => {
    if (!ts.isArrayLiteralExpression(item) || !item.elements[methodAt] || !item.elements[urlAt]) {
      throw new Error(`unexpanded route object in ${info.path}: a loop row is not a literal [method, url]`);
    }
    return { method: item.elements[methodAt], url: item.elements[urlAt] };
  });
}

function prefixOption(options, info, call) {
  if (!options) return '';
  if (!ts.isObjectLiteralExpression(options)) throw new Error(`register options are not a literal in ${info.path} (${enclosingName(call)})`);
  const property = options.properties.find((p) => propertyName(p) === 'prefix');
  if (!property) return '';
  const values = valuesOf(propertyValueNode(property), info);
  if (!values || values.length !== 1) throw new Error(`non-literal plugin prefix in ${info.path} (${enclosingName(call)})`);
  return values[0];
}

// Top-level functions, const arrow functions, and the imports that name a function from another file.
function indexFile({ path, text }) {
  const sf = parseTs(path, text);
  const functions = new Map();
  const consts = new Map();
  const imports = new Map();
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) functions.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        consts.set(declaration.name.text, declaration.initializer);
        if (isFunctionNode(declaration.initializer)) functions.set(declaration.name.text, declaration.initializer);
      }
    }
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const specifier = statement.moduleSpecifier.text;
      const { name, namedBindings } = statement.importClause;
      if (name) imports.set(name.text, { specifier, imported: 'default' });
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          imports.set(element.name.text, { specifier, imported: (element.propertyName ?? element.name).text });
        }
      }
    }
  }
  return { path, sf, functions, consts, imports };
}

function resolveModule(fromPath, specifier, index) {
  const base = posix.join(posix.dirname(fromPath), specifier).replace(/\.(m?js|cjs)$/, '');
  return [`${base}.ts`, `${base}/index.ts`].find((candidate) => index.has(candidate)) ?? null;
}

// { file, node } for a function in a gateway source file, { package } for a package import, or null.
function resolveFunction(name, path, index) {
  const info = index.get(path);
  if (info.functions.has(name)) return { file: path, node: info.functions.get(name) };
  const imported = info.imports.get(name);
  if (!imported) return null;
  if (!imported.specifier.startsWith('.')) return { package: imported.specifier };
  const file = resolveModule(path, imported.specifier, index);
  if (!file) throw new Error(`unresolved import ${imported.specifier} in ${path}`);
  const node = index.get(file).functions.get(imported.imported);
  if (!node) throw new Error(`${imported.specifier} in ${path} does not export a function named ${imported.imported}`);
  return { file, node };
}

function scanCall(call, info, index, out) {
  const callee = call.expression;
  const file = info.path;
  if (ts.isIdentifier(callee)) {
    if (call.arguments.some((arg) => isMountArgument(arg, call))) mount(call, file, index, out);
    return;
  }
  if (!ts.isPropertyAccessExpression(callee)) return;
  const name = callee.name.text;
  if (name === 'register' && isFastifyReceiver(callee.expression)) {
    plugin(call, file, index, out);
    return;
  }
  if (name === 'route' && call.arguments.length === 1 && ts.isObjectLiteralExpression(call.arguments[0])) {
    routeSite(call, info, out, routeObjectRoutes(call.arguments[0], info, call));
    return;
  }
  const method = ROUTE_METHODS.get(name);
  if (!method || call.arguments.length === 0) return;
  const first = call.arguments[0];
  const literal = literalText(first);
  if (literal !== null) {
    if (literal.startsWith('/')) routeSite(call, info, out, [{ method, path: literal }]);
    return;
  }
  if (!isFastifyReceiver(callee.expression) || call.arguments.length < 2) return;
  const paths = valuesOf(first, info);
  if (!paths || paths.some((path) => !path.startsWith('/'))) {
    throw new Error(`unexpanded route path in ${file} (${enclosingName(call)}): ${first.getText(info.sf)}`);
  }
  routeSite(call, info, out, paths.map((path) => ({ method, path })));
}

function routeSite(call, info, out, routes) {
  out.routeSites.push({ key: `${info.path}|${enclosingName(call)}`, file: info.path, call, routes });
}

function plugin(call, file, index, out) {
  const info = index.get(file);
  const [target, options] = call.arguments;
  if (!target) throw new Error(`register without a plugin in ${file} (${enclosingName(call)})`);
  const prefix = prefixOption(options, info, call);
  if (isFunctionNode(target)) {
    out.plugins.push({ key: `${file}|${enclosingName(call)}|<inline>`, file });
    out.edges.push({ target, call, prefix });
    return;
  }
  const resolved = ts.isIdentifier(target) ? resolveFunction(target.text, file, index) : null;
  if (!resolved) throw new Error(`unresolved plugin in ${file} (${enclosingName(call)}): ${target.getText(info.sf)}`);
  out.plugins.push({ key: `${file}|${enclosingName(call)}|${target.text}`, file });
  if (resolved.node) out.edges.push({ target: resolved.node, call, prefix });
}

// An argument is a Fastify instance when it is app, fastify or router, or the scope parameter of the inline plugin that
// encloses the call. `server` is the raw HTTP server and `scope` is an ordinary local elsewhere, so neither counts.
const MOUNT_RECEIVERS = new Set(['app', 'fastify', 'router']);
function isMountArgument(node, call) {
  const name = receiverName(node);
  return name !== undefined && (MOUNT_RECEIVERS.has(name) || name === pluginScopeParam(call));
}

function pluginScopeParam(call) {
  for (let p = call.parent; p; p = p.parent) {
    const registered = isFunctionNode(p) && p.parent && ts.isCallExpression(p.parent) && p.parent.arguments[0] === p
      && ts.isPropertyAccessExpression(p.parent.expression) && p.parent.expression.name.text === 'register';
    if (registered) return p.parameters[0] && ts.isIdentifier(p.parameters[0].name) ? p.parameters[0].name.text : undefined;
  }
  return undefined;
}

// A direct call that passes a Fastify instance is a mount only when its callee is a function the scanner can read. A
// global such as structuredClone(scope) is not one. A callee named register* or mount* must resolve, so an unreadable
// router mount throws instead of dropping out.
function mount(call, file, index, out) {
  const name = call.expression.text;
  const resolved = resolveFunction(name, file, index);
  if (!resolved) {
    if (/^(register|mount)/.test(name)) throw new Error(`unresolved router mount in ${file} (${enclosingName(call)}): ${name}`);
    return;
  }
  out.plugins.push({ key: `${file}|${enclosingName(call)}|${name}`, file });
  if (resolved.node) out.edges.push({ target: resolved.node, call, prefix: '' });
}

function joinPath(base, path) {
  const joined = `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`.replace(/\/+$/, '');
  return joined || '/';
}

// The prefixes a node is served under. The innermost plugin or mount that encloses it decides, and each of its call
// sites contributes its own prefix on top of the prefixes at that call site, so nested prefixes compose.
function prefixResolver(edges) {
  const byTarget = new Map();
  for (const edge of edges) {
    if (!byTarget.has(edge.target)) byTarget.set(edge.target, []);
    byTarget.get(edge.target).push(edge);
  }
  const memo = new Map();
  const active = new Set();
  const at = (node) => {
    if (memo.has(node)) return memo.get(node);
    if (active.has(node)) throw new Error(`cyclic plugin scope at ${node.getText().slice(0, 80)}`);
    let target = null;
    for (let p = node.parent; p && !target; p = p.parent) if (byTarget.has(p)) target = p;
    let out;
    if (!target) {
      out = [''];
    } else {
      active.add(node);
      const prefixes = new Set();
      for (const edge of byTarget.get(target)) {
        for (const base of at(edge.call)) prefixes.add(joinPath(base, edge.prefix));
      }
      active.delete(node);
      out = [...prefixes].sort();
    }
    memo.set(node, out);
    return out;
  };
  return at;
}

// Every route site, registration and route, before review. Routes are { method, path, file } with prefixes applied.
export function scanGateway(files) {
  const index = new Map(files.map((file) => [file.path, indexFile(file)]));
  const out = { routeSites: [], plugins: [], edges: [] };
  for (const info of index.values()) {
    const visit = (node) => {
      if (ts.isCallExpression(node)) scanCall(node, info, index, out);
      ts.forEachChild(node, visit);
    };
    visit(info.sf);
  }
  const prefixesAt = prefixResolver(out.edges);
  const routes = [];
  for (const site of out.routeSites) {
    for (const base of prefixesAt(site.call)) {
      for (const { method, path } of site.routes) routes.push({ method, path: joinPath(base, path), file: site.file });
    }
  }
  return { routeSites: out.routeSites, plugins: out.plugins, routes };
}

// Each key in sites must be reviewed with the same count, and each reviewed key must still be present.
function review(sites, table, label) {
  const counts = new Map();
  for (const { key } of sites) counts.set(key, (counts.get(key) ?? 0) + 1);
  const reviewed = new Map();
  for (const entry of table) {
    if (reviewed.has(entry.key)) throw new Error(`duplicate reviewed ${label} ${entry.key}`);
    reviewed.set(entry.key, entry);
  }
  for (const [key, count] of counts) {
    const entry = reviewed.get(key);
    if (!entry) throw new Error(`unreviewed ${label} ${key} (${count} found)`);
    if (entry.count !== count) throw new Error(`${label} ${key}: reviewed ${entry.count}, found ${count}`);
  }
  for (const entry of table) {
    if (!counts.has(entry.key)) throw new Error(`${label} ${entry.key} is reviewed but absent`);
  }
}

// The reviewed Node HTTP route inventory: { method, path, files } per distinct route, with paths keeping their :param form.
export function gatewayRoutes(files) {
  const scan = scanGateway(files);
  review(scan.routeSites, ROUTE_SITES, 'route site');
  review(scan.plugins, PLUGIN_SITES, 'registration');
  const served = PLUGIN_SITES.flatMap((entry) => (entry.serves ?? []).map((route) => {
    const [method, path] = route.split(' ');
    return { method, path, file: entry.key.split('|')[0] };
  }));
  const merged = new Map();
  for (const { method, path, file } of [...scan.routes, ...served]) {
    const key = `${method} ${path}`;
    if (!merged.has(key)) merged.set(key, { method, path, files: new Set() });
    merged.get(key).files.add(file);
  }
  return [...merged.values()]
    .map(({ method, path, files: sources }) => ({ method, path, files: [...sources].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}
