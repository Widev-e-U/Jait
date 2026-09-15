import { describe, expect, it } from "vitest";
import { describeUpdateFailure } from "./update-failure.js";

/** Build an error shaped like the one `execSync` throws for a failed install. */
function installError(output: string, code?: string): Error & { code?: string } {
  const err = new Error(`Command failed: npm install -g @jait/gateway@0.1.857\n${output}`) as Error & {
    code?: string;
  };
  if (code) err.code = code;
  const stderr = output.split("\n").filter((line) => line.startsWith("npm error")).join("\n");
  (err as unknown as { stderr: string }).stderr = stderr;
  return err;
}

describe("describeUpdateFailure", () => {
  it("explains an unpublished workspace dependency (the real-world failure)", () => {
    const err = installError(
      [
        "npm error code ETARGET",
        "npm error notarget No matching version found for @jait/shared@^0.1.83.",
        "npm error notarget In most cases you or one of your dependencies are requesting",
        "npm error notarget a package version that doesn't exist.",
      ].join("\n"),
    );

    const failure = describeUpdateFailure(err);

    expect(failure.code).toBe("ETARGET");
    expect(failure.hint).toContain("not published on npm");
    expect(failure.detail).toContain("No matching version found for @jait/shared@^0.1.83");
  });

  it("recognises the error code when it is only on err.code", () => {
    const err = installError("something went wrong", "ETARGET");
    expect(describeUpdateFailure(err).code).toBe("ETARGET");
  });

  it("explains a not-yet-published version", () => {
    const failure = describeUpdateFailure(
      installError("npm error 404 Not Found - GET https://registry.npmjs.org/@jait%2fgateway"),
    );
    expect(failure.code).toBe("E404");
    expect(failure.hint).toContain("could not find that package version");
  });

  it("explains missing write permissions", () => {
    const failure = describeUpdateFailure(
      installError("npm error code EACCES\nnpm error syscall mkdir\nnpm error Error: EACCES: permission denied, mkdir '/usr/lib/node_modules'"),
    );
    expect(failure.code).toBe("EACCES");
    expect(failure.hint).toContain("global install directory");
  });

  it("explains DNS/network failures", () => {
    const failure = describeUpdateFailure(
      installError("npm error code EAI_AGAIN\nnpm error network request to https://registry.npmjs.org failed"),
    );
    expect(failure.code).toBe("ENETWORK");
    expect(failure.hint).toContain("npm registry");
  });

  it("explains a Node engine mismatch", () => {
    const failure = describeUpdateFailure(
      installError("npm error code EBADENGINE\nnpm error engine Unsupported engine\nnpm error notsup Required: {\"node\":\">=22\"}"),
    );
    expect(failure.code).toBe("EBADENGINE");
    expect(failure.hint).toContain("newer Node.js");
  });

  it("falls back to a null hint for unrecognised failures but keeps the output", () => {
    const failure = describeUpdateFailure(installError("npm error something entirely unexpected"));
    expect(failure.code).toBe("UNKNOWN");
    expect(failure.hint).toBeNull();
    expect(failure.detail).toContain("something entirely unexpected");
  });

  it("trims a very long log down to the tail", () => {
    const long = `${"npm warn progress ".repeat(500)}npm error code ETARGET`;
    const failure = describeUpdateFailure(new Error(long));
    expect(failure.detail.length).toBeLessThanOrEqual(1201);
    expect(failure.detail.endsWith("npm error code ETARGET")).toBe(true);
  });

  it("handles non-Error throwables", () => {
    const failure = describeUpdateFailure("npm error code ETARGET");
    expect(failure.code).toBe("ETARGET");
    expect(failure.detail).toBe("npm error code ETARGET");
  });
});
