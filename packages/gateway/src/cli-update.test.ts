import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const gatewayRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(gatewayRoot, "bin", "jait.mjs");

describe("gateway CLI update command", () => {
  it("shows update-specific help without starting the gateway", () => {
    const result = spawnSync(process.execPath, [cliPath, "update", "--help"], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: jait update [version]");
  });

  it("rejects invalid package selectors", () => {
    const result = spawnSync(process.execPath, [cliPath, "update", "latest;whoami"], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid gateway version or npm tag");
  });

  it.skipIf(process.platform === "win32")("installs a requested gateway version through npm", async () => {
    const testRoot = await mkdtemp(join(tmpdir(), "jait-cli-update-"));
    const fakeBin = join(testRoot, "bin");
    const fakeNpm = join(fakeBin, "npm");
    const fakeSystemctl = join(fakeBin, "systemctl");
    await mkdir(fakeBin);
    await writeFile(
      fakeNpm,
      `#!/bin/sh
if [ "$1" = "list" ]; then
  echo '{"dependencies":{"@jait/gateway":{"version":"0.1.999"}}}'
  exit 0
fi
if [ "$1" = "install" ]; then
  echo "fake install $3"
  exit 0
fi
exit 1
`,
      { mode: 0o755 },
    );
    await chmod(fakeNpm, 0o755);
    await writeFile(
      fakeSystemctl,
      `#!/bin/sh
if [ "$2" = "is-active" ]; then
  exit 0
fi
if [ "$2" = "restart" ]; then
  echo "fake restart $3"
  exit 0
fi
exit 1
`,
      { mode: 0o755 },
    );
    await chmod(fakeSystemctl, 0o755);

    const result = spawnSync(process.execPath, [cliPath, "update", "0.1.999"], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: testRoot,
        PATH: fakeBin,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("fake install @jait/gateway@0.1.999");
    expect(result.stdout).toContain("Installed @jait/gateway 0.1.999");
    expect(result.stdout).toContain("fake restart jait-gateway");
    expect(result.stdout).toContain("Restarted jait-gateway");
  });
});
