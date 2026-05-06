import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db/connection.js";
import { RepoProposalService } from "./repo-proposals.js";

describe("RepoProposalService", () => {
  let service: RepoProposalService;

  beforeEach(async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    sqlite.exec(`
      CREATE TABLE automation_repo_proposals (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        user_id TEXT,
        message TEXT NOT NULL,
        source_thread_id TEXT,
        source_thread_title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    sqlite.exec(`CREATE INDEX idx_automation_repo_proposals_repo ON automation_repo_proposals(repo_id, updated_at DESC)`);
    sqlite.exec(`CREATE INDEX idx_automation_repo_proposals_user ON automation_repo_proposals(user_id, updated_at DESC)`);
    service = new RepoProposalService(db);
  });

  it("stores and lists repo proposals newest first", () => {
    const first = service.create({
      repoId: "repo-1",
      userId: "user-1",
      message: "First follow-up",
    });
    const second = service.create({
      repoId: "repo-1",
      userId: "user-1",
      message: "Second follow-up",
      sourceThreadId: "thread-2",
      sourceThreadTitle: "Thread Two",
    });

    const proposals = service.listByRepo("repo-1");
    expect(proposals).toHaveLength(2);
    expect(proposals[0]?.id).toBe(second.id);
    expect(proposals[1]?.id).toBe(first.id);
    expect(proposals[0]?.sourceThreadTitle).toBe("Thread Two");
  });

  it("updates and deletes proposals", () => {
    const created = service.create({
      repoId: "repo-1",
      userId: "user-1",
      message: "Original",
    });

    const updated = service.update(created.id, { message: "Updated prompt" });
    expect(updated?.message).toBe("Updated prompt");

    service.delete(created.id);
    expect(service.getById(created.id)).toBeUndefined();
  });
});
