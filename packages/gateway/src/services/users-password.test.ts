import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scryptSync } from "node:crypto";
import { openDatabase, migrateDatabase, type SqliteDatabase } from "../db/connection.js";
import { UserService } from "./users.js";

const salt = "0123456789abcdef0123456789abcdef";
const digest = scryptSync("correct password 🦀", salt, 64).toString("hex");

describe("stored password hash validation", () => {
  let sqlite: SqliteDatabase;
  let users: UserService;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    users = new UserService(opened.db);
    sqlite.prepare("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)")
      .run("owner", "alice", `scrypt$${salt}$${digest}`, "now", "now");
  });
  afterEach(() => {
    sqlite.close();
    vi.restoreAllMocks();
  });

  it("accepts existing scrypt hashes and rejects incorrect credentials", () => {
    expect(users.verifyCredentials(" ALICE ", "correct password 🦀")?.id).toBe("owner");
    expect(users.verifyCredentials("alice", "wrong")).toBeNull();
    expect(users.verifyCredentials("missing", "correct password 🦀")).toBeNull();
  });

  it.each(["zz", "z".repeat(128), "00zz", digest.slice(0, -2), digest + "a", digest + "aa"])(
    "rejects malformed or truncated digests: %s",
    (corrupt) => {
      sqlite.prepare("UPDATE users SET password_hash=? WHERE id='owner'").run(`scrypt$${salt}$${corrupt}`);
      expect(users.verifyCredentials("alice", "correct password 🦀")).toBeNull();
      expect(users.verifyCredentials("alice", "arbitrary password")).toBeNull();
    },
  );

  it("accepts the full uppercase hex representation of an existing digest", () => {
    sqlite.prepare("UPDATE users SET password_hash=? WHERE id='owner'").run(`scrypt$${salt}$${digest.toUpperCase()}`);
    expect(users.verifyCredentials("alice", "correct password 🦀")?.id).toBe("owner");
  });
});
