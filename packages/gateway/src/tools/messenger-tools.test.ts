import { describe, expect, it, vi } from "vitest";
import { createMessengerTools } from "./messenger-tools.js";
import { MessengerBridge } from "../services/messenger-bridge.js";
import type { ToolContext } from "./contracts.js";

const context = { userId: "alice", signal: undefined } as unknown as ToolContext;
describe("Messenger tools", () => {
  it("prepares credential-free sign-in links and rejects unsafe or secret-bearing URLs", async () => {
    const tool = createMessengerTools(new MessengerBridge()).find(tool => tool.name === "messenger.connect")!;
    const result = await tool.execute({ homeserver: "https://matrix.test", username: "@alice:matrix.test" }, context);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ connected: false, href: "/messenger?homeserver=https%3A%2F%2Fmatrix.test&username=%40alice%3Amatrix.test" });
    for (const homeserver of ["http://192.168.1.1", "https://user:secret@matrix.test", "https://matrix.test?token=secret", "javascript:alert(1)"]) {
      expect((await tool.execute({ homeserver }, context)).ok).toBe(false);
    }
    expect((await tool.execute({ homeserver: "https://matrix.test", password: "secret" }, context)).ok).toBe(false);
  });
  it("validates bounds before dispatch and preserves write consent", async () => {
    const bridge = new MessengerBridge();
    const request = vi.spyOn(bridge, "request").mockResolvedValue({ ok: true, message: "done" });
    const tools = createMessengerTools(bridge);
    const search = tools.find(tool => tool.name === "messenger.search")!;
    expect((await search.execute({ query: "x", limit: 51 }, context)).ok).toBe(false);
    expect((await search.execute({ query: "" }, context)).ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
    await search.execute({ query: "firewall", limit: 5 }, context);
    expect(request).toHaveBeenCalledWith("alice", { action: "search", query: "firewall", limit: 5 }, undefined);
    for (const name of ["messenger.send", "messenger.open"]) expect(tools.find(tool => tool.name === name)?.defaultConsentLevel).toBe("always");
    const send = tools.find(tool => tool.name === "messenger.send")!;
    expect((await send.execute({ roomId: "alice", text: "hello" }, context)).ok).toBe(false);
  });
});
