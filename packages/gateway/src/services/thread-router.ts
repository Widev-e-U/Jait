/**
 * Thread Router — automatic problem-solving orchestration for threads.
 *
 * Classifies the user's task, auto-selects relevant skills, and produces
 * a RoutingPlan that guides the agent's execution strategy.
 *
 * The router runs at thread start (before the first turn) and injects
 * its plan into the thread record + agent context.
 */

import type { RoutingPlan, ThreadIntent, ExecutionTopology } from "@jait/shared";
import type { Skill } from "../skills/index.js";

// ── Intent classification ────────────────────────────────────────────

interface IntentSignal {
  intent: ThreadIntent;
  /** Keywords or patterns that trigger this intent. */
  patterns: RegExp[];
  /** Weight boost when matched — higher = stronger signal. */
  weight: number;
}

const INTENT_SIGNALS: IntentSignal[] = [
  {
    intent: "debugging",
    patterns: [
      /\b(fix|bug|error|crash|broken|fail|exception|stack\s?trace|debug|diagnos|troubleshoot|not\s+working|issue|wrong|unexpected)\b/i,
    ],
    weight: 1.2,
  },
  {
    intent: "coding",
    patterns: [
      /\b(implement|create|build|add|write|refactor|extract|rename|move|delete|remove|update|change|modify|feature|component|function|class|module|endpoint|route|api|test|spec|migrate)\b/i,
    ],
    weight: 1.0,
  },
  {
    intent: "review",
    patterns: [
      /\b(review|audit|check|inspect|assess|evaluate|quality|lint|analyze|PR|pull\s+request|code\s+review|security\s+review)\b/i,
    ],
    weight: 1.1,
  },
  {
    intent: "research",
    patterns: [
      /\b(research|investigate|compare|explore|find\s+out|how\s+does|what\s+is|explain|understand|look\s+into|learn|documentation|docs)\b/i,
    ],
    weight: 1.0,
  },
  {
    intent: "planning",
    patterns: [
      /\b(plan|design|architect|breakdown|decompos|structure|organiz|strateg|roadmap|milestone|spec|rfc|proposal)\b/i,
    ],
    weight: 1.1,
  },
  {
    intent: "devops",
    patterns: [
      /\b(deploy|CI\/CD|pipeline|docker|container|kubernetes|k8s|terraform|infra|server|hosting|monitoring|release|publish)\b/i,
    ],
    weight: 1.1,
  },
  {
    intent: "data",
    patterns: [
      /\b(data|dataset|csv|json|sql|query|transform|ETL|analysis|analytics|chart|graph|visualization|parse|scrape)\b/i,
    ],
    weight: 1.0,
  },
];

function classifyIntent(message: string): { intent: ThreadIntent; confidence: number } {
  const scores = new Map<ThreadIntent, number>();

  for (const signal of INTENT_SIGNALS) {
    for (const pattern of signal.patterns) {
      const matches = message.match(new RegExp(pattern, "gi"));
      if (matches) {
        const current = scores.get(signal.intent) ?? 0;
        scores.set(signal.intent, current + matches.length * signal.weight);
      }
    }
  }

  if (scores.size === 0) {
    return { intent: "general", confidence: 0.3 };
  }

  let bestIntent: ThreadIntent = "general";
  let bestScore = 0;
  let totalScore = 0;

  for (const [intent, score] of scores) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  const confidence = Math.min(bestScore / Math.max(totalScore, 1), 1);
  return { intent: bestIntent, confidence };
}

// ── Skill matching ───────────────────────────────────────────────────

function matchSkills(message: string, skills: Skill[]): string[] {
  if (skills.length === 0) return [];

  const messageLower = message.toLowerCase();
  const matched: { id: string; score: number }[] = [];

  for (const skill of skills) {
    // Score based on keyword overlap between task and skill description
    const descWords = skill.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const nameWords = skill.name.toLowerCase().split(/[\s\-_]+/).filter((w) => w.length > 2);
    let score = 0;

    for (const word of descWords) {
      if (messageLower.includes(word)) score += 1;
    }
    for (const word of nameWords) {
      if (messageLower.includes(word)) score += 2; // Name matches are stronger
    }

    if (score > 0) {
      matched.push({ id: skill.id, score });
    }
  }

  // Return top matches, sorted by score
  return matched
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m) => m.id);
}

// ── Topology detection ───────────────────────────────────────────────

