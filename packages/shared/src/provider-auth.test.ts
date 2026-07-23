import { describe, expect, it } from "vitest"
import { extractDeviceAuthDetails, hasCompleteDeviceAuthDetails } from "./provider-auth.js"

describe("extractDeviceAuthDetails", () => {
  it("ignores the Windows Codex COMMAND-LINE placeholder and returns the real device code", () => {
    const partialDetails = extractDeviceAuthDetails([
      "Welcome to Codex",
      "Follow these steps to sign in with ChatGPT using device code authorization:",
      "COMMAND-LINE",
      "1. Open this link in your browser",
      "https://auth.openai.com/codex/device",
    ].join("\n"))
    const details = extractDeviceAuthDetails([
      "Welcome to Codex",
      "Follow these steps to sign in with ChatGPT using device code authorization:",
      "COMMAND-LINE",
      "1. Open this link in your browser",
      "https://auth.openai.com/codex/device",
      "2. Enter this one-time code",
      "AB12-CD34E",
    ].join("\n"))

    expect(partialDetails.userCode).toBeUndefined()
    expect(hasCompleteDeviceAuthDetails(partialDetails)).toBe(false)

    expect(details).toEqual({
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "AB12-CD34E",
    })
    expect(hasCompleteDeviceAuthDetails(details)).toBe(true)
  })
})
