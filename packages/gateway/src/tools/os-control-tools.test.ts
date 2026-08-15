/**
 * os.* — operating-system control tools.
 *
 * These tests exercise:
 *  1. The LinuxDesktopOsControlDriver's shell command building (via an
 *     injected fake SandboxManager.execShell that records commands).
 *  2. The os.* toolset's success/error wiring (via a mock resolver + driver).
 */
import { describe, expect, it, vi } from "vitest";
import type { SandboxManager } from "../security/sandbox-manager.js";
import {
  buildXdotoolKeys,
  LinuxDesktopOsControlDriver,
} from "../os-control/linux-desktop-driver.js";
import {
  buildWindowsSendKeys,
  buildWindowsSshArgs,
  encodePowerShellCommand,
  escapeSendKeysText,
  extractSshPort,
} from "../os-control/windows-driver.js";
import type { OsControlDriver, OsScreenshot } from "../os-control/types.js";
import type { ToolContext } from "./contracts.js";
import { createOsControlToolset } from "./os-control-tools.js";

/** The os.* tools capture their resolver at construction; context is unused. */
const toolCtx = {} as unknown as ToolContext;

/** A tiny 1x1 PNG so OsScreenshot base64 / dimension checks are deterministic. */
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);

function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}

/** A SandboxManager fake that records every execShell call. */
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}

/** A mock driver where each method can be independently stubbed. */
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}

interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}

/** A resolver fake. `list` defaults to one running linux-desktop sandbox. */
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}

function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}

describe("LinuxDesktopOsControlDriver command building", () => {
  it("builds a correct ImageMagick screenshot command", async () => {
    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.screenshot();
    expect(calls).toHaveLength(1);
    expect(calls[0].containerName).toBe("os-linux-test");
    expect(calls[0].command).toContain("import -window root /tmp/jait-os-screenshot.png");
    expect(calls[0].command).toContain("base64 -w0 /tmp/jait-os-screenshot.png");
    expect(calls[0].timeoutMs).toBe(30_000);
  });

  it("builds a correct xdotool click command with button + repeat", async () => {
    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.click(120, 340, { button: "right", clicks: 2 });
    expect(calls[0].command).toBe("DISPLAY=:99 xdotool mousemove 120 340 click --repeat 2 3");
  });

  it("builds a correct xdotool mousemove command", async () => {
    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.mouseMove(5.9, 20.1);
    expect(calls[0].command).toBe("DISPLAY=:99 xdotool mousemove 6 20");
  });

  it("builds a correct xdotool type command with delay and escaping", async () => {
    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.type('hello "world"\n$HOME', { delayMs: 30 });
    expect(calls[0].command).toBe('DISPLAY=:99 xdotool type --delay 30 "hello \\"world\\"\\n\\$HOME"');
  });

  it("builds correct xdotool key and keydown/keyup hold commands", async () => {
    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.key("ctrl+shift+t");
    expect(calls[0].command).toBe("DISPLAY=:99 xdotool key ctrl shift t");

    calls.length = 0;
    await driver.key("super+d", { holdMs: 250 });
    expect(calls[0].command).toBe(
      "DISPLAY=:99 xdotool keydown super d; sleep 0.250; DISPLAY=:99 xdotool keyup super d",
    );
  });

  it("builds correct xdotool scroll commands", async () => {
    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.scroll();
    expect(calls[0].command).toBe("DISPLAY=:99 xdotool click --repeat 1 5");

    calls.length = 0;
    await driver.scroll({ direction: "up", amount: 2 });
    expect(calls[0].command).toBe("DISPLAY=:99 xdotool click --repeat 2 4");

    calls.length = 0;
    await driver.scroll({ x: 10, y: 20, direction: "down" });
    expect(calls[0].command).toBe("DISPLAY=:99 xdotool mousemove 10 20 click --repeat 1 5");
  });

  it("builds correct exec command", async () => {
    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.exec("echo hi", { cwd: "/root", timeoutMs: 5000 });
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("cd '/root' && echo hi");
    expect(calls[0].timeoutMs).toBe(5000);
  });

  it("maps human keyboard combos to xdotool keysyms", () => {
    expect(buildXdotoolKeys("ctrl+shift+t")).toEqual(["ctrl", "shift", "t"]);
    expect(buildXdotoolKeys("super+d")).toEqual(["super", "d"]);
    expect(buildXdotoolKeys("alt+tab")).toEqual(["alt", "Tab"]);
    expect(buildXdotoolKeys("ctrl+alt+delete")).toEqual(["ctrl", "alt", "Delete"]);
    expect(buildXdotoolKeys("ctrl+space")).toEqual(["ctrl", "space"]);
    expect(buildXdotoolKeys("enter")).toEqual(["Return"]);
    expect(buildXdotoolKeys("  ")).toEqual([]);
  });
});
describe("WindowsOsControlDriver helpers", () => {
  it("extracts the published SSH port from a 22/tcp mapping (dockur convention)", () => {
    const ports = JSON.stringify({
      "22/tcp": [{ HostIp: "0.0.0.0", HostPort: "2222" }],
      "3389/tcp": [{ HostIp: "0.0.0.0", HostPort: "3389" }],
      "8006/tcp": [{ HostIp: "0.0.0.0", HostPort: "8006" }],
    });
    expect(extractSshPort(ports)).toBe(2222);
  });

  it("extracts the published SSH port from a 2222/tcp mapping (legacy)", () => {
    const ports = JSON.stringify({
      "2222/tcp": [{ HostIp: "0.0.0.0", HostPort: "42222" }],
    });
    expect(extractSshPort(ports)).toBe(42222);
  });

  it("returns null when no SSH port is published", () => {
    const ports = JSON.stringify({
      "3389/tcp": [{ HostIp: "0.0.0.0", HostPort: "3389" }],
    });
    expect(extractSshPort(ports)).toBeNull();
  });

  it("maps human keyboard combos to Windows SendKeys tokens", () => {
    expect(buildWindowsSendKeys("ctrl+shift+t")).toBe("^+t");
    expect(buildWindowsSendKeys("alt+tab")).toBe("%{TAB}");
    expect(buildWindowsSendKeys("super+d")).toBe("{LWIN}d");
    expect(buildWindowsSendKeys("ctrl+alt+delete")).toBe("^%{DELETE}");
    expect(buildWindowsSendKeys("enter")).toBe("{ENTER}");
    expect(buildWindowsSendKeys("  ")).toBe("");
  });

  it("escapes SendKeys metacharacters in typed text", () => {
    expect(escapeSendKeysText("a+b^c%d~e(f)g{h}i[j]")).toBe("a{+}b{^}c{%}d{~}e{(}f{)}g{{}h{}}i{[}j{]}");
    expect(escapeSendKeysText("plain text")).toBe("plain text");
  });

  it("encodes PowerShell snippets as UTF-16LE base64 (powershell -EncodedCommand)", () => {
    const snippet = "Write-Output 'hi'";
    const encoded = encodePowerShellCommand(snippet);
    // Decoding the base64 as UTF-16LE must round-trip to the original snippet.
    expect(Buffer.from(encoded, "base64").toString("utf16le")).toBe(snippet);
  });

  it("builds a one-shot ssh argv that forces password auth against localhost", () => {
    const args = buildWindowsSshArgs({
      port: 42222,
      username: "Docker",
      command: "powershell -NoProfile -EncodedCommand abc",
    });
    expect(args).toContain("-p");
    expect(args).toContain("42222");
    expect(args).toContain("Docker@127.0.0.1");
    expect(args).toContain("PreferredAuthentications=password,keyboard-interactive");
    expect(args).toContain("PubkeyAuthentication=no");
    expect(args[args.length - 1]).toBe("powershell -NoProfile -EncodedCommand abc");
  });
});


