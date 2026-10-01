import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm, chmod, mkdir, lstat, symlink, readlink } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir, platform, tmpdir } from "node:os";
import { GitService, isManagedWorktreePath } from "./git.js";

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

  it("commits only staged files when some changes are unstaged", { timeout: 15_000 }, async () => {
    await writeFile(join(repoDir, "staged.txt"), "staged");
    await writeFile(join(repoDir, "unstaged-a.txt"), "a");
    await writeFile(join(repoDir, "unstaged-b.txt"), "b");

    // Stage only the first file; the other two remain unstaged.
    git(repoDir, "add staged.txt");

    const result = await svc.runStackedAction(repoDir, "commit", "test: staged only");

    expect(result.commit.status).toBe("created");
    // Only the staged file should be in the commit.
    expect(git(repoDir, "show --name-only --format= HEAD")).toBe("staged.txt");
    // The unstaged files must NOT be committed nor pushed; they stay in the tree.
    const status = git(repoDir, "status --porcelain");
    expect(status).toContain("?? unstaged-a.txt");
    expect(status).toContain("?? unstaged-b.txt");
    expect(status).not.toContain("staged.txt");
  });

  it("ignores untracked local release checkouts when committing", { timeout: 15_000 }, async () => {
    const releaseCheckoutDir = join(repoDir, ".jait", "release-checkout-20260729");
    await mkdir(releaseCheckoutDir, { recursive: true });
    git(releaseCheckoutDir, "init");
    await writeFile(join(repoDir, "file.txt"), "hello");

    const result = await svc.runStackedAction(repoDir, "commit", "test: ignore local checkout");

    expect(result.commit.status).toBe("created");
    expect(git(repoDir, "show --name-only --format= HEAD")).toBe("file.txt");
  });

  it("ignores stale local release checkout gitlinks when committing", { timeout: 15_000 }, async () => {
    const releaseCheckoutDir = join(repoDir, ".jait", "release-checkout-20260729");
    await mkdir(releaseCheckoutDir, { recursive: true });
    git(releaseCheckoutDir, "init");
    git(releaseCheckoutDir, "config user.email test@test.com");
    git(releaseCheckoutDir, "config user.name Test");
    await writeFile(join(releaseCheckoutDir, "release.txt"), "release");
    git(releaseCheckoutDir, "add release.txt");
    git(releaseCheckoutDir, "commit -m release");
    git(repoDir, "add .jait/release-checkout-20260729");
    git(repoDir, "commit -m \"track local release checkout\"");

    git(releaseCheckoutDir, "checkout --orphan empty");
    git(releaseCheckoutDir, "rm -rf .");
    await writeFile(join(repoDir, "file.txt"), "hello");

    const result = await svc.runStackedAction(repoDir, "commit", "test: ignore stale checkout");

    expect(result.commit.status).toBe("created");
    expect(git(repoDir, "show --name-only --format= HEAD")).toBe("file.txt");
  });

  it("commits only changes under the requested working directory", { timeout: 15_000 }, async () => {
    const packageDir = join(repoDir, "packages", "one");
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "inside.txt"), "inside");
    await writeFile(join(repoDir, "outside.txt"), "outside");

    const result = await svc.runStackedAction(packageDir, "commit", "test: scoped commit");

    expect(result.commit.status).toBe("created");
    expect(git(repoDir, "show --name-only --format= HEAD")).toBe("packages/one/inside.txt");
    expect(git(repoDir, "status --porcelain")).toBe("?? outside.txt");
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

  it("retries version bump pushes after a stale non-fast-forward rejection", { timeout: 15_000 }, async () => {
    const bareRemote = await mkdtemp(join(tmpdir(), "git-version-bump-remote-"));
    const collaboratorDir = await mkdtemp(join(tmpdir(), "git-version-bump-peer-"));
    try {
      git(bareRemote, "init --bare");
      git(repoDir, `remote add origin "${bareRemote}"`);

      await writeFile(join(repoDir, "package.json"), `${JSON.stringify({ name: "retry-test", version: "1.0.0" }, null, 2)}\n`);
      git(repoDir, "add package.json");
      git(repoDir, "commit -m \"chore: add package\"");
      git(repoDir, "push -u origin HEAD");

      git(collaboratorDir, `clone "${bareRemote}" .`);
      git(collaboratorDir, "config user.email test@test.com");
      git(collaboratorDir, "config user.name Test");
      await writeFile(join(collaboratorDir, "README.md"), "collaborator change\n");
      git(collaboratorDir, "add README.md");
      git(collaboratorDir, "commit -m \"docs: add readme\"");
      git(collaboratorDir, "push origin HEAD");

      const result = await svc.runVersionBumpCommitPushFlow(repoDir);
      const branch = git(repoDir, "rev-parse --abbrev-ref HEAD");

      expect(result.version.previousVersion).toBe("1.0.0");
      expect(result.version.nextVersion).toBe("1.0.1");
      expect(result.sync.status).toBe("skipped_up_to_date");
      expect(result.git.commit.status).toBe("created");
      expect(result.git.push.status).toBe("pushed");

      const packageJson = JSON.parse(await readFile(join(repoDir, "package.json"), "utf-8")) as { version: string };
      expect(packageJson.version).toBe("1.0.1");
      expect(git(repoDir, `show origin/${branch}:README.md`)).toBe("collaborator change");
      expect(git(repoDir, `show origin/${branch}:package.json`)).toContain("\"version\": \"1.0.1\"");
    } finally {
      await rm(collaboratorDir, { recursive: true, force: true });
      await rm(bareRemote, { recursive: true, force: true });
    }
  });
});

