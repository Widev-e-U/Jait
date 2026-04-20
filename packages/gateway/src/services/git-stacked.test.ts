import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { platform } from "node:os";
import { GitService } from "./git.js";

function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}

async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}

describe("runStackedAction – unstage on commit failure", () => {
  let repoDir: string;
  let svc: GitService;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "git-stacked-test-"));
    git(repoDir, "init");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    // Create an initial commit so HEAD exists
    await writeFile(join(repoDir, "init.txt"), "init");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("unstages files when commit fails", { timeout: 15_000 }, async () => {
    // Create a change
    await writeFile(join(repoDir, "file.txt"), "hello");

    // Make commit fail via a pre-commit hook that rejects
    const hookPath = join(repoDir, ".git", "hooks", "pre-commit");
    await writeFile(hookPath, "#!/bin/sh\nexit 1\n");
    if (platform() !== "win32") await chmod(hookPath, 0o755);

    const error = await captureError(svc.runStackedAction(repoDir, "commit", "test commit"));

    expect(error).toBeInstanceOf(Error);

    // Files should NOT be left staged
    const staged = git(repoDir, "diff --cached --name-only");
    expect(staged).toBe("");
  });

  it("does not leave staged files after commit message generation fails", { timeout: 15_000 }, async () => {
    await writeFile(join(repoDir, "file.txt"), "hello");

    // Pass undefined message so it auto-generates, but sabotage the commit
    // by making the repo read-only objects dir
    // Instead: use a commit-msg hook that rejects
    const hookPath = join(repoDir, ".git", "hooks", "commit-msg");
    await writeFile(hookPath, "#!/bin/sh\nexit 1\n");
    if (platform() !== "win32") await chmod(hookPath, 0o755);

    const error = await captureError(svc.runStackedAction(repoDir, "commit", "test commit"));

    expect(error).toBeInstanceOf(Error);

    // Verify nothing is left staged
    const staged = git(repoDir, "diff --cached --name-only");
    expect(staged).toBe("");
  });

  it("commits successfully when everything works", { timeout: 15_000 }, async () => {
    await writeFile(join(repoDir, "file.txt"), "hello");

    const result = await svc.runStackedAction(repoDir, "commit", "test: add file");

    expect(result.commit.status).toBe("created");
    // No staged or unstaged files should remain
    const status = git(repoDir, "status --porcelain");
    expect(status).toBe("");
  });

  it("sync publishes the current branch when no upstream exists", { timeout: 15_000 }, async () => {
    const bareRemote = await mkdtemp(join(tmpdir(), "git-sync-remote-"));
    git(bareRemote, "init --bare");
    git(repoDir, `remote add origin "${bareRemote}"`);

    const result = await svc.sync(repoDir);

    expect(result.pull.status).toBe("skipped_no_upstream");
    expect(result.push.status).toBe("pushed");
    expect(result.upstreamBranch).toBe("origin/master");
  });
});
