import { afterEach, describe, expect, it, vi } from "vitest";
import { access, mkdir, mkdtemp, readdir, rm, writeFile, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createBrowserRecordTool } from "./browser-tools.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { ToolContext } from "./contracts.js";

const root = resolve(import.meta.dirname, "../../../../.jait/artifacts");
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture(screenshot: (path: string) => Promise<string>) {
  await mkdir(root, { recursive: true });
  const projectRoot = await mkdtemp(resolve(root, "record-test-"));
  directories.push(projectRoot);
  const context: ToolContext = { projectRoot, sessionId: "chat", actionId: "action", userId: "user", requestedBy: "test" };
  const session = { sessionId: "chat", browserId: "browser", controller: "agent", secretSafe: false };
  let listener: (id: string) => void = () => {};
  const surface = { id: "browser", type: "browser", state: "running", sessionId: "chat", screenshot };
  const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
  const collaboration = {
    getSessionByPreviewSessionId: () => ({ ...session, id: "preview" }),
    getSessionByBrowserId: () => ({ ...session, id: "preview" }),
    assertAgentControl: () => { if (session.controller !== "agent") throw new Error("control lost"); },
    onBrowserControlLost: (callback: (id: string) => void) => { listener = callback; return () => { listener = () => {}; }; },
  };
  return { tool: createBrowserRecordTool(registry, collaboration), context, session, handoff: () => { session.controller = "user"; listener("browser"); } };
}

describe("browser recording", () => {
  it("rejects secret-safe sessions before capturing", async () => {
    const screenshot = vi.fn();
    const f = await fixture(screenshot);
    f.session.secretSafe = true;
    await expect(f.tool.execute({ action: "start" }, f.context)).rejects.toThrow("permission was lost");
    expect(screenshot).not.toHaveBeenCalled();
  });

  it("discards an in-flight frame when control is handed to the user", async () => {
    let release!: () => void;
    let began!: () => void;
    const started = new Promise<void>(r => { began = r; });
    const gate = new Promise<void>(r => { release = r; });
    const f = await fixture(async path => { began(); await gate; await writeFile(path, "private frame"); return path; });
    expect((await f.tool.execute({ action: "start" }, f.context)).ok).toBe(true);
    await started;
    f.handoff();
    release();
    const result = await f.tool.execute({ action: "stop" }, f.context);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("discarded");
    expect(await readdir(resolve(f.context.projectRoot, ".jait/artifacts"))).toEqual([]);
  });

  it("rejects an artifact directory symlink outside the project", async () => {
    const f = await fixture(async path => path);
    const external = await mkdtemp(resolve(root, "record-external-"));
    directories.push(external);
    await symlink(external, resolve(f.context.projectRoot, ".jait"));
    await expect(f.tool.execute({ action: "start" }, f.context)).rejects.toThrow("escapes the project");
    expect(await readdir(external)).toEqual([]);
  });

  it("isolates recordings by user and rejects a second start", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const f = await fixture(async path => { await gate; await writeFile(path, "frame"); return path; });
    expect((await f.tool.execute({ action: "start" }, f.context)).ok).toBe(true);
    expect((await f.tool.execute({ action: "start" }, f.context)).ok).toBe(false);
    expect((await f.tool.execute({ action: "stop" }, { ...f.context, userId: "other" })).ok).toBe(false);
    f.handoff(); release();
    await f.tool.execute({ action: "stop" }, f.context);
  });

  it("records real browser interactions into a playable MP4", async () => {
    try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); await access(chromium.executablePath()); }
    catch { return; }
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
      await page.setContent('<button onclick="document.body.style.background=\'red\'">Change</button>');
      let frames = 0;
      const f = await fixture(async path => { await page.screenshot({ path }); frames++; return path; });
      expect((await f.tool.execute({ action: "start" }, f.context)).ok).toBe(true);
      await vi.waitFor(() => expect(frames).toBeGreaterThanOrEqual(1));
      await page.click("button");
      await vi.waitFor(() => expect(frames).toBeGreaterThanOrEqual(2));
      const result = await f.tool.execute({ action: "stop" }, f.context);
      expect(result.ok, result.message).toBe(true);
      const path = (result.data as { path: string }).path;
      const metadata = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "csv=p=0", path], { encoding: "utf8" });
      expect(metadata).toContain("h264,1280,720");
    } finally { await browser.close(); }
  }, 30000);
});
