import { describe, expect, it } from "vitest";
import { buildSshAuthArgs, shellQuote } from "./network.js";

describe("network deploy ssh auth helpers", () => {
  it("uses batch mode for key-based auth", () => {
    expect(buildSshAuthArgs("publickey", "")).toEqual([
      "-o", "BatchMode=yes",
    ]);
  });

  it("uses password-oriented ssh options when a password is provided", () => {
    expect(buildSshAuthArgs("password", "secret")).toEqual([
      "-o", "BatchMode=no",
      "-o", "PreferredAuthentications=password,keyboard-interactive",
      "-o", "PubkeyAuthentication=no",
      "-o", "NumberOfPasswordPrompts=1",
    ]);
  });

  it("shell-quotes single quotes safely", () => {
    expect(shellQuote("pa'ss")).toBe("'pa'\"'\"'ss'");
  });
});
