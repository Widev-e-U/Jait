import { describe, expect, it, vi } from "vitest";
import { createArchitectureTool } from "./architecture-tools.js";

describe("architecture.generate", () => {
  it("returns a failure when the client reports a render error", async () => {
    const sendUICommand = vi.fn();
    const waitForArchitectureRenderResult = vi.fn().mockResolvedValue({
      ok: false,
      error: "Parse error on line 2",
    });

    const tool = createArchitectureTool({
      sendUICommand,
      waitForArchitectureRenderResult,
    } as any);

    const result = await tool.execute(
      { diagram: "flowchart LR\nA[@bad]" },
      { sessionId: "session-1" } as any,
    );

    expect(sendUICommand).toHaveBeenCalledTimes(1);
    expect(waitForArchitectureRenderResult).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Architecture render failed");
    expect((result.data as { error?: string }).error).toContain("Parse error");
  });

  it("succeeds when the client confirms the render", async () => {
    const sendUICommand = vi.fn();
    const waitForArchitectureRenderResult = vi.fn().mockResolvedValue({ ok: true });

    const tool = createArchitectureTool({
      sendUICommand,
      waitForArchitectureRenderResult,
    } as any);

    const result = await tool.execute(
      { diagram: "flowchart LR\nA[ok]-->B[ok]" },
      { sessionId: "session-1" } as any,
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Architecture diagram sent");
  });
});
