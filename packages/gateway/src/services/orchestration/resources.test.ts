import { describe, expect, it } from "vitest";
import { claimsConflict, isGlobKey, keysOverlap, normalizeResourceKey, pathIsProtected } from "./resources.js";

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

  it("does not let a protected path create a conflict between tasks", () => {
    const guarded = { reads: [], writes: ["src"], protects: ["src/tests"] };
    const otherTests = { reads: [], writes: ["docs"], protects: ["docs/api"] };
    expect(claimsConflict(guarded, otherTests)).toBe(false);
    expect(claimsConflict(guarded, { reads: [], writes: ["src/tests"] })).toBe(true);
  });
});

describe("pathIsProtected", () => {
  it("protects a path and everything below it, by whole segment", () => {
    const protects = ["tests", "src/auth/login.test.ts"];
    expect(pathIsProtected("tests", protects)).toBe(true);
    expect(pathIsProtected("tests/unit/a.ts", protects)).toBe(true);
    expect(pathIsProtected("src/auth/login.test.ts", protects)).toBe(true);
    expect(pathIsProtected("testsuite/a.ts", protects)).toBe(false);
    expect(pathIsProtected("src/auth/login.ts", protects)).toBe(false);
    expect(pathIsProtected("src/auth", protects)).toBe(false);
  });

  it("matches * and ? inside one segment, and ** across segments", () => {
    expect(pathIsProtected("a.test.ts", ["**/*.test.ts"])).toBe(true);
    expect(pathIsProtected("src/a/b.test.ts", ["**/*.test.ts"])).toBe(true);
    expect(pathIsProtected("src/a/b.ts", ["**/*.test.ts"])).toBe(false);
    expect(pathIsProtected("src/b.test.ts", ["src/*.test.ts"])).toBe(true);
    expect(pathIsProtected("src/a/b.test.ts", ["src/*.test.ts"])).toBe(false);
    expect(pathIsProtected("src/a1.ts", ["src/a?.ts"])).toBe(true);
    expect(pathIsProtected("src/a12.ts", ["src/a?.ts"])).toBe(false);
    expect(pathIsProtected("pkg/api/__tests__/x.ts", ["**/__tests__"])).toBe(true);
    expect(pathIsProtected("pkg/api/tests/x.ts", ["**/__tests__"])).toBe(false);
  });

  it("protects what lies below a directory that a pattern matches", () => {
    expect(pathIsProtected("src/x.test.ts/inner.txt", ["**/*.test.ts"])).toBe(true);
    expect(pathIsProtected("src/lib", ["src/**"])).toBe(true);
    expect(pathIsProtected("src", ["src/**"])).toBe(true);
  });

  it("protects the whole project for '.', and nothing for no entries or named resources", () => {
    expect(pathIsProtected("any/file.txt", ["."])).toBe(true);
    expect(pathIsProtected(".", ["."])).toBe(true);
    expect(pathIsProtected("any/file.txt", [])).toBe(false);
    expect(pathIsProtected("any/file.txt", undefined)).toBe(false);
    expect(pathIsProtected("name:db", ["name:db"])).toBe(false);
  });

  it("is case sensitive, like the git paths it is checked against", () => {
    expect(pathIsProtected("Tests/a.ts", ["tests"])).toBe(false);
  });

  it("stays fast on patterns built to make a backtracking matcher blow up", () => {
    const started = Date.now();
    expect(pathIsProtected("a".repeat(200), ["*a*a*a*a*a*a*a*a*a*a*b"])).toBe(false);
    expect(pathIsProtected(Array.from({ length: 40 }, () => "a").join("/"), ["**/**/**/**/**/**/b"])).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("isGlobKey", () => {
  it("tells a glob from a literal path", () => {
    expect(isGlobKey("**/*.test.ts")).toBe(true);
    expect(isGlobKey("src/a?.ts")).toBe(true);
    expect(isGlobKey("src/tests")).toBe(false);
  });
});
