import type { MessengerSession, MessengerSnapshot } from '../../../packages/shared/src/messenger.ts';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { MessengerService } from '../../../packages/gateway/src/services/messenger-service.ts';

type RecordValue = Record<string, unknown>;
interface FixtureConnection {
  status: string;
  session: MessengerSession | null;
  client: { getPresenceStatusFor(userId: string): Promise<{ state: string }> } | null;
  rooms: Map<string, unknown>;
  sync(raw: RecordValue): Promise<void>;
}
function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isConnection(value: unknown): value is FixtureConnection {
  return isRecord(value)
    && typeof value.status === 'string'
    && value.session === null
    && value.client === null
    && value.rooms instanceof Map
    && typeof value.sync === 'function';
}
function project(snapshot: MessengerSnapshot) {
  return {
    rooms: snapshot.rooms.map(room => ({
      id: room.id,
      ...(room.peer ? { peer: room.peer } : {}),
    })),
    messages: snapshot.messages.map(message => ({
      id: message.id,
      ...(message.senderId !== undefined ? { senderId: message.senderId } : {}),
      ...(message.senderPresence !== undefined ? { senderPresence: message.senderPresence } : {}),
    })),
  };
}

export async function dispatch(input: unknown) {
  if (!isRecord(input) || !isRecord(input.room) || !Array.isArray(input.steps)) {
    throw new Error('invalid Messenger presence fixture');
  }
  if (input.op !== 'nativemessengerpresence.trace' && input.op !== 'nativemessengerpresence.probe') {
    throw new Error('unknown Messenger presence operation');
  }
  const service = new MessengerService('fixture-secret', fileURLToPath(new URL(
    '../../../.jait/artifacts/gateway-rust/messenger-presence/reference', import.meta.url,
  )));
  // As in the reference tests, seed the connection without starting Matrix.
  // Reflection is confined to fixture setup; sync and snapshot run live code.
  const lookup: unknown = Reflect.get(service, 'connection');
  if (typeof lookup !== 'function') throw new Error('missing Messenger connection fixture seam');
  const connection: unknown = Reflect.apply(lookup, service, ['owner']);
  if (!isConnection(connection)) throw new Error('changed Messenger connection fixture shape');
  connection.status = 'ready';
  connection.session = {
    homeserver: 'https://matrix.invalid', userId: '@self:test', deviceId: 'fixture',
    accessToken: 'fixture-token', cryptoStore: 'fixture-store',
  };
  connection.rooms.set('!room:test', { ...input.room, receipts: {} });
  const calls: string[] = [];
  if (input.op === 'nativemessengerpresence.probe') {
    connection.client = {
      async getPresenceStatusFor(userId) {
        calls.push(userId);
        return { state: 'online' };
      },
    };
    service.snapshot('owner', '!room:test');
    await setImmediate();
    return { calls, snapshot: project(service.snapshot('owner', '!room:test')) };
  }
  const trace = [];
  for (const presence of input.steps) {
    await connection.sync({ presence });
    trace.push(project(service.snapshot('owner', '!room:test')));
  }
  return { trace, other: project(service.snapshot('other', '!room:test')) };
}
