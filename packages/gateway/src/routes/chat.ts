import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";

interface OllamaChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// In-memory conversation history per session (swap for DB later)
const sessionHistory = new Map<string, OllamaChatMessage[]>();

const SYSTEM_PROMPT = `You are Jait — Just Another Intelligent Tool. You are a helpful, concise assistant. Answer clearly and directly.`;

export function registerChatRoutes(app: FastifyInstance, config: AppConfig) {
  // Send a message and stream the LLM response via SSE
  app.post("/api/chat", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const content =
      typeof body["content"] === "string"
        ? body["content"]
        : typeof body["message"] === "string"
          ? (body["message"] as string)
          : "";
    const sessionId =
      typeof body["sessionId"] === "string"
        ? body["sessionId"]
        : typeof body["session_id"] === "string"
          ? (body["session_id"] as string)
          : crypto.randomUUID();

    if (!content.trim()) {
      return reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", details: "content is required" });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Build conversation history
    if (!sessionHistory.has(sessionId)) {
      sessionHistory.set(sessionId, [
        { role: "system", content: SYSTEM_PROMPT },
      ]);
    }
    const history = sessionHistory.get(sessionId)!;
    history.push({ role: "user", content });

    try {
      // Call Ollama streaming API
      const ollamaResponse = await fetch(
        `${config.ollamaUrl}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: config.ollamaModel,
            messages: history,
            stream: true,
          }),
        },
      );

      if (!ollamaResponse.ok) {
        const errText = await ollamaResponse.text();
        app.log.error(
          `Ollama error ${ollamaResponse.status}: ${errText}`,
        );
        reply.raw.write(
          `data: ${JSON.stringify({ type: "error", message: `Ollama error: ${ollamaResponse.status}` })}\n\n`,
        );
        reply.raw.end();
        return;
      }

      const reader = ollamaResponse.body?.getReader();
      if (!reader) {
        reply.raw.write(
          `data: ${JSON.stringify({ type: "error", message: "No response body from Ollama" })}\n\n`,
        );
        reply.raw.end();
        return;
      }

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.message?.content) {
              const token = chunk.message.content;
              fullContent += token;
              reply.raw.write(
                `data: ${JSON.stringify({ type: "token", content: token })}\n\n`,
              );
            }
            if (chunk.done) {
              // Save assistant's reply to history
              history.push({ role: "assistant", content: fullContent });

              reply.raw.write(
                `data: ${JSON.stringify({
                  type: "done",
                  session_id: sessionId,
                  prompt_count: history.filter((m) => m.role === "user").length,
                  remaining_prompts: null,
                })}\n\n`,
              );
            }
          } catch {
            // partial JSON line, will be completed next iteration
          }
        }
      }
    } catch (err) {
      app.log.error(err, "Ollama streaming error");
      reply.raw.write(
        `data: ${JSON.stringify({
          type: "error",
          message:
            err instanceof Error
              ? err.message
              : "Failed to reach Ollama",
        })}\n\n`,
      );
    }

    reply.raw.end();
  });

  // List messages in a session (from in-memory history)
  app.get("/api/sessions/:sessionId/messages", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const history = sessionHistory.get(sessionId) ?? [];
    return {
      sessionId,
      messages: history
        .filter((m) => m.role !== "system")
        .map((m, i) => ({
          id: `${sessionId}-${i}`,
          role: m.role,
          content: m.content,
        })),
    };
  });
}
