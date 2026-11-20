import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { websocketCandidates } from './ws-inventory.mjs';
import { applyBinaryEvidence } from './binary-test-evidence.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('inventory does not turn path references into tested parity claims', () => {
  const summary = JSON.parse(execFileSync(process.execPath, [join(here, 'api-inventory.mjs')], { encoding: 'utf8' }));
  const inventory = JSON.parse(readFileSync(join(here, '..', 'docs', 'api-inventory.json'), 'utf8'));
  assert.deepEqual(inventory.summary, summary, 'regenerate the checked-in inventory');
  assert.equal(summary.nativeTested, [...inventory.http, ...inventory.ws].filter((entry) => entry.status === 'native-tested').length);
  assert.equal(summary.nativeTestedDenominator, inventory.http.length + inventory.ws.length + inventory.services.length);
  assert.equal(summary.nativeTestedPct, +(100 * summary.nativeTested / summary.nativeTestedDenominator).toFixed(2));
  assert.ok([...inventory.http, ...inventory.ws].every((entry) => Array.isArray(entry.binaryTests)));
  assert.ok(inventory.http.some((route) => route.status === 'native-untested' && route.testPathReference));
  assert.ok(inventory.http.filter((route) => route.status === 'native-tested').every((route) => route.binaryTests.length > 0));
  assert.ok(inventory.http.some((route) => route.status === 'mounted-fail-closed'));
  assert.equal(inventory.http.find((route) => route.method === 'GET' && route.path === '/api/environment/snapshot')?.status, 'mounted-incomplete');
  assert.ok(inventory.http.some((route) => route.status === 'missing'));
  const chatCandidate = inventory.clientCandidates.find((candidate) => candidate.path === '/api/chat');
  assert.ok(chatCandidate?.serverPathReference);
  assert.ok(chatCandidate.files.includes('packages/api-client/src/client.ts'));
  assert.ok(inventory.clientCandidates.some((candidate) => !candidate.serverPathReference));
  // Client routes without a Node route are inventory rows, not dropped candidates.
  const clientOnly = inventory.clientCandidates.filter((candidate) => !candidate.serverPathReference);
  assert.equal(summary.clientOnlyRoutes, clientOnly.length);
  for (const candidate of clientOnly) {
    assert.ok(inventory.http.some((route) => route.clientOnly && route.path === candidate.path), `client-only row for ${candidate.path}`);
  }
  assert.ok(inventory.clientCandidates.find((candidate) => candidate.path === '/api/providers')?.serverPathReference, 'a query-suffixed client call maps to its route');
  assert.ok(inventory.clientCandidates.every((candidate) => !('status' in candidate)));
});

// Fastify's `all` registrations accept multiple HTTP methods. They must remain
// visible even if the heuristic cannot prove that Rust serves every method.
test('inventory includes all-method proxy routes and typed registrations', () => {
  const inventory = JSON.parse(readFileSync(join(here, '..', 'docs', 'api-inventory.json'), 'utf8'));
  for (const path of [
    '/api/dev-proxy/:port',
    '/api/dev-proxy/:port/*',
    '/preview/:previewToken/proxy/:port',
    '/preview/:previewToken/proxy/:port/*',
  ]) {
    const route = inventory.http.find((entry) => entry.method === 'ALL' && entry.path === path);
    assert.ok(route, `missing all-method route ${path}`);
    // The Rust side serves these through axum any(), which the scan reads as ALL; production refuses every proxied request.
    assert.equal(route.status, 'mounted-fail-closed', path);
  }
  for (const [method, path] of [
    ['PATCH', '/api/plugins/:id/config'],
    ['PATCH', '/api/channels/:id/config'],
    ['POST', '/api/repos/:id/pull-requests/:number/resolve-conflicts'],
  ]) {
    assert.ok(inventory.http.some((entry) => entry.method === method && entry.path === path), `missing typed route ${method} ${path}`);
  }
});

