// Lane-owned differential driver: the real TypeScript `MessengerHistory` service
// against an owned loopback Matrix backup server, plus the wasm identifier
// constructors and `JSON.stringify` references the native port must match.
// Only the fixture producer and matrix-bot-sdk are Node-only; everything else
// is the production TypeScript module unchanged.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { MessengerHistory } from '../../../packages/gateway/src/services/messenger-history.ts';

const require = createRequire(
  new URL('../../../packages/gateway/package.json', import.meta.url),
);
const crypto = require('@matrix-org/matrix-sdk-crypto-wasm');
const REPLAY_LIMIT = 96 * 1024;

async function produceFixture(): Promise<any> {
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      fileURLToPath(new URL('../matrix-history-fixture.mjs', import.meta.url)),
    ],
    { stdout: 'pipe', stderr: 'pipe', env: process.env },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const code = await child.exited;
  if (code !== 0) throw new Error(`fixture exited ${code}: ${stderr}`);
  return JSON.parse(stdout);
}

let fixturePromise: Promise<any> | undefined;
// One real crypto fixture per driver process; every call deep-clones the parts
// it mutates, so batched differential cases stay inside the harness deadline.
function fixture(): Promise<any> {
  return (fixturePromise ??= produceFixture());
}

function firstSession(backup: any): any {
  const room = Object.values(backup.rooms ?? {})[0] as any;
  return Object.values(room.sessions)[0] as any;
}

async function recover(call: any) {
  const produced = await fixture();
  const requests: string[] = [];
  const version: any = {
    ...produced.version,
    auth_data: { ...produced.version.auth_data },
  };
  if (call.dropAuthData) delete version.auth_data;
  if (call.authData !== undefined) version.auth_data = call.authData;
  if (call.dropVersion) delete version.version;
  if (call.versionValue !== undefined) version.version = call.versionValue;
  if (call.algorithm !== undefined) version.algorithm = call.algorithm;
  if (call.wrongPublicKey)
    version.auth_data = { ...(version.auth_data ?? {}), public_key: 'wrong-public-key' };

  let backup: any = JSON.parse(JSON.stringify(produced.backup));
  if (call.corrupt) firstSession(backup).session_data.ciphertext = 'invalid';
  if (call.sessionData !== undefined) firstSession(backup).session_data = call.sessionData;
  if (call.sessionOverride !== undefined) {
    (Object.values(backup.rooms ?? {})[0] as any).sessions = call.sessionOverride;
  }
  if (call.dropRooms) delete backup.rooms;
  if (call.rooms !== undefined) backup.rooms = call.rooms;
  if (call.backup !== undefined) backup = call.backup;
  if (call.count) {
    const room = Object.values(backup.rooms)[0] as any;
    const entries = Object.entries(room.sessions);
    const template = entries[0]![1];
    room.sessions = Object.fromEntries(
      Array.from({ length: call.count }, (_, index) => [
        index === 0 ? entries[0]![0] : `synthetic-${index}`,
        template,
      ]),
    );
  }

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: request => {
      const url = new URL(request.url);
      requests.push(url.pathname + url.search);
      if (call.textError) return new Response('synthetic failure', { status: 503 });
      const failing =
        call.httpError === 'both' ||
        (call.httpError === 'version' && url.pathname.endsWith('/version')) ||
        (call.httpError === 'keys' && url.pathname.endsWith('/keys'));
      if (failing)
        return Response.json(
          { errcode: 'M_UNKNOWN', error: 'synthetic backup failure' },
          { status: 503 },
        );
      return Response.json(url.pathname.endsWith('/version') ? version : backup);
    },
  });
  const { MatrixClient } = require('matrix-bot-sdk');
  const result: any = { requests };
  let history: any;
  try {
    history = await MessengerHistory.create(
      call.userId ?? '@archive:fixture',
      call.deviceId ?? 'ARCHIVE',
    );
    if (call.closeFirst) history.close();
    const exported = await history.restore(
      new MatrixClient(`http://127.0.0.1:${server.port}`, 'local-unused'),
      call.key ?? produced.recoveryKey,
    );
    result.exportedCount = JSON.parse(exported).length;
    if (result.exportedCount <= 8) result.exported = JSON.parse(exported);
    if (!call.skipDecrypt) {
      try {
        result.decrypted = await history.decrypt(
          call.roomId ?? '!shared:fixture',
          call.event ?? produced.event,
        );
      } catch (error: any) {
        result.decryptError = typeof error?.message === 'string' ? error.message : null;
      }
    }
  } catch (error: any) {
    result.error = error?.message;
  } finally {
    try {
      history?.close();
    } catch {}
    server.stop(true);
  }
  result.eventJson = JSON.stringify(produced.event);
  const fixture = {
    recoveryKey: produced.recoveryKey,
    version,
    backup,
    event: produced.event,
  };
  if ((call.count ?? 1) <= 8 && call.sessionOverride === undefined) {
    if (JSON.stringify(fixture).length <= REPLAY_LIMIT) result.fixture = fixture;
  }
  return result;
}

