import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('inventory includes the scoped GitHub webhook and is current', () => {
  execFileSync(process.execPath, ['scripts/gateway-rust-api-inventory.mjs', '--check'], { cwd: root });
  const inventory = JSON.parse(readFileSync(new URL('../../docs/gateway-rust-api-inventory.json', import.meta.url)));
  const route = inventory.entries.find((entry) => entry.method === 'POST' && entry.path === '/api/github/apps/webhook');
  assert.equal(route?.node.file, 'packages/gateway/src/routes/agent-github-apps.ts');
  assert.notEqual(route?.status, 'native-tested');
});


test('main WebSocket dispatch candidates stay explicitly unreviewed', () => {
  const inventory = JSON.parse(readFileSync(new URL('../../docs/gateway-rust-api-inventory.json', import.meta.url)));
  for (const type of ['authenticate', 'resource.subscribe', 'terminal.input', 'tool.op-response']) {
    const entry = inventory.inboundWsCandidates.find((candidate) => candidate.type === type);
    assert.equal(entry?.node.file, 'packages/gateway/src/ws.ts');
    assert.equal(entry?.status, 'unreviewed');
  }
});


test('startup and WebSocket type leads cite their source without parity claims', () => {
  const inventory = JSON.parse(readFileSync(new URL('../../docs/gateway-rust-api-inventory.json', import.meta.url)));
  for (const expression of ['scheduler.start', 'emailService.startInboxRefresh', 'terminalReaperInterval = setInterval']) {
    const entry = inventory.backgroundCandidates.find((candidate) => candidate.expression === expression);
    assert.equal(entry?.node.file, 'packages/gateway/src/index.ts');
    assert.equal(entry?.status, 'unreviewed');
  }
  const event = inventory.wsTypeCandidates.find((candidate) => candidate.type === 'session.created');
  assert.equal(event?.node.file, 'packages/gateway/src/ws.ts');
  assert.equal(event?.status, 'unreviewed');
});


test('unreviewed source matches and misses do not claim parity', () => {
  const inventory = JSON.parse(readFileSync(new URL('../../docs/gateway-rust-api-inventory.json', import.meta.url)));
  assert.ok(inventory.entries.some((entry) => entry.rust));
  assert.ok(inventory.entries.some((entry) => !entry.rust));
  assert.ok(inventory.entries.every((entry) => entry.status === 'unreviewed'));
  assert.equal(inventory.summary.percentNativeTested, null);
  assert.equal(inventory.summary.rustSourceMatches + inventory.summary.withoutRustSourceMatch, inventory.summary.total);
});


test('project wildcard dispatch is a source lead, not a parity claim', () => {
  const inventory = JSON.parse(readFileSync(new URL('../../docs/gateway-rust-api-inventory.json', import.meta.url)));
  for (const path of ['/api/project/info', '/api/project/open', '/api/project/search']) {
    const entry = inventory.entries.find((candidate) => candidate.path === path);
    assert.equal(entry?.rustDispatchCandidate?.file, 'packages/gateway-rust/src/routes/project.rs');
    assert.equal(entry?.status, 'unreviewed');
  }
});
