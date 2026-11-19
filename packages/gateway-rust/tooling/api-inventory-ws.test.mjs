import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { clientOnlyWsEntries, nodeWsOutboundTypes, relayedWsTypes, voiceSocketFrames } from './api-inventory.mjs';

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

test('the voice-assistant socket frames are read from the service in both directions', () => {
  const text = readFileSync(join(here, '..', '..', 'gateway', 'src', 'voice-assistant', 'service.ts'), 'utf8');
  const frames = voiceSocketFrames(text);
  for (const type of ['audio', 'status', 'transcript', 'tool_call', 'audio.done', 'audio.interrupt', 'session.started', 'error']) {
    assert.ok(frames.emitted.includes(type), `emitted ${type}`);
  }
  assert.deepEqual([...frames.handled].sort(), ['announce', 'audio', 'commit', 'initial_text', 'interrupt', 'stop']);
});

test('a voice-assistant send without a literal type fails closed', () => {
  assert.throws(
    () => voiceSocketFrames('switch (msg.type) {\n  case "stop": break;\n}\nsend(clientWs, msg);'),
    /unexpanded voice-assistant frame: 1 send/,
  );
});

test('screen-share signals are relayed, so each relayed type is also a server-to-client frame', () => {
  const wsSource = readFileSync(join(here, '..', '..', 'gateway', 'src', 'ws.ts'), 'utf8');
  assert.deepEqual([...relayedWsTypes(wsSource)].sort(), ['screen-share:answer', 'screen-share:ice-candidate', 'screen-share:offer']);
});

test('client literals with no gateway entry become client-only candidates; DOM, UI and IPC names do not', () => {
  const files = [{
    path: 'hooks/socket.ts',
    text: [
      'const ws = new WebSocket(url);',
      'ws.onmessage = (event) => {',
      '  const msg = JSON.parse(event.data);',
      "  if (msg.type === 'widget.ping') return;",
      "  if (event.type === 'keydown' || entry.type === 'dir') return;",
      '};',
      "ws.send(JSON.stringify({ type: 'widget.pong' }));",
    ].join('\n'),
  }];
  const entries = clientOnlyWsEntries(files, new Set(), new Set());
  assert.deepEqual(
    entries.map((entry) => `${entry.direction} ${entry.type} ${entry.clientOnly}`).sort(),
    ['client-to-server-candidate widget.pong true', 'server-to-client-candidate widget.ping true'],
  );
  assert.deepEqual(entries.find((entry) => entry.type === 'widget.ping').clientFiles, ['hooks/socket.ts']);
});

test('a client literal the gateway already has in its direction is not a client-only candidate', () => {
  const files = [{
    path: 'socket.ts',
    text: "new WebSocket(url); if (msg.type === 'chat.created') {} ws.send(JSON.stringify({ type: 'subscribe' }));",
  }];
  assert.deepEqual(clientOnlyWsEntries(files, new Set(['chat.created']), new Set(['subscribe'])), []);
});

test('the generated inventory lists the voice, relay and client frames, and no DOM, UI or IPC names', () => {
  const inventory = JSON.parse(readFileSync(join(here, '..', 'docs', 'api-inventory.json'), 'utf8'));
  const has = (direction, type) => inventory.ws.some((entry) => entry.direction === direction && entry.type === type);
  assert.ok(has('client-to-server-candidate', 'initial_text'));
  assert.ok(has('client-to-server-candidate', 'stop'));
  assert.ok(has('server-to-client-candidate', 'tool_call'));
  assert.ok(has('server-to-client-candidate', 'screen-share:offer'));
  for (const type of ['keydown', 'dir', 'directory', 'done', 'token', 'terminal.exit-from-child']) {
    assert.equal(inventory.ws.some((entry) => entry.type === type), false, type);
  }
});
