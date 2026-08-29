import { describe, expect, it } from "vitest";
import type { WsControlPlane } from "../ws.js";
import { RemoteTerminalSurface } from "../surfaces/remote-terminal.js";
import {
  buildTerminalExitMarkerCommand,
  getTerminalCommandDoneEndOffset,
  rewriteProjectPathForSandboxCommand,
} from "./terminal-tools.js";

describe("rewriteProjectPathForSandboxCommand", () => {
  it("rewrites the project root when used as a standalone path token", () => {
    expect(rewriteProjectPathForSandboxCommand(
      'cd "/home/alice/project" && ls /home/alice/project/src',
      "/home/alice/project",
    )).toBe('cd "/project" && ls /project/src');
  });

  it("does not rewrite sibling paths that only share the project prefix", () => {
    expect(rewriteProjectPathForSandboxCommand(
      'ls /home/alice/project-backup /tmp/home/alice/project-backup',
      "/home/alice/project",
    )).toBe('ls /home/alice/project-backup /tmp/home/alice/project-backup');
  });

  it("rewrites assignment-style command arguments without touching longer suffixes", () => {
    expect(rewriteProjectPathForSandboxCommand(
      'ROOT=/home/alice/project pnpm --dir /home/alice/project build && echo /home/alice/project.tmp',
      "/home/alice/project",
    )).toBe('ROOT=/project pnpm --dir /project build && echo /home/alice/project.tmp');
  });

  it("supports Windows-style project roots", () => {
    expect(rewriteProjectPathForSandboxCommand(
      'cd "C:\\Users\\alice\\project" && type C:\\Users\\alice\\project\\README.md',
      "C:\\Users\\alice\\project",
    )).toBe('cd "/project" && type /project\\README.md');
  });
});

describe("buildTerminalExitMarkerCommand", () => {
  it("uses PowerShell status variables on Windows terminals", () => {
    const command = buildTerminalExitMarkerCommand("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "done");

    expect(command).toContain("$LASTEXITCODE");
    expect(command).toContain('Write-Output "done:$jaitExitCode"');
    expect(command).not.toContain("printf");
  });

  it("uses the previous POSIX exit status on gateway terminals", () => {
    expect(buildTerminalExitMarkerCommand("/bin/bash", "done"))
      .toBe(`printf '\\ndone:%s\\n' "$?"`);
  });
});

function makeSurface(): RemoteTerminalSurface {
  return new RemoteTerminalSurface(
    "term-test",
    {} as unknown as WsControlPlane,
    "node-1",
  );
}

describe("getTerminalCommandDoneEndOffset", () => {
  it("pins the boundary at the chunk carrying the 633;D done marker", () => {
    const surface = makeSurface();
    surface.ingestOutput("command output\r\n");
    // Shells deliver the done marker bundled with the next prompt redraw:
    surface.ingestOutput(
      "\x1b]633;D;0\x07\x1b]633;A\x07\x1b]633;B\x07user@host:~$ \x1b]633;C\x07",
    );
    surface.ingestOutput("just the new prompt, no command yet\r\n");
    const outputOffset = 1;

    expect(surface.getOutputOffset()).toBe(3);
    expect(surface.getCommandDoneEndOffset()).toBe(2);
    expect(getTerminalCommandDoneEndOffset(surface, outputOffset)).toBe(2);
  });

  it("ignores a marker from a previous command when the current one started later", () => {
    const surface = makeSurface();
    // Previous command's done marker, pinned at chunk 1:
    surface.ingestOutput(
      "\x1b]633;D;0\x07\x1b]633;A\x07\x1b]633;B\x07user@host:~$ \x1b]633;C\x07",
    );
    surface.ingestOutput("banner redraw\r\n");
    const startOffset = surface.getOutputOffset();
    // A command that never finishes (timed out) leaves the pin stale:
    surface.ingestOutput("long running output\r\n");

    expect(surface.getCommandDoneEndOffset()).toBe(1);
    expect(getTerminalCommandDoneEndOffset(surface, startOffset)).toBeNull();
    // Only stale relative to the captured start offset:
    expect(getTerminalCommandDoneEndOffset(surface, 0)).toBe(1);
  });
});
