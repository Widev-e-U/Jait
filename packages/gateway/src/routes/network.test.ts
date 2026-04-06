import { describe, expect, it } from "vitest";
import { buildInteractiveDeployCommand, buildSshAuthArgs, shellQuote } from "./network.js";

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

  it("builds an interactive deploy command that uses terminal prompts instead of askpass", () => {
    const command = buildInteractiveDeployCommand("192.168.1.10", "alice", "0.1.288");

    expect(command).toContain("ssh -tt -o StrictHostKeyChecking=no -o ConnectTimeout=10 \"alice@192.168.1.10\" 'bash -s'");
    expect(command).toContain("${SUDO:+$SUDO }systemctl enable --now jait-gateway");
    expect(command).not.toContain("SUDO_ASKPASS");
    expect(command).not.toContain("sudo -A");
  });
});
