import { describe, expect, it } from "vitest";
import { extractDeviceAuthDetails, stripAnsi } from "./provider-auth.js";

describe("provider auth helpers", () => {
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
});
