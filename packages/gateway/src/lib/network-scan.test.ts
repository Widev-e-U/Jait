import { describe, expect, it } from "vitest";
import {
  buildSubnetCandidates,
  isValidIpv4,
  mergeEntries,
  normalizeIps,
  normalizeSubnetPrefix,
  parseArpTable,
} from "./network-scan.js";

describe("parseArpTable", () => {
  it("parses the standard Linux `arp -a` parenthesized format", () => {
    const output = [
      "? (192.168.1.1) at 00:11:22:33:44:55 [ether] on eth0",
      "? (192.168.1.2) at aa:bb:cc:dd:ee:ff [ether] on eth0",
      "? (192.168.1.3) at <incomplete> on eth0",
    ].join("\n");

    expect(parseArpTable(output)).toEqual([
      { ip: "192.168.1.1", mac: "00:11:22:33:44:55", responsive: true },
      { ip: "192.168.1.2", mac: "aa:bb:cc:dd:ee:ff", responsive: true },
    ]);
  });

  it("parses macOS single-digit MAC groups and normalizes them", () => {
    const output = "? (192.168.1.3) at 0:11:22:33:44:55 on en0 ifscope [ethernet]";

    expect(parseArpTable(output)).toEqual([
      { ip: "192.168.1.3", mac: "00:11:22:33:44:55", responsive: true },
    ]);
  });

  it("parses the unparenthesized format and hyphen-separated MACs", () => {
    const output = "192.168.1.4 at 00-11-22-33-44-55 [ether] on eth0";

    expect(parseArpTable(output)).toEqual([
      { ip: "192.168.1.4", mac: "00:11:22:33:44:55", responsive: true },
    ]);
  });

  it("skips broadcast, zero, and multicast MACs", () => {
    const output = [
      "? (192.168.1.10) at ff:ff:ff:ff:ff:ff [ether] on eth0",
      "? (192.168.1.11) at 00:00:00:00:00:00 [ether] on eth0",
      "? (192.168.1.12) at 01:00:5e:00:00:01 [ether] on eth0",
      "? (192.168.1.13) at 02:11:22:33:44:55 [ether] on eth0",
    ].join("\n");

    expect(parseArpTable(output)).toEqual([
      { ip: "192.168.1.13", mac: "02:11:22:33:44:55", responsive: true },
    ]);
  });

  it("returns an empty array for output with no matching lines", () => {
    expect(parseArpTable("")).toEqual([]);
    expect(parseArpTable("no arp entries here\njust text")).toEqual([]);
  });
});

describe("normalizeSubnetPrefix", () => {
  it("extracts the prefix from a /24 CIDR", () => {
    expect(normalizeSubnetPrefix("192.168.1.0/24")).toBe("192.168.1");
  });

  it("extracts the prefix from a full IP", () => {
    expect(normalizeSubnetPrefix("192.168.1.42")).toBe("192.168.1");
  });

  it("accepts a bare prefix and trims whitespace", () => {
    expect(normalizeSubnetPrefix("  10.0.0  ")).toBe("10.0.0");
  });

  it("rejects out-of-range octets (reliability guard)", () => {
    expect(normalizeSubnetPrefix("256.1.1.0/24")).toBeNull();
    expect(normalizeSubnetPrefix("192.168.999.0/24")).toBeNull();
    expect(normalizeSubnetPrefix("999.999.999.0/24")).toBeNull();
    expect(normalizeSubnetPrefix("256.1.1.42")).toBeNull();
    expect(normalizeSubnetPrefix("256.1.1")).toBeNull();
  });

  it("rejects invalid values", () => {
    expect(normalizeSubnetPrefix("192.168.1.0/16")).toBeNull();
    expect(normalizeSubnetPrefix("192.168.1.0/24/24")).toBeNull();
    expect(normalizeSubnetPrefix("not-an-ip")).toBeNull();
    expect(normalizeSubnetPrefix("")).toBeNull();
  });
});

describe("isValidIpv4", () => {
  it("accepts valid IPv4 addresses", () => {
    expect(isValidIpv4("192.168.1.1")).toBe(true);
    expect(isValidIpv4("0.0.0.0")).toBe(true);
    expect(isValidIpv4("255.255.255.255")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidIpv4("192.168.1")).toBe(false);
    expect(isValidIpv4("192.168.1.1.1")).toBe(false);
    expect(isValidIpv4("256.1.1.1")).toBe(false);
    expect(isValidIpv4("1.1.1.999")).toBe(false);
    expect(isValidIpv4("192.168.1.abc")).toBe(false);
    expect(isValidIpv4("192.168.1.1 ")).toBe(false);
    expect(isValidIpv4("")).toBe(false);
  });
});

describe("normalizeIps", () => {
  it("trims, dedupes, and filters invalid IPs", () => {
    expect(normalizeIps([" 192.168.1.1 ", "192.168.1.1", "10.0.0.1", "bad", "999.1.1.1"])).toEqual([
      "192.168.1.1",
      "10.0.0.1",
    ]);
  });

  it("returns an empty array for empty or undefined input", () => {
    expect(normalizeIps(undefined)).toEqual([]);
    expect(normalizeIps([])).toEqual([]);
  });
});

describe("mergeEntries", () => {
  it("merges entries by IP, keeping the first MAC and OR-ing responsiveness", () => {
    const entries = [
      { ip: "192.168.1.1", mac: "00:11:22:33:44:55", responsive: true },
      { ip: "192.168.1.1", mac: null, responsive: false },
      { ip: "192.168.1.2", mac: null, responsive: false },
    ];

    expect(mergeEntries(entries)).toEqual([
      { ip: "192.168.1.1", mac: "00:11:22:33:44:55", responsive: true },
      { ip: "192.168.1.2", mac: null, responsive: false },
    ]);
  });

  it("fills in a missing MAC from a later entry", () => {
    const entries = [
      { ip: "192.168.1.1", mac: null, responsive: true },
      { ip: "192.168.1.1", mac: "00:11:22:33:44:55", responsive: false },
    ];

    expect(mergeEntries(entries)).toEqual([
      { ip: "192.168.1.1", mac: "00:11:22:33:44:55", responsive: true },
    ]);
  });
});

describe("buildSubnetCandidates", () => {
  it("generates host addresses 1..254 for each subnet", () => {
    const candidates = buildSubnetCandidates(["192.168.1"]);
    expect(candidates).toHaveLength(254);
    expect(candidates[0]).toBe("192.168.1.1");
    expect(candidates[253]).toBe("192.168.1.254");
  });

  it("handles multiple subnets", () => {
    const candidates = buildSubnetCandidates(["10.0.0", "10.0.1"]);
    expect(candidates).toHaveLength(508);
    expect(candidates[0]).toBe("10.0.0.1");
    expect(candidates[253]).toBe("10.0.0.254");
    expect(candidates[254]).toBe("10.0.1.1");
    expect(candidates[507]).toBe("10.0.1.254");
  });
});
