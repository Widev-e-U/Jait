import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const workflow = readFileSync(resolve(repositoryRoot, ".github/workflows/release.yml"), "utf8");
const releaseGitScript = resolve(repositoryRoot, ".github/scripts/release-git.sh");

function runWithFakeGit(mode: "retry" | "absent" | "fail", command = "tag-exists") {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "jait-release-git-"));
  const fakeGit = resolve(fixtureRoot, "git");
  const stateFile = resolve(fixtureRoot, "attempts");
  const caBundle = resolve(fixtureRoot, "ca-certificates.crt");

  writeFileSync(
    fakeGit,
    `#!/usr/bin/env bash
attempts=0
if [ -f "$FAKE_GIT_STATE" ]; then
  read -r attempts < "$FAKE_GIT_STATE"
fi
attempts=$((attempts + 1))
printf '%s\\n' "$attempts" > "$FAKE_GIT_STATE"

case "$FAKE_GIT_MODE" in
  retry)
    if [ "$attempts" -lt 3 ]; then
      exit 128
    fi
    printf '%s\\n' "0123456789abcdef refs/tags/v1.2.3"
    exit 0
    ;;
  absent)
    exit 2
    ;;
  fail)
    exit 128
    ;;
esac
`,
  );
  chmodSync(fakeGit, 0o755);
  writeFileSync(caBundle, "test CA bundle");

  const result = spawnSync("bash", [releaseGitScript, command, "v1.2.3"], {
    encoding: "utf8",
    env: {
      ...process.env,
      FAKE_GIT_MODE: mode,
      FAKE_GIT_STATE: stateFile,
      PATH: `${fixtureRoot}:${process.env.PATH ?? ""}`,
      RELEASE_GIT_CA_BUNDLE: caBundle,
      RELEASE_GIT_MAX_ATTEMPTS: "3",
      RELEASE_GIT_RETRY_DELAY_SECONDS: "0",
    },
  });
  const attempts = Number(readFileSync(stateFile, "utf8").trim());
  rmSync(fixtureRoot, { force: true, recursive: true });

  return { ...result, attempts };
}

describe("release Git transport", () => {
  it("uses the hardened Git transport for tag checks and pushes", () => {
    expect(workflow).toContain('bash .github/scripts/release-git.sh tag-exists "$TAG"');
    expect(workflow).toContain('bash .github/scripts/release-git.sh push-tag "$TAG"');
    expect(existsSync(releaseGitScript)).toBe(true);
    const script = readFileSync(releaseGitScript, "utf8");
    expect(script).toContain("GIT_SSL_CAINFO");
    expect(script).toContain("RELEASE_GIT_MAX_ATTEMPTS");
    expect(script).toContain("http.sslVerify=true");
  });

  it("retries transient Git transport failures", () => {
    const result = runWithFakeGit("retry");
    expect(result.status).toBe(0);
    expect(result.attempts).toBe(3);
    expect(result.stderr).toContain("attempt 2/3");
  });

  it("distinguishes an absent tag from a transport failure", () => {
    const absent = runWithFakeGit("absent");
    expect(absent.status).toBe(1);
    expect(absent.attempts).toBe(1);

    const failed = runWithFakeGit("fail");
    expect(failed.status).toBe(70);
    expect(failed.attempts).toBe(3);
    expect(failed.stderr).toContain("Unable to verify tag");
  });
});
