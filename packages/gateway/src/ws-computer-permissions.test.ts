import { describe, expect, it } from "vitest";
import { nodeCapabilityForTool, resolveSessionScopedClientTarget } from "./ws.js";

describe("computer node capability routing", () => {
  it("requires input for control, screen for observation, and always permits stop", () => {
    expect(nodeCapabilityForTool("computer.session", { action: "start" })).toBe("input");
    expect(nodeCapabilityForTool("computer.act", { action: "click" })).toBe("input");
    expect(nodeCapabilityForTool("computer.observe", {})).toBe("screen");
    expect(nodeCapabilityForTool("computer.geometry", {})).toBe("input");
    expect(nodeCapabilityForTool("computer.clipboard.read", {})).toBe("input");
    expect(nodeCapabilityForTool("computer.clipboard.write", {})).toBe("input");
    expect(nodeCapabilityForTool("computer.future-action", {})).toBe("input");
    expect(nodeCapabilityForTool("computer.session", { action: "stop" })).toBeUndefined();
  });

  it("maps every remote tool family to the node capability that gates it", () => {
    expect(nodeCapabilityForTool("terminal.exec")).toBe("terminal");
    expect(nodeCapabilityForTool("shell.run")).toBe("terminal");
    expect(nodeCapabilityForTool("command.spawn")).toBe("terminal");
    expect(nodeCapabilityForTool("file.read")).toBe("filesystem");
    expect(nodeCapabilityForTool("fs.write")).toBe("filesystem");
    expect(nodeCapabilityForTool("read.file")).toBe("filesystem");
    expect(nodeCapabilityForTool("write.file")).toBe("filesystem");
    expect(nodeCapabilityForTool("search.files")).toBe("filesystem");
    expect(nodeCapabilityForTool("browser.navigate")).toBe("browser");
    expect(nodeCapabilityForTool("web.fetch")).toBe("browser");
    expect(nodeCapabilityForTool("screen.capture")).toBe("screen");
    expect(nodeCapabilityForTool("voice.transcribe")).toBe("voice");
    expect(nodeCapabilityForTool("camera.snapshot")).toBe("camera");
  });

  it("leaves unrelated tools ungated", () => {
    expect(nodeCapabilityForTool("messenger.send")).toBeUndefined();
    expect(nodeCapabilityForTool("computer")).toBeUndefined();
    expect(nodeCapabilityForTool("filesystem.read")).toBeUndefined();
  });
});

describe("session-scoped client targeting", () => {
  it("returns null when the client is not subscribed to a session", () => {
    expect(resolveSessionScopedClientTarget(null, "session-b")).toBeNull();
    expect(resolveSessionScopedClientTarget(null, undefined)).toBeNull();
  });

  it("accepts an omitted or matching session id", () => {
    expect(resolveSessionScopedClientTarget("session-a", undefined)).toBe("session-a");
    expect(resolveSessionScopedClientTarget("session-a", null)).toBe("session-a");
    expect(resolveSessionScopedClientTarget("session-a", "")).toBe("session-a");
    expect(resolveSessionScopedClientTarget("session-a", "session-a")).toBe("session-a");
  });

  it("refuses to let a client address another session", () => {
    expect(resolveSessionScopedClientTarget("session-a", "session-b")).toBeNull();
  });

  it("ignores non-string session ids instead of throwing", () => {
    expect(resolveSessionScopedClientTarget("session-a", 42)).toBe("session-a");
    expect(resolveSessionScopedClientTarget("session-a", { id: "session-b" })).toBe("session-a");
  });
});
