import { describe, expect, it } from "vitest";
import type { WsControlPlane } from "../ws.js";
import { RemoteTerminalSurface } from "../surfaces/remote-terminal.js";
import {
  AGENT_TERMINAL_ENV_PWSH,
  AGENT_TERMINAL_ENV_POSIX,
  buildAgentCommand,
  buildTerminalExitMarkerCommand,
  detectPagerPrompt,
  getTerminalCommandDoneEndOffset,
  hasStrongPagerPrompt,
  isCmdShell,
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

describe("buildAgentCommand", () => {
  it("prefixes POSIX commands with pager/editor-disabling exports", () => {
    const result = buildAgentCommand("git log --oneline", "/bin/bash");

    expect(result.startsWith("export ")).toBe(true);
    expect(result).toContain("PAGER=cat");
    expect(result).toContain("GIT_EDITOR=true");
    expect(result).toContain("GIT_MERGE_AUTOEDIT=no");
    expect(result.endsWith("git log --oneline")).toBe(true);
    // Every env entry must survive the prefix.
    for (const entry of AGENT_TERMINAL_ENV_POSIX) {
      expect(result).toContain(entry);
    }
  });

  it("prepends the export block as its own line for multi-line commands", () => {
    const command = "echo one\necho two";
    const result = buildAgentCommand(command, "/bin/bash");

    expect(result.startsWith("export ")).toBe(true);
    expect(result).toContain(";\necho one\necho two");
    // The original command body stays untouched after the prefix line.
    expect(result.endsWith(command)).toBe(true);
  });

  it("uses $env: assignment syntax for PowerShell shells", () => {
    const result = buildAgentCommand("git log", "pwsh.exe");

    expect(result).toContain("$env:PAGER = 'cat'");
    expect(result).toContain("$env:GIT_EDITOR = 'true'");
    expect(result.endsWith("git log")).toBe(true);
    expect(result).not.toContain("export ");
  });

  it("returns cmd.exe commands unchanged", () => {
    const command = "git log";
    expect(buildAgentCommand(command, "cmd.exe")).toBe(command);
    expect(buildAgentCommand(command, "C:\\Windows\\system32\\cmd.EXE")).toBe(command);
  });

  it("treats non-PowerShell Unix shells as POSIX-flavored", () => {
    const command = "git log";
    for (const shell of ["/usr/bin/zsh", "/usr/bin/fish", "/bin/sh"]) {
      const result = buildAgentCommand(command, shell);
      expect(result.startsWith("export ")).toBe(true);
      expect(result.endsWith(command)).toBe(true);
    }
  });

  it("leaves empty commands untouched", () => {
    expect(buildAgentCommand("", "/bin/bash")).toBe("");
    expect(buildAgentCommand("   ", "/bin/bash")).toBe("   ");
  });
});

describe("agent terminal env constants", () => {
  it("expresses the POSIX entries as valid PowerShell $env: assignments", () => {
    expect(AGENT_TERMINAL_ENV_PWSH).toHaveLength(AGENT_TERMINAL_ENV_POSIX.length);
    expect(AGENT_TERMINAL_ENV_PWSH[0]).toBe("$env:PAGER = 'cat'");
    expect(AGENT_TERMINAL_ENV_PWSH).toContain("$env:LESS = '-FRX'");
    expect(AGENT_TERMINAL_ENV_PWSH).toContain("$env:GIT_MERGE_AUTOEDIT = 'no'");
  });

  it("recognizes cmd.exe shells case-insensitively", () => {
    expect(isCmdShell("cmd")).toBe(true);
    expect(isCmdShell("cmd.exe")).toBe(true);
    expect(isCmdShell("C:\\Windows\\System32\\cmd.exe")).toBe(true);
    expect(isCmdShell("/bin/bash")).toBe(false);
    expect(isCmdShell("pwsh")).toBe(false);
  });
});

describe("hasStrongPagerPrompt", () => {
  it("matches the less (END) marker at the output tail", () => {
    expect(hasStrongPagerPrompt("some paged content\r\n(END)")).toBe(true);
    expect(hasStrongPagerPrompt("content\n  (END)  ")).toBe(true);
  });

  it("matches man's pager prompts", () => {
    expect(hasStrongPagerPrompt("manual page\nPress RETURN to continue ")).toBe(true);
    expect(hasStrongPagerPrompt("Manual page git(1) line 1\nNo next tag")).toBe(true);
  });

  it("matches a lone colon prompt line from less", () => {
    expect(hasStrongPagerPrompt("git log output\n:")).toBe(true);
  });

  it("ignores healthy output that merely ends with a colon-ish line", () => {
    expect(hasStrongPagerPrompt("Dependencies resolved.\n\ndone")).toBe(false);
    expect(hasStrongPagerPrompt("Building project...\nDone in 1.2s")).toBe(false);
    // "Dependencies resolved:" is not a lone-colon line.
    expect(hasStrongPagerPrompt("step 1 ok\nDependencies resolved:")).toBe(false);
    // Colon only matches when it is the last line.
    expect(hasStrongPagerPrompt(":\nmore output after the prompt")).toBe(false);
    expect(hasStrongPagerPrompt("")).toBe(false);
  });
});

describe("detectPagerPrompt", () => {
  it("flags pager artifacts anywhere in the timed-out output", () => {
    expect(detectPagerPrompt("lines of output\n(END)")).toBe(true);
  });

  it("stays quiet for plain command output", () => {
    expect(detectPagerPrompt("vite v5.0.0 ready in 320 ms\n")).toBe(false);
    expect(detectPagerPrompt("")).toBe(false);
  });
});
