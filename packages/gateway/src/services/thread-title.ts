import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";
import type { AppConfig } from "../config.js";
import type { ProviderId } from "../providers/contracts.js";

const TITLE_MAX_LENGTH = 80;
const TITLE_TIMEOUT_MS = 30_000;

export const THREAD_TITLE_PROMPT = "create a title for this task.";

export interface GenerateThreadTitleOptions {
  providerId: ProviderId;
  task: string;
  model?: string;
  workingDirectory?: string;
  config: AppConfig;
  apiKeys?: Record<string, string>;
}

export function fallbackThreadTitle(task: string): string {
  const normalized = task
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "New Thread";
  if (normalized.length <= TITLE_MAX_LENGTH) return normalized;
  const truncated = normalized.slice(0, TITLE_MAX_LENGTH + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace >= 24 ? truncated.slice(0, lastSpace) : truncated.slice(0, TITLE_MAX_LENGTH)).trim();
}

export function normalizeGeneratedThreadTitle(raw: string, fallback: string): string {
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

  if (!title) return fallback;
  if (title.length <= TITLE_MAX_LENGTH) return title;

  const truncated = title.slice(0, TITLE_MAX_LENGTH + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace >= 24 ? truncated.slice(0, lastSpace) : truncated.slice(0, TITLE_MAX_LENGTH)).trim();
}

export async function generateThreadTitle(options: GenerateThreadTitleOptions): Promise<string> {
  const fallback = fallbackThreadTitle(options.task);
  let raw = "";
  switch (options.providerId) {
    case "claude-code":
      raw = await generateClaudeTitle(options);
      break;
    case "codex":
      raw = await generateCodexTitle(options);
      break;
    case "jait":
    default:
      raw = await generateJaitTitle(options);
      break;
  }
  return normalizeGeneratedThreadTitle(raw, fallback);
}

function buildPrompt(task: string): string {
  return `${THREAD_TITLE_PROMPT}\n\n${task.trim()}`;
}

async function generateJaitTitle(options: GenerateThreadTitleOptions): Promise<string> {
  const apiKeys = options.apiKeys ?? {};
  const promptMessages = [
    { role: "system", content: "Reply with only a short task title. Do not use quotes, bullets, or extra commentary." },
    { role: "user", content: THREAD_TITLE_PROMPT },
    { role: "user", content: options.task.trim() },
  ];

  if (apiKeys["OPENAI_API_KEY"]?.trim() || options.config.llmProvider === "openai") {
    const apiKey = apiKeys["OPENAI_API_KEY"]?.trim() || options.config.openaiApiKey;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

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

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
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

  const data = await response.json() as { message?: { content?: string } };
  const content = data.message?.content?.trim();
  if (!content) throw new Error("Ollama title generation returned no content");
  return content;
}

async function generateClaudeTitle(options: GenerateThreadTitleOptions): Promise<string> {
  const command = await detectCommand(["claude"]);
  const cwd = options.workingDirectory || process.cwd();
  const args = [
    "--output-format", "stream-json",
    "--print",
    ...(options.model ? ["--model", options.model] : []),
    buildPrompt(options.task),
  ];

  const child = spawn(command, args, {
    cwd,
    env: process.env as Record<string, string>,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  let output = "";
  let buffer = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        const type = typeof event["type"] === "string" ? event["type"] : "";
        if (type === "result" && typeof event["result"] === "string") {
          output += event["result"];
        } else if (type === "assistant") {
          const message = event["message"] as Record<string, unknown> | undefined;
          const content = message?.["content"];
          if (typeof content === "string") output += content;
        } else if (type === "content_block_delta") {
          const delta = event["delta"] as Record<string, unknown> | undefined;
          if (delta?.["type"] === "text_delta") output += String(delta["text"] ?? "");
        }
      } catch {
        // Ignore non-JSON status lines.
      }
    }
  });

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      killChildTree(child);
      reject(new Error("Claude title generation timed out"));
    }, TITLE_TIMEOUT_MS);

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      const trimmed = output.trim();
      if (code === 0 && trimmed) {
        resolve(trimmed);
        return;
      }
      reject(new Error(stderr.trim() || `Claude title generation failed with exit code ${code}`));
    });
  });
}

