import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitService } from "./git.js";

function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}

describe("GitService.diffStats – working tree against base branch", () => {
  let repoDir: string;
  let svc: GitService;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "git-diff-stats-test-"));
    git(repoDir, "init -b main");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    await writeFile(join(repoDir, "base.txt"), "line1\nline2\nline3\n");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("counts only this thread's changes when the base branch moved ahead", async () => {
    // Branch off main, then advance main with large unrelated work.
    git(repoDir, "checkout -b jait/thread");
    git(repoDir, "checkout main");
    const bigContent = Array.from({ length: 500 }, (_, i) => `unrelated ${i}`).join("\n") + "\n";
    await writeFile(join(repoDir, "unrelated.txt"), bigContent);
    git(repoDir, "add -A");
    git(repoDir, "commit -m 'big unrelated work on main'");

    // The thread makes a tiny committed change plus an uncommitted edit.
    git(repoDir, "checkout jait/thread");
    await writeFile(join(repoDir, "feature.txt"), "hello\n");
    git(repoDir, "add -A");
    git(repoDir, "commit -m 'thread feature'");
    await writeFile(join(repoDir, "feature.txt"), "hello\nworld\n");

    const stats = await svc.diffStats(repoDir, "main");

    // Only feature.txt (committed + uncommitted), NOT main's 500-line file.
    expect(stats.files).toBe(1);
    expect(stats.insertions).toBe(2);
    expect(stats.deletions).toBe(0);
    expect(stats.hasChanges).toBe(true);
  });

  it("still reports thread changes when the branch is fully behind the base", async () => {
    // Thread branch has no commits of its own; main advanced afterward.
    git(repoDir, "checkout -b jait/thread");
    git(repoDir, "checkout main");
    await writeFile(join(repoDir, "more.txt"), "a\nb\nc\nd\n");
    git(repoDir, "add -A");
    git(repoDir, "commit -m 'main advances'");

    git(repoDir, "checkout jait/thread");
    await writeFile(join(repoDir, "base.txt"), "line1\nline2\nline3\nline4\n");

    const stats = await svc.diffStats(repoDir, "main");

    // Should not surface main's new commit as this thread's work — only the
    // single uncommitted line added to the tracked file.
    expect(stats.insertions).toBe(1);
    expect(stats.deletions).toBe(0);
    expect(stats.files).toBe(1);
  });
});
