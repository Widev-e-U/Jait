/**
 * Polyfill globalThis.crypto for Node.js < 19.
 *
 * jose v6 and other Web Crypto API consumers reference the bare `crypto` global.
 * This module MUST be imported before any other module that depends on it.
 * Because ES module imports are hoisted, placing this as the first import in
 * index.ts ensures it runs before transitive dependencies resolve.
 */
import { webcrypto } from "node:crypto";

if (typeof globalThis.crypto === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}
