import { describe, expect, it, vi, afterEach } from "vitest";
import { uuidv7, newActionId } from "./uuidv7.js";

// RFC 9562 / draft RFC 9562 UUIDv7 layout:
// 48 bits Unix ms timestamp | 4 bits version (7) | 12 bits rand | 2 bits variant (10) | 62 bits rand
const UUIDV7_HEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Decode the embedded 48-bit ms timestamp from a UUIDv7 string. */
function embeddedTimestampMs(uuid: string): bigint {
  const [a, b] = uuid.split("-");
  return BigInt(`0x${a}${b}`);
}

describe("uuidv7", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns RFC-compliant UUID formatting", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(uuidv7()).toMatch(UUIDV7_HEX);
    }
  });

  it("sets the version nibble to 7", () => {
    for (let i = 0; i < 100; i += 1) {
      const thirdGroup = uuidv7().split("-")[2]!;
      expect(thirdGroup[0]).toBe("7");
    }
  });

  it("sets the variant bits to 10 (RFC 4122)", () => {
    for (let i = 0; i < 100; i += 1) {
      const fourthGroup = uuidv7().split("-")[3]!;
      // The high two bits of the first hex char of group 4 must be `10` => 8,9,a,b
      expect("89ab").toContain(fourthGroup[0]!);
    }
  });

  it("embeds the current unix-ms timestamp in the first 48 bits", () => {
    const now = new Date("2024-06-15T12:34:56.789Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const uuid = uuidv7();
    expect(embeddedTimestampMs(uuid)).toBe(BigInt(now));
  });

  it("is lexicographically sortable by creation time", () => {
    const now = new Date("2024-06-15T12:34:56.000Z").getTime();

    // Same timestamp: full strings must still be comparable, timestamp prefix equal.
    vi.spyOn(Date, "now").mockReturnValue(now);
    let previous = uuidv7();
    for (let i = 0; i < 50; i += 1) {
      const next = uuidv7();
      expect(embeddedTimestampMs(next)).toBe(BigInt(now));
      expect(next).not.toBe(previous);
      previous = next;
    }

    // Later timestamp must sort strictly after an earlier one.
    const early = embeddedTimestampMs(uuidv7());
    vi.spyOn(Date, "now").mockReturnValue(now + 5_000); // +5 seconds
    const later = embeddedTimestampMs(uuidv7());
    expect(early).toBeLessThan(later);
  });

  it("produces unique values across many calls", () => {
    const seen = new Set<string>();
    const count = 20_000;
    for (let i = 0; i < count; i += 1) {
      seen.add(uuidv7());
    }
    expect(seen.size).toBe(count);
  });

  it("survives Date.now returning a negative (pre-epoch) value without throwing", () => {
    vi.spyOn(Date, "now").mockReturnValue(-1_000);
    expect(() => uuidv7()).not.toThrow();
    expect(uuidv7()).toMatch(UUIDV7_HEX);
  });
});

describe("newActionId", () => {
  it("returns a valid, non-empty UUIDv7", () => {
    expect(newActionId()).toMatch(UUIDV7_HEX);
    expect(newActionId()).not.toBe(newActionId());
  });
});