function detectTopology(
  message: string,
  intent: ThreadIntent,
): { topology: ExecutionTopology; subtasks?: string[] } {
  // For now, detect obvious multi-part tasks
  // Phase 2 will use LLM-based decomposition
  const lines = message.split("\n").filter((l) => l.trim());

  // Check for numbered lists or bullet points indicating subtasks
  const listItems = lines.filter((l) => /^\s*(?:\d+[.)]\s|-\s|\*\s|•\s)/.test(l));

  if (listItems.length >= 3 && (intent === "coding" || intent === "planning")) {
    return {
      topology: "delegated",
      subtasks: listItems.map((l) => l.replace(/^\s*(?:\d+[.)]\s|-\s|\*\s|•\s)/, "").trim()),
    };
  }

  // Multi-file or multi-component tasks
  if (intent === "coding" && /\b(and|also|plus|additionally)\b/i.test(message) && message.length > 300) {
    return { topology: "delegated" };
  }

  return { topology: "single" };
}

// ── Main router function ─────────────────────────────────────────────

export interface RouteThreadOptions {
  /** The user's first message / task description. */
  message: string;
  /** Available skills from the registry. */
  availableSkills: Skill[];
  /** Skills already pinned on the thread (user-selected). */
  pinnedSkillIds?: string[] | null;
  /** The thread kind (delivery vs delegation). */
  kind?: "delivery" | "delegation";
  /** Repository strategy text, if any. */
  repoStrategy?: string | null;
}

/**
 * Route a thread — classify intent, match skills, determine topology.
 * This is a synchronous, heuristic-based router (Phase 1).
 * Phase 2 will add an optional LLM classification pass for ambiguous cases.
 */
export function routeThread(options: RouteThreadOptions): RoutingPlan {
  const { message, availableSkills, pinnedSkillIds, kind } = options;

  // Classify intent
  const { intent } = classifyIntent(message);

  // Match skills from description
  const autoSkillIds = matchSkills(message, availableSkills);

  // Merge with pinned skills (pinned take priority)
  const pinnedSet = new Set(pinnedSkillIds ?? []);
  const suggestedSkillIds = [
    ...pinnedSet,
    ...autoSkillIds.filter((id) => !pinnedSet.has(id)),
  ];

  // Determine topology
  const { topology, subtasks } = kind === "delegation"
    ? { topology: "single" as const, subtasks: undefined }
    : detectTopology(message, intent);

  // Build reason
  const reason = buildReason(intent, topology, suggestedSkillIds, availableSkills);

  return {
    intent,
    reason,
    suggestedSkillIds,
    topology,
    subtasks,
    routedAt: new Date().toISOString(),
  };
}

function buildReason(
  intent: ThreadIntent,
  topology: ExecutionTopology,
  skillIds: string[],
  skills: Skill[],
): string {
  const intentLabel: Record<ThreadIntent, string> = {
    coding: "code implementation",
    debugging: "debugging/troubleshooting",
    research: "research/investigation",
    review: "code review/assessment",
    planning: "planning/architecture",
    devops: "DevOps/infrastructure",
    data: "data processing",
    general: "general task",
  };

  const parts: string[] = [`Classified as ${intentLabel[intent]}.`];

  if (skillIds.length > 0) {
    const names = skillIds
      .map((id) => skills.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .slice(0, 3);
    if (names.length > 0) {
      parts.push(`Auto-activated skills: ${names.join(", ")}.`);
    }
  }

  if (topology === "delegated") {
    parts.push("Task has separable subtasks — helper threads recommended.");
  }

  return parts.join(" ");
}

// ── Prompt injection ─────────────────────────────────────────────────

/**
 * Format the routing plan as a prescriptive problem-solving methodology
 * injected into the agent's first turn message. This tells the agent
 * exactly how to approach the task using structured orchestration phases.
 */
export function formatRoutingPlanForPrompt(plan: RoutingPlan): string {
  const lines = [
    "<orchestration>",
    `Classification: ${plan.intent} — ${plan.reason}`,
    "",
    "You MUST follow this problem-solving process:",
    "",
  ];

  // Phase-specific instructions based on intent
  const phases = getOrchestrationPhases(plan);
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]!;
    lines.push(`Phase ${i + 1}: ${phase.name}`);
    for (const step of phase.steps) {
      lines.push(`  - ${step}`);
    }
    lines.push("");
  }

  if (plan.topology === "delegated" && plan.subtasks?.length) {
    lines.push("Identified subtasks for parallel execution:");
    for (const subtask of plan.subtasks) {
      lines.push(`  - ${subtask}`);
    }
    lines.push(
      "",
      "Use thread.control create_many to spawn helper threads for independent subtasks.",
      "Each helper should be kind: delegation so it auto-completes after one turn.",
      "",
    );
  }

  lines.push(
    "IMPORTANT: Do NOT skip phases. Show your reasoning at each phase before proceeding.",
    "</orchestration>",
  );
  return lines.join("\n");
}

