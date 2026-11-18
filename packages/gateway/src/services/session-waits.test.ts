import { beforeEach, describe, expect, it } from "vitest";
import {
  SessionWaitService,
  backgroundWaitKey,
  browserWaitKey,
  terminalWaitKey,
} from "./session-waits.js";

/** Records every broadcast so tests can assert the chat list gets told once per change. */
function withBroadcast() {
  const service = new SessionWaitService();
  const changes: { sessionId: string; keys: string[] }[] = [];
  service.setBroadcaster((change) => {
    changes.push({ sessionId: change.sessionId, keys: change.waits.map((wait) => wait.key) });
  });
  return { service, changes };
}

describe("SessionWaitService", () => {
  let service: SessionWaitService;
  let changes: { sessionId: string; keys: string[] }[];

  beforeEach(() => {
    ({ service, changes } = withBroadcast());
  });

  it("fills in the default label, detail and blocking flag", () => {
    const wait = service.raise({ key: "question:1", kind: "question", sessionId: "chat-a" });
    expect(wait).toEqual({
      key: "question:1",
      kind: "question",
      sessionId: "chat-a",
      label: "Waiting for your answer",
      blocking: true,
    });

    expect(service.raise({
      key: "background:term-1",
      kind: "background",
      sessionId: "chat-a",
      blocking: false,
      detail: "bun run build",
    })).toMatchObject({ blocking: false, detail: "bun run build", label: "Waiting for a background command" });
  });

  it("broadcasts the full wait list for the session on every change", () => {
    service.raise({ key: "question:1", kind: "question", sessionId: "chat-a" });
    service.raise({ key: "terminal:term-1", kind: "terminal", sessionId: "chat-a" });
    expect(changes).toEqual([
      { sessionId: "chat-a", keys: ["question:1"] },
      { sessionId: "chat-a", keys: ["question:1", "terminal:term-1"] },
    ]);
  });

  it("does not re-broadcast an identical raise", () => {
    const input = { key: "terminal:term-1", kind: "terminal" as const, sessionId: "chat-a" };
    service.raise(input);
    service.raise(input);
    service.raise(input);
    expect(changes).toHaveLength(1);
  });

  it("re-broadcasts when the same key changes detail", () => {
    service.raise({ key: "terminal:term-1", kind: "terminal", sessionId: "chat-a", detail: "vite" });
    service.raise({ key: "terminal:term-1", kind: "terminal", sessionId: "chat-a", detail: "psql" });
    expect(changes.at(-1)?.keys).toEqual(["terminal:term-1"]);
    expect(changes).toHaveLength(2);
    expect(service.get("terminal:term-1")?.detail).toBe("psql");
  });

  it("clears one wait by key and reports whether anything happened", () => {
    service.raise({ key: "browser:chat-a", kind: "browser", sessionId: "chat-a" });
    expect(service.clear("browser:chat-a")).toBe(true);
    expect(service.get("browser:chat-a")).toBeUndefined();
    expect(service.list("chat-a")).toEqual([]);
    expect(service.clear("browser:chat-a")).toBe(false);
    expect(changes).toHaveLength(2);
  });

  it("clears every wait for one session and leaves other sessions alone", () => {
    service.raise({ key: terminalWaitKey("term-1"), kind: "terminal", sessionId: "chat-a" });
    service.raise({ key: backgroundWaitKey("term-1"), kind: "background", sessionId: "chat-a", blocking: false });
    service.raise({ key: browserWaitKey("chat-b"), kind: "browser", sessionId: "chat-b" });
    changes.length = 0;

    service.clearSession("chat-a");

    expect(service.list("chat-a")).toEqual([]);
    expect(service.list("chat-b").map((wait) => wait.key)).toEqual(["browser:chat-b"]);
    // One broadcast for the cleared session only — not a storm per key.
    expect(changes).toEqual([{ sessionId: "chat-a", keys: [] }]);
  });

  it("stays quiet when clearing a session that has nothing pending", () => {
    service.clearSession("chat-nobody");
    expect(changes).toEqual([]);
  });

  it("orders blocking waits before background ones", () => {
    service.raise({ key: "background:term-1", kind: "background", sessionId: "chat-a", blocking: false });
    service.raise({ key: "browser:chat-a", kind: "browser", sessionId: "chat-a" });
    service.raise({ key: "consent:req-1", kind: "consent", sessionId: "chat-a" });
    expect(service.list("chat-a").map((wait) => wait.kind)).toEqual(["browser", "consent", "background"]);
  });

  it("snapshots every outstanding wait sorted for a stable reconnect payload", () => {
    service.raise({ key: "question:1", kind: "question", sessionId: "chat-b" });
    service.raise({ key: "browser:chat-a", kind: "browser", sessionId: "chat-a" });
    service.raise({ key: "background:term-9", kind: "background", sessionId: "chat-a", blocking: false });

    expect(service.snapshot().map((wait) => wait.key)).toEqual([
      "browser:chat-a",
      "question:1",
      "background:term-9",
    ]);
    expect(new SessionWaitService().snapshot()).toEqual([]);
  });

  it("builds stable keys from terminal and browser ids", () => {
    expect(terminalWaitKey("term-1")).toBe("terminal:term-1");
    expect(browserWaitKey("chat-a")).toBe("browser:chat-a");
    expect(backgroundWaitKey("term-1")).toBe("background:term-1");
  });

  it("drops the broadcaster on clearForTests", () => {
    service.clearForTests();
    service.raise({ key: "question:1", kind: "question", sessionId: "chat-a" });
    expect(changes).toEqual([]);
    expect(service.snapshot()).toHaveLength(1);
  });
});
