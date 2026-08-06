/**
 * agent.message — Talk to sibling specialists.
 *
 * Only available to sub-agents spawned concurrently in the same swarm batch
 * (see swarm-mailbox.ts / agent-loop.ts). Lets a specialist post a short note
 * for its siblings and see what they've posted so far, so parallel specialists
 * can avoid duplicate work, share findings, or flag conflicts — without any
 * blocking request/response.
 */

import type { ToolDefinition, ToolResult } from "./contracts.js";
import { ToolName } from "./tool-names.js";
import { getSwarmParticipantCount, peekSwarmMessages, postSwarmMessage } from "./swarm-mailbox.js";

interface AgentMessageInput {
  /** Optional note to share with sibling specialists. Omit to just read what others have posted. */
  note?: string;
}

export function createAgentMessageTool(): ToolDefinition<AgentMessageInput> {
  return {
    name: ToolName.AgentMessage,
    description:
      "Talk to the other specialists running alongside you in this swarm round. " +
      "Pass `note` to share a finding or flag with your siblings; call with no `note` to just check " +
      "in on what they've posted so far. Siblings only see your note when they call this tool " +
      "themselves — there's no push notification, so don't rely on it for anything time-critical. " +
      "Only available when you're one of several specialists spawned in parallel.",
    tier: "standard",
    category: "agent",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        note: {
          type: "string",
          description: "Optional note to share with sibling specialists. Omit to just read what others have posted.",
        },
      },
      required: [],
    },
    async execute(input, context): Promise<ToolResult> {
      const roundId = context.swarmRoundId;
      if (!roundId) {
        return {
          ok: false,
          message: "No active swarm round — agent.message is only available to specialists running concurrently alongside siblings.",
        };
      }
      const from = context.swarmParticipant?.trim() || "a specialist";

      const messages = input.note?.trim()
        ? postSwarmMessage(roundId, from, input.note.trim())
        : peekSwarmMessages(roundId);

      if (messages.length === 0) {
        const otherCount = Math.max(getSwarmParticipantCount(roundId) - 1, 0);
        return {
          ok: true,
          message: otherCount > 0
            ? `No messages yet from your ${otherCount} sibling specialist${otherCount === 1 ? "" : "s"}.`
            : "No sibling specialists have posted anything yet.",
          data: { messages: [] },
        };
      }

      return {
        ok: true,
        message: messages.map((m) => `[${m.from}] ${m.content}`).join("\n"),
        data: { messages },
      };
    },
  };
}
