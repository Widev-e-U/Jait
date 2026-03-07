import { describe, expect, test } from "vitest";
import { DesktopApp } from "./main.js";
import { allowedIpcChannels } from "./preload-allow-list.js";

describe("sprint9 desktop app", () => {
  test("desktop app launches and connects to gateway", async () => {
    let connected = false;
    const app = new DesktopApp({
      transport: {
        async connect(url: string) {
          expect(url).toBe("ws://localhost:8787/ws");
          connected = true;
        },
        isConnected() {
          return connected;
        },
      },
      terminalAdapter: {
        async spawn() {
          return { terminalId: "term-1", pid: 11 };
        },
      },
    });

    await app.launch("ws://localhost:8787/ws");

    expect(connected).toBe(true);
    expect(app.hasTray()).toBe(true);
    expect(app.canNotify()).toBe(true);
    expect(app.hasGlobalShortcut("Alt+Space")).toBe(true);
  });

  test("native terminal sessions are started via adapter", async () => {
    const app = new DesktopApp({
      transport: {
        async connect() {},
        isConnected() {
          return true;
        },
      },
      terminalAdapter: {
        async spawn(command, cwd) {
          expect(cwd).toBe("/workspace/Jait");
          expect(command === "bash" || command === "pwsh").toBe(true);
          return { terminalId: "term-99", pid: 99 };
        },
      },
    });

    const started = await app.startNativeTerminal("/workspace/Jait");

    expect(started.terminalId).toBe("term-99");
    expect(app.activityFeed.list()[0]?.source).toBe("terminal");
  });

  test("activity feed captures chat-like and surface events", async () => {
    const app = new DesktopApp({
      transport: {
        async connect() {},
        isConnected() {
          return true;
        },
      },
      terminalAdapter: {
        async spawn() {
          return { terminalId: "term-1", pid: 12 };
        },
      },
    });

    app.activityFeed.append("chat", "chat.message", "Hello from desktop");
    app.activityFeed.append("browser", "browser.snapshot", "Captured tab #1");

    const entries = app.activityFeed.list();
    expect(entries.length).toBe(2);
    expect(entries[0]?.source).toBe("browser");
    expect(entries[1]?.source).toBe("chat");
  });

  test("preload IPC allow list includes desktop and gateway channels", () => {
    expect(allowedIpcChannels.invoke).toContain("terminal:start");
    expect(allowedIpcChannels.on).toContain("gateway:event");
  });
});
