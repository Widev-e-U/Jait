import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { websocketCandidates } from './ws-inventory.mjs';

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
