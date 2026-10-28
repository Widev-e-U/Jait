/**
 * Live model catalogue for voice escalation tiers.
 *
 * The escalation router must not guess which model to use. It asks "what does
 * this install actually have, right now?" via `listJaitModels()` — which probes
 * the user's configured backends with the user's own keys — and then ranks only
 * those reachable models by published cost and advertised reasoning support.
 *
 * Nothing in this file names a specific model, so new backends and new model
 * generations flow through without code changes. When the catalogue can say
 * nothing (no keys, all probes failed) it returns an empty result and callers
 * fall back to the thread's configured defaults.
 */

import type { ProviderModelInfo } from "@jait/shared";
import type { AppConfig } from "../config.js";
import { listJaitModels } from "../services/jait-models.js";

/** How a candidate is paid for, derived from published pricing only. */
export type VoiceCostClass = "free" | "cheap" | "standard" | "premium" | "unknown";

/** Relative capability, derived from advertised reasoning support + size hints. */
export type VoiceStrengthClass = "small" | "mid" | "strong" | "unknown";

export interface VoiceModelCandidate {
  /** Jait provider that can run this model (the multiplexing `jait` provider). */
  providerId: string;
  /** Model id exactly as the backend reports it, e.g. `vendor/model`. */
  model: string;
  /** Backend that reported the model, for human-readable routing reasons. */
  backend?: string;
  promptPerMTok?: number;
  completionPerMTok?: number;
  /** Effort values this model actually accepts; empty when it accepts none. */
  reasoningEfforts: string[];
  costClass: VoiceCostClass;
  strengthClass: VoiceStrengthClass;
}

export interface VoiceModelCatalogue {
  source: "backends" | "empty";
  /** Cheapest models that are still usable, best first. */
  fast: VoiceModelCandidate[];
  /** Strongest reasoning-capable models available, best first. */
  deep: VoiceModelCandidate[];
  builtAt: number;
}

export interface BuildVoiceCatalogueOptions {
  config: AppConfig;
  apiKeys?: Record<string, string>;
  fallbackModels?: ProviderModelInfo[];
  /** Injected in tests to avoid touching real backends. */
  listModels?: (options: Parameters<typeof listJaitModels>[0]) => Promise<ProviderModelInfo[]>;
  now?: () => number;
  ttlMs?: number;
}

/** Substring hints that a model is a small/quick variant of its family. */
const SMALL_HINTS = /(mini|nano|tiny|small|lite|flash|haiku|instant|sparkle)/i;
/** Substring hints that a model is the heavyweight of its family. */
const STRONG_HINTS = /(opus|max|ultra|pro|large|heavy|thinking|reason|70b|72b|235b|405b|671b)/i;
/** Backends that host models locally, where marginal token cost is zero. */
const LOCAL_BACKEND = /ollama|llama\.cpp|local|lmstudio/i;

const DEFAULT_TTL_MS = 60_000;
const MAX_SHORTLIST = 6;

/** Models ranked highest here are tried first for the cheap `fast` tier. */
const COST_ORDER: Record<VoiceCostClass, number> = {
  free: 0,
  cheap: 1,
  standard: 2,
  premium: 3,
  unknown: 4,
};

/** Models ranked highest here are tried first for the strong `deep` tier. */
const STRENGTH_ORDER: Record<VoiceStrengthClass, number> = {
  strong: 0,
  mid: 1,
  unknown: 2,
  small: 3,
};

function classifyCost(info: ProviderModelInfo): VoiceCostClass {
  const backend = info.group ?? "";
  if (LOCAL_BACKEND.test(backend)) return "free";
  const prompt = info.pricing?.promptPerMTok;
  const completion = info.pricing?.completionPerMTok;
  if (prompt === undefined && completion === undefined) return "unknown";
  if ((prompt ?? 0) === 0 && (completion ?? 0) === 0) return "free";
  // Output tokens dominate a spoken-answer bill, so gate on completion price.
  const benchmark = completion ?? prompt ?? 0;
  if (benchmark <= 1.5) return "cheap";
  if (benchmark <= 8) return "standard";
  return "premium";
}

function classifyStrength(info: ProviderModelInfo): VoiceStrengthClass {
  const id = info.id.toLowerCase();
  const reasons = info.supportedReasoningEfforts?.length ?? 0;
  if (STRONG_HINTS.test(id) && reasons > 0) return "strong";
  if (reasons > 0) return "strong";
  if (SMALL_HINTS.test(id)) return "small";
  if (STRONG_HINTS.test(id)) return "mid";
  return "unknown";
}

/**
 * Effort values this model will accept. Providers that only advertise a
 * boolean expose a conservative OpenAI-compatible set; models that advertise
 * nothing get no effort at all rather than a value that may be rejected.
 */
function resolveReasoningEfforts(info: ProviderModelInfo): string[] {
  const advertised = (info.supportedReasoningEfforts ?? [])
    .map((entry) => entry.reasoningEffort?.trim())
    .filter((entry): entry is string => Boolean(entry));
  if (advertised.length > 0) return advertised;
  if (info.reasoningEffortSupported) return ["low", "medium", "high"];
  return [];
}

function toCandidate(info: ProviderModelInfo, providerId: string): VoiceModelCandidate {
  const candidate: VoiceModelCandidate = {
    providerId,
    model: info.id,
    reasoningEfforts: resolveReasoningEfforts(info),
    costClass: classifyCost(info),
    strengthClass: classifyStrength(info),
  };
  if (info.group) candidate.backend = info.group;
  const prompt = info.pricing?.promptPerMTok;
  const completion = info.pricing?.completionPerMTok;
  if (prompt !== undefined) candidate.promptPerMTok = prompt;
  if (completion !== undefined) candidate.completionPerMTok = completion;
  return candidate;
}

