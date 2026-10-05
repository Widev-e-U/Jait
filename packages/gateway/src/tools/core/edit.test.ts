import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SurfaceRegistry } from "../../surfaces/registry.js";
import { FileSystemSurface } from "../../surfaces/filesystem.js";
import { createEditTool } from "./edit.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "jait-edit-")); roots.push(root);
  const registry = new SurfaceRegistry(), surface = new FileSystemSurface("fs-edit");
  await surface.start({ sessionId: "edit", projectRoot: root }); registry.registerInstance(surface.id, surface);
  return { root, tool: createEditTool(registry), context: { sessionId: "edit", actionId: "edit", projectRoot: root, requestedBy: "agent" as const } };
}
it("rejects an identical patch instead of claiming it changed the file", async () => {
  const { root, tool, context } = await fixture();
  await writeFile(join(root, "result.txt"), "fixture");
  const result = await tool.execute({ path: "result.txt", search: "fixture", replace: "fixture", explanation: "Append newline" }, context);
  expect(result.ok).toBe(false); expect(result.message).toContain("identical");
  expect(await readFile(join(root, "result.txt"), "utf8")).toBe("fixture");
});
it("preserves newline and Unicode bytes and reports exact write metadata", async () => {
  const { root, tool, context } = await fixture();
  for (const content of ["évidence", "évidence\n", "évidence\r\n"]) {
    const result = await tool.execute({ path: "result.txt", content, explanation: "Write exact bytes" }, context);
    expect(result.ok).toBe(true);
    expect(await readFile(join(root, "result.txt"), "utf8")).toBe(content);
    expect(result.data).toMatchObject({ size: Buffer.byteLength(content), trailingNewline: content.endsWith("\n") });
  }
});