describe("os.* toolset", () => {
  /** Build a toolset wired to a fresh mock resolver + driver. */
  function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }

  it("exposes all eight os.* tools", () => {
    const { tools } = makeToolset();
    for (const name of [
      "os.screenshot",
      "os.click",
      "os.mouse",
      "os.type",
      "os.keyboard",
      "os.scroll",
      "os.exec",
      "os.sandbox.list",
    ]) {
      expect(tools.has(name), `missing tool ${name}`).toBe(true);
    }
  });

  describe("os.screenshot", () => {
    it("returns ok:true with an image reference (png base64 + dimensions)", async () => {
      const { driver, tools } = makeToolset();
      const r = (await tools.get("os.screenshot")!.execute({}, toolCtx)) as {
        ok: boolean;
        data?: Record<string, unknown>;
      };
      expect(r.ok).toBe(true);
      const shot = r.data!.screenshot as { pngBase64: string; width: number; height: number };
      expect(shot.pngBase64).toBe(FAKE_PNG.toString("base64"));
      expect(shot.width).toBe(1280);
      expect(shot.height).toBe(720);
      expect(driver.screenshot).toHaveBeenCalled();
    });

    it("returns ok:false when the sandbox cannot be resolved", async () => {
      const { tools } = makeToolset({
        resolveError: new Error('OS sandbox "os-linux-test" is not running.'),
      });
      const r = (await tools.get("os.screenshot")!.execute({}, toolCtx)) as { ok: boolean; message?: string };
      expect(r.ok).toBe(false);
      expect(r.message).toContain("not running");
    });

    it("returns ok:false when the screenshot action throws", async () => {
      const { stubs, tools } = makeToolset();
      stubs.screenshot.mockRejectedValue(new Error("import: no X server"));
      const r = (await tools.get("os.screenshot")!.execute({}, toolCtx)) as { ok: boolean; message?: string };
      expect(r.ok).toBe(false);
      expect(r.message).toContain("Screenshot failed");
      expect(r.message).toContain("no X server");
    });
  });

  describe("input tools (click / mouse / type / keyboard / scroll)", () => {
    it.each([
      ["os.click", "Click", { x: 10, y: 20, button: "left" }],
      ["os.mouse", "Mouse move", { x: 10, y: 20 }],
      ["os.type", "Type", { text: "hi" }],
      ["os.keyboard", "Keyboard", { combo: "ctrl+c" }],
      ["os.scroll", "Scroll", { direction: "down" }],
    ])("%s returns ok:true and re-screenshots", async (name, verb, input) => {
      const { driver, tools } = makeToolset();
      const r = (await tools.get(name)!.execute(input, toolCtx)) as {
        ok: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };
      expect(r.ok).toBe(true);
      expect(r.message).toContain(`${verb} applied on sandbox`);
      expect(r.data!.screenshot).toBeDefined();
      expect(driver.screenshot).toHaveBeenCalled();
    });

    it.each([
      "os.click",
      "os.mouse",
      "os.type",
      "os.keyboard",
      "os.scroll",
    ])("%s returns ok:false when the sandbox cannot be resolved", async (name) => {
      const { tools } = makeToolset({
        resolveError: new Error("No running OS sandbox found."),
      });
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      expect(r.ok).toBe(false);
      expect(r.message).toContain("No running OS sandbox");
    });

    it.each([
      ["os.click", (s: ReturnType<typeof makeMockDriver>["stubs"]) => s.click],
      ["os.mouse", (s: ReturnType<typeof makeMockDriver>["stubs"]) => s.mouseMove],
      ["os.type", (s: ReturnType<typeof makeMockDriver>["stubs"]) => s.type],
      ["os.keyboard", (s: ReturnType<typeof makeMockDriver>["stubs"]) => s.key],
      ["os.scroll", (s: ReturnType<typeof makeMockDriver>["stubs"]) => s.scroll],
    ])("%s returns ok:false when the action throws", async (name, stubOf) => {
      const { stubs, tools } = makeToolset();
      stubOf(stubs).mockRejectedValue(new Error("xdotool failed"));
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      expect(r.ok).toBe(false);
      expect(r.message).toContain("failed on sandbox");
      expect(r.message).toContain("xdotool failed");
    });
  });

  describe("os.exec", () => {
    it("returns ok:true with command output", async () => {
      const { stubs, tools } = makeToolset();
      stubs.exec.mockResolvedValue({
        ok: true,
        output: "hello",
        exitCode: 0,
        timedOut: false,
        containerName: "os-linux-test",
      });
      const r = (await tools.get("os.exec")!.execute({ command: "echo hello" }, toolCtx)) as {
        ok: boolean;
        data?: Record<string, unknown>;
      };
      expect(r.ok).toBe(true);
      expect(r.data!.output).toBe("hello");
      expect(r.data!.exitCode).toBe(0);
    });

    it("returns ok:false with the exit code when the command fails", async () => {
      const { stubs, tools } = makeToolset();
      stubs.exec.mockResolvedValue({
        ok: false,
        output: "boom",
        exitCode: 2,
        timedOut: false,
        containerName: "os-linux-test",
      });
      const r = (await tools.get("os.exec")!.execute({ command: "false" }, toolCtx)) as {
        ok: boolean;
        message?: string;
      };
      expect(r.ok).toBe(false);
      expect(r.message).toContain("exited with code 2");
    });

    it("returns ok:false when the exec action throws", async () => {
      const { stubs, tools } = makeToolset();
      stubs.exec.mockRejectedValue(new Error("docker exec failed"));
      const r = (await tools.get("os.exec")!.execute({ command: "ls" }, toolCtx)) as {
        ok: boolean;
        message?: string;
      };
      expect(r.ok).toBe(false);
      expect(r.message).toContain("Exec failed");
      expect(r.message).toContain("docker exec failed");
    });
  });

  describe("os.sandbox.list", () => {
    it("returns ok:true with the discovered sandboxes", async () => {
      const sandboxes = [
        { containerName: "os-linux-abc", type: "linux-desktop", running: true },
        { containerName: "os-windows-def", type: "windows", running: true },
      ];
      const { tools } = makeToolset({ sandboxes });
      const r = (await tools.get("os.sandbox.list")!.execute({}, toolCtx)) as {
        ok: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };
      expect(r.ok).toBe(true);
      expect(r.data!.sandboxes).toEqual(sandboxes);
    });

    it("returns ok:false when listing throws", async () => {
      const { resolver, tools } = makeToolset();
      resolver.listSandboxes.mockRejectedValue(new Error("docker ps failed"));
      const r = (await tools.get("os.sandbox.list")!.execute({}, toolCtx)) as { ok: boolean; message?: string };
      expect(r.ok).toBe(false);
      expect(r.message).toContain("docker ps failed");
    });
  });
});