async function decrypt(call: any) {
  const history = await MessengerHistory.create(
    call.userId ?? '@archive:fixture',
    call.deviceId ?? 'ARCHIVE',
  );
  try {
    const event = call.event ?? {};
    return {
      decrypted: await history.decrypt(call.roomId ?? '!shared:fixture', event),
      eventJson: JSON.stringify(event),
    };
  } catch (error: any) {
    return {
      error: typeof error?.message === 'string' ? error.message : null,
      stringified: String(error),
      eventJson: JSON.stringify(call.event ?? {}),
    };
  } finally {
    history.close();
  }
}

async function createOnly(call: any) {
  let history: any;
  try {
    history = await MessengerHistory.create(
      call.userId,
      call.deviceId,
      call.exported,
    );
    return { created: true, userId: call.userId, deviceId: call.deviceId };
  } catch (error: any) {
    return { error: typeof error?.message === 'string' ? error.message : String(error) };
  } finally {
    try {
      history?.close();
    } catch {}
  }
}

function attempt(build: () => void): string {
  try {
    build();
    return 'ok';
  } catch (error: any) {
    return String(error?.message ?? error);
  }
}

function identifiers(call: any) {
  const userIds: string[] = call.userId ?? DEFAULT_USER_IDS;
  const roomIds: string[] = call.roomId ?? DEFAULT_ROOM_IDS;
  const deviceIds: string[] = call.deviceId ?? DEFAULT_DEVICE_IDS;
  return {
    userId: userIds.map(value => ({ value, result: attempt(() => new crypto.UserId(value)) })),
    roomId: roomIds.map(value => ({ value, result: attempt(() => new crypto.RoomId(value)) })),
    deviceId: deviceIds.map(value => ({
      value,
      result: attempt(() => new crypto.DeviceId(value)),
    })),
  };
}

const DEFAULT_USER_IDS = [
  '@archive:fixture',
  'archive',
  '',
  '@archive',
  '@archive:',
  '@archive:fixture:extra',
  '@:fixture',
  '@a b:fixture',
  '@archive:EXAMPLE.com',
  '@archive:example.com:8448',
  '@archive:[::1]',
  '@archive:[::1]:8448',
  '@archive:localhost',
  '@archive:-bad.com',
  '@archive:bad-.com',
  '@archive:1.2.3.4',
  '@archive:256.1.1.1',
  '@archive:ex ample',
  '@archive:\u00fcnicode',
  '@archive:fixture.',
  '@archive:.',
  '@archive:..',
  '@archive:fixture:0',
  '@archive:fixture:99999',
  '@archive:fixture:abc',
  '@archive:_service:fixture',
  `@${'a'.repeat(300)}:fixture`,
];

const DEFAULT_ROOM_IDS = ['!shared:fixture', '!x', '', ':x', '!', '!a:b:c', 'shared', '! '];

const DEFAULT_DEVICE_IDS = ['', 'ARCHIVE', 'a b', '\u00fc', 'a'.repeat(300), 'a:b'];

export async function dispatch(call: any) {
  switch (call.op) {
    case 'nativemessengerhistory.recover':
      return await recover(call);
    case 'nativemessengerhistory.decrypt':
      return await decrypt(call);
    case 'nativemessengerhistory.create':
      return await createOnly(call);
    case 'nativemessengerhistory.identifiers':
      return identifiers(call);
    case 'nativemessengerhistory.serialize':
      return { serialized: (call.inputs ?? []).map((value: unknown) => JSON.stringify(value)) };
    default:
      throw new Error('unknown driver operation');
  }
}
