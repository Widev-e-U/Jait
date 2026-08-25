import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { registerAuthRoutes } from "./auth.js";
import { UserService } from "../services/users.js";

describe("auth refresh route", () => {
  it("returns 204 No Content (not 401) when there is no session", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const { app } = makeApp(db);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
    });

    // A missing session is the normal state on a fresh login page. It must not
    // surface a 401, which the browser logs as a console error on every load.
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");

    await app.close();
    sqlite.close();
  });

  it("returns 204 when the token is present but invalid", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const { app } = makeApp(db);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { authorization: "Bearer not-a-real-jwt" },
    });

    expect(res.statusCode).toBe(204);

    await app.close();
    sqlite.close();
  });

  it("issues a fresh token and cookie for a valid session", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const { app, users, config } = makeApp(db);
    const user = users.createUser("tester", "password123");
    const token = await signAuthToken(
      { id: user.id, username: user.username },
      config.jwtSecret,
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { id: user.id, username: "tester" },
    });

    await app.close();
    sqlite.close();
  });
});

function makeApp(db: Awaited<ReturnType<typeof openDatabase>>["db"]) {
  const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
  const users = new UserService(db);
  const app = Fastify();
  app.register(cookie);
  registerAuthRoutes(app, config, users);
  return { app, users, config };
}
