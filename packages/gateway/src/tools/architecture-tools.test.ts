import { describe, expect, it, vi } from "vitest";
import { createArchitectureTool } from "./architecture-tools.js";

describe("architecture.generate", () => {
  it("saves the diagram even when the client reports a render error", async () => {
    const sendUICommand = vi.fn();
    const waitForArchitectureRenderResult = vi.fn().mockResolvedValue({
      ok: false,
      error: "Parse error on line 2",
    });
    const save = vi.fn().mockResolvedValue({
      updatedAt: "2026-03-21T00:00:00.000Z",
      filePath: "/workspace/app/.jait/architecture.mmd",
    });

    const tool = createArchitectureTool({
      sendUICommand,
      waitForArchitectureRenderResult,
    } as any, {
      save,
    } as any);

    const result = await tool.execute(
      { diagram: "flowchart LR\nA[@bad]" },
      { sessionId: "session-1", workspaceRoot: "/workspace/app", userId: "user-1" } as any,
    );

    expect(sendUICommand).toHaveBeenCalledTimes(1);
    expect(waitForArchitectureRenderResult).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("saved to .jait/architecture.mmd");
  });

  it("succeeds when the client confirms the render", async () => {
    const sendUICommand = vi.fn();
    const waitForArchitectureRenderResult = vi.fn().mockResolvedValue({ ok: true });
    const getFilePath = vi.fn().mockReturnValue("/workspace/app/.jait/architecture.mmd");
    const save = vi.fn().mockResolvedValue({
      updatedAt: "2026-03-21T00:00:00.000Z",
      filePath: "/workspace/app/.jait/architecture.mmd",
    });

    const tool = createArchitectureTool({
      sendUICommand,
      waitForArchitectureRenderResult,
    } as any, {
      getFilePath,
      save,
    } as any);

    const result = await tool.execute(
      { diagram: "flowchart LR\nA[ok]-->B[ok]" },
      { sessionId: "session-1", workspaceRoot: "/workspace/app", userId: "user-1" } as any,
    );

    expect(result.ok).toBe(true);
    expect(getFilePath).toHaveBeenCalledWith("/workspace/app");
    expect(sendUICommand).toHaveBeenCalledWith(
      {
        command: "architecture.update",
        data: {
          diagram: "flowchart LR\nA[ok]-->B[ok]",
          requestId: expect.any(String),
          workspaceRoot: "/workspace/app",
          filePath: "/workspace/app/.jait/architecture.mmd",
        },
      },
      "session-1",
    );
    expect(save).toHaveBeenCalledWith({
      workspaceRoot: "/workspace/app",
      diagram: "flowchart LR\nA[ok]-->B[ok]",
      userId: "user-1",
    });
    expect(result.message).toContain("saved to .jait/architecture.mmd");
  });
});
