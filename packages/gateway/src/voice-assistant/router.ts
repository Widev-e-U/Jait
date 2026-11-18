/**
 * Escalation router for the real-time voice assistant.
 *
 * The live realtime model is cheap and instant but shallow; the delegated Jait
 * agent is strong but slow. This module decides *which* delegated model a
 * spoken question deserves:
 *
 *   - `fast` — a quick lookup, a single tool call, a short summary. Cheap model,
 *     low reasoning effort, answer is expected in a couple of seconds.
 *   - `deep` — multi-step research, code understanding, project state, "why"
 *     questions, comparisons and plans. The user's strongest configured model.
 *
 * The live model still decides *whether* to escalate at all (it is the only one
 * that hears the conversation and the prosody), the router only decides *where
 * to send it*. When a System One model is configured the lane choice is made by
 * that model — it is a bounded two-way classification, which is exactly what
 * System One is for. Without System One we fall back to deterministic
 * heuristics so routing still behaves sanely offline.
 */

import { evaluateDecision, systemOneEnabled } from "../services/system-one.js";
import { effortFor, type VoiceModelCandidate, type VoiceModelCatalogue } from "./tier-catalog.js";

export type VoiceEscalationTier = "fast" | "deep";

export interface VoiceRoutePlan {
  tier: VoiceEscalationTier;
  source: "explicit" | "system-one" | "heuristic";
  /** Short human/model readable justification, surfaced in the tool result. */
  reason: string;
  confidence?: number;
  /**
   * Concrete model chosen from the live catalogue. Empty when the catalogue
   * knows nothing, in which case the caller keeps the thread's own defaults.
   */
  target?: VoiceTierTarget;
}

/** A concrete model target, always resolved from what the install really has. */
export interface VoiceTierTarget {
  providerId?: string;
  model?: string;
  reasoningEffort?: string;
}

