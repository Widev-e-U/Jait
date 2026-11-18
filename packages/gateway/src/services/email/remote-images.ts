import { request } from "node:https";
import { publicMailServer } from "./connection.js";

const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

/** Public HTTPS only, pinned DNS, no redirects, cookies, credentials or SVG. */
export async function loadMailImage(
  raw: string,
  transport: { request: typeof request; publicMailServer: typeof publicMailServer } = { request, publicMailServer },
): Promise<string> {
  const url = new URL(raw);
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || raw.length > 4096) throw new Error("Unsupported image URL");
  const pinned = await transport.publicMailServer({ host: url.hostname, port: 443, secure: true, user: "unused", password: "unused" });
  return new Promise((resolve, reject) => {
    const req = transport.request({ hostname: pinned.host, servername: pinned.servername, port: 443, path: url.pathname + url.search,
      method: "GET", headers: { Host: url.host, Accept: "image/png,image/jpeg,image/gif,image/webp,image/avif" }, rejectUnauthorized: true }, res => {
      const type = String(res.headers["content-type"] || "").split(";")[0]!.toLowerCase();
      if (res.statusCode !== 200 || !TYPES.has(type)) { res.destroy(); reject(new Error("Image unavailable")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1024 * 1024) { res.destroy(new Error("Image too large")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(`data:${type};base64,${Buffer.concat(chunks).toString("base64")}`));
      res.on("error", reject);
    });
    const timeout = setTimeout(() => req.destroy(new Error("Image request timed out")), 6000);
    req.on("close", () => clearTimeout(timeout));
    req.on("error", reject);
    req.end();
  });
}
