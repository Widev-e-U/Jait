import { randomUUID } from "node:crypto";

const sessions = new WeakMap<object, string>();

/** Go uses conversation identity for routing and cache continuity. */
export function llmRequestHeaders(
  llm: { openaiApiKey: string; openaiBaseUrl: string; backend?: string; sessionId?: string },
  sessionId?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${llm.openaiApiKey}`,
  };
  let go = llm.backend === "opencode-go";
  try {
    const url = new URL(llm.openaiBaseUrl);
    go ||= url.hostname === "opencode.ai" && url.pathname.startsWith("/zen/go/");
  } catch { /* URL validation belongs to the request resolver. */ }
  if (go) {
    let id = sessionId || llm.sessionId || sessions.get(llm);
    if (!id) { id = randomUUID(); sessions.set(llm, id); }
    headers["User-Agent"] = "jait/1.0";
    headers["x-opencode-session"] = id;
  }
  return headers;
}
