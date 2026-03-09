const TITLE_MAX_LENGTH = 80;
const TITLE_TURN_TIMEOUT_MS = 30_000;
export const THREAD_TITLE_PROMPT = "Reply with ONLY a short task title (3-8 words). No quotes, bullets, or commentary.";
/**
 * Generate a title by sending a turn through an already-running provider
 * session.  The session must not be busy (turn completed / just started).
 * Returns the assistant text from the turn.
 */
export async function generateTitleViaTurn(provider, sessionId, task) {
    const prompt = `${THREAD_TITLE_PROMPT}\n\n${task.trim()}`;
    return new Promise((resolve, reject) => {
        let text = "";
        const timer = setTimeout(() => {
            unsub();
            reject(new Error("Title turn timed out"));
        }, TITLE_TURN_TIMEOUT_MS);
        const unsub = provider.onEvent((event) => {
            if (!("sessionId" in event) || event.sessionId !== sessionId)
                return;
            if (event.type === "token") {
                text += event.content;
            }
            else if (event.type === "message" && event.role === "assistant") {
                // Full message replaces streamed tokens
                text = event.content;
            }
            else if (event.type === "turn.completed") {
                clearTimeout(timer);
                unsub();
                resolve(text.trim());
            }
            else if (event.type === "session.error") {
                clearTimeout(timer);
                unsub();
                reject(new Error(event.error));
            }
            else if (event.type === "session.completed") {
                clearTimeout(timer);
                unsub();
                resolve(text.trim());
            }
        });
        // Fire the turn — the prompt asks for only a title
        provider.sendTurn(sessionId, prompt).catch((err) => {
            clearTimeout(timer);
            unsub();
            reject(err);
        });
    });
}
/**
 * Generate a title using a direct LLM API call (OpenAI / Ollama).
 * Used as fallback when the provider isn't a CLI agent or when no
 * session is available.
 */
export async function generateTitleViaApi(options) {
    const raw = await callLlm(options);
    const title = normalizeGeneratedThreadTitle(raw, "");
    if (!title)
        throw new Error("Title generation returned empty result");
    return title;
}
export function normalizeGeneratedThreadTitle(raw, fallback) {
    const singleLine = raw
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? "";
    let title = singleLine
        .replace(/^title\s*:\s*/i, "")
        .replace(/^[-*•\d.)\s]+/, "")
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    title = title.replace(/[.:;\-–\s]+$/g, "").trim();
    if (!title)
        return fallback;
    if (title.length <= TITLE_MAX_LENGTH)
        return title;
    const truncated = title.slice(0, TITLE_MAX_LENGTH + 1);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace >= 24 ? truncated.slice(0, lastSpace) : truncated.slice(0, TITLE_MAX_LENGTH)).trim();
}
// ── Private helpers ──────────────────────────────────────────────
async function callLlm(options) {
    const apiKeys = options.apiKeys ?? {};
    const promptMessages = [
        { role: "system", content: THREAD_TITLE_PROMPT },
        { role: "user", content: options.task.trim() },
    ];
    if (apiKeys["OPENAI_API_KEY"]?.trim() || options.config.llmProvider === "openai") {
        const apiKey = apiKeys["OPENAI_API_KEY"]?.trim() || options.config.openaiApiKey;
        if (!apiKey)
            throw new Error("OPENAI_API_KEY is not configured");
        const response = await fetch(`${(apiKeys["OPENAI_BASE_URL"]?.trim() || options.config.openaiBaseUrl).replace(/\/+$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: apiKeys["OPENAI_MODEL"]?.trim() || options.model || options.config.openaiModel,
                temperature: 0.2,
                max_tokens: 24,
                messages: promptMessages,
            }),
        });
        if (!response.ok) {
            throw new Error(`OpenAI title generation failed: ${response.status}`);
        }
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (typeof content === "string")
            return content;
        if (Array.isArray(content)) {
            return content
                .map((part) => (part?.type === "text" ? part.text ?? "" : ""))
                .join("")
                .trim();
        }
        throw new Error("OpenAI title generation returned no content");
    }
    const response = await fetch(`${options.config.ollamaUrl.replace(/\/+$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: options.config.ollamaModel,
            stream: false,
            messages: promptMessages,
        }),
    });
    if (!response.ok) {
        throw new Error(`Ollama title generation failed: ${response.status}`);
    }
    const data = await response.json();
    const content = data.message?.content?.trim();
    if (!content)
        throw new Error("Ollama title generation returned no content");
    return content;
}
//# sourceMappingURL=thread-title.js.map