/**
 * Tool Registry — Sprint 3.5
 *
 * Central registry for all tool definitions. Tools are registered
 * by name and executed through a unified interface.
 */
import { uuidv7 } from "../lib/uuidv7.js";
import { validateToolInput } from "./validate.js";
export class ToolRegistry {
    tools = new Map();
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    get(name) {
        return this.tools.get(name);
    }
    list() {
        return [...this.tools.values()];
    }
    listNames() {
        return [...this.tools.keys()];
    }
    has(name) {
        return this.tools.has(name);
    }
    /** List tools filtered by tier */
    listByTier(tier) {
        return this.list().filter((t) => (t.tier ?? "standard") === tier);
    }
    /** List tools filtered by category */
    listByCategory(category) {
        return this.list().filter((t) => (t.category ?? "external") === category);
    }
    /** Search tools by name, description, or category (fuzzy keyword match) */
    search(query) {
        const lower = query.toLowerCase();
        const keywords = lower.split(/\s+/).filter(Boolean);
        return this.list().filter((t) => {
            const haystack = `${t.name} ${t.description} ${t.category ?? ""} ${t.tier ?? ""}`.toLowerCase();
            return keywords.every((kw) => haystack.includes(kw));
        });
    }
    /** Get tool info summaries for all tools (lightweight, no execute fn) */
    listInfo() {
        return this.list().map((t) => ({
            name: t.name,
            description: t.description,
            tier: t.tier ?? "standard",
            category: t.category ?? "external",
            source: t.source ?? "builtin",
            parameterCount: Object.keys(t.parameters.properties ?? {}).length,
        }));
    }
    /** Get tool info filtered to only enabled tools for a user */
    listInfoFiltered(disabledTools) {
        return this.listInfo().filter((t) => !disabledTools?.has(t.name));
    }
    /**
     * Get tools that should be sent in the initial LLM payload.
     * Core tools always, standard tools unless user disabled them.
     */
    listForLLM(disabledTools) {
        return this.list().filter((t) => {
            if (disabledTools?.has(t.name))
                return false;
            const tier = t.tier ?? "standard";
            // Core and standard go in the initial payload
            // External (MCP) tools must be discovered via tools.search
            return tier === "core" || tier === "standard";
        });
    }
    /**
     * Check if a tool is executable (registered and not disabled).
     * Even discovered external tools can be executed if they're registered.
     * The disabled check only gates what's sent to the LLM, not execution.
     */
    isExecutable(name, disabledTools) {
        if (!this.tools.has(name))
            return false;
        if (disabledTools?.has(name))
            return false;
        return true;
    }
    /**
     * Execute a tool by name with audit logging.
     */
    async execute(name, input, context, audit) {
        const tool = this.tools.get(name);
        if (!tool) {
            return { ok: false, message: `Unknown tool: ${name}` };
        }
        const actionId = context.actionId || uuidv7();
        // ── Input validation (fast-reject bad LLM arguments) ──
        const validation = validateToolInput(tool.parameters, input);
        if (!validation.valid) {
            const errorMsg = `Input validation failed: ${validation.errors.join("; ")}`;
            audit?.write({
                sessionId: context.sessionId,
                actionId,
                actionType: "tool.validation_error",
                toolName: name,
                inputs: input,
                outputs: { errors: validation.errors },
                status: "failed",
            });
            return { ok: false, message: errorMsg };
        }
        // Log start
        audit?.write({
            sessionId: context.sessionId,
            actionId,
            actionType: "tool.execute",
            toolName: name,
            inputs: input,
            status: "executing",
        });
        try {
            const result = await tool.execute(input, { ...context, actionId });
            // Log result
            audit?.write({
                sessionId: context.sessionId,
                actionId: uuidv7(), // separate audit entry for completion
                actionType: "tool.result",
                toolName: name,
                inputs: input,
                outputs: result.data,
                status: result.ok ? "completed" : "failed",
                parentActionId: actionId,
            });
            return result;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            audit?.write({
                sessionId: context.sessionId,
                actionId: uuidv7(),
                actionType: "tool.error",
                toolName: name,
                inputs: input,
                outputs: { error: message },
                status: "failed",
                parentActionId: actionId,
            });
            return { ok: false, message };
        }
    }
}
//# sourceMappingURL=registry.js.map