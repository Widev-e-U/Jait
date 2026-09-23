import type { FastifyInstance } from "fastify";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_FILE_BYTES = 100 * 1024;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 256;
const HASHED_ASSET = /^\/assets\/([A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(js|css|svg|png|woff2))$/;
const CONTENT_TYPES: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  woff2: "font/woff2",
};

/** Cache only immutable Vite assets; dynamic files stay with @fastify/static. */
export function registerStaticAssetCache(app: FastifyInstance, webDir: string): void {
  const cache = new Map<string, Buffer | null>();
  let cachedBytes = 0;

  function remember(name: string, body: Buffer | null): void {
    const previous = cache.get(name);
    if (previous) cachedBytes -= previous.byteLength;
    cache.delete(name);
    cache.set(name, body);
    if (body) cachedBytes += body.byteLength;
    while (cache.size > MAX_ENTRIES || cachedBytes > MAX_CACHE_BYTES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      const removed = cache.get(oldest);
      cache.delete(oldest);
      if (removed) cachedBytes -= removed.byteLength;
    }
  }

  async function getAsset(name: string): Promise<Buffer | null> {
    const hit = cache.get(name);
    if (hit !== undefined) {
      cache.delete(name);
      cache.set(name, hit);
      return hit;
    }

    const path = join(webDir, "assets", name);
    let body: Buffer;
    try {
      const info = await lstat(path);
      if (!info.isFile()) return null;
      if (info.size > MAX_FILE_BYTES) {
        remember(name, null);
        return null;
      }
      body = await readFile(path);
      if (body.byteLength > MAX_FILE_BYTES) return null;
    } catch {
      return null;
    }

    remember(name, body);
    return body;
  }

  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "GET" || request.headers.range || request.headers["if-none-match"] || request.headers["if-modified-since"]) return;
    const pathname = request.url.split("?", 1)[0] ?? "";
    const match = HASHED_ASSET.exec(pathname);
    if (!match) return;
    const body = await getAsset(match[1]!);
    if (!body) return;
    return reply
      .type(CONTENT_TYPES[match[2]!]!)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .send(body);
  });
}
