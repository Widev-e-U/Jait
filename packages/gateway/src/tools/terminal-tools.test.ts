import { describe, expect, it } from "vitest";
import { rewriteWorkspacePathForSandboxCommand } from "./terminal-tools.js";

describe("rewriteWorkspacePathForSandboxCommand", () => {
  it("rewrites the workspace root when used as a standalone path token", () => {
    expect(rewriteWorkspacePathForSandboxCommand(
      'cd "/home/jakob/project" && ls /home/jakob/project/src',
      "/home/jakob/project",
    )).toBe('cd "/workspace" && ls /workspace/src');
  });

  it("does not rewrite sibling paths that only share the workspace prefix", () => {
    expect(rewriteWorkspacePathForSandboxCommand(
      'ls /home/jakob/project-backup /tmp/home/jakob/project-backup',
      "/home/jakob/project",
    )).toBe('ls /home/jakob/project-backup /tmp/home/jakob/project-backup');
  });

  it("rewrites assignment-style command arguments without touching longer suffixes", () => {
    expect(rewriteWorkspacePathForSandboxCommand(
      'ROOT=/home/jakob/project pnpm --dir /home/jakob/project build && echo /home/jakob/project.tmp',
      "/home/jakob/project",
    )).toBe('ROOT=/workspace pnpm --dir /workspace build && echo /home/jakob/project.tmp');
  });

  it("supports Windows-style workspace roots", () => {
    expect(rewriteWorkspacePathForSandboxCommand(
      'cd "C:\\Users\\jakob\\project" && type C:\\Users\\jakob\\project\\README.md',
      "C:\\Users\\jakob\\project",
    )).toBe('cd "/workspace" && type /workspace\\README.md');
  });
});
