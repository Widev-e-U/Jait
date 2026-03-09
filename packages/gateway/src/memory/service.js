import { mkdirSync, appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nanoid } from "nanoid";
import { cosineSimilarity, embedText } from "./embeddings.js";
export class MemoryEngine {
    backend;
    memoryDir;
    constructor(options) {
        this.backend = options.backend;
        this.memoryDir = options.memoryDir;
    }
    async save(input) {
        const now = new Date().toISOString();
        const entry = {
            id: nanoid(),
            scope: input.scope,
            content: input.content,
            source: input.source,
            embedding: embedText(input.content),
            createdAt: now,
            updatedAt: now,
            expiresAt: input.expiresAt,
        };
        await this.backend.save(entry);
        this.writeMemoryLog(entry);
        return entry;
    }
    async search(query, limit = 5, scope) {
        await this.backend.forgetExpired();
        const entries = await this.backend.list(scope);
        const qv = embedText(query);
        return entries
            .map((entry) => ({ entry, score: cosineSimilarity(qv, entry.embedding) }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((item) => item.entry);
    }
    async forget(id) {
        return this.backend.forget(id);
    }
    async forgetExpired(now) {
        return this.backend.forgetExpired(now);
    }
    async flushPreCompaction(sessionId, snippets) {
        let saved = 0;
        for (const snippet of snippets) {
            const content = snippet.trim();
            if (!content)
                continue;
            await this.save({
                scope: "workspace",
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
    writeMemoryLog(entry) {
        if (!this.memoryDir)
            return;
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
//# sourceMappingURL=service.js.map