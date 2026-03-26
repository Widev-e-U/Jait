import { describe, expect, it } from "vitest";
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
      "/tmp/project/.env",
      "/tmp/.jait/.env",
    ]);
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
