import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { RepositoryService } from "../repositories.js";
import type { VerificationRunner } from "./orchestrator.js";
import { isNamedResourceKey, normalizeResourceKey, PROJECT_ROOT_KEY } from "./resources.js";

export function createArtifactVerifier(repositories: Pick<RepositoryService, "getById">): VerificationRunner {
  return {
    async run({ userId, repoId, check, signal, workspacePath }) {
      signal.throwIfAborted();
      if (check.kind !== "artifact") {
        return { passed: false, detail: "command verification requires a configured consent-aware runner" };
      }
      const path = normalizeResourceKey(check.path);
      if (!path || path === PROJECT_ROOT_KEY || isNamedResourceKey(path)) {
        return { passed: false, detail: "artifact path must be a repository-relative file" };
      }
      const repository = repoId ? repositories.getById(repoId) : undefined;
      if (!repository || repository.userId !== userId || repository.deviceId || !isAbsolute(repository.localPath)) {
        return { passed: false, detail: "an owned gateway-local repository is required" };
      }
      try {
        // A task workspace is checked when present; it is a gateway-managed worktree of the same repository.
        const root = await realpath(workspacePath ?? repository.localPath);
        const artifact = await realpath(resolve(root, path));
        const fromRoot = relative(root, artifact);
        if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
          return { passed: false, detail: "artifact resolves outside the repository" };
        }
        const metadata = await stat(artifact);
        signal.throwIfAborted();
        return metadata.isFile()
          ? { passed: true, detail: "artifact file exists in the repository" }
          : { passed: false, detail: "artifact must be a regular file" };
      } catch {
        signal.throwIfAborted();
        return { passed: false, detail: "artifact could not be verified" };
      }
    },
  };
}
