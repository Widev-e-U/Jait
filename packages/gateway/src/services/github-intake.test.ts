import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import type { SqliteDatabase } from "../db/connection.js";
import { GithubIntakeService, validateGithubIntakeRules } from "./github-intake.js";

let sqlite: SqliteDatabase;
let intake: GithubIntakeService;
beforeEach(async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  migrateDatabase(sqlite);
  intake = new GithubIntakeService(opened.db);
});
afterEach(() => sqlite.close());

describe("GitHub event observation", () => {
  it("records exact matches once and keeps owners isolated without storing event bodies", () => {
    intake.save("one", "agent", validateGithubIntakeRules([{ repository: "org/repo", sender: "alice", event: "issues", action: "opened" }]));
    const event = { userId: "one", agentId: "agent", deliveryId: "delivery-1", event: "issues", payload: { action: "opened", repository: { full_name: "Org/Repo" }, sender: { login: "Alice" }, issue: { body: "private content" } } };
    intake.receive(event);
    intake.receive(event);
    expect(intake.list("one", "agent")).toHaveLength(1);
    expect(intake.list("one", "agent")[0]?.result).toBe("would_accept");
    expect(JSON.stringify(intake.list("one", "agent"))).not.toContain("private content");
    expect(intake.list("two", "agent")).toEqual([]);
    expect(intake.rules("two", "agent")).toEqual([]);
    intake.receive({ ...event, deliveryId: "delivery-2", payload: { ...event.payload, sender: { login: "mallory" } } });
    expect(intake.list("one", "agent").find(row => row.deliveryId === "delivery-2")?.result).toBe("ignored");
  });
  it("rejects broad, malformed rules and deliveries without an id", () => {
    expect(() => validateGithubIntakeRules([{ repository: "*", sender: "alice", event: "issues", action: "opened" }])).toThrow();
    expect(() => validateGithubIntakeRules([{ repository: "org/repo", sender: "alice", event: "push", action: "opened" }])).toThrow();
    expect(() => intake.receive({ userId: "one", agentId: "agent", deliveryId: null, event: "issues", payload: {} })).toThrow();
  });
});
