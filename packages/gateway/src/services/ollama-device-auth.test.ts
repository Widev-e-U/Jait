import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } from "./ollama-device-auth.js";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));

// Encode a disposable key in the OpenSSH wire format independently of the parser.
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}

beforeEach(() => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Ollama device authentication", () => {
  it("imports an OpenSSH key and produces a verifiable request signature", () => {
    const key = parseOllamaDeviceKey(fixture());
    expect(createPublicKey(key).export({ format: "jwk" })).toEqual(publicKey.export({ format: "jwk" }));
    const [pub, signature] = signOllamaRequest(key, "GET", "/api/usage", "123").split(":");
    expect(Buffer.from(pub, "base64").subarray(4, 15).toString()).toBe("ssh-ed25519");
    expect(verify(null, Buffer.from("GET,/api/usage?ts=123"), publicKey, Buffer.from(signature, "base64"))).toBe(true);
    expect(verify(null, Buffer.from("GET,/api/me?ts=123"), publicKey, Buffer.from(signature, "base64"))).toBe(false);
  });

  it.each(["invalid", fixture("aes256-ctr"), fixture().slice(0, 100)])("rejects malformed or encrypted keys", (pem) => {
    expect(() => parseOllamaDeviceKey(pem)).toThrow("Unsupported Ollama device key");
  });

  it.each(["http://localhost:11434", "http://127.0.0.1:11434/", "http://[::1]:11434"])("recognizes local daemon %s", (url) => {
    expect(isLocalOllamaUrl(url)).toBe(true);
  });
  it.each(["http://192.168.1.2:11434", "https://ollama.com", "http://localhost.evil.test", "http://localhost/proxy", "http://user@localhost", "http://localhost?target=remote", "file:///", "invalid"])("rejects nonlocal or ambiguous target %s", (url) => {
    expect(isLocalOllamaUrl(url)).toBe(false);
  });

  it("falls back on a local 404, verifies the account, then loads signed usage", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(json({ Email: account.email, Name: account.name, Plan: "pro" }))
      .mockResolvedValueOnce(json(usage));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSignedInOllamaUsage("http://localhost:11434", account)).resolves.toEqual(usage);
    expect(readFile).toHaveBeenCalledWith("/test/ollama-key", "utf8");
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
    for (const [url, init] of fetchMock.mock.calls.slice(1)) {
      const parsed = new URL(url);
      expect(parsed.origin).toBe("https://ollama.com");
      expect(init.redirect).toBe("error");
      const signature = init.headers.Authorization.split(":")[1];
      expect(verify(null, Buffer.from(`${init.method},${parsed.pathname}${parsed.search}`), publicKey, Buffer.from(signature, "base64"))).toBe(true);
    }
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toBe("/api/me");
    expect(new URL(fetchMock.mock.calls[2][0]).pathname).toBe("/api/usage");
  });

  it("uses an existing daemon usage endpoint without opening credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(usage)));
    await expect(fetchSignedInOllamaUsage("http://localhost:11434", account)).resolves.toEqual(usage);
    expect(readFile).not.toHaveBeenCalled();
  });

  it.each([["http://remote:11434", 404], ["http://localhost:11434", 401], ["http://localhost:11434", 500]])("does not read credentials for %s status %s", async (url, status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("error", { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSignedInOllamaUsage(url, account)).rejects.toMatchObject({ status });
    expect(readFile).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([{ Email: "someone@example.com", Name: account.name }, {}, null])("rejects an unverified account before fetching usage", async (body) => {
    const fetchMock = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchOllamaDeviceUsage(account, privateKey)).rejects.toThrow("different or unverified account");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts lowercase account fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(account)).mockResolvedValueOnce(json(usage)));
    await expect(fetchOllamaDeviceUsage(account, privateKey)).resolves.toEqual(usage);
  });

  it("rejects malformed quota responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(account)).mockResolvedValueOnce(json({ limits: {} })));
    await expect(fetchOllamaDeviceUsage(account, privateKey)).rejects.toThrow("unexpected usage response");
  });

  it("reports unreadable keys without exposing filesystem errors or sending a request", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("EACCES private path"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchOllamaDeviceUsage(account)).rejects.toThrow("Ollama device key is not readable by Jait");
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves authentication failure status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 401 })));
    await expect(fetchOllamaDeviceUsage(account, privateKey)).rejects.toMatchObject({ status: 401 });
  });
});
