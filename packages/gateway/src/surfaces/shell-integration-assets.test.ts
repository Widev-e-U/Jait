import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BASH_INTEGRATION_SCRIPT,
  PWSH_INTEGRATION_SCRIPT,
  SHELL_INTEGRATION_ASSETS,
  ZSH_INTEGRATION_SCRIPT,
} from "./shell-integration-assets.js";
import { hasEmbeddedIntegrationScripts, shellIntegrationScript } from "./terminal.js";

const here = dirname(fileURLToPath(import.meta.url));
// `src/surfaces` at test time, `dist/surfaces` when the suite runs from a build.
const scriptDir = [join(here, "shell-integration"), join(here, "..", "..", "src", "surfaces", "shell-integration")]
  .find((dir) => existsSync(join(dir, "bash.sh")));

const files: Array<[string, string]> = [
  ["bash.sh", BASH_INTEGRATION_SCRIPT],
  ["zsh.sh", ZSH_INTEGRATION_SCRIPT],
  ["pwsh.ps1", PWSH_INTEGRATION_SCRIPT],
];

describe("embedded shell integration assets", () => {
  it("exposes a non-empty embedded copy for every shell integration script", () => {
    expect(hasEmbeddedIntegrationScripts()).toBe(true);
    for (const [name, content] of files) {
      expect(SHELL_INTEGRATION_ASSETS[name]).toBe(content);
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("keeps the embedded copies in sync with src/surfaces/shell-integration", () => {
    // The generator (`scripts/embed-shell-integration.mjs`) writes this module
    // from the on-disk scripts. If a script changed without regenerating, the
    // packaged gateway would silently fall back to stale integration code.
    if (!scriptDir) return; // Installed copy without sources, e.g. node_modules.
    for (const [name, content] of files) {
      expect(readFileSync(join(scriptDir, name), "utf8")).toBe(content);
    }
  });

  it("materializes an embedded script on demand when no packaged copy exists", () => {
    const cache = mkdtempSync(join(tmpdir(), "jait-shell-integration-test-"));
    const previousDir = process.env["JAIT_SHELL_INTEGRATION_DIR"];
    const previousCache = process.env["JAIT_SHELL_INTEGRATION_CACHE"];
    process.env["JAIT_SHELL_INTEGRATION_DIR"] = join(cache, "definitely-not-here");
    process.env["JAIT_SHELL_INTEGRATION_CACHE"] = join(cache, "materialized");
    try {
      const resolved = shellIntegrationScript("/bin/bash");
      expect(resolved).not.toBeNull();
      expect(resolved!.type).toBe("bash");
      expect(resolved!.embedded).toBe(true);
      expect(existsSync(resolved!.path)).toBe(true);
      expect(readFileSync(resolved!.path, "utf8")).toBe(SHELL_INTEGRATION_ASSETS["bash.sh"]);
    } finally {
      if (previousDir === undefined) delete process.env["JAIT_SHELL_INTEGRATION_DIR"];
      else process.env["JAIT_SHELL_INTEGRATION_DIR"] = previousDir;
      if (previousCache === undefined) delete process.env["JAIT_SHELL_INTEGRATION_CACHE"];
      else process.env["JAIT_SHELL_INTEGRATION_CACHE"] = previousCache;
      rmSync(cache, { recursive: true, force: true });
    }
  });

  it("carries the OSC 633 markers the host relies on", () => {
    for (const [name, content] of files) {
      if (name === "pwsh.ps1") continue;
      expect(content).toContain("633;");
    }
    expect(PWSH_INTEGRATION_SCRIPT).toContain("633;");
  });
});
