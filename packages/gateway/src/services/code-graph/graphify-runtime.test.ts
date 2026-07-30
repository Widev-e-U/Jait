import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ensureGraphifyRuntime,
  GRAPHIFY_PACKAGE_VERSION,
  GraphifyRuntimeError,
  getGraphifyRuntimePaths,
  inspectGraphifyRuntime,
  resolveGraphifyCommand,
} from "./graphify-runtime.js";

describe("Graphify runtime", () => {
  it("resolves the Jait-managed executable by default", async () => {
    const jaitDir = await mkdtemp(join(tmpdir(), "jait-graphify-path-"));
    expect(resolveGraphifyCommand({ jaitDir, env: {} })).toBe(getGraphifyRuntimePaths(jaitDir).commandPath);
  });

  it("provisions and pins Graphify in an isolated virtual environment", async () => {
    const jaitDir = await mkdtemp(join(tmpdir(), "jait-graphify-runtime-"));
    const paths = getGraphifyRuntimePaths(jaitDir);
    const calls: Array<{ command: string; args: string[] }> = [];
    let installed = false;

    const status = await ensureGraphifyRuntime({
      jaitDir,
      env: {},
      execute: async (command, args) => {
        calls.push({ command, args });
        if (command === paths.commandPath && args[0] === "--version") {
          if (!installed) throw Object.assign(new Error("missing"), { code: "ENOENT" });
          return { stdout: `graphify ${GRAPHIFY_PACKAGE_VERSION}\n`, stderr: "" };
        }
        if ((command === "python3" || command === "python") && args[0] === "--version") {
          return { stdout: "Python 3.12.3\n", stderr: "" };
        }
        if ((command === "python3" || command === "python") && args.includes("venv")) {
          return { stdout: "", stderr: "" };
        }
        if (command === paths.pythonPath && args.includes("pip")) {
          installed = true;
          return { stdout: "installed", stderr: "" };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      },
    });

    expect(status).toMatchObject({
      ready: true,
      managed: true,
      command: paths.commandPath,
    });
    expect(calls.some((call) => call.args.includes(`graphifyy==${GRAPHIFY_PACKAGE_VERSION}`))).toBe(true);
    const metadata = JSON.parse(await readFile(paths.metadataPath, "utf8")) as { version: string };
    expect(metadata.version).toBe(GRAPHIFY_PACKAGE_VERSION);
  });

  it("honors a validated custom Graphify command", async () => {
    const status = await ensureGraphifyRuntime({
      env: { JAIT_GRAPHIFY_COMMAND: "/opt/graphify/bin/graphify" },
      execute: async (command, args) => {
        expect(command).toBe("/opt/graphify/bin/graphify");
        expect(args).toEqual(["--version"]);
        return { stdout: "graphify custom-build", stderr: "" };
      },
    });

    expect(status).toMatchObject({ ready: true, managed: false });
  });

  it("rejects hosts without a supported Python runtime", async () => {
    const jaitDir = await mkdtemp(join(tmpdir(), "jait-graphify-python-"));
    const paths = getGraphifyRuntimePaths(jaitDir);

    await expect(ensureGraphifyRuntime({
      jaitDir,
      env: {},
      execute: async (command, args) => {
        if (command === paths.commandPath) throw new Error("missing");
        if (args[0] === "--version") return { stdout: "Python 3.9.18", stderr: "" };
        throw new Error("unexpected");
      },
    })).rejects.toBeInstanceOf(GraphifyRuntimeError);
  });

  it("reports a managed version mismatch as not ready", async () => {
    const status = await inspectGraphifyRuntime({
      jaitDir: "/tmp/jait-version-mismatch",
      env: {},
      execute: async () => ({ stdout: "graphify 0.9.1", stderr: "" }),
    });

    expect(status.ready).toBe(false);
    expect(status.error).toContain(GRAPHIFY_PACKAGE_VERSION);
  });
});
