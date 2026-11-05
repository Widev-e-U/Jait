/**
 * UUIDv7 — time-sortable unique identifiers.
 *
 * Format: 48-bit ms timestamp + 4-bit version (7) + 12-bit rand + 2-bit variant + 62-bit rand
 * Total: 128 bits, lexicographically sortable by creation time.
 *
 * The 12 bits in bytes 6-7 act as a per-millisecond counter, so ids created inside the same
 * millisecond still sort in creation order (RFC 9562 §6.2 monotonicity guidance). This matters
 * beyond cosmetics: delivery settlement, goal verification and room history order rows by id and
 * compare ids (`id > message.id`), so id order has to equal creation order. With a fully random
 * rand_a field, roughly half of all same-millisecond pairs came back reversed — which is what
 * made a blocker that was resolved by a same-turn verification settle as `failed`.
 *
 * When the counter is exhausted inside one millisecond the timestamp is advanced by one
 * millisecond (borrowed from the future); a clock rewind smaller than {@link REWIND_TOLERANCE_MS}
 * keeps the previous timestamp so ids never go backwards. Ordering is guaranteed per process;
 * ids from different processes in the same millisecond are still unordered, as before.
 *
 * Uses globalThis.crypto (available natively in Bun and Node 19+).
 */

const COUNTER_MAX = 0xfff;
/** Clock rewinds at or below this many ms keep the previous timestamp instead of re-anchoring. */
const REWIND_TOLERANCE_MS = 1_000;

let lastMs = 0;
let counter = 0;

/** Advance the (timestamp, counter) pair so that consecutive ids order by creation order. */
function nextStamp(now: number, seed: number): void {
  if (now > lastMs || lastMs - now > REWIND_TOLERANCE_MS) {
    // A new millisecond on the wall clock, or a rewind too large to absorb: re-anchor.
    lastMs = now;
    counter = seed;
    return;
  }
  if (counter >= COUNTER_MAX) {
    // Counter exhausted inside one millisecond: borrow the next millisecond and restart.
    lastMs += 1;
    counter = 0;
    return;
  }
  counter += 1;
}

export function uuidv7(): string {
  const now = Math.max(0, Date.now());
  const bytes = new Uint8Array(16);

  // Fill with random bytes first
  crypto.getRandomValues(bytes);

  // Counter seed: keeps rand_a unpredictable for the first id of each millisecond.
  nextStamp(now, ((bytes[6]! & 0x0f) << 8) | bytes[7]!);

  // Timestamp: first 48 bits (6 bytes). Divisions by powers of two are exact, and masking keeps
  // the low 8 bits of each quotient even where it exceeds 32 bits.
  bytes[0] = Math.floor(lastMs / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(lastMs / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(lastMs / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(lastMs / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(lastMs / 2 ** 8) & 0xff;
  bytes[5] = lastMs & 0xff;

  // Version 7: set bits 48-51 to 0111, then the counter in bits 52-63
  bytes[6] = ((counter >> 8) & 0x0f) | 0x70;
  bytes[7] = counter & 0xff;

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
