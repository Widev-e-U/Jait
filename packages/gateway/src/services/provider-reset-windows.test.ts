import { describe, expect, it } from "vitest";
import {
  deriveOllamaResetWindow,
  describeOllamaResetSource,
  parseOllamaResetSource,
  OLLAMA_MONTH_MINS,
  OLLAMA_SESSION_MINS,
  OLLAMA_WEEK_MINS,
} from "./provider-reset-windows.js";

const SESSION = OLLAMA_SESSION_MINS;
const WEEK = OLLAMA_WEEK_MINS;
const MONTH = OLLAMA_MONTH_MINS;

describe("deriveOllamaResetWindow", () => {
  it("never reports a reset at fetch time when no evidence exists yet", () => {
    const now = new Date("2026-03-11T09:37:00.000Z");
    // Ollama's activity period ends "now", which is what used to leak into resetsAt.
    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now,
      utilization: 0.42,
      anchorIso: now.toISOString(),
    });
    expect(new Date(window.resetsAt).getTime()).toBeGreaterThan(now.getTime());
    expect(window.windowStartAt).toBe("2026-03-11T05:00:00.000Z");
    expect(window.resetsAt).toBe("2026-03-11T10:00:00.000Z");
    expect(window.source).toBe("window-grid");
  });

  it("keeps a 5-hour grid stable across a week-aligned anchor", () => {
    // The anchor Ollama reports is week-aligned; using it directly would shift a
    // 5-hour grid by three hours every week.
    const first = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T09:37:00.000Z"),
      utilization: 0.4,
      anchorIso: "2026-03-09T00:00:00.000Z",
    });
    const second = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-18T09:37:00.000Z"),
      utilization: 0.4,
      anchorIso: "2026-03-16T00:00:00.000Z",
    });
    expect(new Date(first.resetsAt).getUTCHours()).toBe(new Date(second.resetsAt).getUTCHours());
  });

  it("uses the week-aligned anchor for weekly windows", () => {
    const window = deriveOllamaResetWindow({
      windowDurationMins: WEEK,
      now: new Date("2026-03-11T09:37:00.000Z"),
      utilization: 0.2,
      anchorIso: "2026-03-09T00:00:00.000Z",
    });
    expect(window.windowStartAt).toBe("2026-03-09T00:00:00.000Z");
    expect(window.resetsAt).toBe("2026-03-16T00:00:00.000Z");
  });

  it("uses calendar months for monthly windows", () => {
    const window = deriveOllamaResetWindow({
      windowDurationMins: MONTH,
      now: new Date("2026-03-11T09:37:00.000Z"),
      utilization: 0.2,
      anchorIso: "2026-01-31T00:00:00.000Z",
    });
    expect(window.windowStartAt).toBe("2026-03-01T00:00:00.000Z");
    expect(window.resetsAt).toBe("2026-04-01T00:00:00.000Z");
  });

  it("reports a rollover as observed, snapped to the previous window's grid", () => {
    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T10:20:00.000Z"),
      utilization: 0.03,
      previous: {
        utilization: 0.81,
        resetsAt: "2026-03-11T10:00:00.000Z",
        source: "observed",
        observedAt: "2026-03-11T09:37:00.000Z",
      },
    });
    expect(window.source).toBe("observed");
    expect(window.windowStartAt).toBe("2026-03-11T10:00:00.000Z");
    expect(window.resetsAt).toBe("2026-03-11T15:00:00.000Z");
  });

  it("bounds an observed rollover by the previous observation time", () => {
    // The stale grid point (05:00) predates the previous snapshot, so it cannot
    // be the boundary the drop crossed; "now" is the honest upper bound.
    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T09:50:00.000Z"),
      utilization: 0.05,
      previous: {
        utilization: 0.6,
        resetsAt: "2026-03-11T10:00:00.000Z",
        source: "window-grid",
        observedAt: "2026-03-11T09:40:00.000Z",
      },
    });
    expect(window.source).toBe("observed");
    expect(window.windowStartAt).toBe("2026-03-11T09:50:00.000Z");
    expect(window.resetsAt).toBe("2026-03-11T14:50:00.000Z");
  });

  it("carries an evidence-backed prediction forward unchanged", () => {
    const now = new Date("2026-03-11T16:20:00.000Z");
    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now,
      utilization: 0.55,
      previous: { utilization: 0.5, resetsAt: "2026-03-11T20:00:00.000Z", source: "observed" },
    });
    expect(window.source).toBe("observed");
    expect(window.resetsAt).toBe("2026-03-11T20:00:00.000Z");
    expect(window.windowStartAt).toBe("2026-03-11T15:00:00.000Z");
  });

  it("advances to the next window once the predicted reset has passed", () => {
    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T21:30:00.000Z"),
      utilization: 0.6,
      previous: { utilization: 0.6, resetsAt: "2026-03-11T20:00:00.000Z", source: "observed" },
    });
    expect(window.source).toBe("window-boundary");
    expect(window.windowStartAt).toBe("2026-03-11T20:00:00.000Z");
    expect(window.resetsAt).toBe("2026-03-12T01:00:00.000Z");
  });

  it("keeps a guess's phase but not its confidence once it passes unconfirmed", () => {
    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T21:30:00.000Z"),
      utilization: 0.4,
      previous: { utilization: 0.4, resetsAt: "2026-03-11T20:00:00.000Z", source: "window-grid" },
    });
    expect(window.source).toBe("window-grid");
    expect(window.windowStartAt).toBe("2026-03-11T20:00:00.000Z");
    expect(window.resetsAt).toBe("2026-03-12T01:00:00.000Z");
  });

  it("does not treat small decreases as rollovers", () => {
    const window = deriveOllamaResetWindow({
      windowDurationMins: SESSION,
      now: new Date("2026-03-11T12:00:00.000Z"),
      utilization: 0.799,
      previous: { utilization: 0.8, resetsAt: "2026-03-11T15:00:00.000Z", source: "window-grid" },
    });
    expect(window.source).toBe("window-grid");
    expect(window.resetsAt).toBe("2026-03-11T15:00:00.000Z");
  });

  it("handles missing utilization and anchors defensively", () => {
    const window = deriveOllamaResetWindow({
      windowDurationMins: WEEK,
      now: new Date("2026-03-11T09:37:00.000Z"),
      utilization: null,
      previous: { utilization: null, resetsAt: null, source: null },
      anchorIso: null,
    });
    expect(window.source).toBe("window-grid");
    expect(window.windowStartAt).toBe("2026-03-09T00:00:00.000Z");
    expect(window.resetsAt).toBe("2026-03-16T00:00:00.000Z");
  });
});

describe("reset-source helpers", () => {
  it("validates stored source values", () => {
    expect(parseOllamaResetSource("observed")).toBe("observed");
    expect(parseOllamaResetSource("bogus")).toBeNull();
    expect(parseOllamaResetSource(undefined)).toBeNull();
  });

  it("explains each source distinctly", () => {
    const messages = [
      describeOllamaResetSource("observed"),
      describeOllamaResetSource("window-boundary"),
      describeOllamaResetSource("window-grid"),
      describeOllamaResetSource(null),
    ];
    expect(new Set(messages).size).toBe(messages.length);
  });
});
