import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RepositoryService } from "../repositories.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pathCoveredByWrites, taskBranchName, WorkflowWorkspaces, WorkspaceConflictError, WorkspaceError, integrationBranchName } from "./workspace.js";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}

function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}

async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}

const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";

describe("workflow workspaces (real git)", () => {
  let base: string;
  let repo: string;
  let workspaces: WorkflowWorkspaces;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });

  it("starts a writing task in its own worktree and leaves the user's checkout untouched", async () => {
    const headBefore = git(repo, "rev-parse", "HEAD");
    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);

    expect(git(location.path, "rev-parse", "--abbrev-ref", "HEAD")).toBe(taskBranchName(RUN, "A"));
    expect(git(repo, "rev-parse", "HEAD")).toBe(headBefore);
    expect(git(repo, "branch", "--show-current")).toBe("main");
    expect(git(repo, "status", "--porcelain")).toBe("");
    expect(existsSync(join(location.path, "README.md"))).toBe(true);
  });

  it("reports changes outside the declared writes and accepts changes inside them", async () => {
    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(location.path, "docs/guide/intro.md", "hello\n");
    await writeIn(location.path, "src/hack.ts", "export {};\n");

    const scope = await workspaces.checkScope(location.path, ["docs"]);
    expect(scope.ok).toBe(false);
    expect(scope.outside).toEqual(["src/hack.ts"]);
    expect(scope.changed).toEqual(["docs/guide/intro.md", "src/hack.ts"]);

    const whole = await workspaces.checkScope(location.path, ["."]);
    expect(whole.ok).toBe(true);
  });

  it("integrates verified work into the integration branch and never into main", async () => {
    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(location.path, "docs/a.md", "from A\n");

    const result = await workspaces.integrate(ref("A"), ["docs"], "integrate A");
    expect(result.integrated).toBe(true);

    const integration = workspaces.integrationPath(RUN);
    expect(git(integration, "rev-parse", "--abbrev-ref", "HEAD")).toBe(integrationBranchName(RUN));
    expect(await readFile(join(integration, "docs/a.md"), "utf8")).toBe("from A\n");
    expect(git(repo, "branch", "--show-current")).toBe("main");
    expect(gitOk(repo, "cat-file", "-e", `main:docs/a.md`)).toBe(false);
  });

  it("starts a dependent from the integrated head, so it sees its predecessor's changes", async () => {
    const a = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(a.path, "docs/a.md", "from A\n");
    await workspaces.integrate(ref("A"), ["docs"], "integrate A");

    const b = await workspaces.prepareWrite(ref("B"), ["src"]);
    expect(await readFile(join(b.path, "docs/a.md"), "utf8")).toBe("from A\n");
  });

  it("merges parallel writers with disjoint paths into one integration branch", async () => {
    const b = await workspaces.prepareWrite(ref("B"), ["docs"]);
    const c = await workspaces.prepareWrite(ref("C"), ["src"]);
    await writeIn(b.path, "docs/b.md", "B\n");
    await writeIn(c.path, "src/c.ts", "export const c = 1;\n");

    await workspaces.integrate(ref("B"), ["docs"], "integrate B");
    await workspaces.integrate(ref("C"), ["src"], "integrate C");

    const integration = workspaces.integrationPath(RUN);
    expect(await readFile(join(integration, "docs/b.md"), "utf8")).toBe("B\n");
    expect(await readFile(join(integration, "src/c.ts"), "utf8")).toBe("export const c = 1;\n");
    expect(git(integration, "status", "--porcelain")).toBe("");
  });

  it("aborts a conflicting merge, reports the files, and leaves the integration branch unchanged", async () => {
    const x = await workspaces.prepareWrite(ref("X"), ["."]);
    const y = await workspaces.prepareWrite(ref("Y"), ["."]);
    await writeIn(x.path, "shared.txt", "from X\n");
    await writeIn(y.path, "shared.txt", "from Y\n");
    await workspaces.integrate(ref("X"), ["."], "integrate X");
    const headAfterX = git(workspaces.integrationPath(RUN), "rev-parse", "HEAD");

    const attempt = workspaces.integrate(ref("Y"), ["."], "integrate Y");
    await expect(attempt).rejects.toBeInstanceOf(WorkspaceConflictError);
    await attempt.catch((error: unknown) => {
      expect((error as WorkspaceConflictError).files).toEqual(["shared.txt"]);
    });

    const integration = workspaces.integrationPath(RUN);
    expect(git(integration, "rev-parse", "HEAD")).toBe(headAfterX);
    expect(git(integration, "status", "--porcelain")).toBe("");
    expect(await readFile(join(integration, "shared.txt"), "utf8")).toBe("from X\n");
    expect(existsSync(join(integration, ".git"))).toBe(true);
    expect(gitOk(integration, "rev-parse", "--verify", "--quiet", "MERGE_HEAD")).toBe(false);
  });

  it("clears a merge left in progress by an interrupted process before the next operation", async () => {
    const a = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(a.path, "docs/a.md", "from A\n");
    await workspaces.integrate(ref("A"), ["docs"], "integrate A");

    // A pending task branch with its own commit, merged into integration but never committed (simulated crash).
    const d = await workspaces.prepareWrite(ref("D"), ["notes"]);
    await writeIn(d.path, "notes/d.md", "from D\n");
    git(d.path, "add", "-A");
    git(d.path, "commit", "-q", "-m", "D work");
    const integration = workspaces.integrationPath(RUN);
    expect(gitOk(integration, "merge", "--no-commit", "--no-ff", taskBranchName(RUN, "D"))).toBe(true);
    expect(gitOk(integration, "rev-parse", "--verify", "--quiet", "MERGE_HEAD")).toBe(true);

    await workspaces.prepareRead(ref("reader"));
    expect(gitOk(integration, "rev-parse", "--verify", "--quiet", "MERGE_HEAD")).toBe(false);
    expect(git(integration, "status", "--porcelain")).toBe("");
  });

  it("refuses a retry whose workspace holds changes outside the declared writes", async () => {
    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(location.path, "src/leftover.ts", "x\n");

    await expect(workspaces.prepareWrite(ref("A"), ["docs"])).rejects.toBeInstanceOf(WorkspaceError);
  });

  it("checkpoints in-scope leftovers from an earlier attempt before syncing", async () => {
    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(location.path, "docs/partial.md", "half done\n");

    await workspaces.prepareWrite(ref("A"), ["docs"]);
    expect(git(location.path, "log", "--format=%s", "-1")).toBe(`wip: earlier attempt of A`);
    expect(git(location.path, "status", "--porcelain")).toBe("");
  });

  it("only hosts runs for the owner and a repository they own", async () => {
    expect(() => workspaces.assertRunHost(USER, REPO_ID)).not.toThrow();
    expect(() => workspaces.assertRunHost("someone-else", REPO_ID)).toThrow(WorkspaceError);
    expect(() => workspaces.assertRunHost(USER, "missing-repo")).toThrow(WorkspaceError);
    expect(() => workspaces.assertRunHost(USER, null)).toThrow(WorkspaceError);
    const unconfigured = new WorkflowWorkspaces({ root: join(base, "other") });
    expect(() => unconfigured.assertRunHost(USER, REPO_ID)).toThrow(WorkspaceError);
  });

  it("maps any task id to a valid branch name", () => {
    for (const taskId of ["plain", "with.dot", "a/b c", "trailing.lock", "émoji"]) {
      const branch = taskBranchName(RUN, taskId);
      expect(gitOk(repo, "check-ref-format", "--branch", branch)).toBe(true);
    }
    expect(taskBranchName(RUN, "a.b")).not.toBe(taskBranchName(RUN, "a_b"));
  });
});

describe("pathCoveredByWrites", () => {
  it("matches by path segment and ignores named resources", () => {
    expect(pathCoveredByWrites("src/lib.rs", ["src"])).toBe(true);
    expect(pathCoveredByWrites("srcx/lib.rs", ["src"])).toBe(false);
    expect(pathCoveredByWrites("anything", ["."])).toBe(true);
    expect(pathCoveredByWrites("name:build", ["name:build"])).toBe(false);
  });
});
