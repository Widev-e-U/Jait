import { BackupDecryptionKey } from '@matrix-org/matrix-sdk-crypto-nodejs';
import type { MatrixClient } from 'matrix-bot-sdk';
import {
  OlmMachine,
  UserId,
  DeviceId,
  RoomId,
  DecryptionSettings,
  TrustRequirement,
} from '@matrix-org/matrix-sdk-crypto-wasm';

function decodeRecoveryKey(input: string): Buffer {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const value = input.replace(/\s/g, '');
  if (!value || value.length > 100) throw new Error('Invalid recovery key.');
  let number = 0n;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid recovery key.');
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0) {
    bytes.unshift(Number(number & 255n));
    number >>= 8n;
  }
  for (const char of value) {
    if (char !== '1') break;
    bytes.unshift(0);
  }
  const data = Buffer.from(bytes);
  if (
    data.length !== 35 ||
    data[0] !== 0x8b ||
    data[1] !== 1 ||
    data.reduce((a, b) => a ^ b, 0) !== 0
  )
    throw new Error('Invalid recovery key.');
  const key = Buffer.from(data.subarray(2, 34));
  data.fill(0);
  return key;
}

/** The native binding lacks key import. Use the official Rust WASM binding in memory for recovered history only.
 * Exported keys are encrypted by MessengerService before persistence. This machine never logs in or syncs.
 */
export class MessengerHistory {
  private constructor(private machine: OlmMachine) {}
  static async create(userId: string, deviceId: string, exported?: string) {
    const machine = await OlmMachine.initialize(
      new UserId(userId),
      new DeviceId(deviceId),
    );
    const history = new MessengerHistory(machine);
    if (exported) await machine.importRoomKeys(exported, () => {});
    return history;
  }
  async restore(client: MatrixClient, recoveryKey: string) {
    const key = decodeRecoveryKey(recoveryKey);
    try {
      const privateKey = BackupDecryptionKey.fromBase64(key.toString('base64'));
      const backup = await client.doRequest(
        'GET',
        '/_matrix/client/v3/room_keys/version',
      );
      if (
        backup.algorithm !== 'm.megolm_backup.v1.curve25519-aes-sha2' ||
        !backup.version ||
        backup.auth_data?.public_key !==
          privateKey.megolmV1PublicKey.publicKeyBase64
      )
        throw new Error('Recovery key does not match this backup.');
      const response = await client.doRequest(
        'GET',
        '/_matrix/client/v3/room_keys/keys',
        { version: backup.version },
      );
      const keys: Record<string, unknown>[] = [];
      for (const [roomId, room] of Object.entries(response.rooms ?? {}) as [
        string,
        any,
      ][]) {
        for (const [sessionId, session] of Object.entries(
          room.sessions ?? {},
        ) as [string, any][]) {
          if (keys.length >= 50000)
            throw new Error('Backup exceeds the recovery limit.');
          const encrypted = session.session_data;
          const clear = JSON.parse(
            privateKey.decryptV1(
              encrypted.ephemeral,
              encrypted.mac,
              encrypted.ciphertext,
            ),
          );
          keys.push({ ...clear, room_id: roomId, session_id: sessionId });
        }
      }
      await this.machine.importRoomKeys(JSON.stringify(keys), () => {});
      return this.machine.exportRoomKeys(() => true);
    } finally {
      key.fill(0);
    }
  }
  async decrypt(roomId: string, event: unknown) {
    const room = new RoomId(roomId);
    const settings = new DecryptionSettings(TrustRequirement.Untrusted);
    try {
      const result = await this.machine.decryptRoomEvent(
        JSON.stringify(event),
        room,
        settings,
      );
      try {
        return JSON.parse(result.event);
      } finally {
        result.free();
      }
    } finally {
      room.free();
      settings.free();
    }
  }
  close() {
    this.machine.close();
  }
}
