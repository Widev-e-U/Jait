/**
 * Command timeout resolution for terminal command execution.
 *
 * Invariant: every terminal command execution is bounded by a finite,
 * non-zero timeout — there is no "run forever" mode. Agents may *lift*
 * the default via the `timeout` parameter, but the value is always
 * clamped to a hard cap and `timeout: 0` / negative / non-numeric input
 * falls back to the default instead of disabling the guard.
 *
 * Env knobs:
 *   JAIT_TERMINAL_TIMEOUT_MS     — default timeout (ms), default 1 hour
 *   JAIT_TERMINAL_TIMEOUT_MAX_MS — hard cap (ms), default 24 hours
 */

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** Default execution timeout for terminal commands: 1 hour. */
export const DEFAULT_COMMAND_TIMEOUT_MS = ONE_HOUR_MS;

/** Hard upper bound for terminal command timeouts: 24 hours. */
export const MAX_COMMAND_TIMEOUT_MS = ONE_DAY_MS;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function defaultCommandTimeoutMs(): number {
  return envNumber("JAIT_TERMINAL_TIMEOUT_MS", DEFAULT_COMMAND_TIMEOUT_MS);
}

export function maxCommandTimeoutMs(): number {
  // The cap must never sit below the default, otherwise every run would clamp.
  return Math.max(envNumber("JAIT_TERMINAL_TIMEOUT_MAX_MS", MAX_COMMAND_TIMEOUT_MS), defaultCommandTimeoutMs());
}

/**
 * Resolve the effective timeout for a terminal command execution.
 *
 * - omit / 0 / negative / NaN  → default (1 hour; env-overridable)
 * - within (0, cap]            → used as-is (the agent may lift the default)
 * - above cap                  → clamped to the cap
 */
export function resolveCommandTimeoutMs(timeout: unknown): number {
  const ms = typeof timeout === "number" ? timeout : Number(timeout);
  if (!Number.isFinite(ms) || ms <= 0) {
    return defaultCommandTimeoutMs();
  }
  const max = maxCommandTimeoutMs();
  if (ms > max) {
    console.warn(
      `[terminals] requested timeout ${Math.round(ms)}ms exceeds the ${Math.round(max)}ms cap — clamping to the cap`,
    );
    return max;
  }
  return Math.max(1, Math.ceil(ms));
}