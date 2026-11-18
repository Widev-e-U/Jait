import { describe, expect, it } from "vitest";
import { parseAgentTaskReport, redactSecrets } from "./agent-report.js";

const expected = { taskId: "A", attemptId: "attempt-1" };

function report(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    taskId: "A",
    attemptId: "attempt-1",
    status: "completed",
    summary: "Wrote the file.",
    changedFiles: ["./src/lib.rs", "src/lib.rs"],
    ...extra,
  };
}

describe("parseAgentTaskReport", () => {
  it("accepts a well-formed completed report and normalizes its paths", () => {
    const result = parseAgentTaskReport(report({ artifacts: [{ path: "out/result.txt", kind: "file" }] }), expected);
    expect(result).toEqual({
      ok: true,
      report: expect.objectContaining({
        status: "completed",
        changedFiles: ["src/lib.rs"],
        artifacts: [{ path: "out/result.txt", kind: "file" }],
        followUps: [],
      }),
    });
  });

  it("rejects reports for another task or a superseded attempt", () => {
    expect(parseAgentTaskReport(report({ taskId: "B" }), expected)).toMatchObject({
      ok: false,
      reason: "report belongs to a different task",
    });
    expect(parseAgentTaskReport(report({ attemptId: "attempt-0" }), expected)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("stale"),
    });
  });

  it("refuses fields that try to set verification or task state", () => {
    for (const field of ["verified", "verification", "passed", "state"]) {
      const result = parseAgentTaskReport(report({ [field]: true }), expected);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain(`"${field}"`);
    }
  });

  it("rejects unknown fields, unknown statuses and malformed bodies", () => {
    expect(parseAgentTaskReport(report({ extra: 1 }), expected).ok).toBe(false);
    expect(parseAgentTaskReport(report({ status: "done" }), expected).ok).toBe(false);
    expect(parseAgentTaskReport("done", expected).ok).toBe(false);
    expect(parseAgentTaskReport(report({ summary: "   " }), expected).ok).toBe(false);
  });

  it("enforces error rules by status", () => {
    expect(parseAgentTaskReport(report({ error: "oops" }), expected).ok).toBe(false);
    expect(parseAgentTaskReport(report({ status: "failed" }), expected).ok).toBe(false);
    expect(parseAgentTaskReport(report({ status: "failed", error: "compile error" }), expected)).toMatchObject({
      ok: true,
      report: { status: "failed", error: "compile error" },
    });
  });

  it("rejects unsafe changed-file paths", () => {
    for (const bad of ["/etc/passwd", "../secrets", "C:/x", "."]) {
      expect(parseAgentTaskReport(report({ changedFiles: [bad] }), expected).ok).toBe(false);
    }
  });

  it("reports unreadable objects as rejections instead of throwing", () => {
    const hostile = new Proxy({}, {
      ownKeys() {
        throw new Error("boom");
      },
    });
    expect(parseAgentTaskReport(hostile, expected)).toEqual({ ok: false, reason: "report could not be read" });
  });

  it("redacts credentials and bounds long summaries", () => {
    const token = `ghp_${"a".repeat(36)}`;
    const result = parseAgentTaskReport(
      report({ summary: `pushed with ${token} and password=hunter2 ${"x".repeat(5000)}` }),
      expected,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.summary).not.toContain(token);
    expect(result.report.summary).not.toContain("hunter2");
    expect(result.report.summary.length).toBeLessThanOrEqual(4000);
  });
});

describe("redactSecrets", () => {
  it("masks common credential shapes", () => {
    expect(redactSecrets("Authorization: Bearer abcdef1234567890")).toContain("Bearer [redacted]");
    expect(redactSecrets("api_key=sk-abcdefghijklmnop1234")).not.toContain("abcdefghijklmnop");
  });
});
