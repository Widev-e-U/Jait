import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailClient } from "./gmail.js";
import { OutlookClient } from "./outlook.js";
import { embedInlineImages, inlineImageData } from "./inline-images.js";
afterEach(() => vi.unstubAllGlobals());
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPt0AAAAASUVORK5CYII=";
describe("provider mail bodies", () => {
  it("hydrates Gmail CID images without hiding the rest of the message on attachment failure", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      if (path.endsWith("/labels")) return Response.json({ labels: [] });
      if (path.includes("/attachments/")) return Response.json({ data: png });
      return Response.json({ id: "m1", payload: { headers: [{ name: "Subject", value: "Welcome" }], parts: [
        { mimeType: "text/html", body: { data: Buffer.from('<p>Welcome</p><img src="cid:logo">').toString("base64url") } },
        { mimeType: "image/png", headers: [{ name: "Content-ID", value: "<logo>" }], body: { attachmentId: "a1", size: 100 } },
      ] } });
    });
    vi.stubGlobal("fetch", fetch);
    const message = await new GmailClient().getMessage("test-token", "m1");
    expect(message.bodyHtml).toContain("data:image/png;base64," + png);
    expect(message.bodyHtml).toContain("<p>Welcome</p>");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("hydrates Outlook inline file attachments", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      if (path.includes("/attachments/a1")) return Response.json({ contentBytes: png });
      if (path.includes("/attachments?")) return Response.json({ value: [{ id: "a1", contentId: "logo", isInline: true, contentType: "image/png", size: 100 }] });
      return Response.json({ id: "m1", body: { contentType: "html", content: '<p>Hello</p><img src="cid:logo">' } });
    }));
    expect((await new OutlookClient().getMessage("test-token", "m1")).bodyHtml).toContain("data:image/png;base64," + png);
  });
  it("keeps a valid MIME header/body boundary when sending Gmail signatures", async () => {
    let raw = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      raw = JSON.parse(String(init?.body)).raw;
      return Response.json({ id: "sent" });
    }));
    await new GmailClient().sendMessage("test-token", { to: "recipient@example.com", subject: "Hello", body: "Message\n\n-- \nSignature" });
    const mime = Buffer.from(raw, "base64url").toString();
    expect(mime).toContain("\r\n\r\nMessage\n\n-- \nSignature");
  });
  it("allows bounded raster data and leaves unknown CIDs unchanged", () => {
    expect(inlineImageData("image/svg+xml", "AAAA")).toBeNull();
    expect(inlineImageData("image/png", "<bad>")).toBeNull();
    expect(inlineImageData("image/png", "a".repeat(1_500_001))).toBeNull();
    expect(embedInlineImages('<img src="cid:missing"><img src="cid:logo%40mail">', new Map([["logo@mail", "data:image/png;base64,AAAA"]]))).toBe('<img src="cid:missing"><img src="data:image/png;base64,AAAA">');
  });
});
