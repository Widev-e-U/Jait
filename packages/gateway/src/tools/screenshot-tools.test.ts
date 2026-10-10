import { describe, expect, it } from "vitest";
import { resolve, sep } from "node:path";
import { resolveOutPath } from "./screenshot-tools.js";

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
