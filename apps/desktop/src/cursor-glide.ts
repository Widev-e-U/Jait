export interface GlidePlan {
  /** Cadence per animation step, in milliseconds. */
  readonly stepMs: number;
  /** Total animation duration in milliseconds. */
  readonly duration: number;
  /** Number of frames (>= 2 for non-trivial moves, 0 for no-ops). */
  readonly steps: number;
  /** Total horizontal span in pixels (float). */
  readonly dx: number;
  /** Total vertical span in pixels (float). */
  readonly dy: number;
}

export interface GlidePoint {
  x: number;
  y: number;
}

export const GLIDE_STEP_MS = 14;
export const GLIDE_MIN_DURATION_MS = 90;
export const GLIDE_MAX_DURATION_MS = 420;

export function easeInOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * macOS "Codex"-style cursor glide: a short, slightly eased tween from the
 * current pointer position to the target. Clamps very short hops to a single
 * snap and long hauls to a ceiling so the cursor never feels sluggish.
 */
export function planGlide(
  start: GlidePoint,
  target: GlidePoint,
  options: { maxDurationMs?: number; minDurationMs?: number; stepMs?: number } = {},
): GlidePlan {
  const stepMs = options.stepMs ?? GLIDE_STEP_MS;
  const minDurationMs = options.minDurationMs ?? GLIDE_MIN_DURATION_MS;
  const maxDurationMs = options.maxDurationMs ?? GLIDE_MAX_DURATION_MS;
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 2) {
    return { stepMs, duration: 0, steps: 0, dx, dy };
  }
  const duration = Math.round(
    Math.min(maxDurationMs, Math.max(minDurationMs, 80 + distance * 0.35)),
  );
  const steps = Math.max(2, Math.round(duration / stepMs));
  return { stepMs: Math.max(1, Math.round(duration / steps)), duration, steps, dx, dy };
}

/** Positions at each animation frame (excludes the start, includes the exact target). */
export function* glidePath(plan: GlidePlan, start: GlidePoint): Generator<GlidePoint> {
  for (let step = 1; step <= plan.steps; step += 1) {
    const progress = easeInOutCubic(step / plan.steps);
    yield {
      x: Math.round(start.x + plan.dx * progress),
      y: Math.round(start.y + plan.dy * progress),
    };
  }
}