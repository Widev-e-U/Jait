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
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'normal',
        due_date TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        completed_at TEXT,
        completion_history TEXT NOT NULL DEFAULT '[]',
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
      priority: "high",
      dueDate: "2026-05-12",
      tags: ["ui", "todo"],
      sourceThreadId: "thread-2",
      sourceThreadTitle: "Thread Two",
    });

    const proposals = service.listByRepo("repo-1");
    expect(proposals).toHaveLength(2);
    expect(proposals[0]?.id).toBe(second.id);
    expect(proposals[1]?.id).toBe(first.id);
    expect(proposals[0]?.sourceThreadTitle).toBe("Thread Two");
    expect(proposals[0]?.priority).toBe("high");
    expect(proposals[0]?.dueDate).toBe("2026-05-12");
    expect(proposals[0]?.tags).toBe(JSON.stringify(["ui", "todo"]));
    expect(proposals[0]?.completedAt).toBeNull();
    expect(proposals[0]?.completionHistory).toBe("[]");
  });

  it("updates, tracks completion history, and deletes proposals", () => {
    const created = service.create({
      repoId: "repo-1",
      userId: "user-1",
      message: "Original",
    });

    const updated = service.update(created.id, {
      message: "Updated prompt",
      status: "in_progress",
      priority: "low",
      dueDate: "2026-05-20",
      tags: ["cleanup"],
    });
    expect(updated?.message).toBe("Updated prompt");
    expect(updated?.status).toBe("in_progress");
    expect(updated?.priority).toBe("low");
    expect(updated?.dueDate).toBe("2026-05-20");
    expect(updated?.tags).toBe(JSON.stringify(["cleanup"]));
    expect(updated?.completedAt).toBeNull();

    const completed = service.update(created.id, {
      status: "done",
    });
    expect(completed?.completedAt).toEqual(expect.any(String));
    const history = JSON.parse(completed?.completionHistory ?? "[]") as Array<{ completedAt: string; previousStatus: string }>;
    expect(history).toHaveLength(1);
    expect(history[0]?.completedAt).toBe(completed?.completedAt);
    expect(history[0]?.previousStatus).toBe("in_progress");

    const reopened = service.update(created.id, {
      status: "open",
    });
    expect(reopened?.completedAt).toBeNull();
    expect(JSON.parse(reopened?.completionHistory ?? "[]")).toHaveLength(1);

    service.delete(created.id);
    expect(service.getById(created.id)).toBeUndefined();
  });

  it("records completion metadata when creating done proposals", () => {
    const created = service.create({
      repoId: "repo-1",
      userId: "user-1",
      message: "Already finished",
      status: "done",
    });

    expect(created.completedAt).toEqual(expect.any(String));
    const history = JSON.parse(created.completionHistory) as Array<{ completedAt: string; previousStatus: string | null }>;
    expect(history).toEqual([{ completedAt: created.completedAt, previousStatus: null }]);
  });
});
