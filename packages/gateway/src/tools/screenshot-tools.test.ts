import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createScreenshotCaptureTool, resolveOutPath } from "./screenshot-tools.js";
import type { ToolContext } from "./contracts.js";

const artifacts = resolve(import.meta.dirname, "../../../../.jait/artifacts");
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=";
const png = Buffer.from(PNG_BASE64, "base64");

vi.mock("playwright", () => ({ chromium: { launch: async () => ({ close: async () => undefined }) } }));

// Stand-in for the real Playwright surface. The factory intentionally avoids
// outer-scope references so it is safe under vi.mock hoisting.
vi.mock("../surfaces/browser.js", () => ({
  launchLocalBrowser: async () => ({
    newContext: async () => ({
      newPage: async () => ({
        goto: async () => undefined,
        waitForSelector: async () => undefined,
        locator: () => ({
          first: () => ({ click: async () => undefined, fill: async () => undefined, waitFor: async () => undefined }),
        }),
        waitForTimeout: async () => undefined,
        screenshot: async ({ path }: { path: string }) => {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(path, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=", "base64"));
        },
      }),
    }),
    close: async () => undefined,
  }),
}));

describe("screenshot.capture display copy", () => {
  let root: string;
  let project: string;
  let gatewayCwd: string;

  beforeAll(async () => {
    await mkdir(artifacts, { recursive: true });
    root = await mkdtemp(join(artifacts, "screenshot-display-"));
    project = join(root, "project");
    gatewayCwd = join(root, "gateway");
    await mkdir(join(project, ".jait/shots"), { recursive: true });
    await mkdir(gatewayCwd, { recursive: true });
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("saves the inline display copy inside the chat project, not the gateway cwd", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(gatewayCwd);
    try {
      const result = await createScreenshotCaptureTool().execute(
        { target: "https://example.com", fullPage: false },
        { projectRoot: project, sessionId: "display-copy-chat" } as unknown as ToolContext,
      );
      expect(result.ok, result.message).toBe(true);

      const data = result.data as { path: string; capturePath: string };
      const displayDir = resolve(project, ".jait", "shots");
      // The chat image route only serves paths inside the chat's project root,
      // so a cwd-relative display copy makes every screenshot unservable.
      expect(data.path.startsWith(displayDir + sep)).toBe(true);
      expect(existsSync(data.path)).toBe(true);
      expect(await readFile(data.path)).toEqual(png);
      expect(existsSync(join(gatewayCwd, ".jait"))).toBe(false);
    } finally {
      cwd.mockRestore();
    }
  });
});

describe("screenshot output paths", () => {
  const projectRoot = resolve("other-project");
  it("defaults to the active project's .jait directory", () => {
    expect(resolveOutPath(undefined, projectRoot).startsWith(resolve(projectRoot, ".jait", "shots") + sep)).toBe(true);
  });
  it("resolves an explicit relative path against the project", () => {
    expect(resolveOutPath(".jait/shots/layout", projectRoot)).toBe(resolve(projectRoot, ".jait/shots/layout.png"));
  });
  it("preserves an explicitly chosen absolute path", () => {
    const output = resolve("chosen-output.png");
    expect(resolveOutPath(output, projectRoot)).toBe(output);
  });
});
