// Exercises the real Rust executable with the SDK used by the Node gateway.
// Run after building the binary: node --test packages/gateway-rust/tests/mcp_legacy_sdk.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { randomUUID } = require('node:crypto');

const project = path.resolve(__dirname, '../../..');
const gatewayRequire = createRequire(path.join(project, 'packages/gateway/package.json'));
const { Client } = gatewayRequire('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = gatewayRequire('@modelcontextprotocol/sdk/client/sse.js');
const binary = path.join(project, 'packages/gateway-rust/target/debug/jait-gateway');

async function postJson(base, route, body, token) {
  return fetch(base + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

test('legacy SDK SSE binds real authenticated requests to the stream owner', { timeout: 45000 }, async (t) => {
  const dir = path.join(project, '.jait/artifacts/mcp-sdk-tests', randomUUID());
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'policy.txt'), 'sdk-policy-marker');
  const child = spawn(binary, [], {
    env: {
      HOME: dir, JAIT_RUST_APPLICATION: '1', JAIT_RUST_PORT: '0',
      JAIT_RUST_PROJECT_ROOT: dir, JAIT_RUST_DB: path.join(dir, 'gateway.sqlite'),
      JWT_SECRET: 'isolated-sdk-test-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => child.once('exit', resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
  child.stderr.resume();
  const lines = readline.createInterface({ input: child.stdout });
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('gateway startup timeout')), 15000);
    child.once('error', reject);
    child.once('exit', () => reject(new Error('gateway exited before ready')));
    lines.on('line', line => {
      try {
        const event = JSON.parse(line);
        if (event.event === 'gateway.ready') { clearTimeout(timer); resolve(event.address); }
      } catch { /* Ignore non-JSON startup output. */ }
    });
  });
  assert.match(address, /^127\.0\.0\.1:\d+$/);
  const base = `http://${address}`;
  let response = await postJson(base, '/api/auth/register', { username: 'owner', password: 'owner-pass-123' });
  assert.equal(response.status, 200);
  const owner = (await response.json()).access_token;
  response = await postJson(base, '/api/sessions', {}, owner);
  assert.equal(response.status, 201);
  const session = (await response.json()).id;
  assert.ok(session);
  response = await postJson(base, '/api/auth/invitations', {}, owner);
  assert.equal(response.status, 200);
  const invitation = (await response.json()).invitation;
  response = await postJson(base, '/api/auth/register', { username: 'other', password: 'other-pass-123', invitation });
  assert.equal(response.status, 200);
  const other = (await response.json()).access_token;
  let endpoint;
  const transport = new SSEClientTransport(new URL('/mcp/sse', base), {
    requestInit: { headers: { authorization: `Bearer ${owner}`, 'x-jait-session-id': session } },
    fetch: (url, init) => {
      if (init?.method === 'POST') endpoint = String(url);
      return fetch(url, init);
    },
  });
  const client = new Client({ name: 'jait-sdk-regression', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.ok(Array.isArray(tools.tools));
  assert.ok(tools.tools.some(tool => tool.name === 'file_read'));
  const readPolicy = () => client.callTool({ name: 'file_read', arguments: { path: 'policy.txt' } });
  const before = await readPolicy();
  assert.equal(before.isError, false);
  assert.match(JSON.stringify(before.content), /sdk-policy-marker/);
  const setDisabled = async disabled => {
    const result = await fetch(`${base}/api/auth/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${owner}` },
      body: JSON.stringify({ disabled_tools: disabled }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(result.status, 200);
  };
  await setDisabled(['file.read']);
  assert.ok(!(await client.listTools()).tools.some(tool => tool.name === 'file_read'));
  // A client can retain a previously discovered tool name, so execute must recheck settings.
  const denied = await readPolicy();
  assert.equal(denied.isError, true);
  assert.match(JSON.stringify(denied.content), /disabled/i);
  assert.doesNotMatch(JSON.stringify(denied.content), /sdk-policy-marker/);
  const otherClient = new Client({ name: 'jait-sdk-other', version: '1.0.0' });
  t.after(async () => { await otherClient.close(); });
  await otherClient.connect(new SSEClientTransport(new URL('/mcp/sse', base), {
    requestInit: { headers: { authorization: `Bearer ${other}` } },
  }));
  assert.ok((await otherClient.listTools()).tools.some(tool => tool.name === 'file_read'));
  await setDisabled([]);
  assert.ok((await client.listTools()).tools.some(tool => tool.name === 'file_read'));
  const restored = await readPolicy();
  assert.equal(restored.isError, false);
  assert.match(JSON.stringify(restored.content), /sdk-policy-marker/);
  assert.ok(endpoint?.startsWith(`${base}/mcp/messages?`));
  const message = { jsonrpc: '2.0', id: 42, method: 'ping' };
  for (const [token, expected] of [[undefined, 401], [other, 400]]) {
    response = await postJson('', endpoint, message, token);
    assert.equal(response.status, expected);
  }
  // Denied POSTs do not disturb the owner's existing stream.
  await client.ping();
  await client.close();
  let status;
  for (let attempt = 0; attempt < 30; attempt++) {
    response = await postJson('', endpoint, message, owner);
    status = response.status;
    if (status === 400) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(status, 400, 'closed stream must be removed from the registry');
});
