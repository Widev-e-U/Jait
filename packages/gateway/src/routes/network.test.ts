import { describe, expect, it } from "vitest";
import { buildNonInteractiveScpArgs, buildNonInteractiveSshArgs, shellQuote } from "./network.js";

describe("network deploy ssh auth helpers", () => {
  it("uses batch mode for key-based auth", () => {
    expect(buildNonInteractiveSshArgs({
      ip: "192.168.1.10",
      username: "alice",
      password: null,
      command: "uname -m",
    })).toContain("BatchMode=yes");
  });

  it("uses password-oriented ssh options when a password is provided", () => {
    expect(buildNonInteractiveSshArgs({
      ip: "192.168.1.10",
      username: "alice",
      password: "secret",
      command: "uname -m",
    })).toEqual(expect.arrayContaining([
      "BatchMode=no",
      "PreferredAuthentications=password,keyboard-interactive",
      "PubkeyAuthentication=no",
      "NumberOfPasswordPrompts=1",
    ]));
  });

  it("shell-quotes single quotes safely", () => {
    expect(shellQuote("pa'ss")).toBe("'pa'\"'\"'ss'");
  });

  it("builds scp args for the guided deploy transfer", () => {
    const args = buildNonInteractiveScpArgs({
      ip: "192.168.1.10",
      username: "alice",
      password: null,
      source: "/tmp/jait-gateway",
      target: "~/.jait/jait-gateway",
    });

    expect(args).toContain("/tmp/jait-gateway");
    expect(args).toContain("alice@192.168.1.10:~/.jait/jait-gateway");
    expect(args).toContain("BatchMode=yes");
  });
});
