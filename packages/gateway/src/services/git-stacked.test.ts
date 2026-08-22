import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm, chmod, mkdir } from "node:fs/promises";
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
  it("copies repository contents into the existing worktree instead of nesting a checkout", () => {
    const service = new GitService() as unknown as {
      pickCopyCommand(source: string, destination: string): string;
    };

    expect(service.pickCopyCommand("/source-repo", "/target-worktree"))
      .toContain('"/source-repo/." "/target-worktree"');
  });

  it("accepts only descendants of Jait's managed worktree root", () => {
    const managedRoot = join(homedir(), ".jait", "worktrees");

    expect(isManagedWorktreePath(join(managedRoot, "repo", "thread"))).toBe(true);
    expect(isManagedWorktreePath(managedRoot)).toBe(false);
    expect(isManagedWorktreePath(`${managedRoot}-copy/repo/thread`)).toBe(false);
  });
});
