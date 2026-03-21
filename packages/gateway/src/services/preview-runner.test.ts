import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectFramework, detectPreviewCommand } from "./preview-runner.js";

function createWorkspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "preview-runner-"));
  for (const [relativePath, content] of Object.entries(files)) {
    writeFileSync(join(root, relativePath), content, "utf8");
  }
  return root;
}

describe("preview-runner command detection", () => {
  it("builds npm exec commands with the required separator for vite", () => {
    const workspaceRoot = createWorkspace({
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        devDependencies: { vite: "^6.0.0" },
      }),
      "vite.config.ts": "export default {};\n",
    });

    try {
      expect(detectFramework(workspaceRoot)?.name).toBe("vite");
      expect(detectPreviewCommand(workspaceRoot, null, 3002)).toBe(
        "npm exec -- vite --host 127.0.0.1 --port 3002",
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("builds npm exec commands with the required separator for next", () => {
    const workspaceRoot = createWorkspace({
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        dependencies: { next: "^15.0.0" },
      }),
      "next.config.js": "module.exports = {};\n",
    });

    try {
      expect(detectFramework(workspaceRoot)?.name).toBe("next");
      expect(detectPreviewCommand(workspaceRoot, null, 4010)).toBe(
        "npm exec -- next dev --hostname 127.0.0.1 --port 4010",
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
