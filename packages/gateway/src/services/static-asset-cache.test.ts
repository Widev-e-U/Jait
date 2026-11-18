import Fastify from "fastify";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { expect, it } from "vitest";
import { registerStaticAssetCache } from "./static-asset-cache.js";

it("serves an immutable asset from cache after its backing file disappears", async () => {
  const output = resolve(import.meta.dirname, "../../../../.jait/artifacts/static-cache-tests");
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(join(output, "cache-"));
  const assets = join(directory, "assets");
  await mkdir(assets);
  const file = join(assets, "app-abcdefgh.js");
  await writeFile(file, "cached asset");
  const app = Fastify();
  registerStaticAssetCache(app, directory);
  app.get("/*", async () => "fallback");
  try {
    const first = await app.inject({ url: "/assets/app-abcdefgh.js" });
    expect(first.body).toBe("cached asset");
    expect(first.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    await rm(file);
    const second = await app.inject({ url: "/assets/app-abcdefgh.js?version=1" });
    expect(second.body).toBe("cached asset");
    expect((await app.inject({ url: "/assets/missing-abcdefgh.js" })).body).toBe("fallback");
    expect((await app.inject({ url: "/index.html" })).body).toBe("fallback");
    expect((await app.inject({ url: "/assets/app-abcdefgh.js", headers: { range: "bytes=0-1" } })).body).toBe("fallback");
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
