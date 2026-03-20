import { describe, expect, it } from "vitest";
import { getExternalFileMutationPath } from "./chat.js";

describe("getExternalFileMutationPath", () => {
  it("recognizes edit-style tool names used by external providers", () => {
    expect(getExternalFileMutationPath("edit", { path: "/tmp/a.ts" })).toBe("/tmp/a.ts");
    expect(getExternalFileMutationPath("file.write", { filePath: "/tmp/b.ts" })).toBe("/tmp/b.ts");
    expect(getExternalFileMutationPath("write", { file_path: "/tmp/c.ts" })).toBe("/tmp/c.ts");
    expect(getExternalFileMutationPath("create_file", { filename: "/tmp/d.ts" })).toBe("/tmp/d.ts");
    expect(getExternalFileMutationPath("replace_string_in_file", { targetFile: "/tmp/e.ts" })).toBe("/tmp/e.ts");
  });

  it("ignores non-mutating tools", () => {
    expect(getExternalFileMutationPath("read", { path: "/tmp/a.ts" })).toBeNull();
    expect(getExternalFileMutationPath("web", { path: "/tmp/a.ts" })).toBeNull();
    expect(getExternalFileMutationPath("execute", { command: "echo hi" })).toBeNull();
  });
});
