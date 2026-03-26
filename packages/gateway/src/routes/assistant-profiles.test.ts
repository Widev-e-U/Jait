import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { AssistantProfileService } from "../services/assistant-profiles.js";
import { registerAssistantProfileRoutes } from "./assistant-profiles.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("assistant profile routes", () => {
  it("creates, lists, gets, updates, and deletes profiles", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const profileService = new AssistantProfileService(db);

    registerAssistantProfileRoutes(app, config, profileService);

    const headers = await authHeader(config.jwtSecret, "user-1");

    // Create
    const create = await app.inject({
      method: "POST",
      url: "/api/assistants/profiles",
      headers,
      payload: {
        name: "Code Helper",
        description: "Assists with coding tasks",
        systemPrompt: "Be concise and helpful",
        runtimeMode: "supervised",
        toolProfile: "default",
        enabledSkills: ["skill-a"],
        enabledPlugins: ["plugin-x"],
        isDefault: true,
      },
    });
    expect(create.statusCode).toBe(201);
    const created = (create.json() as { profile: { id: string } }).profile;

    // List
    const list = await app.inject({ method: "GET", url: "/api/assistants/profiles", headers });
    expect(list.statusCode).toBe(200);
    const listPayload = list.json() as { profiles: Array<{ name: string }> };
    expect(listPayload.profiles.some((p) => p.name === "Code Helper")).toBe(true);

    // Get
    const get = await app.inject({ method: "GET", url: `/api/assistants/profiles/${created.id}`, headers });
    expect(get.statusCode).toBe(200);
    expect((get.json() as { profile: { name: string } }).profile.name).toBe("Code Helper");

    // Update
    const update = await app.inject({
      method: "PATCH",
      url: `/api/assistants/profiles/${created.id}`,
      headers,
      payload: { name: "Ops Helper", isDefault: false, enabledSkills: ["skill-b", "skill-c"] },
    });
    expect(update.statusCode).toBe(200);
    const updated = (update.json() as { profile: { name: string; isDefault: number | boolean } }).profile;
    expect(updated.name).toBe("Ops Helper");

    // Delete
    const del = await app.inject({ method: "DELETE", url: `/api/assistants/profiles/${created.id}`, headers });
    expect(del.statusCode).toBe(204);

    await app.close();
    sqlite.close();
  });
});
