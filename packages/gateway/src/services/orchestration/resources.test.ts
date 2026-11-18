import { describe, expect, it } from "vitest";
import { claimsConflict, keysOverlap, normalizeResourceKey } from "./resources.js";

describe("normalizeResourceKey", () => {
  it("canonicalizes project-relative paths and named resources", () => {
    expect(normalizeResourceKey("./src/lib.rs/")).toBe("src/lib.rs");
    expect(normalizeResourceKey("src//a")).toBe("src/a");
    expect(normalizeResourceKey(".")).toBe(".");
    expect(normalizeResourceKey("name:build-lock")).toBe("name:build-lock");
  });

  it("rejects absolute, traversing, drive-prefixed and malformed keys", () => {
    for (const bad of ["", "   ", "/etc/passwd", "../outside", "src/../../x", "C:/x", "a\\b", "name:bad name", "name:", 42]) {
      expect(normalizeResourceKey(bad)).toBeNull();
    }
  });
});

describe("keysOverlap and claimsConflict", () => {
  it("treats a directory and its children as overlapping, but not sibling prefixes", () => {
    expect(keysOverlap("src", "src/lib.rs")).toBe(true);
    expect(keysOverlap("src", "srcx")).toBe(false);
    expect(keysOverlap(".", "docs/readme.md")).toBe(true);
  });

  it("matches named resources exactly", () => {
    expect(keysOverlap("name:lock", "name:lock")).toBe(true);
    expect(keysOverlap("name:lock", "name:other")).toBe(false);
    expect(keysOverlap("name:lock", "src")).toBe(false);
  });

  it("conflicts on write/write and write/read, never on read/read", () => {
    const readDocs = { reads: ["docs"], writes: [] };
    const readDocsAgain = { reads: ["docs"], writes: [] };
    const writeSrc = { reads: [], writes: ["src"] };
    const writeSrcLib = { reads: [], writes: ["src/lib.rs"] };
    const readSrc = { reads: ["src"], writes: [] };
    expect(claimsConflict(readDocs, readDocsAgain)).toBe(false);
    expect(claimsConflict(writeSrc, writeSrcLib)).toBe(true);
    expect(claimsConflict(readSrc, writeSrcLib)).toBe(true);
    expect(claimsConflict(readDocs, writeSrc)).toBe(false);
  });
});
