import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileListTool, createFilePatchTool, createFileReadTool, createFileWriteTool } from "../../tools/file-tools.js";
import { ToolRegistry } from "../../tools/registry.js";
import {
  authorizeWorkflowToolCall,
  WORKFLOW_READ_TOOLS,
  WORKFLOW_WRITE_TOOLS,
  type WorkspaceMode,
} from "./workflow-tool-guard.js";

describe("workflow tool guard", () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  const claims = { reads: ["src"], writes: ["docs"] };

  function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }

  it("allows file writes inside the declared writes", () => {
    expect(call("file.write", { path: "docs/new.md", content: "x" })).toEqual({ ok: true });
    expect(call("file.patch", { path: "docs/a.md", search: "a", replace: "b" })).toEqual({ ok: true });
  });

  it("refuses writes outside the declared writes, even inside the workspace", () => {
    const verdict = call("file.write", { path: "src/lib.ts", content: "x" });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/outside the declared writes/);
  });

  it("allows reads of declared reads and writes, and refuses anything else", () => {
    expect(call("file.read", { path: "src/lib.ts" })).toEqual({ ok: true });
    expect(call("file.read", { path: "docs/a.md" })).toEqual({ ok: true });
    expect(call("file.read", { path: "other.md" }).ok).toBe(false);
  });

  it("refuses tools the workspace mode does not allow", () => {
    expect(call("terminal.run", { command: "ls" }).ok).toBe(false);
    expect(call("file.write", { path: "docs/x.md", content: "x" }, "read").ok).toBe(false);
    expect(call("file.read", { path: "src/lib.ts" }, "read")).toEqual({ ok: true });
  });

  it("refuses paths that leave the workspace, relative or absolute", () => {
    expect(call("file.read", { path: "../outside/secret.txt" }).ok).toBe(false);
    expect(call("file.read", { path: join(outside, "secret.txt") }).ok).toBe(false);
    expect(call("file.write", { path: "/etc/hosts", content: "x" }).ok).toBe(false);
  });

  it("accepts absolute paths that stay inside the workspace", () => {
    expect(call("file.write", { path: join(root, "docs", "abs.md"), content: "x" })).toEqual({ ok: true });
  });

  it("refuses a symlink inside the workspace that points outside it", async () => {
    await symlink(outside, join(root, "docs", "escape"));
    expect(call("file.write", { path: "docs/escape/pwned.md", content: "x" }).ok).toBe(false);
    expect(call("file.read", { path: "docs/escape/secret.txt" }).ok).toBe(false);
  });

  it("does not treat a sibling that shares a prefix as inside a declared path", () => {
    expect(call("file.write", { path: "docsx/y.md", content: "x" }).ok).toBe(false);
  });

  it("treats file.list without a path as the workspace root, which needs the whole project declared", () => {
    expect(call("file.list", {}, "read", { reads: ["."], writes: [] })).toEqual({ ok: true });
    expect(call("file.list", {}, "read", { reads: ["src"], writes: [] }).ok).toBe(false);
  });

  it("refuses control characters and non-string paths", () => {
    expect(call("file.read", { path: "src/\u0000lib.ts" }).ok).toBe(false);
    expect(call("file.read", { path: 3 }).ok).toBe(false);
    expect(call("file.read", "src/lib.ts").ok).toBe(false);
  });
});

describe("workflow tool names", () => {
  it("are all registered by the file tools the gateway ships, so workers can be given them", () => {
    // The surface registry is only used when a tool runs, so building the definitions needs no real surfaces.
    const surfaces = {} as never;
    const registry = new ToolRegistry();
    for (const tool of [
      createFileReadTool(surfaces),
      createFileListTool(surfaces),
      createFileWriteTool(surfaces),
      createFilePatchTool(surfaces),
    ]) {
      registry.register(tool);
    }
    for (const name of [...WORKFLOW_READ_TOOLS, ...WORKFLOW_WRITE_TOOLS]) {
      expect(registry.has(name), name).toBe(true);
    }
  });
});
