/**
 * Trust Level Engine — Sprint 4.4
 *
 * Tracks per-action-type trust progression Level 0→3:
 *
 *   Level 0 — Observer:   everything requires consent
 *   Level 1 — Assisted:   low-risk ops auto-execute
 *   Level 2 — Trusted:    "once" consent ops auto-execute after first approval
 *   Level 3 — Autopilot:  "always" consent ops also auto-execute
 *
 * Trust increases after consecutive successful approved actions.
 * Trust decreases (revert) when actions are rolled back or fail dangerously.
 *
 * Thresholds:
 *   Level 0 → 1:  3 approved actions
 *   Level 1 → 2:  10 approved actions (cumulative)
 *   Level 2 → 3:  25 approved actions (cumulative)
 *
 * Any revert drops one level and resets the revert counter.
 */
import type { JaitDB } from "../db/connection.js";
import type { TrustLevel } from "./contracts.js";
export interface TrustState {
    actionType: string;
    approvedCount: number;
    revertedCount: number;
    currentLevel: TrustLevel;
}
export declare class TrustEngine {
    private readonly db?;
    private cache;
    constructor(db?: JaitDB | undefined);
    /**
     * Get the current trust level for an action type.
     */
    getLevel(actionType: string): TrustLevel;
    /**
     * Get the full trust state for an action type.
     */
    getState(actionType: string): TrustState;
    /**
     * Record a successful approved action. May increase trust level.
     * Returns the new trust state.
     */
    recordApproval(actionType: string): TrustState;
    /**
     * Record a revert / dangerous failure. Drops one level.
     * Returns the new trust state.
     */
    recordRevert(actionType: string): TrustState;
    /**
     * Reset trust for an action type back to Level 0.
     */
    reset(actionType: string): TrustState;
    /**
     * Get all tracked trust states.
     */
    listAll(): TrustState[];
    private persist;
}
//# sourceMappingURL=trust-engine.d.ts.map