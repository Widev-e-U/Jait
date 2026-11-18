/**
 * AgentControlService — owner-wide hard stop for autonomous execution.
 *
 * The stop is deliberately *whole-owner*, not per-agent: during an incident the
 * user must not have to work out which identity is still spinning, and a
 * per-agent stop leaves the next scheduled delivery free to start the same
 * agent again. While halted:
 *
 *   - new agent threads are refused,
 *   - team-chat deliveries are held instead of dispatched,
 *   - anything already running is stopped through the `stopRunning` hook.
 *
 * The row in `agent_control` is the durable record; absence of a row means
 * "running normally", so no backfill is required and a fresh user is never
 * accidentally frozen. Resuming is the only way out of a halt — no delivery,
 * retry, timer or route path can clear it implicitly, because they all call
 * `assertCanRun`/`isHalted` instead of writing the table.
 */

import type { AgentControlState, AgentHaltResult } from "@jait/shared";
export type { AgentControlState } from "@jait/shared";
import { eq } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { agentControl } from "../db/schema.js";

/** Stable code so the UI and API clients can branch without parsing prose. */
export const AGENT_HALTED_CODE = "agent_halted";

type AgentControlRow = typeof agentControl.$inferSelect;



export const RUNNING_STATE: AgentControlState = {
  halted: false,
  reason: null,
  haltedAt: null,
  updatedAt: null,
};

export class AgentHaltedError extends Error {
  readonly code = AGENT_HALTED_CODE;

  constructor(
    message = "Autonomous agents are halted. Resume agents to continue.",
    readonly action?: string,
  ) {
    super(message);
    this.name = "AgentHaltedError";
  }
}

export function isAgentHaltedError(error: unknown): error is AgentHaltedError {
  return error instanceof AgentHaltedError
    || (typeof error === "object" && error !== null && (error as { code?: unknown }).code === AGENT_HALTED_CODE);
}

/**
 * HTTP body for a refused autonomous action. Shared so every route refuses
 * with the same machine-readable `code` and the same human wording; clients
 * branch on `code`, never on prose.
 */
export function agentHaltedBody(state: AgentControlState, action?: string): Record<string, unknown> {
  const reason = state.reason ? ` (${state.reason})` : "";
  return {
    code: AGENT_HALTED_CODE,
    halted: true,
    reason: state.reason,
    haltedAt: state.haltedAt,
    action: action ?? null,
    error: `Autonomous agents are halted${reason}. Resume agents to continue.`,
  };
}

export interface AgentStopResult {
  stopped: number;
  errors: string[];
}

export interface AgentControlHooks {
  /**
   * Best-effort teardown of everything the user currently has running (thread
   * runners, team deliveries in flight, routed work). Returns how many things
   * were stopped. Throwing does NOT prevent the halt from being persisted: an
   * emergency stop must land even if a runner refuses to die.
   */
  stopRunning?: (userId: string) => Promise<number | AgentStopResult> | number | AgentStopResult;
  /** Notified after a successful halt/resume so transports can broadcast. */
  onChange?: (change: { userId: string; state: AgentControlState }) => void;
}

export type HaltResult = AgentHaltResult;

export class AgentControlService {
  constructor(
    private readonly db: JaitDB,
    private readonly hooks: AgentControlHooks = {},
  ) {}

  private readRow(userId: string): AgentControlRow | null {
    return this.db.select().from(agentControl).where(eq(agentControl.userId, userId)).get() ?? null;
  }

  private toState(row: AgentControlRow | null): AgentControlState {
    if (!row || !row.halted) {
      return row
        ? { halted: false, reason: null, haltedAt: null, updatedAt: row.updatedAt ?? null }
        : { ...RUNNING_STATE };
    }
    return {
      halted: true,
      reason: row.reason ?? null,
      haltedAt: row.haltedAt ?? null,
      updatedAt: row.updatedAt ?? null,
    };
  }

  /** Current halt state for one user. Never throws: unknown users are running. */
  getState(userId: string): AgentControlState {
    if (!userId) return { ...RUNNING_STATE };
    return this.toState(this.readRow(userId));
  }

  /** Cheap predicate for callers that want to hold work rather than fail it. */
  isHalted(userId: string): boolean {
    if (!userId) return false;
    return this.readRow(userId)?.halted === true;
  }

  /**
   * Throw `AgentHaltedError` when the user's agents are halted. Call this on
   * every path that would start autonomous work; it is the single choke point
   * that makes the stop authoritative rather than advisory.
   */
  assertCanRun(userId: string, action?: string): void {
    if (!this.isHalted(userId)) return;
    const reason = this.getState(userId).reason;
    throw new AgentHaltedError(
      reason
        ? `Autonomous agents are halted (${reason}). Resume agents to continue.`
        : undefined,
      action,
    );
  }

  /**
   * Freeze every autonomous path for this user and stop what is running.
   * Idempotent: calling it twice keeps the original `haltedAt` and re-runs the
   * stop hook so a runner that came up in between is still caught.
   */
  async halt(userId: string, options: { reason?: string | null } = {}): Promise<HaltResult> {
    if (!userId) throw new Error("userId is required to halt agents");

    const previous = this.getState(userId);
    const now = new Date().toISOString();
    const reason = options.reason?.trim() ? options.reason.trim().slice(0, 500) : null;

    this.db
      .insert(agentControl)
      .values({
        userId,
        halted: true,
        reason,
        haltedAt: previous.haltedAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: agentControl.userId,
        set: {
          halted: true,
          reason,
          haltedAt: previous.haltedAt ?? now,
          updatedAt: now,
        },
      })
      .run();

    let stopped = 0;
    let stopError: string | null = null;
    if (this.hooks.stopRunning) {
      try {
        const result = await this.hooks.stopRunning(userId);
        stopped = typeof result === "number" ? result : result.stopped;
        if (typeof result !== "number" && result.errors.length) stopError = result.errors.join("; ");
      } catch (error) {
        stopError = error instanceof Error ? error.message : String(error);
      }
    }

    const state = this.getState(userId);
    this.hooks.onChange?.({ userId, state });
    return { stopped, stopError, state };
  }

  /**
   * Lift the halt. Only ever called from the explicit resume route: nothing
   * else — including restarts and retries — may clear a stop on its own.
   */
  resume(userId: string): AgentControlState {
    if (!userId) throw new Error("userId is required to resume agents");
    const now = new Date().toISOString();
    this.db
      .insert(agentControl)
      .values({ userId, halted: false, reason: null, haltedAt: null, updatedAt: now })
      .onConflictDoUpdate({
        target: agentControl.userId,
        set: { halted: false, reason: null, haltedAt: null, updatedAt: now },
      })
      .run();

    const state = this.getState(userId);
    this.hooks.onChange?.({ userId, state });
    return state;
  }
}
