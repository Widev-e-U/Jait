import { describe, expect, it } from "vitest";
import { createAgentMessageTool } from "./agent-message-tool.js";
import { createSwarmRound, endSwarmRound } from "./swarm-mailbox.js";
import type { ToolContext } from "./contracts.js";

const baseContext: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/repo",
  requestedBy: "test",
};

describe("createAgentMessageTool", () => {
  it("fails clearly when there's no active swarm round", async () => {
    const tool = createAgentMessageTool();
    const result = await tool.execute({}, baseContext);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No active swarm round");
  });

  it("reports no siblings have posted yet when peeking an empty round", async () => {
    createSwarmRound("round-1", 2);
    try {
      const tool = createAgentMessageTool();
      const result = await tool.execute(
        {},
        { ...baseContext, swarmRoundId: "round-1", swarmParticipant: "Research Specialist" },
      );
      expect(result.ok).toBe(true);
      expect(result.message).toContain("No messages yet from your 1 sibling specialist");
    } finally {
      endSwarmRound("round-1");
    }
  });

  it("lets one specialist's posted note be read by another via peek", async () => {
    createSwarmRound("round-2", 2);
    try {
      const tool = createAgentMessageTool();

      const posted = await tool.execute(
        { note: "found the bug in auth.ts" },
        { ...baseContext, swarmRoundId: "round-2", swarmParticipant: "Research Specialist" },
      );
      expect(posted.ok).toBe(true);
      expect(posted.message).toBe("[Research Specialist] found the bug in auth.ts");

      const peeked = await tool.execute(
        {},
        { ...baseContext, swarmRoundId: "round-2", swarmParticipant: "Fix Specialist" },
      );
      expect(peeked.ok).toBe(true);
      expect(peeked.message).toBe("[Research Specialist] found the bug in auth.ts");

      const posted2 = await tool.execute(
        { note: "patched, running tests" },
        { ...baseContext, swarmRoundId: "round-2", swarmParticipant: "Fix Specialist" },
      );
      expect(posted2.message).toBe(
        "[Research Specialist] found the bug in auth.ts\n[Fix Specialist] patched, running tests",
      );
    } finally {
      endSwarmRound("round-2");
    }
  });

  it("labels the sender as 'a specialist' when no participant label is set", async () => {
    createSwarmRound("round-3", 1);
    try {
      const tool = createAgentMessageTool();
      const result = await tool.execute({ note: "hi" }, { ...baseContext, swarmRoundId: "round-3" });
      expect(result.message).toBe("[a specialist] hi");
    } finally {
      endSwarmRound("round-3");
    }
  });
});
