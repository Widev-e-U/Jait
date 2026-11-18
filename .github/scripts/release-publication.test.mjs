import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { parse } = createRequire(new URL("../../packages/gateway/package.json", import.meta.url))("yaml");

const root = resolve(import.meta.dirname, "../..");
const workflow = parse(readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8"));
const artifactRoot = resolve(root, ".jait/artifacts");
mkdirSync(artifactRoot, { recursive: true });

function fixture(run) {
  const directory = mkdtempSync(resolve(artifactRoot, "release-publication-"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function shell(command, cwd, env = {}) {
  return spawnSync("bash", ["-eo", "pipefail", "-c", command], {
    cwd, encoding: "utf8", env: { ...process.env, ...env },
  });
}

const steps = workflow.jobs["npm-publish"].steps;
const verify = steps.find((step) => step.name === "Verify @jait/gateway on the registry");

describe("release publication", () => {
  it("detects a version bump before the final commit of a push", () => fixture((directory) => {
    const setup = shell(`
      git init -q
      git config user.name Test
      git config user.email test@example.invalid
      mkdir -p packages/gateway
      printf '{"version":"1.0.0"}' > packages/gateway/package.json
      git add . && git commit -qm initial
      git rev-parse HEAD > base
      printf '{"version":"1.0.1"}' > packages/gateway/package.json
      git add . && git commit -qm bump
      printf followup > followup
      git add . && git commit -qm followup
    `, directory);
    assert.equal(setup.status, 0, setup.stderr);
    const output = resolve(directory, "output");
    const detect = workflow.jobs["auto-tag"].steps.find((step) => step.id === "version");
    const result = shell(detect.run, directory, {
      VERSION_BASE: readFileSync(resolve(directory, "base"), "utf8").trim(),
      GITHUB_OUTPUT: output,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(readFileSync(output, "utf8").includes("gateway_changed=true"));
    assert.ok(readFileSync(output, "utf8").includes("version=1.0.1"));
  }));

  for (const live of [false, true]) {
    it(live ? "accepts an available registry version" : "fails when npm accepts uploads but the version stays unavailable", () => fixture((directory) => {
      for (const [name, script] of Object.entries({
        npm: live ? "echo 1.0.1" : "exit 0",
        curl: "printf 404",
        sleep: "exit 0",
      })) {
        writeFileSync(resolve(directory, name), `#!/usr/bin/env bash\n${script}\n`, { mode: 0o755 });
      }
      writeFileSync(resolve(directory, "package.json"), '{"version":"1.0.1"}');
      // Keep the workflow's generated log in the project-local fixture.
      const run = verify.run.replace(/LOG=.*\n/, `LOG="${directory}/verify.log"\n`);
      const result = shell(run, directory, { PATH: `${directory}:${process.env.PATH}` });
      assert.equal(result.status, live ? 0 : 1, result.stderr);
    }));
  }

  it("verifies the gateway for every release, including dependency-only bumps", () => {
    assert.equal(verify.if, undefined);
    assert.equal(steps.find((step) => step.name === "Publish @jait/gateway").if, undefined);
  });

  it("validates the installed tarball before publishing the gateway", () => {
    const check = steps.findIndex((step) => step.name === "Validate packed gateway with registry dependencies");
    const publish = steps.findIndex((step) => step.name === "Publish @jait/gateway");
    assert.ok(check >= 0 && check < publish);
    assert.equal(steps[check].if, undefined);
    assert.equal(steps[check].run, "node scripts/check-gateway-package.mjs");
  });

  it("requires successful platform builds before publishing the release", () => {
    assert.ok(workflow.jobs.desktop.if.includes("needs.desktop-gateway-runtime.result == 'success'"));
    assert.ok(workflow.jobs.release.if.includes("needs.desktop.result == 'success'"));
    assert.ok(workflow.jobs.release.if.includes("needs.android.result == 'success'"));
  });
});
