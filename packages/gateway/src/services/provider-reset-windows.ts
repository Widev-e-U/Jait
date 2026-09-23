/**
 * Ollama Cloud quota reset windows.
 *
 * Ollama's `/api/usage` reports how much of each limit is used but not when the
 * window resets. The only timestamp it exposes is the activity *reporting
 * period* (`period.starting_at` / `period.ending_at`), and `ending_at` is
 * simply "now" — the moment of the request. Treating it as `resetsAt` made the
 * Usage modal claim the quota reset at fetch time (i.e. "resets in a few
 * seconds"), and the value moved forward on every refresh.
 *
 * Reset times are therefore reconstructed from the boundaries Ollama actually
 * exposes plus rollovers we observe ourselves, in this order:
 *
 *  1. `observed`         — utilization dropped since the previous snapshot, so a
 *                          window boundary lies between the two snapshots. The
 *                          boundary is snapped onto the previous window's grid
 *                          when a grid point falls in that interval, otherwise
 *                          "now" is used as the upper bound.
 *  2. `window-boundary`  — the boundary predicted by the last snapshot has
 *                          passed, so the current window started there. This
 *                          keeps the schedule advancing when no request was made
 *                          in the meantime (nothing to observe a drop in).
 *  3. `window-grid`      — no evidence yet. Weekly windows use the reporting
 *                          period anchor (it is week-aligned, so its boundaries
 *                          are real), monthly windows use calendar months, and
 *                          shorter windows a fixed UTC-day grid — the
 *                          week-aligned anchor would shift a 5-hour grid by
 *                          three hours every week. The next observed rollover
 *                          replaces the estimate.
 *
 * Snapshots keep their `windowStartAt` and `source`, so evidence-backed resets
 * (sources 1 and 2) are preserved across refreshes instead of being re-guessed.
 */

/** Why a reset time is what it is: observed rollovers outrank estimates. */
export type OllamaResetSource = "observed" | "window-boundary" | "window-grid";

export interface OllamaResetWindow {
  /** Start of the window the snapshot's utilization belongs to (ISO 8601). */
  windowStartAt: string;
  /** End of that window, i.e. the next reset (ISO 8601, always in the future). */
  resetsAt: string;
  source: OllamaResetSource;
}

export interface OllamaResetWindowInput {
  windowDurationMins: number;
  now: Date;
  /** Utilization reported by the snapshot being recorded. */
  utilization?: number | null;
  /** The previous snapshot for this account/limit, when there is one. */
  previous?: {
    utilization: number | null;
    resetsAt: string | null;
    source: OllamaResetSource | null;
    /** When the previous snapshot was recorded — the lower bound of a rollover. */
    observedAt?: string | null;
  } | null;
  /** `activity.period.starting_at` — the only real boundary anchor Ollama exposes. */
  anchorIso?: string | null;
}

export const OLLAMA_SESSION_MINS = 300;
export const OLLAMA_WEEK_MINS = 10_080;
export const OLLAMA_MONTH_MINS = 43_200;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** Utilization never decreases inside a window, so a drop beyond rounding noise means a new window began. */
const ROLLOVER_EPSILON = 0.005;
const MAX_STEPS = 500;

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isResetSource(value: unknown): value is OllamaResetSource {
  return value === "observed" || value === "window-boundary" || value === "window-grid";
}

