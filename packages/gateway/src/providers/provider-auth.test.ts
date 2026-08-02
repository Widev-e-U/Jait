import { delimiter } from "node:path";
import { describe, expect, it } from "vitest";
import { extractDeviceAuthDetails, buildProviderAuthEnv, parseCommandLine, stripAnsi } from "./provider-auth.js";

describe("provider auth helpers", () => {
  it("parses quoted command paths and quoted default arguments", () => {
    expect(parseCommandLine(`"/Applications/Codex CLI/codex" login --profile "QA Team"`)).toEqual({
      command: "/Applications/Codex CLI/codex",
      args: ["login", "--profile", "QA Team"],
    });
  });

  it("preserves escaped quotes inside double-quoted arguments", () => {
    expect(parseCommandLine(`codex login --message "Use \\\"staging\\\" profile"`)).toEqual({
      command: "codex",
      args: ["login", "--message", `Use "staging" profile`],
    });
  });

  it("preserves Windows path separators in quoted command paths", () => {
    expect(parseCommandLine(`"C:\\Program Files\\Codex\\codex.exe" login`)).toEqual({
      command: "C:\\Program Files\\Codex\\codex.exe",
      args: ["login"],
    });
  });

  it("preserves Windows path separators in unquoted arguments", () => {
    expect(parseCommandLine(`codex login --config C:\\Users\\Alice\\.codex\\auth.json`)).toEqual({
      command: "codex",
      args: ["login", "--config", "C:\\Users\\Alice\\.codex\\auth.json"],
    });
  });

  it("extracts verification URL and user code from device login output", () => {
    const details = extractDeviceAuthDetails([
      "Open https://auth.openai.com/activate in your browser",
      "Your code is ABCD-EFGH",
    ].join("\n"));

    expect(details).toEqual({
      verificationUri: "https://auth.openai.com/activate",
      userCode: "ABCD-EFGH",
    });
  });

  it("strips terminal escape sequences before parsing", () => {
    const output = "\u001b[32mCode: WXYZ-1234\u001b[0m\nVisit https://github.com/login/device";

    expect(stripAnsi(output)).toContain("Code: WXYZ-1234");
    expect(extractDeviceAuthDetails(output)).toMatchObject({
      verificationUri: "https://github.com/login/device",
      userCode: "WXYZ-1234",
    });
  });

  it("does not mistake authorization labels for device codes", () => {
    const details = extractDeviceAuthDetails([
      "DEVICE AUTHORIZATION",
      "Open https://auth.openai.com/activate in your browser",
      "Code: AUTHORIZATION",
      "Use code AB12-CD34 to continue",
    ].join("\n"));

    expect(details).toEqual({
      verificationUri: "https://auth.openai.com/activate",
      userCode: "AB12-CD34",
    });
  });

  it("does not mistake Codex placeholder text for the device code", () => {
    const details = extractDeviceAuthDetails([
      "Open https://auth.openai.com/activate in your browser",
      "Enter THIS-ONE-TIME-CODE",
      "Use code XY12-ZZ90 to continue",
    ].join("\n"));

    expect(details).toEqual({
      verificationUri: "https://auth.openai.com/activate",
      userCode: "XY12-ZZ90",
    });
  });

  it("parses the Codex device code from the line after the instruction", () => {
    const details = extractDeviceAuthDetails([
      "Welcome to Codex [v0.125.0]",
      "Follow these steps to sign in with ChatGPT using device code authorization:",
      "",
      "1. Open this link in your browser and sign in to your account",
      "   https://auth.openai.com/codex/device",
      "",
      "2. Enter this one-time code (expires in 15 minutes)",
      "   1URT-UU74B",
      "",
      "Device codes are a common phishing target. Never share this code.",
    ].join("\n"));

    expect(details).toEqual({
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "1URT-UU74B",
    });
  });

  it("flags reverse-device-code prompts that ask for an authorization code", () => {
    const details = extractDeviceAuthDetails([
      "Opening https://claude.ai/oauth/authorize in your browser…",
      "Enter the authorization code from your browser:",
    ].join("\n"));

    expect(details).toMatchObject({
      verificationUri: "https://claude.ai/oauth/authorize",
      requiresCodeInput: true,
      inputPrompt: "Enter the authorization code from your browser",
    });
    expect(details.userCode).toBeUndefined();
  });

  it("flags 'Authorization code:' as a code-input prompt", () => {
    const details = extractDeviceAuthDetails([
      "Visit https://example.com/login",
      "Authorization code:",
    ].join("\n"));

    expect(details.requiresCodeInput).toBe(true);
    expect(details.inputPrompt).toBe("Authorization code");
    expect(details.userCode).toBeUndefined();
  });

  it("flags 'Paste the auth code' as a code-input prompt", () => {
    const details = extractDeviceAuthDetails([
      "Open https://example.com/oauth",
      "Paste the auth code here:",
    ].join("\n"));

    expect(details.requiresCodeInput).toBe(true);
    expect(details.inputPrompt).toBe("Paste the auth code here");
  });

  it("does not set requiresCodeInput when a device code is already present", () => {
    const details = extractDeviceAuthDetails([
      "Open https://auth.openai.com/activate",
      "Your code is AB12-CD34",
      "Enter the authorization code from your browser:",
    ].join("\n"));

    expect(details.userCode).toBe("AB12-CD34");
    expect(details.requiresCodeInput).toBeUndefined();
    expect(details.inputPrompt).toBeUndefined();
  });

  it("strips trailing punctuation from extracted URLs", () => {
    const details = extractDeviceAuthDetails("Visit https://github.com/login/device. to continue");
    expect(details.verificationUri).toBe("https://github.com/login/device");
  });

  it("does not include surrounding parentheses in extracted URLs", () => {
    const details = extractDeviceAuthDetails("Open the page (https://auth.example.com/path) in your browser");
    expect(details.verificationUri).toBe("https://auth.example.com/path");
  });

  it("returns an empty result for empty output", () => {
    expect(extractDeviceAuthDetails("")).toEqual({
      verificationUri: undefined,
      userCode: undefined,
      requiresCodeInput: undefined,
      inputPrompt: undefined,
    });
  });

  it("returns empty command for whitespace-only input", () => {
    expect(parseCommandLine("   \t  ")).toEqual({ command: "", args: [] });
  });

  it("collapses runs of whitespace between arguments", () => {
    expect(parseCommandLine("codex   login\t\t--profile  dev")).toEqual({
      command: "codex",
      args: ["login", "--profile", "dev"],
    });
  });

  it("adds npm global bin directories to auth command PATH", () => {
    const env = buildProviderAuthEnv({
      PATH: "/usr/bin",
      NPM_CONFIG_PREFIX: "/tmp/jait-npm-global",
    });

    expect(env.PATH?.split(delimiter)).toContain("/tmp/jait-npm-global/bin");
  });
});
