import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatewayRoutes, scanGateway } from './routes-inventory.mjs';
import { walkGatewaySource } from './services-inventory.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const gatewaySrc = join(here, '../../gateway/src');
const routesOf = (files) => scanGateway(files).routes.map((route) => `${route.method} ${route.path}`).sort();

test('reads literal, template, array, route-object and method-array registrations', () => {
  const files = [{
    path: 'routes/a.ts',
    text: [
      'export function registerA(app) {',
      '  app.get("/api/a", handler);',
      '  app.post(`/api/a/${id}/b`, handler);',
      '  for (const path of ["/api/c", "/api/d"]) app.get(path, handler);',
      '  for (const [method, url] of [["GET", "/api/e"], ["PUT", "/api/f"]]) app.route({ method, url, handler });',
      '  app.route({ method: ["GET", "HEAD"], url: "/api/g", handler });',
      '  app.all("/api/h/*", handler);',
      '}',
    ].join('\n'),
  }];
  assert.deepEqual(routesOf(files), [
    'ALL /api/h/*', 'GET /api/a', 'GET /api/c', 'GET /api/d', 'GET /api/e', 'GET /api/g', 'HEAD /api/g', 'POST /api/a/:id/b', 'PUT /api/f',
  ]);
});

test('a path that literal evidence cannot expand throws instead of dropping out', () => {
  assert.throws(
    () => scanGateway([{ path: 'routes/b.ts', text: 'export function registerB(app, path) { app.get(path, handler); }' }]),
    /unexpanded route path in routes\/b\.ts \(registerB\): path/,
  );
  assert.throws(
    () => scanGateway([{ path: 'routes/c.ts', text: 'export function registerC(app, method) { app.route({ method, url: "/api/c", handler }); }' }]),
    /unexpanded route object in routes\/c\.ts \(registerC\)/,
  );
});

test('prefixes compose through inline plugins, nested plugins and mounts', () => {
  const files = [
    {
      path: 'server.ts',
      text: [
        'import { registerItems } from "./routes/items.js";',
        'export function build(app) {',
        '  app.register(async (scope) => {',
        '    scope.get("/a", handler);',
        '    registerItems(scope);',
        '    scope.register(async (inner) => { inner.get("/deep", handler); }, { prefix: "/v1" });',
        '  }, { prefix: "/api" });',
        '  registerItems(app);',
        '}',
      ].join('\n'),
    },
    { path: 'routes/items.ts', text: 'export function registerItems(app) { app.get("/items", handler); }' },
  ];
  assert.deepEqual(routesOf(files), ['GET /api/a', 'GET /api/items', 'GET /api/v1/deep', 'GET /items']);
});

test('a non-literal prefix and an unreadable plugin throw', () => {
  assert.throws(
    () => scanGateway([{ path: 'routes/d.ts', text: 'export function registerD(app, prefix) { app.register(async (scope) => { scope.get("/x", handler); }, { prefix }); }' }]),
    /non-literal plugin prefix in routes\/d\.ts \(registerD\)/,
  );
  assert.throws(
    () => scanGateway([{ path: 'server.ts', text: 'export function build(app) { app.register(makePlugin()); }' }]),
    /unresolved plugin in server\.ts \(build\)/,
  );
});

test('an unlisted route site or registration fails generation against the reviewed tables', () => {
  const real = walkGatewaySource(gatewaySrc);
  assert.throws(
    () => gatewayRoutes([...real, { path: 'routes/extra.ts', text: 'export function registerExtra(app) { app.get("/api/extra", handler); }' }]),
    /unreviewed route site routes\/extra\.ts\|registerExtra/,
  );
  assert.throws(
    () => gatewayRoutes([...real, { path: 'routes/extra-plugin.ts', text: 'import cors from "@fastify/cors";\nexport function registerExtraPlugin(app) { app.register(cors, { origin: true }); }' }]),
    /unreviewed registration routes\/extra-plugin\.ts\|registerExtraPlugin\|cors/,
  );
});

test('a reviewed count that changes in the real gateway source fails generation', () => {
  const files = walkGatewaySource(gatewaySrc);
  const original = files.find((file) => file.path === 'routes/health.ts').text;
  const changed = files.map((file) => (file.path === 'routes/health.ts'
    ? { ...file, text: original.replace(/\n(\s*)app\.get\(/, '\n$1app.get("/api/health/extra", handler);\n$1app.get(') }
    : file));
  assert.notEqual(changed.find((file) => file.path === 'routes/health.ts').text, original);
  assert.throws(() => gatewayRoutes(changed), /route site routes\/health\.ts\|registerHealthRoutes: reviewed 1, found 2/);
});

test('non-route calls are not read as registrations, and a global passed a scope is not a mount', () => {
  const files = [{ path: 'security/x.ts', text: 'export function run(scope, key) { const v = cache.get(key, fallback); return structuredClone(scope) && map.get("header"); }' }];
  assert.deepEqual(routesOf(files), []);
  assert.doesNotThrow(() => scanGateway(files));
});

test('an unreadable router mount throws, while an unreadable helper that is not a mount is ignored', () => {
  assert.throws(
    () => scanGateway([{ path: 'server.ts', text: 'export function build(app) { registerMissing(app); }' }]),
    /unresolved router mount in server\.ts \(build\): registerMissing/,
  );
  assert.doesNotThrow(() => scanGateway([{ path: 'server.ts', text: 'export function build(app) { lateInit(app); }' }]));
});

test('a plugin that registers itself with a prefix is a cycle and throws', () => {
  assert.throws(
    () => scanGateway([{ path: 'server.ts', text: 'export function loop(app) { app.register(loop, { prefix: "/x" }); app.get("/a", handler); }' }]),
    /cyclic plugin scope/,
  );
});

test('the reviewed tables cover every route and registration in the real gateway source', () => {
  const routes = gatewayRoutes(walkGatewaySource(gatewaySrc));
  assert.equal(routes.length, 449);
  assert.ok(routes.some((route) => route.method === 'GET' && route.path === '/api/sessions/:sessionId/shared-stream'));
  assert.ok(routes.some((route) => route.method === 'PATCH' && route.path === '/api/sessions/:id/share'));
  assert.ok(routes.some((route) => route.method === 'DELETE' && route.path === '/api/projects/:id/members/:userId'));
  const webhook = routes.find((route) => route.method === 'POST' && route.path === '/api/github/apps/webhook');
  assert.deepEqual(webhook.files, ['routes/agent-github-apps.ts'], 'a route on a scoped child of register is read');
  assert.deepEqual(routes.find((route) => route.method === 'GET' && route.path === '/').files, ['server.ts'], 'the web UI is a reviewed static registration');
  assert.ok(routes.some((route) => route.method === 'ALL' && route.path === '/api/dev-proxy/:port'));
});
