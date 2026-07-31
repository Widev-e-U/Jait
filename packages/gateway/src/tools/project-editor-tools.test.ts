import { describe, expect, it, vi } from "vitest";
import { createProjectEditorOpenTool } from "./project-editor-tools.js";

describe("project.editor.open", () => {
  it("opens the editor only through an explicit tool call", async () => {
    const sendUICommand = vi.fn();
    const tool = createProjectEditorOpenTool({ sendUICommand } as any);

    const result = await tool.execute({}, {
      sessionId: "session-1",
      projectRoot: "/project/app",
    } as any);

    expect(result.ok).toBe(true);
    expect(sendUICommand).toHaveBeenCalledWith({
      command: "project.editor.open",
      data: { projectRoot: "/project/app" },
    }, "session-1");
  });

  it("does not emit a UI command without a project", async () => {
    const sendUICommand = vi.fn();
    const tool = createProjectEditorOpenTool({ sendUICommand } as any);

    const result = await tool.execute({}, {
      sessionId: "session-1",
      projectRoot: "",
    } as any);

    expect(result.ok).toBe(false);
    expect(sendUICommand).not.toHaveBeenCalled();
  });
});
