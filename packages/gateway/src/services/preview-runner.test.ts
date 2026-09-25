import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalPreviewRunner, detectFramework, detectPackageManager, detectPreviewCommand, resolvePreviewProjectRoot } from "./preview-runner.js";

function createProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "preview-runner-"));
  for (const [relativePath, content] of Object.entries(files)) {
    writeFileSync(join(root, relativePath), content, "utf8");
  }
  return root;
}

describe("preview-runner lifecycle", () => {
  it("reports an early command exit with its output", async () => {
    const projectRoot = createProject({ "package.json": JSON.stringify({ name: "broken-preview" }) });
    const runner = new LocalPreviewRunner();
    const startedAt = Date.now();
    try {
      await expect(runner.start({
        projectRoot,
        command: "node -e 'console.error(\"missing config\"); process.exit(3)'",
      }, () => {})).rejects.toThrow(/missing config/);
      expect(Date.now() - startedAt).toBeLessThan(5000);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("stops the dev server process when preview stops", async () => {
    const projectRoot = createProject({
      "package.json": JSON.stringify({ name: "preview-child", scripts: { dev: "node server.cjs" } }),
      "server.cjs": "const http = require('node:http'); const fs = require('node:fs'); fs.writeFileSync('server.pid', String(process.pid)); http.createServer((_req, res) => res.end('ready')).listen(Number(process.env.PORT), '0.0.0.0');",
    });
    const runner = new LocalPreviewRunner();
    let serverPid: number | null = null;
    try {
      const preview = await runner.start({ projectRoot, command: "npm run dev" }, () => {});
      serverPid = Number(readFileSync(join(projectRoot, "server.pid"), "utf8"));
      expect((await fetch(preview.url)).ok).toBe(true);
      await runner.stop(preview);
      await vi.waitFor(async () => {
        await expect(fetch(preview.url, { signal: AbortSignal.timeout(300) })).rejects.toThrow();
      }, { timeout: 3000, interval: 100 });
    } finally {
      if (serverPid) {
        try { process.kill(serverPid, "SIGKILL"); } catch { /* already stopped */ }
      }
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("preview-runner command detection", () => {
  it("selects the only frontend app in a monorepo", () => {
    const root = createProject({
      "package.json": JSON.stringify({ name: "workspace", workspaces: ["apps/*"], scripts: { dev: "run-all" } }),
      "bun.lock": "",
    });
    const webRoot = join(root, "apps", "web");
    mkdirSync(webRoot, { recursive: true });
    writeFileSync(join(webRoot, "package.json"), JSON.stringify({
      name: "web", scripts: { dev: "vite" }, devDependencies: { vite: "^6.0.0" },
    }));
    try {
      expect(resolvePreviewProjectRoot(root)).toBe(webRoot);
      expect(detectPackageManager(webRoot)).toBe("bun");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the project root when it already contains a frontend", () => {
    const root = createProject({
      "package.json": JSON.stringify({ name: "web", scripts: { dev: "vite" }, devDependencies: { vite: "^6.0.0" } }),
    });
    try {
      expect(resolvePreviewProjectRoot(root)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the current Bun lockfile for preview commands", () => {
    const projectRoot = createProject({
      "package.json": JSON.stringify({ name: "fixture", devDependencies: { vite: "^6.0.0" } }),
      "bun.lock": "",
    });
    try {
      expect(detectPackageManager(projectRoot)).toBe("bun");
      expect(detectPreviewCommand(projectRoot, null, 5173)).toBe(
        "bun run vite --host 0.0.0.0 --port 5173",
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("builds npm exec commands with the required separator for vite", () => {
    const projectRoot = createProject({
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        devDependencies: { vite: "^6.0.0" },
      }),
      "vite.config.ts": "export default {};\n",
    });

    try {
      expect(detectFramework(projectRoot)?.name).toBe("vite");
      expect(detectPreviewCommand(projectRoot, null, 3002)).toBe(
        "npm exec -- vite --host 0.0.0.0 --port 3002",
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("builds npm exec commands with the required separator for next", () => {
    const projectRoot = createProject({
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        dependencies: { next: "^15.0.0" },
      }),
      "next.config.js": "module.exports = {};\n",
    });

    try {
      expect(detectFramework(projectRoot)?.name).toBe("next");
      expect(detectPreviewCommand(projectRoot, null, 4010)).toBe(
        "npm exec -- next dev --hostname 0.0.0.0 --port 4010",
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
