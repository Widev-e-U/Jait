import { describe, expect, it } from "vitest";
import { getRememberedTerminalSecretDescriptor, rewriteProjectPathForSandboxCommand } from "./terminal-tools.js";

describe("getRememberedTerminalSecretDescriptor", () => {
  it("makes sudo and password prompts rememberable within the project", () => {
    expect(getRememberedTerminalSecretDescriptor("sudo apt-get update", "[sudo] password for jakob:", "/project")).toEqual({
      rememberLabel: "[sudo] password for jakob:",
      secretType: "terminal-password",
      secretKey: "/project:[sudo] password for jakob:",
    });
  });

  it("separates SSH passwords and does not remember verification codes", () => {
    expect(getRememberedTerminalSecretDescriptor("ssh jakob@host", "jakob@host's password:", "/project")?.secretType).toBe("terminal-ssh-password");
    expect(getRememberedTerminalSecretDescriptor("login", "Verification code:", "/project")).toBeNull();
  });
});

describe("rewriteProjectPathForSandboxCommand", () => {
  it("rewrites the project root when used as a standalone path token", () => {
    expect(rewriteProjectPathForSandboxCommand(
      'cd "/home/jakob/project" && ls /home/jakob/project/src',
      "/home/jakob/project",
    )).toBe('cd "/project" && ls /project/src');
  });

  it("does not rewrite sibling paths that only share the project prefix", () => {
    expect(rewriteProjectPathForSandboxCommand(
      'ls /home/jakob/project-backup /tmp/home/jakob/project-backup',
      "/home/jakob/project",
    )).toBe('ls /home/jakob/project-backup /tmp/home/jakob/project-backup');
  });

  it("rewrites assignment-style command arguments without touching longer suffixes", () => {
    expect(rewriteProjectPathForSandboxCommand(
      'ROOT=/home/jakob/project pnpm --dir /home/jakob/project build && echo /home/jakob/project.tmp',
      "/home/jakob/project",
    )).toBe('ROOT=/project pnpm --dir /project build && echo /home/jakob/project.tmp');
  });

  it("supports Windows-style project roots", () => {
    expect(rewriteProjectPathForSandboxCommand(
      'cd "C:\\Users\\jakob\\project" && type C:\\Users\\jakob\\project\\README.md',
      "C:\\Users\\jakob\\project",
    )).toBe('cd "/project" && type /project\\README.md');
  });
});
