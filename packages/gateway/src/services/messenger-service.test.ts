import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { MessengerService, messengerHomeserver } from './messenger-service.js';

function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', import.meta.url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}

describe('Messenger assistant access persistence', () => {
  it('restores enabled and disabled access across gateway restarts', async () => {
    const directory = fileURLToPath(new URL(`../../../../.jait/artifacts/messenger-access-${randomUUID()}`, import.meta.url));
    try {
      const service = new MessengerService('test-secret', directory);
      const connection = (service as any).connection('owner');
      connection.session = { userId: '@alice:test' };
      await connection.command({ action: 'assistantAccess', enabled: true });
      const restarted = new MessengerService('test-secret', directory);
      const restored = (restarted as any).connection('owner');
      restored.start = vi.fn(async (session: unknown) => { restored.session = session; });
      await restarted.resume('owner');
      expect(restored.assistantAccess).toBe(true);
      await restored.command({ action: 'assistantAccess', enabled: false });
      const next = new MessengerService('test-secret', directory);
      const nextConnection = (next as any).connection('owner');
      nextConnection.start = vi.fn(async (session: unknown) => { nextConnection.session = session; });
      await next.resume('owner');
      expect(nextConnection.assistantAccess).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('Messenger message actions and history', () => {
  it('uses sender names for direct alerts and prefixes group messages', async () => {
    vi.useFakeTimers();
    try {
      const { c, room } = setup();
      const notify = vi.fn();
      c.incoming = () => notify;
      room.summary = { ...room.summary, name: 'Teams bridge', service: 'Teams' } as any;
      room.states = [{ type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Bob' } }] as any;
      const event = { event_id: '$direct', sender: '@bob:test', type: 'm.room.message', origin_server_ts: Date.now(), content: { body: 'Hello' } };
      (room as any).peer = { userId: '@bob:test' };
      c.announce(room, event);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(notify).toHaveBeenLastCalledWith('test', expect.objectContaining({ title: 'Bob', body: 'Hello' }));
      delete (room as any).peer;
      room.summary.name = 'Team-Chat';
      c.announce(room, { ...event, event_id: '$group', origin_server_ts: Date.now() });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(notify).toHaveBeenLastCalledWith('test', expect.objectContaining({ title: 'Team-Chat', body: 'Bob: Hello' }));
    } finally { vi.useRealTimers(); }
  });

  it('projects edits and reactions onto their original message', () => {
    const { c, room } = setup();
    room.events.push({ event_id: '$edit', type: 'm.room.message', sender: '@alice:test', origin_server_ts: 2, content: { 'm.relates_to': { rel_type: 'm.replace', event_id: '$one' }, 'm.new_content': { msgtype: 'm.text', body: 'changed' } } } as any);
    room.events.push({ event_id: '$react', type: 'm.reaction', sender: '@alice:test', content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$one', key: '👍' } } } as any);
    expect(c.messages('!room:test')).toMatchObject([{ body: 'changed', edited: true, reactions: [{ key: '👍', count: 1, own: true }] }]);
  });
  it('projects each group sender’s Matrix avatar and rejects external URLs', () => {
    const { c, room, message } = setup();
    room.states = [
      { type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Bob', avatar_url: 'mxc://test/bob' } },
      { type: 'm.room.member', state_key: '@eve:test', content: { displayname: 'Eve', avatar_url: 'https://example.test/photo' } },
    ] as any;
    room.events = [message('$bob', '@bob:test'), message('$eve', '@eve:test')];
    const messages = c.messages('!room:test');
    expect(messages[0]).toMatchObject({ sender: 'Bob', senderAvatarUrl: 'mxc://test/bob' });
    expect(messages[1]).not.toHaveProperty('senderAvatarUrl');
  });
  it('projects reply references after a message is sent, including edits', () => {
    const { c, room, message } = setup();
    room.events.push({ ...message('$reply'), content: { body: 'reply', 'm.relates_to': { 'm.in_reply_to': { event_id: '$one' } } } });
    room.events.push({ event_id: '$edit', type: 'm.room.message', sender: room.events[0].sender, content: { 'm.relates_to': { rel_type: 'm.replace', event_id: '$one' }, 'm.new_content': { body: 'updated' } } } as any);
    expect(c.messages('!room:test')[1].replyTo).toEqual({ id: '$one', sender: room.events[0].sender, body: 'updated' });
  });
  it('ignores forged edits and redacted reactions', () => {
    const { c, room } = setup();
    room.events.push({ event_id: '$edit', type: 'm.room.message', sender: '@other:test', content: { 'm.relates_to': { rel_type: 'm.replace', event_id: '$one' }, 'm.new_content': { body: 'forged' } } } as any);
    room.events.push({ event_id: '$react', type: 'm.reaction', sender: '@other:test', content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$one', key: '👍' } } } as any);
    room.events.push({ event_id: '$redact', type: 'm.room.redaction', content: { redacts: '$react' } } as any);
    expect(c.messages('!room:test')[0]).toMatchObject({ body: 'original', reactions: [] });
  });
  it('retains newly fetched history when more than 2000 events are loaded', async () => {
    const { c, room, message } = setup();
    room.events = Array.from({ length: 2000 }, (_, i) => message('$' + i));
    c.client.doRequest.mockResolvedValue({ chunk: [message('$older')], end: 'page2' });
    await c.earlier('!room:test');
    expect(c.messages('!room:test')[0].id).toBe('$older');
  });
  it('records exhausted history even after subsequent syncs', async () => {
    const { c } = setup();
    c.client.doRequest.mockResolvedValue({ chunk: [], end: 'page1' });
    await c.earlier('!room:test');
    await c.sync({ rooms: { join: { '!room:test': { timeline: { events: [], prev_batch: 'reset' } } } } });
    expect(c.snapshot('!room:test').hasEarlier).toBe(false);
    await c.earlier('!room:test');
    expect(c.client.doRequest).toHaveBeenCalledTimes(1);
  });
  it('rejects edits of another sender and toggles own reactions', async () => {
    const { c, room } = setup();
    room.events[0].sender = '@bob:test';
    await expect(c.command({ action: 'edit', roomId: '!room:test', eventId: '$one', text: 'wrong' })).rejects.toThrow();
    await c.command({ action: 'react', roomId: '!room:test', eventId: '$one', key: '👍' });
    expect(c.client.sendEvent).toHaveBeenCalledWith('!room:test', 'm.reaction', { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$one', key: '👍' } });
    await c.command({ action: 'react', roomId: '!room:test', eventId: '$one', key: '👍' });
    expect(c.client.redactEvent).toHaveBeenCalledWith('!room:test', '$reaction');
  });
  it('lists each reader once no matter how many messages they acknowledged', () => {
    const { c, room, message } = setup();
    room.events = [message('$one'), message('$two'), message('$three')];
    room.receipts = {
      '$one': { '@bob:test': { ts: 100 } },
      '$two': { '@bob:test': { ts: 200 } },
      '$three': { '@bob:test': { ts: 300 } },
    } as any;
    const messages = c.messages('!room:test');
    expect(messages[0].readBy).toHaveLength(1);
    expect(messages[2].readBy).toEqual([{ userId: '@bob:test', name: '@bob:test', timestamp: 300, exact: true }]);
  });
  it('keeps receipt positions stable when an earlier message is redacted', () => {
    const { c, room, message } = setup();
    room.events = [message('$one'), message('$two'), message('$three')];
    room.events.push({ event_id: '$redact', type: 'm.room.redaction', content: { redacts: '$one' } } as any);
    room.receipts = { '$three': { '@bob:test': { ts: 300 } } } as any;
    const messages = c.messages('!room:test');
    expect(messages.map((m: any) => m.id)).toEqual(['$two', '$three']);
    expect(messages[0].readBy).toEqual([{ userId: '@bob:test', name: '@bob:test', timestamp: 300, exact: false }]);
  });
  it('removes a conversation after leaving and forgetting', async () => {
    const { c } = setup();
    await c.command({ action: 'remove', roomId: '!room:test' });
    expect(c.client.leaveRoom).toHaveBeenCalledWith('!room:test');
    expect(c.client.doRequest).toHaveBeenCalledWith('POST', '/_matrix/client/v3/rooms/!room%3Atest/forget', undefined, {});
    expect(c.snapshot().rooms).toEqual([]);
  });
});

describe('Own Matrix presence', () => {
  it('persists and refreshes the requested status, then stops refreshing', async () => {
    vi.useFakeTimers();
    try {
      const { c } = setup();
      c.save = vi.fn();
      c.client.setPresenceStatus = vi.fn().mockResolvedValue(undefined);
      await c.setOwnPresence('online', true);
      expect(c.save).toHaveBeenCalledWith(expect.objectContaining({ ownPresence: { state: 'online', keep: true } }));
      await vi.advanceTimersByTimeAsync(45_000);
      expect(c.client.setPresenceStatus).toHaveBeenCalledTimes(2);
      await c.setOwnPresence('unavailable', false);
      await vi.advanceTimersByTimeAsync(45_000);
      expect(c.client.setPresenceStatus).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });
  it('does not save a status rejected by the homeserver', async () => {
    const { c } = setup();
    c.save = vi.fn();
    c.client.setPresenceStatus = vi.fn().mockRejectedValue(new Error('unavailable'));
    await expect(c.setOwnPresence('online', true)).rejects.toThrow();
    expect(c.save).not.toHaveBeenCalled();
    expect(c.ownPresence.keep).toBe(false);
  });
});

describe('Messenger homeserver validation', () => {
  it('normalises an https homeserver to its origin', () => {
    expect(messengerHomeserver('https://matrix.example.org')).toBe('https://matrix.example.org');
    expect(messengerHomeserver('  https://matrix.example.org/  ')).toBe('https://matrix.example.org');
    expect(messengerHomeserver('https://matrix.example.org:8448/')).toBe('https://matrix.example.org:8448');
  });

  it('rejects credentials in the url', () => {
    expect(() => messengerHomeserver('https://alice@matrix.example.org')).toThrow('Use an HTTPS Matrix homeserver');
    expect(() => messengerHomeserver('https://alice:secret@matrix.example.org')).toThrow('Use an HTTPS Matrix homeserver');
  });

  it('rejects query strings and fragments', () => {
    expect(() => messengerHomeserver('https://matrix.example.org/?access_token=abc')).toThrow('Use an HTTPS Matrix homeserver');
    expect(() => messengerHomeserver('https://matrix.example.org/#/room')).toThrow('Use an HTTPS Matrix homeserver');
  });

  it('rejects any path beyond the server root', () => {
    expect(() => messengerHomeserver('https://matrix.example.org/_matrix/client')).toThrow('Use an HTTPS Matrix homeserver');
  });

  it('rejects plaintext http unless it is loopback', () => {
    expect(() => messengerHomeserver('http://matrix.example.org')).toThrow('Use an HTTPS Matrix homeserver');
    expect(messengerHomeserver('http://localhost:8008')).toBe('http://localhost:8008');
    expect(messengerHomeserver('http://127.0.0.1:8008')).toBe('http://127.0.0.1:8008');
    expect(messengerHomeserver('http://[::1]:8008')).toBe('http://[::1]:8008');
  });

  it('rejects schemes other than http and https', () => {
    expect(() => messengerHomeserver('ftp://matrix.example.org')).toThrow('Use an HTTPS Matrix homeserver');
    expect(() => messengerHomeserver('ws://matrix.example.org')).toThrow('Use an HTTPS Matrix homeserver');
  });
});


describe('Messenger status broadcasts', () => {
  it.each([
    ['WhatsApp Status Broadcast', ''],
    ['WhatsApp', 'Status updates from your contacts'],
  ])('projects status room metadata and preserves sender IDs and captions (%s)', async (name, topic) => {
    const { c } = setup();
    await c.sync({ rooms: { join: { '!status:test': {
      state: { events: [
        { type: 'm.room.name', state_key: '', content: { name } },
        { type: 'm.room.topic', state_key: '', content: { topic } },
        { type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Bob', membership: 'join' } },
      ] },
      timeline: { events: [{
        event_id: '$story', type: 'm.room.message', sender: '@bob:test', origin_server_ts: Date.now(),
        content: { msgtype: 'm.image', body: 'Evening sky', filename: 'sky.png', url: 'mxc://test/sky', info: { mimetype: 'image/png' } },
      }] },
    } } } });
    const snapshot = c.snapshot('!status:test');
    expect(snapshot.rooms.find((room: any) => room.id === '!status:test')).toMatchObject({ status: true, kind: 'status', topic });
    expect(snapshot.messages).toMatchObject([{ sender: 'Bob', senderId: '@bob:test', body: 'Evening sky', attachment: { name: 'sky.png', image: true } }]);

    await c.sync({ rooms: { join: { '!status:test': {
      state: { events: [
        { type: 'm.room.name', state_key: '', content: { name: 'General chat' } },
        { type: 'm.room.topic', state_key: '', content: { topic: 'Ordinary conversation' } },
      ] }, timeline: { events: [] },
    } } } });
    const updated = c.snapshot('!status:test').rooms.find((room: any) => room.id === '!status:test');
    expect(updated.status).toBeUndefined();
    expect(updated.kind).not.toBe('status');
  });
});

describe('Messenger bridged service detection', () => {
  it.each(['go.mau.fi/mautrix-teams', 'msteams', 'teams', 'microsoft-teams'])('recognizes Teams metadata after joining an invitation (%s)', async protocol => {
    const { c } = setup();
    await c.sync({ rooms: { invite: { '!teams:test': { invite_state: { events: [
      { type: 'm.room.name', state_key: '', content: { name: 'A conversation' } },
    ] } } } } });
    expect(c.snapshot().rooms.find((r: any) => r.id === '!teams:test')).toMatchObject({ membership: 'invite', service: 'Matrix' });
    await c.sync({ rooms: { join: { '!teams:test': { state: { events: [
      { type: 'm.bridge', state_key: 'teams', content: { protocol: { id: protocol, displayname: 'Microsoft Teams' } } },
    ] }, timeline: { events: [] } } } } });
    expect(c.snapshot().rooms.find((r: any) => r.id === '!teams:test')).toMatchObject({ membership: 'join', service: 'Teams' });
  });
});
