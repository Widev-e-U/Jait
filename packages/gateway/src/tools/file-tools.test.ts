/**
 * image.view tool — reads a project image and returns a base64 data URI so the
 * web UI can render it inline instead of a fallback text card.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { FileSystemSurfaceFactory } from "../surfaces/filesystem.js";
import { createImageViewTool } from "./file-tools.js";
import type { ToolContext } from "./contracts.js";

describe("image.view tool", () => {
  let project: string;
  let registry: SurfaceRegistry;

  const toolContext: ToolContext = {
    sessionId: "img-session",
    actionId: "a1",
    projectRoot: "",
    requestedBy: "test",
  };

  beforeEach(async () => {
    project = mkdtempSync(join(tmpdir(), "jait-imageview-"));
    registry = new SurfaceRegistry();
    registry.register(new FileSystemSurfaceFactory());
    toolContext.projectRoot = project;
    await registry.startSurface("filesystem", `fs-${toolContext.sessionId}`, {
      sessionId: toolContext.sessionId,
      projectRoot: project,
    });
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it("returns a base64 data URI for a PNG image", async () => {
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x01, 0x02, 0x03,
    ]);
    const imgPath = "shot.png";
    writeFileSync(join(project, imgPath), pngBytes);

    const tool = createImageViewTool(registry);
    const result = await tool.execute({ path: imgPath }, toolContext);

    expect(result.ok).toBe(true);
    const data = result.data as { dataUri: string; base64: string; mimeType: string; size: number };
    expect(data.mimeType).toBe("image/png");
    expect(data.size).toBe(pngBytes.length);
    expect(data.base64).toBe(pngBytes.toString("base64"));
    expect(data.dataUri).toBe(`data:image/png;base64,${data.base64}`);
  });

  it("derives the correct mime type for jpeg, webp, and gif", async () => {
    const tool = createImageViewTool(registry);
    const cases: Array<{ file: string; mime: string }> = [
      { file: "a.jpg", mime: "image/jpeg" },
      { file: "b.jpeg", mime: "image/jpeg" },
      { file: "c.webp", mime: "image/webp" },
      { file: "d.gif", mime: "image/gif" },
    ];
    for (const { file, mime } of cases) {
      writeFileSync(join(project, file), Buffer.from([0x01, 0x02, 0x03]));
      const result = await tool.execute({ path: file }, toolContext);
      expect(result.ok).toBe(true);
      expect((result.data as { mimeType: string }).mimeType).toBe(mime);
    }
  });

  it("rejects non-image file extensions", async () => {
    const tool = createImageViewTool(registry);
    const result = await tool.execute({ path: "notes.txt" }, toolContext);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Only PNG, JPG, GIF, or WEBP");
  });

  it("fails gracefully for a missing file", async () => {
    const tool = createImageViewTool(registry);
    const result = await tool.execute({ path: "missing.png" }, toolContext);
    expect(result.ok).toBe(false);
  });
});