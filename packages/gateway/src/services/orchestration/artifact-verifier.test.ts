import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepoRow } from "../repositories.js";
import { createArtifactVerifier } from "./artifact-verifier.js";
import type { VerificationRunInput } from "./orchestrator.js";

const artifactsRoot = resolve(import.meta.dirname, "../../../../../.jait/artifacts");

describe("artifact verification", () => {
  let fixture: string;
  let repository: RepoRow;
  const getById = vi.fn((id: string) => id === repository.id ? repository : undefined);
  const verifier = createArtifactVerifier({ getById });

  beforeEach(async () => {
    await mkdir(artifactsRoot, { recursive: true });
    fixture = await mkdtemp(join(artifactsRoot, "artifact-verifier-"));
    const localPath = join(fixture, "repo");
    repository = {
      id: "repo", userId: "owner", deviceId: null, name: "repo", localPath,
      defaultBranch: "main", githubUrl: null, strategy: null, createdAt: "", updatedAt: "",
    };
    await mkdir(localPath);
    await writeFile(join(localPath, "result.txt"), "result");
    await writeFile(join(fixture, "outside.txt"), "outside");
    await symlink(join(fixture, "outside.txt"), join(localPath, "escape.txt"));
    await symlink(join(localPath, "result.txt"), join(localPath, "alias.txt"));
  });

  afterEach(async () => {
    await rm(fixture, { recursive: true, force: true });
  });

  function verify(path: string, overrides: Partial<VerificationRunInput> = {}) {
    return verifier.run({
      userId: "owner", repoId: "repo", runId: "run", taskId: "task", attemptId: "attempt", workspacePath: null,
      check: { kind: "artifact", path }, signal: new AbortController().signal, ...overrides,
    });
  }

  it.each(["result.txt", "./alias.txt"])("accepts a regular file inside the repository: %s", async (path) => {
    await expect(verify(path)).resolves.toMatchObject({ passed: true });
  });

  it.each(["missing.txt", "escape.txt", "../outside.txt", ".", "name:result"])("rejects unusable paths: %s", async (path) => {
    await expect(verify(path)).resolves.toMatchObject({ passed: false });
  });

  it("requires repository ownership and a gateway-local repository", async () => {
    await expect(verify("result.txt", { userId: "someone-else" })).resolves.toMatchObject({ passed: false });
    await expect(verify("result.txt", { repoId: null })).resolves.toMatchObject({ passed: false });
    repository.deviceId = "other-node";
    await expect(verify("result.txt")).resolves.toMatchObject({ passed: false });
  });

  it("fails closed for command checks and propagates cancellation", async () => {
    await expect(verify("result.txt", { check: { kind: "command", command: "exit 0" } })).resolves.toMatchObject({ passed: false });
    await expect(verify("result.txt", { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
  });
});
