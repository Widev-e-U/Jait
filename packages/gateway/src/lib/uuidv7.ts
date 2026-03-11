import { webcrypto } from "node:crypto";

interface WebCrypto {
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
}

const _crypto = (globalThis.crypto as WebCrypto) ?? (webcrypto as unknown as WebCrypto);

/**
 * UUIDv7 — time-sortable unique identifiers.
 *
 * Format: 48-bit ms timestamp + 4-bit version (7) + 12-bit rand + 2-bit variant + 62-bit rand
 * Total: 128 bits, lexicographically sortable by creation time.
 */
export function uuidv7(): string {
  const now = Date.now();
  const bytes = new Uint8Array(16);

  // Fill with random bytes first
  _crypto.getRandomValues(bytes);

  // Timestamp: first 48 bits (6 bytes)
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  // Version 7: set bits 48-51 to 0111
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;

  // Variant: set bits 64-65 to 10
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  // Convert to hex string
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Generate a new action ID (UUIDv7). */
export function newActionId(): string {
  return uuidv7();
}
