import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ThreadService } from "../services/threads.js";
import { createPersonaAgentTool, createPersonaAgentInspectTool } from "./persona-agent-tools.js";
import { ToolRegistry } from "./registry.js";
import type { ToolContext } from "./contracts.js";
import { ASK_MODE_TOOLS, MUTATING_TOOLS } from "./chat-modes.js";

const owner: ToolContext = { userId: "owner", sessionId: "chat", actionId: "test", requestedBy: "agent", projectRoot: "/tmp" };
describe("Agents-page tools", () => {
  let opened: Awaited<ReturnType<typeof openDatabase>>;
  let service: ThreadService;
  let registry: ToolRegistry;
  beforeEach(async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    service = new ThreadService(opened.db);
    registry = new ToolRegistry();
    const deps = { threadService: service, providerAvailable: (id: string) => id === "codex" };
    registry.register(createPersonaAgentTool(deps));
    registry.register(createPersonaAgentInspectTool(deps));
  });
  afterEach(() => opened.sqlite.close());
  const create = async (r: ToolRegistry, name: string) => {
    const result = await r.execute("agent.profiles", { action: "create", profile: { name, providerId: "codex", role: "Developer", skillIds: ["coding"] } }, owner);
    expect(result.ok).toBe(true);
    return (result.data as any).agent;
  };
  it("shares persistence with the page and preserves omitted fields during updates", async () => {
    const agent = await create(registry, "Developer");
    const changed = await registry.execute("agent.profiles", { action: "update", id: agent.id, profile: { paused: true } }, owner);
    expect(changed.ok).toBe(true);
    expect(service.getPersonaAgent(agent.id, "owner")).toMatchObject({ name: "Developer", role: "Developer", skillIds: ["coding"], paused: true });
    const listed = await registry.execute("agent.profiles.inspect", { action: "list" }, owner);
    expect((listed.data as any).agents).toHaveLength(1);
  });
  it("rejects foreign profiles, missing identity, unavailable providers, and invalid nested configuration", async () => {
    const agent = await create(registry, "Developer");
    for (const action of ["get", "update", "delete"]) {
      const result = await registry.execute("agent.profiles", { action, id: agent.id, profile: { name: "stolen" } }, { ...owner, userId: "other" });
      expect(result.ok).toBe(false);
    }
    expect((await registry.execute("agent.profiles.inspect", { action: "list" }, { ...owner, userId: undefined })).ok).toBe(false);
    for (const profile of [{ providerId: "missing" }, { schedule: { kind: "cron", cron: "" } }, { notificationEvents: ["arbitrary"] }, { tasks: [{ id: "task", name: "Task", cron: "* * * * *" }] }]) {
      const result = await registry.execute("agent.profiles", { action: "update", id: agent.id, profile }, owner);
      expect(result.ok).toBe(false);
    }
    expect(service.getPersonaAgent(agent.id, "owner")?.name).toBe("Developer");
  });
  it("validates reporting lines and detaches reports and threads on deletion", async () => {
    const lead = await create(registry, "Lead");
    const worker = await create(registry, "Worker");
    const setManager = (id: string, reportsToId: string | null) => registry.execute("agent.profiles", { action: "update", id, profile: { reportsToId } }, owner);
    expect((await setManager(worker.id, lead.id)).ok).toBe(true);
    expect((await setManager(lead.id, worker.id)).ok).toBe(false);
    expect((await setManager(worker.id, worker.id)).ok).toBe(false);
    expect((await setManager(worker.id, null)).ok).toBe(true);
    await setManager(worker.id, lead.id);
    const thread = service.create({ title: "Work", providerId: "codex", userId: "owner", personaAgentId: lead.id });
    expect((await registry.execute("agent.profiles", { action: "delete", id: lead.id }, owner)).ok).toBe(true);
    expect(service.getPersonaAgent(worker.id, "owner")?.reportsToId).toBeNull();
    expect(service.getById(thread.id)?.personaAgentId).toBeNull();
  });
  it("keeps inspection read-only and mutations outside Ask mode", async () => {
    expect(ASK_MODE_TOOLS.has("agent.profiles.inspect")).toBe(true);
    expect(ASK_MODE_TOOLS.has("agent.profiles")).toBe(false);
    expect(MUTATING_TOOLS.has("agent.profiles")).toBe(true);
    expect((await registry.execute("agent.profiles.inspect", { action: "delete", id: "x" }, owner)).ok).toBe(false);
  });
});