export interface VoiceRouteInput {
  /** The question the live model wants delegated, in the user's own words. */
  question: string;
  /** Recent user/assistant turns, for context-dependent questions. */
  context?: string;
  /** Per-user provider keys; carries `SYSTEM_ONE_*` when configured. */
  apiKeys?: Record<string, string>;
  /** Hard ceiling for the routing decision itself. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

const ROUTER_TIMEOUT_MS = 4_000;

/** Turn a catalogue candidate into a concrete delegation target. */
export function candidateToTarget(
  candidate: VoiceModelCandidate,
  tier: VoiceEscalationTier,
): VoiceTierTarget {
  const target: VoiceTierTarget = { providerId: candidate.providerId, model: candidate.model };
  const effort = effortFor(candidate, tier);
  if (effort) target.reasoningEffort = effort;
  return target;
}

/**
 * Resolve the model for a tier from the live catalogue — never from a pinned
 * model name. Returns an empty target when the catalogue is empty so the
 * delegation falls back to whatever the thread is configured with.
 */
export function resolveTierTarget(
  tier: VoiceEscalationTier,
  catalogue?: VoiceModelCatalogue,
): VoiceTierTarget {
  const shortlist = tier === "deep" ? catalogue?.deep : catalogue?.fast;
  const best = shortlist?.[0];
  return best ? candidateToTarget(best, tier) : {};
}

/** One-line, model-readable summary of why a candidate fits a tier. */
function describeCandidate(candidate: VoiceModelCandidate): string {
  const cost =
    candidate.costClass === "free"
      ? "no marginal cost (local)"
      : candidate.costClass === "unknown"
        ? "price unknown"
        : `${candidate.costClass} (${candidate.completionPerMTok ?? candidate.promptPerMTok ?? "?"}/1M output tokens)`;
  const effort = candidate.reasoningEfforts.length
    ? `accepts reasoning efforts ${candidate.reasoningEfforts.join("/")}`
    : "no reasoning effort control";
  return `${cost}; ${effort}${candidate.backend ? `; backend ${candidate.backend}` : ""}`;
}

/**
 * Deterministic difficulty estimate, 0 (trivial) .. 6 (hard).
 *
 * Biased toward `fast`: a wrongly-deep route costs seconds of latency, whereas
 * a wrongly-fast route costs a bad answer, so only genuinely hard-sounding
 * questions should cross the threshold.
 */
export function estimateDifficulty(question: string): { score: number; signals: string[] } {
  const text = question.toLowerCase();
  const signals: string[] = [];
  let score = 0;

  const add = (points: number, signal: string) => {
    score += points;
    signals.push(signal);
  };

  const words = text.split(/\s+/).filter(Boolean).length;
  if (words >= 28) add(2, "long-request");
  else if (words >= 16) add(1, "multi-clause-request");

  if (/\b(why|causes?|root cause|reason|explain|trace|diagnose|investigate)\b/.test(text)) {
    add(1, "asks-for-reasoning");
  }
  if (/\b(compare|trade-?offs?|versus|vs\.?|better|should i|pros and cons|design|architect)\b/.test(text)) {
    add(2, "comparison-or-design");
  }
  if (/\b(refactor|implement|migrate|rewrite|fix|debug|failing|fails|error|exception|stack|regress)\b/.test(text)) {
    add(2, "code-work");
  }
  if (/\b(plan|strategy|roadmap|step by step|how (do|can) (we|i) (build|make|set up|configure))\b/.test(text)) {
    add(1, "multi-step-plan");
  }
  if (/\b(threads?|sessions?|pull requests?|pr|repo|repositor(y|ies)|projects?|providers?|agents?|tools?|config|deploy|logs?|tests?|database|schema)\b/.test(text)) {
    add(1, "project-state");
  }
  if (/\b(today|tomorrow|weather|hello|hey|thanks|how are you|what time)\b/.test(text) && words <= 10) {
    score = Math.max(0, score - 2);
    signals.push("small-talk");
  }
  if (words <= 7 && !signals.some((s) => s === "code-work")) {
    score = Math.max(0, score - 1);
    signals.push("short-utterance");
  }

  return { score: Math.max(0, Math.min(score, 6)), signals };
}

const DEEP_THRESHOLD = 3;

function heuristicPlan(question: string): VoiceRoutePlan {
  const { score, signals } = estimateDifficulty(question);
  const tier: VoiceEscalationTier = score >= DEEP_THRESHOLD ? "deep" : "fast";
  return {
    tier,
    source: "heuristic",
    reason: signals.length ? `difficulty ${score}/6 (${signals.slice(0, 3).join(", ")})` : `difficulty ${score}/6`,
    confidence: tier === "deep" ? Math.min(0.9, 0.45 + score * 0.08) : 0.6,
  };
}

/**
 * Ask the user's System One model which lane a question belongs in.
 * Returns null when System One is unconfigured/unavailable so the caller can
 * fall back — routing must never fail a voice turn.
 */
/** Union of both tier shortlists, capped so the decision stays a small choice. */
function mergedShortlist(catalogue?: VoiceModelCatalogue): VoiceModelCandidate[] {
  const seen = new Set<string>();
  const merged: VoiceModelCandidate[] = [];
  for (const candidate of [...(catalogue?.fast ?? []), ...(catalogue?.deep ?? [])]) {
    if (seen.has(candidate.model)) continue;
    seen.add(candidate.model);
    merged.push(candidate);
  }
  return merged.slice(0, 6);
}

async function systemOnePlan(
  input: VoiceRouteInput & { catalogue?: VoiceModelCatalogue },
): Promise<VoiceRoutePlan | null> {
  if (!systemOneEnabled(input.apiKeys)) return null;

  // Only models this install can actually reach right now, carrying their real
  // price and reasoning support, so the choice is grounded instead of guessed.
  const catalogue = input.catalogue;
  const shortlist = mergedShortlist(catalogue);
  const describeLane = (tier: VoiceEscalationTier): string => {
    const bucket = tier === "deep" ? catalogue?.deep : catalogue?.fast;
    const lines = (bucket ?? [])
      .map((candidate) => `- ${candidate.model}: ${describeCandidate(candidate)}`)
      .join("\n");
    return lines || "- none known";
  };

  const state = [
    "You are routing questions asked by a user to a voice assistant.",
    "The live voice model answers instantly but cannot reason deeply.",
    "Escalated questions go to a delegated coding/research agent.",
    'Lane "fast": cheap model, low effort — lookups, single-tool fetches, short summaries, status checks, one-fact answers.',
    'Lane "deep": strong model, high effort — multi-step work, code reading or changes, project/repo state, diagnosis, comparisons, plans, anything where a quick answer would likely be wrong or incomplete.',
    "When unsure, prefer fast: latency is the product here.",
    `Models reachable from this install for the cheap lane:\n${describeLane("fast")}`,
    `Models reachable from this install for the strong lane:\n${describeLane("deep")}`,
    input.context ? `Recent conversation:\n${input.context.slice(-1_200)}` : "",
    `Question to route:\n${input.question.slice(0, 1_500)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? ROUTER_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  input.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await evaluateDecision(
      input.apiKeys,
      state,
      {
        lane: {
          type: "choice",
          instructions: "Choose the escalation lane for the question to route.",
          criteria: {
            fast: "a quick lookup, single tool call, or one-sentence factual answer",
            deep: "multi-step reasoning, code or project state, diagnosis, comparison or plan",
          },
        },
        ...(shortlist.length > 0
          ? {
              model: {
                type: "choice" as const,
                instructions:
                  "Choose which model actually available on this Jait install should answer. Prefer the cheapest model that is good enough; choose a stronger, pricier model only when the lane needs deep reasoning.",
                criteria: Object.fromEntries(
                  shortlist.map((candidate) => [candidate.model, describeCandidate(candidate)]),
                ),
              },
            }
          : {}),
      },
      controller.signal,
    );
    const answer = response.answers["lane"];
    const choice = answer?.choice?.trim().toLowerCase();
    if (choice !== "fast" && choice !== "deep") return null;

    // The model vote is advisory: if it names something not in the shortlist we
    // fall back to the ranked pick for the lane rather than failing the turn.
    const chosenModel = response.answers["model"]?.choice?.trim();
    const matched = chosenModel
      ? shortlist.find((candidate) => candidate.model === chosenModel)
      : undefined;
    const target = matched ? candidateToTarget(matched, choice) : resolveTierTarget(choice, catalogue);

    return {
      tier: choice,
      source: "system-one",
      reason: matched
        ? `system-one chose ${choice} lane with ${matched.model}`
        : `system-one chose ${choice} lane`,
      confidence: typeof answer?.confidence === "number" ? answer.confidence : undefined,
      ...(target.model ? { target } : {}),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Decide the lane for a delegated voice question.
 *
 * `explicit` short-circuits everything: when the live model already named a
 * lane we honour it, because it had the audio and the conversation.
 */
export async function planVoiceEscalation(
  input: VoiceRouteInput & {
    explicitTier?: VoiceEscalationTier | "auto";
    catalogue?: VoiceModelCatalogue;
  },
): Promise<VoiceRoutePlan> {
  const question = input.question?.trim() ?? "";

  const withTarget = (plan: VoiceRoutePlan): VoiceRoutePlan => {
    if (plan.target?.model) return plan;
    const target = resolveTierTarget(plan.tier, input.catalogue);
    return target.model ? { ...plan, target } : plan;
  };

  if (input.explicitTier === "fast" || input.explicitTier === "deep") {
    return withTarget({
      tier: input.explicitTier,
      source: "explicit",
      reason: "requested by the live model",
    });
  }
  if (!question) return withTarget({ tier: "fast", source: "heuristic", reason: "no question text" });

  const fromSystemOne = await systemOnePlan(input).catch(() => null);
  if (fromSystemOne) return withTarget(fromSystemOne);
  return withTarget(heuristicPlan(question));
}
