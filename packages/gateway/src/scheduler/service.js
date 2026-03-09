import { eq, desc } from "drizzle-orm";
import { scheduledJobs } from "../db/schema.js";
import { uuidv7 } from "../lib/uuidv7.js";
const MINUTE_MS = 60_000;
function matchesCronMinute(cron, date) {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5)
        return false;
    const minute = parts[0] ?? "";
    const hour = parts[1] ?? "";
    const minuteValue = date.getUTCMinutes();
    const hourValue = date.getUTCHours();
    const minuteOk = minute === "*" || Number.parseInt(minute, 10) === minuteValue;
    const hourOk = hour === "*" || Number.parseInt(hour, 10) === hourValue;
    // keep support intentionally small for Sprint 7:
    // day-of-month, month, day-of-week are wildcard only.
    const day = parts[2] === "*";
    const month = parts[3] === "*";
    const weekday = parts[4] === "*";
    return minuteOk && hourOk && day && month && weekday;
}
function isSameUtcMinute(iso, now) {
    if (!iso)
        return false;
    const previous = new Date(iso);
    if (Number.isNaN(previous.getTime()))
        return false;
    return previous.getUTCFullYear() === now.getUTCFullYear()
        && previous.getUTCMonth() === now.getUTCMonth()
        && previous.getUTCDate() === now.getUTCDate()
        && previous.getUTCHours() === now.getUTCHours()
        && previous.getUTCMinutes() === now.getUTCMinutes();
}
function parseInput(input) {
    if (!input)
        return {};
    try {
        return JSON.parse(input);
    }
    catch {
        return {};
    }
}
function normalizeToolName(name) {
    const trimmed = name.trim();
    if (!trimmed)
        return trimmed;
    const firstUnderscore = trimmed.indexOf("_");
    if (firstUnderscore === -1)
        return trimmed;
    return `${trimmed.slice(0, firstUnderscore)}.${trimmed.slice(firstUnderscore + 1)}`;
}
function mapJob(row) {
    return {
        id: row.id,
        userId: row.userId ?? null,
        name: row.name,
        cron: row.cron,
        toolName: normalizeToolName(row.toolName),
        input: parseInput(row.input),
        sessionId: row.sessionId ?? "default",
        workspaceRoot: row.workspaceRoot ?? process.cwd(),
        enabled: row.enabled === 1,
        lastRunAt: row.lastRunAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
export class SchedulerService {
    options;
    timer = null;
    ticking = false;
    constructor(options) {
        this.options = options;
    }
    start(pollMs = MINUTE_MS) {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            void this.tick();
        }, pollMs);
    }
    stop() {
        if (!this.timer)
            return;
        clearInterval(this.timer);
        this.timer = null;
    }
    list(userId) {
        const rows = this.options.db
            .select()
            .from(scheduledJobs)
            .orderBy(desc(scheduledJobs.updatedAt))
            .all();
        const all = rows.map(mapJob);
        if (!userId)
            return all;
        // Include both the user's own jobs AND system-level jobs (userId === null)
        return all.filter((job) => job.userId === userId || job.userId === null);
    }
    create(params) {
        const now = new Date().toISOString();
        const id = uuidv7();
        this.options.db.insert(scheduledJobs).values({
            id,
            userId: params.userId ?? null,
            name: params.name,
            cron: params.cron,
            toolName: normalizeToolName(params.toolName),
            input: JSON.stringify(params.input ?? {}),
            sessionId: params.sessionId ?? "default",
            workspaceRoot: params.workspaceRoot ?? process.cwd(),
            enabled: params.enabled === false ? 0 : 1,
            createdAt: now,
            updatedAt: now,
        }).run();
        return this.get(id);
    }
    get(id, userId) {
        const row = this.options.db.select().from(scheduledJobs).where(eq(scheduledJobs.id, id)).get();
        const job = row ? mapJob(row) : null;
        if (!job)
            return null;
        // Allow access to system-level jobs (userId === null) for any authenticated user
        if (userId && job.userId !== null && job.userId !== userId)
            return null;
        return job;
    }
    remove(id, userId) {
        const exists = this.get(id, userId);
        if (!exists)
            return false;
        this.options.db.delete(scheduledJobs).where(eq(scheduledJobs.id, id)).run();
        return true;
    }
    update(id, patch, userId) {
        const existing = this.get(id, userId);
        if (!existing)
            return null;
        this.options.db.update(scheduledJobs).set({
            name: patch.name ?? existing.name,
            cron: patch.cron ?? existing.cron,
            toolName: patch.toolName ? normalizeToolName(patch.toolName) : existing.toolName,
            enabled: patch.enabled === undefined ? (existing.enabled ? 1 : 0) : (patch.enabled ? 1 : 0),
            input: patch.input === undefined ? JSON.stringify(existing.input) : JSON.stringify(patch.input),
            updatedAt: new Date().toISOString(),
        }).where(eq(scheduledJobs.id, id)).run();
        return this.get(id, userId);
    }
    async trigger(id, userId, runAt = new Date()) {
        const job = this.get(id, userId);
        if (!job) {
            throw new Error(`Job not found: ${id}`);
        }
        const actionId = uuidv7();
        const result = await this.options.executeTool({
            toolName: normalizeToolName(job.toolName),
            input: job.input,
            sessionId: job.sessionId,
            workspaceRoot: job.workspaceRoot,
            userId: job.userId,
        });
        this.options.db.update(scheduledJobs).set({
            lastRunAt: runAt.toISOString(),
            updatedAt: new Date().toISOString(),
        }).where(eq(scheduledJobs.id, id)).run();
        const payload = { jobId: id, actionId, result };
        this.options.onExecuted?.(payload);
        return payload;
    }
    async tick(now = new Date()) {
        if (this.ticking)
            return;
        this.ticking = true;
        try {
            const jobs = this.list().filter((j) => j.enabled);
            for (const job of jobs) {
                if (matchesCronMinute(job.cron, now) && !isSameUtcMinute(job.lastRunAt, now)) {
                    await this.trigger(job.id, undefined, now);
                }
            }
        }
        finally {
            this.ticking = false;
        }
    }
}
//# sourceMappingURL=service.js.map