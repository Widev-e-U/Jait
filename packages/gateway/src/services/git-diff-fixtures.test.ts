import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitService } from "./git.js";

describe("Git diff statistics on isolated repositories", () => {
  let directory: string;
  let service: GitService;
  const git = (...args: string[]) => execFileSync("git", args, {
    cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  beforeEach(async () => {
    const output = resolve(import.meta.dirname, "../../../../.jait/artifacts/git-diff-tests");
    await mkdir(output, { recursive: true });
    directory = await mkdtemp(join(output, "repo-"));
    git("init", "--initial-branch=main", "--template=");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "commit.gpgsign", "false");
    await writeFile(join(directory, ".git", "empty-excludes"), "");
    git("config", "core.excludesFile", join(directory, ".git", "empty-excludes"));
    await writeFile(join(directory, "tracked.txt"), "initial\n");
    git("add", "tracked.txt");
    git("commit", "-m", "initial");
    service = new GitService();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("counts untracked files alongside tracked edits without inventing insertion counts", async () => {
    await writeFile(join(directory, "tracked.txt"), "initial\nadded\n");
    await writeFile(join(directory, "untracked.txt"), "not in a Git diff\n");

    expect(await service.diffStats(directory)).toEqual({
      files: 2, insertions: 1, deletions: 0, hasChanges: true,
    });
  });

  it("reports no changes when the branch equals the merge base without merge history", async () => {
    git("branch", "topic");

    expect(await service.diffStats(directory, "main", "topic")).toEqual({
      files: 0, insertions: 0, deletions: 0, hasChanges: false,
    });
  });
});
