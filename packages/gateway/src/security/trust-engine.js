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
import { trustLevels } from "../db/schema.js";
import { eq } from "drizzle-orm";
// ── Thresholds ───────────────────────────────────────────────────────
const LEVEL_THRESHOLDS = [
    0, // Level 0: default
    3, // Level 1: 3 approved
    10, // Level 2: 10 approved
    25, // Level 3: 25 approved
];
// ── TrustEngine ──────────────────────────────────────────────────────
export class TrustEngine {
    db;
    cache = new Map();
    constructor(db) {
        this.db = db;
    }
    /**
     * Get the current trust level for an action type.
     */
    getLevel(actionType) {
        return this.getState(actionType).currentLevel;
    }
    /**
     * Get the full trust state for an action type.
     */
    getState(actionType) {
        // Check cache first
        const cached = this.cache.get(actionType);
        if (cached)
            return cached;
        // Load from DB
        if (this.db) {
            const row = this.db
                .select()
                .from(trustLevels)
                .where(eq(trustLevels.actionType, actionType))
                .get();
            if (row) {
                const state = {
                    actionType,
                    approvedCount: row.approvedCount ?? 0,
                    revertedCount: row.revertedCount ?? 0,
                    currentLevel: clampLevel(row.currentLevel ?? 0),
                };
                this.cache.set(actionType, state);
                return state;
            }
        }
        // Default: Level 0
        const defaultState = {
            actionType,
            approvedCount: 0,
            revertedCount: 0,
            currentLevel: 0,
        };
        this.cache.set(actionType, defaultState);
        return defaultState;
    }
    /**
     * Record a successful approved action. May increase trust level.
     * Returns the new trust state.
     */
    recordApproval(actionType) {
        const state = this.getState(actionType);
        state.approvedCount += 1;
        // Check if we should level up
        const newLevel = computeLevel(state.approvedCount);
        if (newLevel > state.currentLevel) {
            state.currentLevel = newLevel;
        }
        this.persist(state);
        return state;
    }
    /**
     * Record a revert / dangerous failure. Drops one level.
     * Returns the new trust state.
     */
    recordRevert(actionType) {
        const state = this.getState(actionType);
        state.revertedCount += 1;
        // Drop one level (minimum 0)
        if (state.currentLevel > 0) {
            state.currentLevel = (state.currentLevel - 1);
        }
        this.persist(state);
        return state;
    }
    /**
     * Reset trust for an action type back to Level 0.
     */
    reset(actionType) {
        const state = {
            actionType,
            approvedCount: 0,
            revertedCount: 0,
            currentLevel: 0,
        };
        this.cache.set(actionType, state);
        this.persist(state);
        return state;
    }
    /**
     * Get all tracked trust states.
     */
    listAll() {
        if (!this.db)
            return [...this.cache.values()];
        const rows = this.db.select().from(trustLevels).all();
        return rows.map((row) => ({
            actionType: row.actionType,
            approvedCount: row.approvedCount ?? 0,
            revertedCount: row.revertedCount ?? 0,
            currentLevel: clampLevel(row.currentLevel ?? 0),
        }));
    }
    // ── Internal ─────────────────────────────────────────────────────
    persist(state) {
        this.cache.set(state.actionType, state);
        if (!this.db)
            return;
        try {
            // Upsert: try insert, on conflict update
            const existing = this.db
                .select()
                .from(trustLevels)
                .where(eq(trustLevels.actionType, state.actionType))
                .get();
            if (existing) {
                this.db
                    .update(trustLevels)
                    .set({
                    approvedCount: state.approvedCount,
                    revertedCount: state.revertedCount,
                    currentLevel: state.currentLevel,
                })
                    .where(eq(trustLevels.actionType, state.actionType))
                    .run();
            }
            else {
                this.db.insert(trustLevels).values({
                    actionType: state.actionType,
                    approvedCount: state.approvedCount,
                    revertedCount: state.revertedCount,
                    currentLevel: state.currentLevel,
                }).run();
            }
        }
        catch {
            // Non-fatal: in-memory cache is source of truth during session
        }
    }
}
// ── Helpers ──────────────────────────────────────────────────────────
function computeLevel(approvedCount) {
    if (approvedCount >= LEVEL_THRESHOLDS[3])
        return 3;
    if (approvedCount >= LEVEL_THRESHOLDS[2])
        return 2;
    if (approvedCount >= LEVEL_THRESHOLDS[1])
        return 1;
    return 0;
}
function clampLevel(n) {
    if (n >= 3)
        return 3;
    if (n >= 2)
        return 2;
    if (n >= 1)
        return 1;
    return 0;
}
//# sourceMappingURL=trust-engine.js.map