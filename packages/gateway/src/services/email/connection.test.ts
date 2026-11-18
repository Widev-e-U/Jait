import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { connectMailboxSchema, discoverMailSettings, publicMailServer } from "./connection.js";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
const server = { host: "mail.example.com", port: 993, secure: true, user: "user@example.com", password: "test-password" };
beforeEach(() => { vi.mocked(lookup).mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("mail connection boundary", () => {
  it.each(["127.0.0.1", "::1", "169.254.169.254", "localhost"])("blocks private targets before DNS: %s", async host => {
    await expect(publicMailServer({ ...server, host })).rejects.toThrow(/private/);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("rejects a DNS result containing even one private address", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "1.1.1.1", family: 4 }, { address: "10.0.0.1", family: 4 }] as never);
    await expect(publicMailServer(server)).rejects.toThrow(/private/);
  });
  it("pins the checked public address and preserves the TLS server name", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "1.1.1.1", family: 4 }] as never);
    const pinned = await publicMailServer(server);
    expect(pinned.host).toBe("1.1.1.1");
    expect(pinned.servername).toBe("mail.example.com");
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it("bounds DNS resolution time", async () => {
    vi.useFakeTimers();
    vi.mocked(lookup).mockReturnValue(new Promise(() => {}) as never);
    const check = expect(publicMailServer(server)).rejects.toThrow(/DNS timed out/);
    await vi.advanceTimersByTimeAsync(8001);
    await check;
  });
  it("rejects malformed hosts, ports and injected usernames", () => {
    for (const imap of [{ ...server, host: "mail.example.com/path" }, { ...server, port: 0 }, { ...server, user: "a\r\nAUTH evil" }]) {
      expect(connectMailboxSchema.safeParse({ email: "user@example.com", imap, smtp: server }).success).toBe(false);
    }
  });
});
describe("provider discovery", () => {
  it("sends only the domain to a fixed registry and accepts encrypted settings", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(`<clientConfig><emailProvider><displayName>Example Mail</displayName><incomingServer type="imap"><hostname>imap.example.com</hostname><port>993</port><socketType>SSL</socketType><username>%EMAILADDRESS%</username></incomingServer><outgoingServer type="smtp"><hostname>smtp.example.com</hostname><port>587</port><socketType>STARTTLS</socketType><username>%EMAILLOCALPART%</username></outgoingServer></emailProvider></clientConfig>`));
    vi.stubGlobal("fetch", fetch);
    const result = await discoverMailSettings("person@example.com");
    expect(fetch.mock.calls[0][0]).toBe("https://autoconfig.thunderbird.net/v1.1/example.com");
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error" });
    expect(result.imap).toMatchObject({ host: "imap.example.com", port: 993, secure: true, user: "person@example.com" });
    expect(result.smtp).toMatchObject({ port: 587, secure: false, user: "person" });
    expect(JSON.stringify(result)).not.toContain("password");
  });
  it.each(["<!DOCTYPE x><x/>", "<!ENTITY x 'oops'>", "x".repeat(65_537), "<clientConfig/>"])("rejects unsafe or malformed provider responses", async xml => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(xml)));
    await expect(discoverMailSettings("person@example.com")).rejects.toThrow();
  });
});
