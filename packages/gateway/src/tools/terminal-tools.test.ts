import { describe, expect, it } from "vitest";
import {
  buildTerminalExitMarkerCommand,
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
