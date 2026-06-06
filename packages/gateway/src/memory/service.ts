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
  if (content.length < 24) return false;
  if (/[?]/.test(content)) return false;

  if (/^(let me\b|i was\b|i'?m\b|i think\b|i don'?t\b|i need\b|i see\b|now let me\b|did you\b|do you\b|can you\b|could you\b|would you\b|will you\b|please\b|pls\b|ok\b|okay\b|sure\b|thanks\b|thank you\b|what\b|how\b|why\b|when\b|where\b|which\b|who\b)/i.test(content)) {
    return false;
  }

  if (/^(commit\b|push\b|pull\b|fix\b|make\b|add\b|run\b|start\b|stop\b|restart\b|delete\b|remove\b|create\b|update\b|check\b|verify\b|build\b|deploy\b|install\b|uninstall\b|kill\b|test\b|trace\b|show\b|tell\b|give\b|find\b|open\b|close\b|merge\b|rebase\b|undo\b|redo\b)/i.test(content)) {
    return false;
  }

  const strongFactPattern = /\b(prefers?|preferred|always|never|avoid|source of truth|lives? in|stored in|belongs? in|configured|workflow|api key|do not\b|don'?t\b|instead\b|remember that)\b/i;
  if (strongFactPattern.test(content)) return true;

  const declarativeRule = /\b(should|must)\b/i;
  if (declarativeRule.test(content) && !/\b(this|that|here|it)\b/i.test(content.slice(0, 40))) {
    return true;
  }

  return false;
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

  async list(scope?: MemoryScope): Promise<MemoryEntry[]> {
    await this.backend.forgetExpired();
    return this.backend.list(scope);
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
