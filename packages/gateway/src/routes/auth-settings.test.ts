import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { registerAuthRoutes } from "./auth.js";
import { UserService } from "../services/users.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: "tester" }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("auth settings routes", () => {
  it("persists workspace picker location in user settings", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const users = new UserService(db);
    const user = users.createUser("tester", "password123");
    const app = Fastify();

    registerAuthRoutes(app, config, users);

    const headers = await authHeader(config.jwtSecret, user.id);
    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/api/auth/settings",
      headers,
      payload: {
        workspace_picker_path: "/tmp/project",
        workspace_picker_node_id: "gateway",
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      workspace_picker_path: "/tmp/project",
      workspace_picker_node_id: "gateway",
    });

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/auth/settings",
      headers,
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      workspace_picker_path: "/tmp/project",
      workspace_picker_node_id: "gateway",
    });

    await app.close();
    sqlite.close();
  });
});
