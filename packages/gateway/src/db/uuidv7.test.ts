import { afterEach, describe, expect, it, vi } from "vitest";
import { newActionId, uuidv7 } from "./uuidv7.js";

// RFC 9562 UUIDv7 layout:
// 48 bits unix-ms timestamp | 4 bits version (7) | 12 bits rand_a | 2 bits variant (10) | 62 bits rand_b
const UUIDV7_HEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Decode the embedded 48-bit unix-ms timestamp from a UUIDv7 string. */
function embeddedTimestampMs(uuid: string): bigint {
  const [timeHigh, timeLow] = uuid.split("-");
  return BigInt(`0x${timeHigh}${timeLow}`);
}

/**
 * Collects ordering violations without printing thousands of ids: the first few
 * examples are enough to diagnose a generator that is not monotonic.
 */
function orderingViolations(count: number, generate: () => string) {
  let previous = generate();
  const examples: string[] = [];
  let reversals = 0;
  let duplicates = 0;
  const seen = new Set<string>([previous]);
  for (let index = 0; index < count; index += 1) {
    const next = generate();
    if (next <= previous) {
      reversals += 1;
      if (examples.length < 3) examples.push(`${previous} -> ${next}`);
    }
    if (seen.has(next)) duplicates += 1;
    seen.add(next);
    previous = next;
  }
  return { reversals, duplicates, examples };
}

describe("uuidv7", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns RFC-compliant ids", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(uuidv7()).toMatch(UUIDV7_HEX);
    }
  });

  it("embeds the current unix-ms timestamp", () => {
    const now = new Date("2024-06-15T12:34:56.789Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(embeddedTimestampMs(uuidv7())).toBe(BigInt(now));
  });

  // Delivery routing, goal verification and room history all order rows by id and compare
  // ids with `id > message.id`, so id order has to equal creation order — including for
  // ids created inside a single millisecond.
  it("is strictly increasing across calls made within the same millisecond", () => {
    expect(orderingViolations(20_000, uuidv7)).toEqual({ reversals: 0, duplicates: 0, examples: [] });
  });

  it("keeps ids ordered and unique when one millisecond overflows the 12-bit counter", () => {
    const now = new Date("2024-06-15T12:34:56.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const violations = orderingViolations(5_000, uuidv7);
    expect(violations).toEqual({ reversals: 0, duplicates: 0, examples: [] });
    // A frozen clock cannot advance the timestamp, so ids may borrow at most the
    // milliseconds the counter needs; the wall-clock contract is preserved elsewhere.
    for (let index = 0; index < 100; index += 1) {
      const stamp = embeddedTimestampMs(uuidv7());
      expect(stamp).toBeGreaterThanOrEqual(BigInt(now));
      expect(stamp).toBeLessThanOrEqual(BigInt(now + 10));
    }
  });

  it("produces unique values across many calls", () => {
    const seen = new Set<string>();
    const count = 20_000;
    for (let index = 0; index < count; index += 1) seen.add(uuidv7());
    expect(seen.size).toBe(count);
  });

  it("stays monotonic when the clock moves backwards by less than the rewind tolerance", () => {
    const now = new Date("2024-06-15T12:34:56.789Z").getTime();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const before = uuidv7();
    clock.mockReturnValue(now - 500);
    expect(uuidv7() > before).toBe(true);
  });

  it("re-anchors to the wall clock after a clock rewind larger than the tolerance", () => {
    const now = new Date("2024-06-15T12:34:56.789Z").getTime();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    uuidv7();
    clock.mockReturnValue(now - 60_000);
    expect(embeddedTimestampMs(uuidv7())).toBe(BigInt(now - 60_000));
  });

  it("does not throw for pre-epoch clocks and keeps ids ordered", () => {
    vi.spyOn(Date, "now").mockReturnValue(-1_000);
    const first = uuidv7();
    expect(first).toMatch(UUIDV7_HEX);
    expect(uuidv7() > first).toBe(true);
  });
});

describe("newActionId", () => {
  it("returns an ordered, unique UUIDv7", () => {
    const first = newActionId();
    expect(first).toMatch(UUIDV7_HEX);
    expect(newActionId() > first).toBe(true);
  });
});
