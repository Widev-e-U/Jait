import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { nodeWsOutboundTypes } from './api-inventory.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('templated WS frames expand from a literal union or from helper call sites', () => {
  const files = [
    {
      path: 'routes/sessions.ts',
      text: 'function emit(userId: string, event: "created" | "moved", data: unknown) {\n'
        + '  ws.broadcastToUser(userId, { type: `chat.${event}` as WsEventType, data });\n}',
    },
    {
      path: 'routes/threads.ts',
      text: 'function broadcastThreadEvent(\n  threadId: string,\n  event: string,\n  data: unknown,\n) {\n'
        + '  ws.broadcastAll({ type: `thread.${event}` as WsEventType, data });\n}\n'
        + 'broadcastThreadEvent(threadId, "status", {});\nbroadcastThreadEvent(id, "activity", {});',
    },
    { path: 'index.ts', text: 'ws.broadcastAll({ type: "consent.required", payload: {} });' },
  ];
  assert.deepEqual([...nodeWsOutboundTypes(files)].sort(), [
    'chat.created', 'chat.moved', 'consent.required', 'thread.activity', 'thread.status',
  ]);
});

test('a template with no reviewed expansion fails closed', () => {
  assert.throws(
    () => nodeWsOutboundTypes([{ path: 'x.ts', text: 'ws.broadcastAll({ type: `widget.${kind}` as WsEventType });' }]),
    /unexpanded WebSocket template widget\.\$\{kind\}/,
  );
});

test('upstream protocols are not gateway WS frames, but client frames of the same file are', () => {
  const files = [
    { path: 'services/messenger-service.ts', text: 'const body = { type: "m.login.password" };' },
    {
      path: 'voice-assistant/service.ts',
      text: 'openaiWs.send(JSON.stringify({ type: "response.create" }));\nws.send(JSON.stringify({ type: "audio.done" }));',
    },
  ];
  const types = nodeWsOutboundTypes(files);
  assert.equal(types.has('m.login.password'), false);
  assert.equal(types.has('response.create'), false);
  assert.equal(types.has('audio.done'), true);
});

test('the generated WS inventory lists frames that are sent outside ws.ts', () => {
  const inventory = JSON.parse(readFileSync(join(here, '..', 'docs', 'api-inventory.json'), 'utf8'));
  const outbound = new Set(
    inventory.ws.filter((entry) => entry.direction === 'server-to-client-candidate').map((entry) => entry.type),
  );
  for (const type of ['consent.required', 'thread.status', 'chat.moved', 'repo.deleted', 'plan.created', 'project.restored']) {
    assert.ok(outbound.has(type), type);
  }
  assert.equal(outbound.has('m.login.password'), false);
  assert.equal(outbound.has('conversation.item.create'), false);
});