async function generateCodexTitle(options: GenerateThreadTitleOptions): Promise<string> {
  const command = await detectCommand(["codex", "npx codex"]);
  const cwd = options.workingDirectory || process.cwd();
  const child = spawn(command, ["app-server"], {
    cwd,
    env: process.env as Record<string, string>,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });

  const rl = readline.createInterface({ input: child.stdout! });
  const pending = new Map<string, {
    timeout: ReturnType<typeof setTimeout>;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  let nextId = 1;
  let providerThreadId = "";
  let streamed = "";
  let completedText = "";
  let settled = false;
  let stderr = "";

  const cleanup = () => {
    rl.close();
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Codex session closed"));
    }
    pending.clear();
    killChildTree(child);
  };

  const writeMessage = (message: unknown) => {
    if (!child.stdin?.writable) throw new Error("Cannot write to codex stdin");
    child.stdin.write(JSON.stringify(message) + "\n");
  };

  const sendRequest = (method: string, params: unknown, timeoutMs = TITLE_TIMEOUT_MS): Promise<unknown> => {
    const id = String(nextId++);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      pending.set(id, { timeout, resolve, reject });
      writeMessage({ id, method, params });
    });
  };

  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  let failResponse: (error: Error) => void = () => {};
  const responsePromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Codex title generation timed out"));
    }, TITLE_TIMEOUT_MS);

    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(error);
    };
    failResponse = finishReject;

    const finishResolve = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(value);
    };

    child.on("error", finishReject);
    child.on("exit", (code, signal) => {
      if (settled) return;
      const text = (streamed || completedText).trim();
      if (code === 0 && text) {
        finishResolve(text);
        return;
      }
      finishReject(new Error(stderr.trim() || `Codex exited before completing title generation (code=${code}, signal=${signal})`));
    });

    rl.on("line", (line) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }

      if ((typeof message["id"] === "string" || typeof message["id"] === "number") && typeof message["method"] !== "string") {
        const key = String(message["id"]);
        const request = pending.get(key);
        if (!request) return;
        pending.delete(key);
        clearTimeout(request.timeout);
        const error = message["error"] as Record<string, unknown> | undefined;
        if (error?.["message"]) {
          request.reject(new Error(String(error["message"])));
        } else {
          request.resolve(message["result"]);
        }
        return;
      }

      if (typeof message["method"] !== "string") return;
      const method = message["method"];
      const params = (message["params"] ?? {}) as Record<string, unknown>;

      if (message["id"] != null) {
        writeMessage({
          id: message["id"],
          error: { code: -32601, message: `Unsupported server request: ${method}` },
        });
        return;
      }

      switch (method) {
        case "item/agentMessage/delta":
        case "codex/event/agent_message_content_delta":
          streamed += typeof params["delta"] === "string"
            ? params["delta"]
            : typeof params["text"] === "string"
              ? params["text"]
              : "";
          break;
        case "codex/event/agent_message":
          if (!streamed) {
            completedText += typeof params["content"] === "string"
              ? params["content"]
              : typeof params["text"] === "string"
                ? params["text"]
                : typeof params["message"] === "string"
                  ? params["message"]
                  : "";
          }
          break;
        case "item/completed":
          if (!streamed) {
            const item = (params["item"] ?? params) as Record<string, unknown>;
            completedText += extractCodexText(item);
          }
          break;
        case "codex/event/item_completed":
          if (!streamed) {
            const item = (params["msg"] ?? params) as Record<string, unknown>;
            completedText += extractCodexText(item);
          }
          break;
        case "turn/completed":
          if ((streamed || completedText).trim()) {
            finishResolve((streamed || completedText).trim());
          }
          break;
        case "error": {
          const error = params["error"] as Record<string, unknown> | undefined;
          finishReject(new Error(String(error?.["message"] ?? "Codex title generation failed")));
          break;
        }
      }
    });
  });

  try {
    await sendRequest("initialize", {
      clientInfo: { name: "jait", title: "Jait Gateway", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    writeMessage({ method: "initialized" });

    const threadResponse = await sendRequest("thread/start", {
      model: options.model ?? null,
      cwd,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      experimentalRawEvents: false,
    }) as { thread?: { id?: string }; threadId?: string };

    providerThreadId = threadResponse?.thread?.id ?? threadResponse?.threadId ?? "";
    if (!providerThreadId) {
      throw new Error("Codex thread/start did not return a thread id");
    }

    await sendRequest("turn/start", {
      threadId: providerThreadId,
      input: [{ type: "text", text: buildPrompt(options.task), text_elements: [] }],
    });
  } catch (err) {
    failResponse(err instanceof Error ? err : new Error(String(err)));
  }

  return responsePromise;
}

async function detectCommand(commands: string[]): Promise<string> {
  for (const command of commands) {
    if (await testCommand(command)) return command;
  }
  throw new Error(`Provider command not found: ${commands.join(", ")}`);
}

function testCommand(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = command.split(" ");
    const bin = parts[0];
    if (!bin) {
      resolve(false);
      return;
    }

    const child = spawn(bin, [...parts.slice(1), "--version"], {
      stdio: "ignore",
      shell: true,
    });

    const timer = setTimeout(() => {
      killChildTree(child);
      resolve(false);
    }, 5_000);

    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function killChildTree(child: import("node:child_process").ChildProcess): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall back to child.kill below.
    }
  }

  if (!child.killed) {
    child.kill();
  }
}

function extractCodexText(item: Record<string, unknown>): string {
  if (typeof item["role"] === "string" && item["role"] === "user") return "";
  if (typeof item["content"] === "string" && item["content"].trim()) return item["content"];
  if (typeof item["text"] === "string" && item["text"].trim()) return item["text"];
  if (typeof item["message"] === "string" && item["message"].trim()) return item["message"];
  if (typeof item["output"] === "string" && item["output"].trim()) return item["output"];
  if (typeof item["last_agent_message"] === "string" && item["last_agent_message"].trim()) return item["last_agent_message"];

  const content = item["content"];
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const block = part as Record<string, unknown>;
        if ((block["type"] === "text" || block["type"] === "output_text") && typeof block["text"] === "string") {
          return block["text"];
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}
