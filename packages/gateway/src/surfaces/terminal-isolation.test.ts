import { describe, expect, it } from "vitest";
import { resolveTerminalSpawnSpec } from "./terminal.js";

describe("resolveTerminalSpawnSpec", () => {
  it("isolates service-owned Linux terminals in a bounded systemd scope", () => {
    const result = resolveTerminalSpawnSpec("/bin/bash", ["--rcfile", "/tmp/jait.sh"], "term/a:b", {
      platform: "linux",
      systemdRunAvailable: true,
      env: { JAIT_UNIT: "jait-gateway" },
    });

    expect(result.command).toBe("/usr/bin/systemd-run");
    expect(result.args).toEqual([
      "--user",
      "--scope",
      "--quiet",
      "--collect",
      "--unit=jait-terminal-term-a-b.scope",
      "--property=OOMPolicy=kill",
      "--property=MemoryHigh=1536M",
      "--property=MemoryMax=2G",
      "--property=MemorySwapMax=1G",
      "--",
      "/bin/bash",
      "--rcfile",
      "/tmp/jait.sh",
    ]);
  });

  it("keeps direct spawning outside a systemd service or when disabled", () => {
    expect(resolveTerminalSpawnSpec("/bin/zsh", ["-l"], "term-1", {
      platform: "linux",
      systemdRunAvailable: true,
      env: {},
    })).toEqual({ command: "/bin/zsh", args: ["-l"] });

    expect(resolveTerminalSpawnSpec("/bin/zsh", ["-l"], "term-1", {
      platform: "linux",
      systemdRunAvailable: true,
      env: { JAIT_UNIT: "jait-gateway", JAIT_TERMINAL_ISOLATION: "0" },
    })).toEqual({ command: "/bin/zsh", args: ["-l"] });
  });

  it("accepts only systemd memory values from configuration", () => {
    const result = resolveTerminalSpawnSpec("/bin/bash", [], "term-2", {
      platform: "linux",
      systemdRunAvailable: true,
      env: {
        JAIT_TERMINAL_ISOLATION: "1",
        JAIT_TERMINAL_MEMORY_HIGH: "2G",
        JAIT_TERMINAL_MEMORY_MAX: "3G",
        JAIT_TERMINAL_SWAP_MAX: "0",
      },
    });
    expect(result.args).toContain("--property=MemoryHigh=2G");
    expect(result.args).toContain("--property=MemoryMax=3G");
    expect(result.args).toContain("--property=MemorySwapMax=0");

    const invalid = resolveTerminalSpawnSpec("/bin/bash", [], "term-3", {
      platform: "linux",
      systemdRunAvailable: true,
      env: {
        JAIT_TERMINAL_ISOLATION: "1",
        JAIT_TERMINAL_MEMORY_MAX: "2G;rm",
      },
    });
    expect(invalid.args).toContain("--property=MemoryMax=2G");
  });
});