interface OrchestrationPhase {
  name: string;
  steps: string[];
}

function getOrchestrationPhases(plan: RoutingPlan): OrchestrationPhase[] {
  const common: OrchestrationPhase[] = [
    {
      name: "ANALYZE",
      steps: [
        "Read and understand the full request before touching any code",
        "Identify the core problem vs. symptoms",
        "List what you know vs. what you need to discover",
      ],
    },
  ];

  const intentPhases: Record<string, OrchestrationPhase[]> = {
    debugging: [
      {
        name: "REPRODUCE",
        steps: [
          "Locate the error source — read stack traces, logs, failing tests",
          "Trace the execution path to find the root cause",
          "Confirm you understand WHY it fails, not just WHERE",
        ],
      },
      {
        name: "FIX",
        steps: [
          "Implement the minimal correct fix",
          "Check for related occurrences of the same bug pattern",
        ],
      },
      {
        name: "VERIFY",
        steps: [
          "Run the failing test/scenario to confirm the fix works",
          "Check for regressions — run related tests",
        ],
      },
    ],
    coding: [
      {
        name: "PLAN",
        steps: [
          "Identify which files need changes and what the changes are",
          "Consider edge cases and error handling needed",
          "If the task is large, break it into sequential steps",
        ],
      },
      {
        name: "IMPLEMENT",
        steps: [
          "Make changes file by file, verifying each step compiles",
          "Follow existing code patterns and conventions in the codebase",
        ],
      },
      {
        name: "VERIFY",
        steps: [
          "Run type checking / compilation to catch errors",
          "Run relevant tests if they exist",
          "Review your changes for correctness",
        ],
      },
    ],
    review: [
      {
        name: "SURVEY",
        steps: [
          "Read all changed files / the code under review",
          "Understand the intent and context of the changes",
        ],
      },
      {
        name: "ASSESS",
        steps: [
          "Check for correctness, edge cases, and potential bugs",
          "Evaluate code quality, naming, and adherence to conventions",
          "Look for security issues and performance concerns",
        ],
      },
      {
        name: "REPORT",
        steps: [
          "Summarize findings with specific file/line references",
          "Categorize issues by severity (critical, warning, suggestion)",
        ],
      },
    ],
    research: [
      {
        name: "INVESTIGATE",
        steps: [
          "Search the codebase for relevant implementations and patterns",
          "Read documentation and comments for context",
          "Map out the relevant architecture and data flow",
        ],
      },
      {
        name: "SYNTHESIZE",
        steps: [
          "Compile findings into a clear summary",
          "Provide concrete recommendations with code references",
        ],
      },
    ],
    planning: [
      {
        name: "SCOPE",
        steps: [
          "Define clear boundaries — what is and isn't included",
          "Identify dependencies and ordering constraints",
        ],
      },
      {
        name: "DECOMPOSE",
        steps: [
          "Break the work into concrete, actionable tasks",
          "Estimate relative complexity of each task",
          "Identify which tasks can be parallelized",
        ],
      },
      {
        name: "DOCUMENT",
        steps: [
          "Write the plan with task ordering and dependencies",
          "Include acceptance criteria for each task",
        ],
      },
    ],
    devops: [
      {
        name: "ASSESS",
        steps: [
          "Review current infrastructure/pipeline configuration",
          "Identify what needs to change and potential risks",
        ],
      },
      {
        name: "IMPLEMENT",
        steps: [
          "Make configuration changes incrementally",
          "Validate each change before proceeding",
        ],
      },
      {
        name: "VERIFY",
        steps: [
          "Test the pipeline/deployment in a safe way",
          "Confirm rollback path exists if something goes wrong",
        ],
      },
    ],
    data: [
      {
        name: "EXPLORE",
        steps: [
          "Understand the data schema, format, and volume",
          "Identify transformations needed",
        ],
      },
      {
        name: "TRANSFORM",
        steps: [
          "Implement data processing step by step",
          "Validate intermediate results",
        ],
      },
      {
        name: "VALIDATE",
        steps: [
          "Check output correctness with sample data",
          "Handle edge cases (nulls, malformed entries, encoding)",
        ],
      },
    ],
  };

  const specific = intentPhases[plan.intent] ?? [
    {
      name: "EXECUTE",
      steps: [
        "Work through the task methodically",
        "Verify your work at each step",
      ],
    },
    {
      name: "VERIFY",
      steps: [
        "Confirm the result is correct and complete",
      ],
    },
  ];

  return [...common, ...specific];
}
