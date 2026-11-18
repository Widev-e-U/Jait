import { describe, expect, it } from "vitest"
import {
  BLOCKING_SESSION_WAIT_KINDS,
  attentionKey,
  sessionWaitLabel,
  type SessionWaitKind,
} from "./message.js"

const ALL_WAIT_KINDS: readonly SessionWaitKind[] = [
  "question",
  "consent",
  "secret",
  "browser",
  "terminal",
  "background",
]

describe("sessionWaitLabel", () => {
  it("gives every wait kind its own non-empty label", () => {
    const labels = ALL_WAIT_KINDS.map((kind) => sessionWaitLabel(kind))

    expect(labels).toEqual([
      "Waiting for your answer",
      "Waiting for approval",
      "Waiting for a secret",
      "Paused — you have browser control",
      "Waiting for terminal input",
      "Waiting for a background command",
    ])
    expect(new Set(labels).size).toBe(ALL_WAIT_KINDS.length)
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(0)
  })

  it("names the secret prompt without implying a chat answer", () => {
    expect(sessionWaitLabel("secret")).toBe("Waiting for a secret")
    expect(sessionWaitLabel("secret")).not.toBe(sessionWaitLabel("question"))
  })
})

describe("BLOCKING_SESSION_WAIT_KINDS", () => {
  it("covers every wait kind that stops the agent and leaves background out", () => {
    expect(BLOCKING_SESSION_WAIT_KINDS).toEqual([
      "question",
      "consent",
      "secret",
      "browser",
      "terminal",
    ])
    expect(BLOCKING_SESSION_WAIT_KINDS).not.toContain("background")
    expect([...BLOCKING_SESSION_WAIT_KINDS].sort()).toEqual(
      ALL_WAIT_KINDS.filter((kind) => kind !== "background").sort(),
    )
  })
})

describe("attentionKey", () => {
  it("namespaces the request id by kind so a consent card never revokes a question", () => {
    expect(attentionKey("consent", "req-1")).toBe("consent:req-1")
    expect(attentionKey("question", "req-1")).toBe("question:req-1")
    expect(attentionKey("consent", "req-1")).not.toBe(attentionKey("question", "req-1"))
  })
})
