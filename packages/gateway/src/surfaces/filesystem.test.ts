import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSystemSurface } from "./filesystem.js";

const artifacts = resolve(import.meta.dirname, "../../../../.jait/artifacts/filesystem-tests");
const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  await mkdir(artifacts, { recursive: true });
  const root = await mkdtemp(join(artifacts, "copy-"));
  cleanup.push(root);
  await mkdir(join(root, "source"));
  await writeFile(join(root, "source/file.txt"), "fixture");
  const surface = new FileSystemSurface("fs-test");
  await surface.start({ sessionId: "copy-test", projectRoot: root });
  return { root, surface };
}
describe("filesystem copy boundaries", () => {
  it("copies directories and files to distinct destinations", async () => {
    const { root, surface } = await fixture();
    await surface.copyFile("source", "sibling");
    expect(await readFile(join(root, "sibling/file.txt"), "utf8")).toBe("fixture");
    await surface.copyFile("source/file.txt", "file-copy.txt");
    expect(await readFile(join(root, "file-copy.txt"), "utf8")).toBe("fixture");
  });
  it("rejects self copies, descendants and symlink aliases before recursive copy", async () => {
    const { root, surface } = await fixture();
    await expect(surface.copyFile("source", "source")).rejects.toThrow("Cannot copy a directory");
    await expect(surface.copyFile("source", "source/nested")).rejects.toThrow("Cannot copy a directory");
    await symlink(join(root, "source"), join(root, "alias"));
    await expect(surface.copyFile("source", "alias")).rejects.toThrow("Cannot copy a directory");
    await expect(surface.copyFile("source", "alias/child")).rejects.toThrow("Cannot copy a directory");
    await expect(surface.copyFile("source", "../escape")).rejects.toThrow();
  });
});
