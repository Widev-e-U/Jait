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

  it("strips ANSI escape codes before matching the one-time code", () => {
    const details = extractDeviceAuthDetails(
      [
        "\u001b[32mEnter this one-time code\u001b[0m",
        "\u001b[1mAB12-CD34E\u001b[0m",
      ].join("\n"),
    )
    expect(details.userCode).toBe("AB12-CD34E")
  })

  it("strips trailing punctuation from the verification URI", () => {
    const details = extractDeviceAuthDetails(
      "Open https://auth.example.com/device, then enter this one-time code\n9F3K-2Q7X",
    )
    expect(details.verificationUri).toBe("https://auth.example.com/device")
    expect(details.userCode).toBe("9F3K-2Q7X")
  })

  it("extracts a code from a 'code is:' line", () => {
    const details = extractDeviceAuthDetails("Your user code is: 1234-5678-9012")
    expect(details.userCode).toBe("1234-5678-9012")
  })

  it("extracts a code from an 'enter the code' line", () => {
    const details = extractDeviceAuthDetails("Please enter the code 9F3K-2Q7X")
    expect(details.userCode).toBe("9F3K-2Q7X")
  })

  it("extracts a code from a 'copy the code' line", () => {
    const details = extractDeviceAuthDetails("Copy the code WXYZ-1234-ABCD")
    expect(details.userCode).toBe("WXYZ-1234-ABCD")
  })

  it("does not treat blocked placeholder words as a code", () => {
    const details = extractDeviceAuthDetails("Enter this one-time code\nDEVICE")
    expect(details.userCode).toBeUndefined()
  })

  it("flags requiresCodeInput when the output asks the user to enter a code", () => {
    const details = extractDeviceAuthDetails("Enter the authorization code from your device")
    expect(details.userCode).toBeUndefined()
    expect(details.requiresCodeInput).toBe(true)
    expect(details.inputPrompt).toBe("Enter the authorization code from your device")
  })

  it("flags requiresCodeInput for a 'paste the code' prompt and trims trailing punctuation", () => {
    const details = extractDeviceAuthDetails("Paste the authorization code below:")
    expect(details.requiresCodeInput).toBe(true)
    expect(details.inputPrompt).toBe("Paste the authorization code below")
  })

  it("does not flag requiresCodeInput when a code was already extracted", () => {
    const details = extractDeviceAuthDetails("Enter the authorization code\nAB12-CD34E")
    expect(details.userCode).toBe("AB12-CD34E")
    expect(details.requiresCodeInput).toBeUndefined()
  })
})

describe("hasCompleteDeviceAuthDetails", () => {
  it("is true when both a verification URI and user code are present", () => {
    expect(hasCompleteDeviceAuthDetails({ verificationUri: "https://x", userCode: "AB12-CD34E" })).toBe(true)
  })

  it("is true when code input is required", () => {
    expect(hasCompleteDeviceAuthDetails({ requiresCodeInput: true })).toBe(true)
  })

  it("is false when only a verification URI is present", () => {
    expect(hasCompleteDeviceAuthDetails({ verificationUri: "https://x" })).toBe(false)
  })

  it("is false for empty details", () => {
    expect(hasCompleteDeviceAuthDetails({})).toBe(false)
  })
})
