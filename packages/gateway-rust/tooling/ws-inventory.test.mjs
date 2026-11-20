import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { broadcastHelperLiterals, objectTypeValues, parseTs, switchArms, websocketCandidates } from './ws-inventory.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('separates inbound cases from outbound literal candidates and preserves both directions', () => {
  const node = `
    switch (msg.type) {
      case "receive": break;
      case "grouped": break;
      case "duplex": break;
    }
    send({ type: "send" });
    send({ type: "duplex" });
  `;
  const rust = `
    match kind { "receive" | "grouped" => (), "duplex" => () }
    json!({ "type": "send" })
  `;
  assert.deepEqual(websocketCandidates(node, rust), [
    { type: 'duplex', direction: 'client-to-server-candidate', rustReference: true },
    { type: 'grouped', direction: 'client-to-server-candidate', rustReference: true },
    { type: 'receive', direction: 'client-to-server-candidate', rustReference: true },
    { type: 'duplex', direction: 'server-to-client-candidate', rustReference: false },
    { type: 'send', direction: 'server-to-client-candidate', rustReference: true },
  ]);
});

test('actual gateway hub identifies representative inbound and outbound types separately', () => {
  const node = readFileSync(join(here, '../../gateway/src/ws.ts'), 'utf8');
  const rust = readFileSync(join(here, '../src/ws.rs'), 'utf8');
  const entries = websocketCandidates(node, rust);
  assert.ok(entries.some((e) => e.type === 'terminal.input' && e.direction === 'client-to-server-candidate'));
  assert.ok(entries.some((e) => e.type === 'session.created' && e.direction === 'server-to-client-candidate'));
  assert.ok(!entries.some((e) => e.type === 'session.created' && e.direction === 'client-to-server-candidate'));
  assert.ok(entries.every((e) => typeof e.rustReference === 'boolean'));
});

test('reads frame types from object literals, quoted keys, conditionals and broadcast helpers only', () => {
  const sf = parseTs(
    'ws.ts',
    `
    // { type: "commented" }
    const note = 'type: "in-string"';
    interface Frame { type: "annotated" }
    send({ "type": "quoted" });
    send({ type: flag ? "left" : "right" });
    broadcastToUser(id, "chat.moved", { payload: 1 });
    switch (msg.type) { case "in": break; }
    `,
  );
  assert.deepEqual(objectTypeValues(sf).literals.map((l) => l.value).sort(), ['left', 'quoted', 'right']);
  assert.deepEqual(broadcastHelperLiterals(sf).map((h) => h.value), ['chat.moved']);
  assert.deepEqual(switchArms(sf, 'msg.type').literals.map((a) => a.value), ['in']);
});

test('dynamic frame types are returned with the calls that send them, never dropped', () => {
  const sf = parseTs('ws.ts', 'this.send(client.ws, { type: msg.type as Kind, payload: 1 });\nsend({ type: kind });');
  assert.deepEqual(
    objectTypeValues(sf).dynamic.map((d) => [d.text, d.calls]),
    [
      ['msg.type', ['this.send']],
      ['kind', ['send']],
    ],
  );
});

test('switch arms that are not string literals are reported as dynamic', () => {
  const sf = parseTs('ws.ts', 'switch (msg.type) { case KIND: break; case "ok": break; }');
  const arms = switchArms(sf, 'msg.type');
  assert.deepEqual(arms.literals.map((a) => a.value), ['ok']);
  assert.deepEqual(arms.dynamic.map((a) => a.text), ['KIND']);
});

test('switch arms that call relayShareSignal are marked as relayed', () => {
  const sf = parseTs(
    'ws.ts',
    'switch (msg.type) { case "screen-share:offer": { this.relayShareSignal(id, client, msg); break; } case "subscribe": { this.send(c, {}); break; } }',
  );
  assert.deepEqual(switchArms(sf, 'msg.type').relayed, ['screen-share:offer']);
});
