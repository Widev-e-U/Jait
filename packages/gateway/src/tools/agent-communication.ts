/**
 * Agent-to-agent communicative acts.
 *
 * A minimal, FIPA-ACL-inspired vocabulary for how a sub-agent (or swarm
 * specialist) reports back to whatever delegated its task. Scoped down from
 * full FIPA ACL — no conversation protocols, no ontologies, no transport
 * concerns — to just the handful of intents that matter for Jait's one-shot
 * delegation model (agent.spawn, swarm specialists): did it inform, propose
 * options, refuse, fail, or need clarification?
 *
 * The parent (coordinator / swarm orchestrator) uses the tag to decide how to
 * treat a result instead of folding every sub-agent response into the
 * synthesis as if it were an unconditional success.
 */

export type Performative = "inform" | "propose" | "refuse" | "failure" | "query" | "agree";

export const PERFORMATIVES: readonly Performative[] = ["inform", "propose", "refuse", "failure", "query", "agree"];

const PERFORMATIVE_TAG_RE = /^\s*\[(INFORM|PROPOSE|REFUSE|FAILURE|QUERY|AGREE)\]\s*/i;

/** Performatives that mean the delegated task did NOT complete successfully. */
const UNSUCCESSFUL_PERFORMATIVES = new Set<Performative>(["refuse", "failure", "query"]);

export interface ParsedPerformative {
  performative: Performative;
  /** Content with the leading tag stripped. */
  content: string;
}

/**
 * Sub-agents are instructed (see buildSubAgentSystemPrompt) to prefix their
 * final answer with a bracketed tag, e.g. "[REFUSE] out of scope: ...".
 * Parse it out, defaulting to "inform" when the model omitted the tag
 * (smaller/older models don't always comply).
 */
export function parsePerformative(rawContent: string): ParsedPerformative {
  const match = rawContent.match(PERFORMATIVE_TAG_RE);
  if (!match) {
    return { performative: "inform", content: rawContent.trim() };
  }
  const performative = match[1]!.toLowerCase() as Performative;
  return { performative, content: rawContent.slice(match[0].length).trim() };
}

/** Whether a result carrying this performative should be treated as a successful completion. */
export function isSuccessfulPerformative(performative: Performative): boolean {
  return !UNSUCCESSFUL_PERFORMATIVES.has(performative);
}

export function describePerformative(performative: Performative): string {
  switch (performative) {
    case "inform": return "Reported results";
    case "propose": return "Proposed options for a decision";
    case "refuse": return "Declined the task";
    case "failure": return "Attempted but failed";
    case "query": return "Needs clarification";
    case "agree": return "Accepted the task";
    default: return "Reported results";
  }
}