test('generated markdown includes typed registrations and labels WS matches as heuristic', () => {
  const inventory = readFileSync(join(here, '..', 'docs', 'api-inventory.md'), 'utf8');
  for (const [method, path] of [
    ['PATCH', '/api/plugins/:id/config'],
    ['PATCH', '/api/channels/:id/config'],
    ['POST', '/api/repos/:id/pull-requests/:number/resolve-conflicts'],
  ]) {
    assert.ok(inventory.includes(`| ${method} | \`${path}\` |`), `missing typed route ${method} ${path}`);
  }
  assert.match(inventory, /## WS message candidates \(heuristic\)/);
  assert.doesNotMatch(inventory, /native-and-tested/);
});

test('WebSocket scan records direction and references as lexical candidates', () => {
  const node = `switch (msg.type) { case "subscribe": break; case 'cancel': break; }
    const event = { type: "session.event" }; const dynamic = { type: name };`;
  const rust = `match kind { "subscribe" | "other" => (), _ => () }
    json!({"type": "session.event"});`;
  assert.deepEqual(websocketCandidates(node, rust), [
    { type: 'cancel', direction: 'client-to-server-candidate', rustReference: false },
    { type: 'subscribe', direction: 'client-to-server-candidate', rustReference: true },
    { type: 'session.event', direction: 'server-to-client-candidate', rustReference: true },
  ]);
});


test('only explicit valid binary-test mappings contribute to the percentage', () => {
  const http = [{ method: 'GET', path: '/one', status: 'native-untested' }, { method: 'POST', path: '/two', status: 'missing' }];
  const ws = [{ direction: 'client-to-server-candidate', type: 'subscribe', rustReference: true }];
  const manifest = { version: 1, http: [{ method: 'GET', path: '/one', tests: [{ file: 'tests/binary.rs', name: 'requests_one' }] }], ws: [] };
  const result = applyBinaryEvidence(http, ws, manifest, () => '#[tokio::test]\nasync fn requests_one() {}');
  assert.deepEqual(result, { tested: 1, total: 3, nativeTestedPct: 33.33 });
  assert.equal(http[0].status, 'native-tested');
  assert.deepEqual(ws[0].binaryTests, []);
});

test('manifest rejects unknown, duplicate, unmounted, and missing test references', () => {
  const route = () => [{ method: 'GET', path: '/one', status: 'native-untested' }];
  const mapping = { method: 'GET', path: '/one', tests: [{ file: 'tests/binary.rs', name: 'requests_one' }] };
  const run = (http, mappings, source = '#[test]\nfn requests_one() {}') => applyBinaryEvidence(http, [], { version: 1, http: mappings, ws: [] }, () => source);
  assert.throws(() => run(route(), [{ ...mapping, path: '/unknown' }]), /Unknown/);
  assert.throws(() => run(route(), [mapping, mapping]), /duplicate/);
  assert.throws(() => run([{ ...route()[0], status: 'mounted-fail-closed' }], [mapping]), /non-native/);
  assert.throws(() => run([{ ...route()[0], status: 'mounted-incomplete' }], [mapping]), /non-native/);
  assert.throws(() => run(route(), [mapping], 'fn requests_one() {}'), /Missing or ignored test/);
  assert.throws(() => run(route(), [{ ...mapping, tests: [{ file: '../other.rs', name: 'requests_one' }] }]), /Invalid test/);
});

test('directional WebSocket mappings are counted separately', () => {
  const ws = [{ direction: 'client-to-server-candidate', type: 'event' }, { direction: 'server-to-client-candidate', type: 'event' }];
  const manifest = { version: 1, http: [], ws: [{ direction: 'server-to-client-candidate', type: 'event', tests: [{ file: 'tests/ws.rs', name: 'receives_event' }] }] };
  const result = applyBinaryEvidence([], ws, manifest, () => '#[test]\nfn receives_event() {}');
  assert.equal(result.nativeTestedPct, 50);
  assert.equal(ws[0].binaryTests.length, 0);
  assert.equal(ws[1].status, 'native-tested');
});


test('commented, ignored and string-contained tests do not count as evidence', () => {
  const mapping = { method: 'GET', path: '/one', tests: [{ file: 'tests/binary.rs', name: 'requests_one' }] };
  const check = (source) => applyBinaryEvidence([{ method: 'GET', path: '/one', status: 'native-untested' }], [], { version: 1, http: [mapping], ws: [] }, () => source);
  for (const source of [
    '// #[test]\n// fn requests_one() {}',
    '/* nested /* comment */\n#[test]\nfn requests_one() {} */',
    '#[ignore]\n#[test]\nfn requests_one() {}',
    '#[test]\n#[ignore = "reason"]\nfn requests_one() {}',
    'const EXAMPLE: &str = r#"\n#[test]\nfn requests_one() {}\n"#;',
  ]) assert.throws(() => check(source), /Missing or ignored test/);
  assert.equal(check('#[test]\nfn requests_one() {}').tested, 1);
});

test('mobile and reminder routes expose missing composed collaborators', () => {
  const inventory = JSON.parse(readFileSync(join(here, '..', 'docs', 'api-inventory.json'), 'utf8'));
  const status = (method, path) => inventory.http.find((entry) => entry.method === method && entry.path === path)?.status;
  for (const [method, path] of [
    ['POST', '/api/mobile/devices/register'],
    ['GET', '/api/mobile/push-devices'],
    ['GET', '/api/mobile/routines'],
    ['GET', '/api/mobile/os-tool/sessions'],
    ['GET', '/api/reminders'],
    ['DELETE', '/api/reminders/:id'],
  ]) assert.equal(status(method, path), 'mounted-incomplete', `${method} ${path}`);
  for (const [method, path] of [
    ['DELETE', '/api/mobile/push-devices/:deviceId'],
    ['POST', '/api/mobile/push-devices/test'],
    ['PUT', '/api/mobile/routines/:kind'],
  ]) assert.equal(status(method, path), 'mounted-fail-closed', `${method} ${path}`);
  // Complete routes are native; binary evidence promotes them to native-tested.
  for (const [method, path] of [
    ['POST', '/api/reminders'],
    ['GET', '/api/mobile/discovery'],
  ]) assert.match(status(method, path), /^native-(?:un)?tested$/, `${method} ${path}`);
});

test('the scoped webhook comes from the AST route scan, and every non-literal client request is reviewed in the inventory', () => {
  const inventory = JSON.parse(readFileSync(join(here, '..', 'docs', 'api-inventory.json'), 'utf8'));
  const webhook = inventory.http.find((entry) => entry.method === 'POST' && entry.path === '/api/github/apps/webhook');
  assert.deepEqual(webhook.nodeFiles, ['routes/agent-github-apps.ts'], 'the regex scan missed the route on the scoped child');
  const reviewedCalls = inventory.clientRequestReviews.reduce((sum, entry) => sum + entry.count, 0);
  assert.equal(inventory.summary.clientNonLiteralRequestCalls, reviewedCalls);
  assert.equal(inventory.summary.clientReviewedRequestSites, inventory.clientRequestReviews.length);
  assert.ok(inventory.clientRequestReviews.some((entry) => entry.key === 'packages/cli/src/commands/resources.ts|runSurfacesList'));
  assert.match(readFileSync(join(here, '..', 'docs', 'api-inventory.md'), 'utf8'), /## Client request reviews \(non-literal request paths\)/);
});