describe("GitService worktree cleanup", () => {

  it("does not multiply ignored dependencies or build mirrors into fast worktrees", { timeout: 15_000 }, async () => {
    const repoDir = await mkdtemp(join(tmpdir(), "git-disk-growth-test-"));
    const worktreeDir = `${repoDir}-worktree`;
    try {
      git(repoDir, "init");
      git(repoDir, "config user.email test@test.com");
      git(repoDir, "config user.name Test");
      await writeFile(join(repoDir, ".gitignore"), "node_modules/\njait-win/\ntarget/\n*.local\n");
      await writeFile(join(repoDir, "tracked.local"), "tracked despite ignore");
      await writeFile(join(repoDir, "untracked.txt"), "keep");
      await writeFile(join(repoDir, "file with spaces.txt"), "keep spaces");
      await symlink("jait-win", join(repoDir, "build-link"));
      await mkdir(join(repoDir, "nested", "target"), { recursive: true });
      await mkdir(join(repoDir, "node_modules"));
      await mkdir(join(repoDir, "jait-win"));
      await writeFile(join(repoDir, "nested", "target", "build.bin"), Buffer.alloc(1024 * 1024));
      await writeFile(join(repoDir, "node_modules", "dep.js"), "dependency");
      await writeFile(join(repoDir, "jait-win", "disk.bin"), Buffer.alloc(1024 * 1024));
      await writeFile(join(repoDir, "secret.local"), "excluded");
      git(repoDir, "add .gitignore");
      git(repoDir, "add -f tracked.local");
      git(repoDir, "commit -m initial");
      await new GitService().createWorktree(repoDir, git(repoDir, "branch --show-current"),
        "jait/disk-growth", worktreeDir, { fastPath: true });
      for (const path of ["node_modules", "jait-win", "nested/target", "secret.local"]) {
        await expect(lstat(join(worktreeDir, path))).rejects.toMatchObject({ code: "ENOENT" });
      }
      expect(await readFile(join(worktreeDir, "tracked.local"), "utf8")).toBe("tracked despite ignore");
      expect(await readFile(join(worktreeDir, "untracked.txt"), "utf8")).toBe("keep");
      expect(await readFile(join(worktreeDir, "file with spaces.txt"), "utf8")).toBe("keep spaces");
      expect((await lstat(join(worktreeDir, "build-link"))).isSymbolicLink()).toBe(true);
      expect(await readlink(join(worktreeDir, "build-link"))).toBe("jait-win");
      expect((await lstat(join(worktreeDir, ".git"))).isFile()).toBe(true);
    } finally {
      await rm(worktreeDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it("keeps the git pointer intact when creating a fast worktree", { timeout: 15_000 }, async () => {
    const repoDir = await mkdtemp(join(tmpdir(), "git-fast-worktree-test-"));
    const worktreeDir = `${repoDir}-worktree`;
    try {
      git(repoDir, "init");
      git(repoDir, "config user.email test@test.com");
      git(repoDir, "config user.name Test");
      await writeFile(join(repoDir, "tracked.txt"), "tracked");
      await writeFile(join(repoDir, "untracked.txt"), "copied");
      git(repoDir, "add tracked.txt");
      git(repoDir, "commit -m initial");
      const baseBranch = git(repoDir, "branch --show-current");

      await new GitService().createWorktree(
        repoDir,
        baseBranch,
        "jait/fast-worktree-test",
        worktreeDir,
        { fastPath: true },
      );

      expect((await lstat(join(worktreeDir, ".git"))).isFile()).toBe(true);
      expect(await readFile(join(worktreeDir, ".git"), "utf8")).toMatch(/^gitdir: /);
      expect(await readFile(join(worktreeDir, "tracked.txt"), "utf8")).toBe("tracked");
      expect(await readFile(join(worktreeDir, "untracked.txt"), "utf8")).toBe("copied");
      expect(git(worktreeDir, "status --porcelain")).toBe("?? untracked.txt");
    } finally {
      await rm(worktreeDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it("accepts only descendants of Jait's managed worktree root", () => {
    const managedRoot = join(homedir(), ".jait", "worktrees");

    expect(isManagedWorktreePath(join(managedRoot, "repo", "thread"))).toBe(true);
    expect(isManagedWorktreePath(managedRoot)).toBe(false);
    expect(isManagedWorktreePath(`${managedRoot}-copy/repo/thread`)).toBe(false);
  });
});
