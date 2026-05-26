import { mkdirSync, appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nanoid } from "nanoid";
import type { MemoryBackend, MemoryEntry, MemoryScope, MemoryService, SaveMemoryInput } from "./contracts.js";
import { cosineSimilarity, embedText } from "./embeddings.js";

export interface MemoryEngineOptions {
  backend: MemoryBackend;
  memoryDir?: string;
}

function normalizeMemoryContent(content: string): string {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenSet(content: string): Set<string> {
  return new Set(
    normalizeMemoryContent(content)
      .split(/[^a-z0-9_]+/)
      .map((token) => token.replace(/s$/, ""))
      .filter((token) => token.length >= 2),
  );
}

function lexicalSimilarity(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function recencyScore(value: string, now = Date.now()): number {
  const updatedAt = new Date(value).getTime();
  if (!Number.isFinite(updatedAt)) return 0;
  const ageDays = Math.max(0, (now - updatedAt) / 86_400_000);
  return 1 / (1 + ageDays / 30);
}

function normalizePreCompactionSnippet(snippet: string): string {
  return snippet
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\[(?:user|assistant|system|tool)\]\s*/i, "")
    .replace(/^(?:remember that|remember:)\s+/i, "")
    .trim();
}

function isDurablePreCompactionFact(content: string): boolean {
  if (content.length < 12) return false;
  const durablePattern = /\b(prefers?|preferred|likes?|wants?|always|never|avoid|keep|source of truth|lives? in|stored in|belongs? in|uses?|runs?|requires?|configured|workflow|release|version|env(?:ironment)?|api key|command|should|must|do not|don't|instead|remember)\b/i;
  if (!durablePattern.test(content)) return false;

  const transientPattern = /\b(thanks|thank you|ok|okay|please continue|can you|could you|what is|how do|run the tests|fix this|help me)\b/i;
  const strongFactPattern = /\b(prefers?|always|never|source of truth|lives? in|stored in|belongs? in|uses?|requires?|should|must|instead|remember|version)\b/i;
  return !transientPattern.test(content) || strongFactPattern.test(content);
}

function extractPreCompactionFacts(snippets: string[]): string[] {
  const facts: string[] = [];
  const seen = new Set<string>();

  for (const snippet of snippets) {
    const content = normalizePreCompactionSnippet(snippet);
    if (!isDurablePreCompactionFact(content)) continue;

    const key = normalizeMemoryContent(content);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    facts.push(content);
  }

  return facts.slice(0, 20);
}

export class MemoryEngine implements MemoryService {
  private readonly backend: MemoryBackend;
  private readonly memoryDir?: string;

  constructor(options: MemoryEngineOptions) {
    this.backend = options.backend;
    this.memoryDir = options.memoryDir;
  }

  async save(input: SaveMemoryInput): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const existing = await this.findReplacementCandidate(input);
    const entry: MemoryEntry = {
      id: existing?.id ?? nanoid(),
      scope: input.scope,
      content: input.content,
      source: input.source,
      embedding: embedText(input.content),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      expiresAt: input.expiresAt,
    };

    if (existing) {
      await this.backend.update(entry);
      if (normalizeMemoryContent(existing.content) !== normalizeMemoryContent(entry.content)) {
        this.writeMemoryLog(entry);
      }
    } else {
      await this.backend.save(entry);
      this.writeMemoryLog(entry);
    }
    return entry;
  }

  async search(query: string, limit = 5, scope?: MemoryScope): Promise<MemoryEntry[]> {
    await this.backend.forgetExpired();
    const entries = await this.backend.list(scope);
    const qv = embedText(query);

    return entries
      .map((entry) => {
        const vectorScore = cosineSimilarity(qv, entry.embedding);
        const lexicalScore = lexicalSimilarity(query, entry.content);
        const freshness = recencyScore(entry.updatedAt);
        const relevance = vectorScore * 0.65 + lexicalScore * 0.25;
        return {
          entry,
          relevance,
          score: relevance + freshness * 0.1,
        };
      })
      .filter((item) => item.relevance > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.entry);
  }

  async forget(id: string): Promise<boolean> {
    return this.backend.forget(id);
  }

  async forgetExpired(now?: Date): Promise<number> {
    return this.backend.forgetExpired(now);
  }

  async flushPreCompaction(sessionId: string, snippets: string[]): Promise<number> {
    let saved = 0;
    const facts = extractPreCompactionFacts(snippets);

    for (const content of facts) {
      await this.save({
        scope: "project",
        content,
        source: {
          type: "pre_compaction",
          id: sessionId,
          surface: "chat",
        },
      });
      saved += 1;
    }

    return saved;
  }

  private async findReplacementCandidate(input: SaveMemoryInput): Promise<MemoryEntry | null> {
    const normalized = normalizeMemoryContent(input.content);
    if (!normalized) return null;
    const existing = await this.backend.list(input.scope);
    let best: { entry: MemoryEntry; score: number } | null = null;
    for (const entry of existing) {
      if (
        input.source.type !== "pre_compaction"
        && entry.source.type === input.source.type
        && entry.source.id === input.source.id
        && entry.source.surface === input.source.surface
      ) {
        return entry;
      }
      const entryNormalized = normalizeMemoryContent(entry.content);
      const score = entryNormalized === normalized ? 1 : lexicalSimilarity(input.content, entry.content);
      if (score >= 0.82 && (!best || score > best.score)) {
        best = { entry, score };
      }
    }
    return best?.entry ?? null;
  }

  private writeMemoryLog(entry: MemoryEntry): void {
    if (!this.memoryDir) return;

    const date = entry.createdAt.slice(0, 10);
    const dailyPath = join(this.memoryDir, `${date}.md`);
    const curatedPath = join(dirname(this.memoryDir), "MEMORY.md");
    const line = `- [${entry.scope}] ${entry.content} (source=${entry.source.type}:${entry.source.id}@${entry.source.surface})\n`;

    mkdirSync(this.memoryDir, { recursive: true });
    appendFileSync(dailyPath, line, "utf-8");

    if (!existsSync(curatedPath)) {
      writeFileSync(curatedPath, "# Curated Memory\n\n", "utf-8");
    }

    const curated = readFileSync(curatedPath, "utf-8");
    if (!curated.includes(line.trim())) {
      appendFileSync(curatedPath, line, "utf-8");
    }
  }
}
