// Protocol fixture producer only: the Rust contract runner makes all assertions.
// Both encryption and backup generation use the real Matrix Rust crypto binding.
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../../packages/gateway/package.json', import.meta.url),
);
const crypto = require('@matrix-org/matrix-sdk-crypto-nodejs');
const machine = await crypto.OlmMachine.initialize(
  new crypto.UserId('@archive:fixture'),
  new crypto.DeviceId('ARCHIVE'),
);
try {
  const room = new crypto.RoomId('!shared:fixture');
  const settings = new crypto.EncryptionSettings();
  await machine.shareRoomKey(room, [], settings);
  const content = JSON.parse(
    await machine.encryptRoomEvent(
      room,
      'm.room.message',
      JSON.stringify({
        msgtype: 'm.text',
        body: 'historical encrypted message',
      }),
    ),
  );
  const key = crypto.BackupDecryptionKey.createRandomKey();
  await machine.enableBackupV1(key.megolmV1PublicKey.publicKeyBase64, '1');
  const backup = await machine.backupRoomKeys();
  if (!backup) throw new Error('Fixture generated no backed up room key');
  const data = Buffer.concat([
    Buffer.from([0x8b, 1]),
    Buffer.from(key.toBase64(), 'base64'),
  ]);
  const recovery = Buffer.concat([
    data,
    Buffer.from([data.reduce((a, b) => a ^ b, 0)]),
  ]);
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt('0x' + recovery.toString('hex'));
  let recoveryKey = '';
  while (value > 0n) {
    recoveryKey = alphabet[Number(value % 58n)] + recoveryKey;
    value /= 58n;
  }
  process.stdout.write(
    JSON.stringify({
      recoveryKey,
      version: {
        version: '1',
        algorithm: 'm.megolm_backup.v1.curve25519-aes-sha2',
        auth_data: { public_key: key.megolmV1PublicKey.publicKeyBase64 },
      },
      backup: JSON.parse(backup.body),
      event: {
        event_id: '$history',
        sender: '@archive:fixture',
        type: 'm.room.encrypted',
        origin_server_ts: 1759999990000,
        content,
      },
    }),
  );
} finally {
  machine.close();
}
