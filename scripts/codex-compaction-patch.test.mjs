import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const bundle = readFileSync(require.resolve('@agentclientprotocol/codex-acp'), 'utf8');
const patch = readFileSync(new URL('../patches/@agentclientprotocol%252Fcodex-acp@2.1.1.patch', import.meta.url), 'utf8');

function adapterBundle(patched) {
  let source = bundle;
  const hunks = patch.split(/(?=^@@ )/m).filter((part) => /^@@ -350\d\d/m.test(part));
  if (!patched) hunks.reverse();
  for (const hunk of hunks) {
    const lines = hunk.split('\n').slice(1).filter((line) => /^[ +-]/.test(line));
    const before = lines.filter((line) => line[0] !== '+').map((line) => line.slice(1)).join('\n');
    const after = lines.filter((line) => line[0] !== '-').map((line) => line.slice(1)).join('\n');
    const from = patched ? before : after;
    const to = patched ? after : before;
    if (source.includes(to)) continue;
    assert.equal(source.split(from).length, 2, 'compaction patch must match installed adapter exactly once');
    source = source.replace(from, to);
  }
  assert.equal(source.includes("Codex compaction turn did not finish after compaction completed"), patched);
  return source;
}

function setup(source) {
  const start = source.indexOf('  async runCompact(params, onTurnStarted) {');
  const end = source.indexOf('  async turnInterrupt(params) {', start);
  assert.ok(start >= 0 && end > start);
  const method = source.slice(start, end);
  let timeoutCallback;
  let cleared = false;
  const fakeSetTimeout = (callback) => { timeoutCallback = callback; return 1; };
  const fakeClearTimeout = () => { cleared = true; };
  const Client = new Function('setTimeout', 'clearTimeout', `return class { ${method} }`)(fakeSetTimeout, fakeClearTimeout);
  const client = new Client();
  const captures = {};
  client.connection = { onClose: (callback) => { captures.close = callback; return { dispose() {} }; } };
  client.captureCompactionCompletions = (_id, callback) => { captures.compaction = callback; return () => {}; };
  client.captureTurnCompletions = (_id, callback) => { captures.turn = callback; return () => {}; };
  client.captureTurnRoutings = (_id, callback) => { captures.routing = callback; return () => {}; };
  client.threadCompactStart = async () => {};
  const result = client.runCompact({ threadId: 'thread' });
  return { captures, result, timeout: () => timeoutCallback?.(), wasCleared: () => cleared };
}

async function startedAndCompacted(instance) {
  instance.captures.routing('turn', { method: 'turn/started' });
  instance.captures.compaction({ method: 'item/completed', params: { turnId: 'turn' } });
  await Promise.resolve();
  await Promise.resolve();
}

test('adapter does not return between compaction item and turn completion', async () => {
  const old = setup(adapterBundle(false));
  await startedAndCompacted(old);
  assert.equal((await old.result).method, 'item/completed');
  const fixed = setup(adapterBundle(true));
  let settled = false;
  fixed.result.finally(() => { settled = true; });
  await startedAndCompacted(fixed);
  assert.equal(settled, false);
  fixed.captures.turn({ turn: { id: 'other', status: 'completed' } });
  await Promise.resolve();
  assert.equal(settled, false);
  fixed.captures.turn({ turn: { id: 'turn', status: 'completed' } });
  assert.equal((await fixed.result).method, 'turn/completed');
  assert.equal(fixed.wasCleared(), true);
});

test('missing turn completion fails closed after compaction', async () => {
  const fixed = setup(adapterBundle(true));
  const rejected = assert.rejects(fixed.result, /compaction turn did not finish/);
  await startedAndCompacted(fixed);
  fixed.timeout();
  await rejected;
  assert.equal(fixed.wasCleared(), true);
});

test('turn failure settles compaction', async () => {
  const fixed = setup(adapterBundle(true));
  fixed.captures.routing('turn', { method: 'turn/started' });
  fixed.captures.turn({ turn: { id: 'turn', status: 'failed' } });
  assert.equal((await fixed.result).params.turn.status, 'failed');
});


test('transport closure rejects and releases the timeout', async () => {
  const fixed = setup(adapterBundle(true));
  const rejected = assert.rejects(fixed.result, /connection closed during compaction/);
  await startedAndCompacted(fixed);
  fixed.captures.close();
  await rejected;
  assert.equal(fixed.wasCleared(), true);
});

test('thread compaction event without turn ID still starts timeout', async () => {
  const fixed = setup(adapterBundle(true));
  const rejected = assert.rejects(fixed.result, /compaction turn did not finish/);
  fixed.captures.routing('turn', { method: 'turn/started' });
  fixed.captures.compaction({ method: 'thread/compacted', params: {} });
  await Promise.resolve();
  fixed.timeout();
  await rejected;
});