/** Price used for ordering; unknown prices sort last instead of looking free. */
function priceForRanking(candidate: VoiceModelCandidate): number {
  if (candidate.costClass === "free") return 0;
  return candidate.completionPerMTok ?? candidate.promptPerMTok ?? Number.POSITIVE_INFINITY;
}

function rankFast(a: VoiceModelCandidate, b: VoiceModelCandidate): number {
  const cost = COST_ORDER[a.costClass] - COST_ORDER[b.costClass];
  if (cost !== 0) return cost;
  const price = priceForRanking(a) - priceForRanking(b);
  if (Number.isFinite(price) && price !== 0) return price;
  // Among equals, avoid heavyweight reasoning models: they are slow to first token.
  const strength = STRENGTH_ORDER[b.strengthClass] - STRENGTH_ORDER[a.strengthClass];
  if (strength !== 0) return strength;
  return a.model.localeCompare(b.model);
}

function rankDeep(a: VoiceModelCandidate, b: VoiceModelCandidate): number {
  const effort = Number(b.reasoningEfforts.length > 0) - Number(a.reasoningEfforts.length > 0);
  if (effort !== 0) return effort;
  const strength = STRENGTH_ORDER[a.strengthClass] - STRENGTH_ORDER[b.strengthClass];
  if (strength !== 0) return strength;
  // Pricier almost always means larger within a vendor's own ladder.
  const price = priceForRanking(b) - priceForRanking(a);
  if (Number.isFinite(price) && price !== 0) return price;
  return a.model.localeCompare(b.model);
}

/**
 * Build the tier catalogue, de-duplicating ids that several backends may
 * report and keeping the best-known pricing for each.
 */
export function buildCatalogueFromModels(
  models: ProviderModelInfo[],
  options: { providerId?: string; now?: () => number } = {},
): VoiceModelCatalogue {
  const providerId = options.providerId ?? "jait";
  const byId = new Map<string, VoiceModelCandidate>();
  for (const info of models) {
    if (!info?.id) continue;
    const candidate = toCandidate(info, providerId);
    const existing = byId.get(candidate.model);
    if (!existing) {
      byId.set(candidate.model, candidate);
      continue;
    }
    // Prefer the entry that actually knows its price and reasoning support.
    const existingScore = COST_ORDER[existing.costClass] + (existing.reasoningEfforts.length ? 0 : 5);
    const candidateScore = COST_ORDER[candidate.costClass] + (candidate.reasoningEfforts.length ? 0 : 5);
    if (candidateScore < existingScore) byId.set(candidate.model, candidate);
  }

  const unique = [...byId.values()];
  return {
    source: unique.length > 0 ? "backends" : "empty",
    fast: unique.slice().sort(rankFast).slice(0, MAX_SHORTLIST),
    deep: unique.slice().sort(rankDeep).slice(0, MAX_SHORTLIST),
    builtAt: (options.now ?? Date.now)(),
  };
}

export const EMPTY_CATALOGUE: VoiceModelCatalogue = {
  source: "empty",
  fast: [],
  deep: [],
  builtAt: 0,
};

let cachedCatalogue: { key: string; value: VoiceModelCatalogue; expiresAt: number } | null = null;

/** Cheap, stable fingerprint so a key change invalidates the cache. */
function catalogueCacheKey(apiKeys?: Record<string, string>): string {
  if (!apiKeys) return "none";
  return Object.keys(apiKeys).sort().map((key) => `${key}:${apiKeys[key]?.length ?? 0}`).join("|");
}

/**
 * Resolve the catalogue for a user, cached briefly because escalation happens
 * mid-conversation and a voice turn cannot afford a fresh multi-backend probe.
 */
export async function buildVoiceCatalogue(
  options: BuildVoiceCatalogueOptions,
): Promise<VoiceModelCatalogue> {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const key = catalogueCacheKey(options.apiKeys);
  if (!options.listModels && cachedCatalogue && cachedCatalogue.key === key && now() < cachedCatalogue.expiresAt) {
    return cachedCatalogue.value;
  }

  const listModels = options.listModels ?? listJaitModels;
  let models: ProviderModelInfo[] = [];
  try {
    models = await listModels({
      config: options.config,
      apiKeys: options.apiKeys,
      fallbackModels: options.fallbackModels ?? [],
      includeCloud: true,
    });
  } catch {
    // A dead backend must never fail a voice turn; the router falls back to
    // thread defaults when the catalogue is empty.
    return EMPTY_CATALOGUE;
  }

  const catalogue = buildCatalogueFromModels(models, { now });
  if (!options.listModels) {
    cachedCatalogue = { key, value: catalogue, expiresAt: now() + ttlMs };
  }
  return catalogue;
}

/** Test hook: drop the process-wide cache. */
export function resetVoiceCatalogueCache(): void {
  cachedCatalogue = null;
}

/**
 * Pick the effort value for a candidate: cheapest/lowest for `fast`, deepest
 * for `deep`. Returns undefined when the model advertises no efforts.
 */
export function effortFor(
  candidate: VoiceModelCandidate,
  tier: "fast" | "deep",
): string | undefined {
  if (candidate.reasoningEfforts.length === 0) return undefined;
  const rank = (effort: string): number => {
    const normalized = effort.toLowerCase();
    if (normalized === "minimal" || normalized === "none") return 0;
    if (normalized === "low") return 1;
    if (normalized === "medium" || normalized === "med") return 2;
    if (normalized === "high") return 3;
    if (normalized === "xhigh" || normalized === "extra_high") return 4;
    return 2;
  };
  const sorted = candidate.reasoningEfforts.slice().sort((a, b) => rank(a) - rank(b));
  return tier === "fast" ? sorted[0] : sorted[sorted.length - 1];
}
