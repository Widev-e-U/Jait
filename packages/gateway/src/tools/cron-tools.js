function normalizeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}
function normalizeToolName(value) {
    const raw = normalizeString(value).trim();
    if (!raw)
        return raw;
    const firstUnderscore = raw.indexOf("_");
    if (firstUnderscore === -1)
        return raw;
    return `${raw.slice(0, firstUnderscore)}.${raw.slice(firstUnderscore + 1)}`;
}
export function createCronAddTool(scheduler) {
    return {
        name: "cron.add",
        description: "Add a scheduled cron job",
        tier: "standard",
        category: "scheduler",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string" },
                cron: { type: "string" },
                toolName: { type: "string" },
                input: { type: "object" },
                sessionId: { type: "string" },
                workspaceRoot: { type: "string" },
            },
            required: ["name", "cron", "toolName"],
        },
        execute: async (input, context) => {
            const body = input ?? {};
            const job = scheduler.create({
                userId: context.userId,
                name: normalizeString(body["name"]),
                cron: normalizeString(body["cron"]),
                toolName: normalizeToolName(body["toolName"]),
                input: body["input"] ?? {},
                sessionId: normalizeString(body["sessionId"], "default"),
                workspaceRoot: normalizeString(body["workspaceRoot"], process.cwd()),
            });
            return { ok: true, message: "Cron job created", data: job };
        },
    };
}
export function createCronListTool(scheduler) {
    return {
        name: "cron.list",
        description: "List configured cron jobs",
        tier: "standard",
        category: "scheduler",
        source: "builtin",
        parameters: { type: "object", properties: {} },
        execute: async (_input, context) => ({
            ok: true,
            message: "Cron jobs",
            data: { jobs: scheduler.list(context.userId) },
        }),
    };
}
export function createCronRemoveTool(scheduler) {
    return {
        name: "cron.remove",
        description: "Remove a cron job by id",
        tier: "standard",
        category: "scheduler",
        source: "builtin",
        parameters: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
        },
        execute: async (input, context) => {
            const id = normalizeString(input?.["id"]);
            const removed = scheduler.remove(id, context.userId);
            return { ok: removed, message: removed ? "Cron job removed" : "Cron job not found", data: { removed } };
        },
    };
}
export function createCronUpdateTool(scheduler) {
    return {
        name: "cron.update",
        description: "Update cron job fields",
        tier: "standard",
        category: "scheduler",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                id: { type: "string" },
                name: { type: "string" },
                cron: { type: "string" },
                enabled: { type: "boolean" },
                input: { type: "object" },
            },
            required: ["id"],
        },
        execute: async (input, context) => {
            const body = input ?? {};
            const id = normalizeString(body["id"]);
            const updated = scheduler.update(id, {
                name: typeof body["name"] === "string" ? body["name"] : undefined,
                cron: typeof body["cron"] === "string" ? body["cron"] : undefined,
                enabled: typeof body["enabled"] === "boolean" ? body["enabled"] : undefined,
                input: body["input"],
            }, context.userId);
            return {
                ok: !!updated,
                message: updated ? "Cron job updated" : "Cron job not found",
                data: updated ?? { id },
            };
        },
    };
}
//# sourceMappingURL=cron-tools.js.map