/** Read a stored source value (e.g. from a snapshot's JSON) without trusting it. */
export function parseOllamaResetSource(value: unknown): OllamaResetSource | null {
  return isResetSource(value) ? value : null;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Monday 00:00 UTC of the week containing `date` (Ollama reports weekly windows week-aligned). */
function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day.getTime() - weekday * DAY_MS);
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** First day of the month `months` calendar months after `date`'s month. */
function monthStartAfter(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/** The first boundary strictly after `now` on the grid that `start` belongs to. */
function nextBoundary(start: Date, windowDurationMins: number, now: Date): Date {
  const nowMs = now.getTime();
  if (windowDurationMins >= OLLAMA_MONTH_MINS) {
    for (let months = 1; months <= MAX_STEPS; months += 1) {
      const candidate = monthStartAfter(start, months);
      if (candidate.getTime() > nowMs) return candidate;
    }
    return monthStartAfter(start, MAX_STEPS + 1);
  }

  const step = Math.max(1, windowDurationMins) * MINUTE_MS;
  const steps = Math.floor((nowMs - start.getTime()) / step) + 1;
  return new Date(start.getTime() + Math.max(1, Math.min(steps, MAX_STEPS)) * step);
}

/** The latest grid point of the window that `reference` ends, at or before `now`. */
function previousGridPoint(reference: Date, windowDurationMins: number, now: Date): Date {
  if (reference.getTime() <= now.getTime()) return reference;
  if (windowDurationMins >= OLLAMA_MONTH_MINS) return startOfUtcMonth(now);
  const step = Math.max(1, windowDurationMins) * MINUTE_MS;
  const steps = Math.ceil((reference.getTime() - now.getTime()) / step);
  return new Date(reference.getTime() - Math.max(1, Math.min(steps, MAX_STEPS)) * step);
}

/**
 * The window start the exposed grid implies. Weekly windows use the
 * reporting-period anchor (week-aligned); monthly windows use calendar months;
 * shorter windows use a UTC-day grid, because the week-aligned anchor would
 * shift a 5-hour grid by three hours every week.
 */
function gridStart(windowDurationMins: number, now: Date, anchor: Date | null): Date {
  if (windowDurationMins >= OLLAMA_MONTH_MINS) return startOfUtcMonth(now);
  if (windowDurationMins === OLLAMA_WEEK_MINS) {
    if (!anchor) return startOfUtcWeek(now);
    const weeks = Math.floor((now.getTime() - anchor.getTime()) / (7 * DAY_MS));
    return new Date(anchor.getTime() + Math.max(0, Math.min(weeks, MAX_STEPS)) * 7 * DAY_MS);
  }

  const midnight = startOfUtcDay(now);
  const step = Math.max(1, windowDurationMins) * MINUTE_MS;
  if (step >= DAY_MS) return midnight;
  return new Date(midnight.getTime() + Math.floor((now.getTime() - midnight.getTime()) / step) * step);
}

/**
 * Reconstruct the reset window for one Ollama usage bucket. Always returns an
 * ISO `resetsAt` strictly in the future — never the fetch time.
 */
export function deriveOllamaResetWindow(input: OllamaResetWindowInput): OllamaResetWindow {
  const { now, windowDurationMins } = input;
  const previous = input.previous ?? null;
  const previousReset = parseIso(previous?.resetsAt ?? null);
  const durationMins =
    windowDurationMins >= OLLAMA_MONTH_MINS ? OLLAMA_MONTH_MINS : Math.max(1, windowDurationMins);

  // 1. Utilization dropped: a boundary was crossed between the two snapshots.
  if (
    previous &&
    typeof previous.utilization === "number" &&
    typeof input.utilization === "number" &&
    input.utilization < previous.utilization - ROLLOVER_EPSILON
  ) {
    const lowerBound = parseIso(previous.observedAt ?? null);
    const snapped = previousReset ? previousGridPoint(previousReset, durationMins, now) : null;
    const boundary =
      snapped && (!lowerBound || snapped.getTime() > lowerBound.getTime()) ? snapped : now;
    return {
      windowStartAt: boundary.toISOString(),
      resetsAt: nextBoundary(boundary, durationMins, now).toISOString(),
      source: "observed",
    };
  }

  // 2. A predicted boundary has passed: the current window started there. A
  //    prediction that was never confirmed only keeps its phase, not its source.
  if (previousReset && previousReset.getTime() <= now.getTime()) {
    return {
      windowStartAt: previousReset.toISOString(),
      resetsAt: nextBoundary(previousReset, durationMins, now).toISOString(),
      source: previous?.source === "observed" || previous?.source === "window-boundary"
        ? "window-boundary"
        : "window-grid",
    };
  }

  // 2b. An evidence-backed prediction still in the future stays valid.
  if (previousReset && (previous?.source === "observed" || previous?.source === "window-boundary")) {
    return {
      windowStartAt: new Date(previousReset.getTime() - durationMins * MINUTE_MS).toISOString(),
      resetsAt: previousReset.toISOString(),
      source: previous.source,
    };
  }

  // 3. No evidence yet: estimate from the grid Ollama exposes.
  const start = gridStart(durationMins, now, parseIso(input.anchorIso ?? null));
  return {
    windowStartAt: start.toISOString(),
    resetsAt: nextBoundary(start, durationMins, now).toISOString(),
    source: "window-grid",
  };
}

/** Human-readable explanation of a reset source, for tooltips. */
export function describeOllamaResetSource(source: OllamaResetSource | null): string {
  switch (source) {
    case "observed":
      return "Confirmed by an observed usage reset";
    case "window-boundary":
      return "Continued from the previous reset deadline";
    case "window-grid":
      return "Estimated from Ollama's usage window boundaries";
    default:
      return "Derived from Ollama's usage window boundaries";
  }
}
