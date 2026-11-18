import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "node:https";
import { loadMailImage } from "./remote-images.js";

vi.mock("node:https", () => ({ request: vi.fn() }));
vi.mock("./connection.js", () => ({ publicMailServer: vi.fn(async config => ({ ...config, host: "1.1.1.1", servername: config.host })) }));
let status = 200;
let type = "image/png";
let payload = Buffer.from("image-bytes");
beforeEach(() => {
  status = 200; type = "image/png"; payload = Buffer.from("image-bytes");
  vi.mocked(request).mockReset();
  vi.mocked(request).mockImplementation((options: unknown, callback: unknown) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
    req.destroy = error => { req.emit("error", error); req.emit("close"); };
    req.end = () => {
      const res = Readable.from([payload]) as Readable & { statusCode: number; headers: Record<string, string> };
      res.statusCode = status; res.headers = { "content-type": type };
      res.on("close", () => req.emit("close"));
      (callback as (response: unknown) => void)(res);
    };
    return req as never;
  });
});
afterEach(() => vi.clearAllMocks());
describe("external mail images", () => {
  it("pins public TLS and fetches without cookies or authorization", async () => {
    const result = await loadMailImage("https://images.example.com/banner.png?size=2");
    expect(result).toBe("data:image/png;base64," + payload.toString("base64"));
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ hostname: "1.1.1.1", servername: "images.example.com", path: "/banner.png?size=2", rejectUnauthorized: true }), expect.any(Function));
    const options = vi.mocked(request).mock.calls[0][0] as { headers: Record<string, unknown> };
    expect(options.headers).not.toHaveProperty("Cookie");
    expect(options.headers).not.toHaveProperty("Authorization");
  });
  it.each(["http://example.com/a", "https://name:secret@example.com/a", "https://example.com:8443/a"])("rejects unsupported URLs before requesting them", async url => {
    await expect(loadMailImage(url)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("does not follow redirects", async () => {
    status = 302;
    await expect(loadMailImage("https://example.com/a")).rejects.toThrow(/unavailable/);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("rejects SVG/HTML and bounds image size", async () => {
    type = "image/svg+xml";
    await expect(loadMailImage("https://example.com/a")).rejects.toThrow(/unavailable/);
    type = "image/png"; payload = Buffer.alloc(1024 * 1024 + 1);
    await expect(loadMailImage("https://example.com/a")).rejects.toThrow(/too large/);
  });
});
