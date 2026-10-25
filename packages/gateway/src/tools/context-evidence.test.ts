import { describe, expect, it } from "vitest";
import { ContextEvidence } from "./context-evidence.js";
import { boundModelData } from "./model-result.js";

describe("recoverable tool evidence", () => {
  it("keeps terminal completion handles and diagnostics within the projection budget", () => {
    const input = { output: "started\n" + "noise ".repeat(5000) + "\nERROR at completion", executionId: "exec", status: "failed", exitCode: 1, coverage: { complete: false } };
    const before = JSON.stringify(input);
    const bounded = boundModelData(input, 1024) as Record<string, unknown>;
    expect(JSON.stringify(bounded).length).toBeLessThanOrEqual(1024);
    expect(bounded.executionId).toBe("exec");
    expect(bounded.coverage).toEqual({ complete: false });
    expect(bounded.preview).toContain("started");
    expect(bounded.preview).toContain("ERROR at completion");
    expect(JSON.stringify(input)).toBe(before);
  });
  it("finds literal tail evidence, paginates matches and preserves owner/session/expiry checks", () => {
    let now = 1000;
    const store = new ContextEvidence(undefined, () => now);
    const scope = { sessionId: "s", userId: "owner" };
    const text = "noise ".repeat(4000) + "ERROR 🦀 first " + ".".repeat(100) + "ERROR second";
    const ref = store.save(scope, text)!;
    const first = store.read(scope, ref, 0, 60, "ERROR");
    const page = first.data as { content: string; nextOffset: number; matchOffset: number };
    expect(page.content).toContain("ERROR 🦀 first");
    expect(page.matchOffset).toBe(text.indexOf("ERROR"));
    expect((store.read(scope, ref, page.nextOffset, 60, "ERROR").data as { content: string }).content).toContain("ERROR second");
    expect((store.read(scope, ref, 0, 60, "error").data as { matchOffset: null }).matchOffset).toBeNull();
    for (const query of ["", "a".repeat(257)]) expect(store.read(scope, ref, 0, 60, query).ok).toBe(false);
    expect(store.read({ ...scope, userId: "other" }, ref, 0, 60, "ERROR").ok).toBe(false);
    expect(store.read({ ...scope, sessionId: "other" }, ref, 0, 60, "ERROR").ok).toBe(false);
    now += 86_400_001;
    expect(store.read(scope, ref, 0, 60, "ERROR").ok).toBe(false);
  });
});
