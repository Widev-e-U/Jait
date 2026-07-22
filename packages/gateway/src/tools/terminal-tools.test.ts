import { describe, expect, it } from "vitest";
import { rewriteProjectPathForSandboxCommand } from "./terminal-tools.js";

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
