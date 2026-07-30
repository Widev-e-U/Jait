import { describe, expect, it } from "vitest";
import { resolve, join } from "node:path";
import { runDoctor, resolveDoctorEnvCandidates } from "./doctor.js";

describe("doctor", () => {
  it("prioritizes explicit env paths when resolving candidates", () => {
    const candidates = resolveDoctorEnvCandidates({
      cwd: "/tmp/project",
      envPath: "/tmp/custom.env",
      jaitDir: "/tmp/.jait",
    });

    expect(candidates).toEqual([
      "/tmp/custom.env",
      resolve("/tmp/project", ".env"),
      join("/tmp/.jait", ".env"),
    ]);
  });

  it("treats the mandatory Graphify runtime as a diagnostic failure", async () => {
    const result = await runDoctor({
      cwd: "/tmp/project",
      jaitDir: "/tmp/nonexistent-jait-home",
      port: 8000,
      graphifyCheck: async () => ({
        ready: false,
        managed: true,
        command: "/tmp/.jait/runtime/graphify/venv/bin/graphify",
        version: null,
        expectedVersion: "0.9.30",
        error: "Graphify is missing",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === "graphify-runtime")).toMatchObject({
      status: "fail",
      message: "Graphify is missing",
    });
  });

  it("reports invalid ports as failures", async () => {
    const result = await runDoctor({
      cwd: "/tmp/project",
      jaitDir: "/tmp/nonexistent-jait-home",
      port: "nope",
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === "gateway-health")).toMatchObject({
      status: "fail",
    });
  });
});
