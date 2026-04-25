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
});
