import { parseDocument, DomUtils } from "htmlparser2";
import type { OllamaQuotaUsageResponse } from "./provider-quota-fetchers.js";

export interface OpenCodeGoUsage {
  usage: Record<"rolling" | "weekly" | "monthly", {
    status: "ok" | "rate-limited";
    percent: number;
    resetsAt: string;
  }>;
}

export async function fetchOpenCodeGoUsage(apiKey: string): Promise<OpenCodeGoUsage> {
  const response = await fetch("https://opencode.ai/zen/go/v1/usage", {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(response.status === 401
    ? "OpenCode Go rejected this API key. Reconnect Go in Settings."
    : response.status === 403 ? "This key has no OpenCode Go subscription."
    : `OpenCode Go usage request failed (${response.status}).`);
  const body = await response.json() as OpenCodeGoUsage;
  if (!["rolling", "weekly", "monthly"].every(name => {
    const window = body?.usage?.[name as keyof OpenCodeGoUsage["usage"]];
    return window && ["ok", "rate-limited"].includes(window.status) &&
      typeof window.percent === "number" && Number.isFinite(window.percent) && window.percent >= 0 &&
      typeof window.resetsAt === "string" && Number.isFinite(Date.parse(window.resetsAt));
  })) throw new Error("OpenCode Go returned an unexpected usage response.");
  return body;
}

export function normalizeOllamaSession(value: string): string {
  const cookie = value.trim().replace(/^__Secure-session=/, "");
  // Reject separators and controls so the value cannot inject cookies or headers.
  // eslint-disable-next-line no-control-regex
  if (!cookie || cookie.length > 4096 || /[\s;,\x00-\x1f\x7f]/.test(cookie)) {
    throw new Error("Enter only the Ollama __Secure-session cookie value.");
  }
  return cookie;
}

/** Read only the dashboard's explicit usage attributes; never execute its HTML. */
export function parseOllamaSettingsUsage(html: string): OllamaQuotaUsageResponse {
  if (html.length > 2_000_000) throw new Error("Ollama settings response is too large.");
  const limits: OllamaQuotaUsageResponse["limits"] = {};
  const document = parseDocument(html);
  const tracks = DomUtils.findAll(element => "data-usage-track" in element.attribs, document.children);
  for (const track of tracks) {
    const label = track.attribs["aria-label"] ?? "";
    const name = /session/i.test(label) ? "session" : /weekly/i.test(label) ? "weekly" : null;
    const match = /(?:^|\s)(\d+(?:\.\d+)?)%/.exec(label);
    if (!name || !match) continue;
    const percent = Number(match[1]);
    if (!Number.isFinite(percent) || percent > 100 || limits[name]) throw new Error("Ollama returned invalid usage meters.");
    let meter = track.parent;
    while (meter && !("attribs" in meter && "data-usage-meter" in meter.attribs)) meter = meter.parent;
    let sibling = meter?.nextSibling;
    while (sibling && !("attribs" in sibling)) sibling = sibling.nextSibling;
    const value = sibling && "attribs" in sibling ? sibling.attribs["data-time"] : undefined;
    const resetsAt = value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
    limits[name] = { usage: percent / 100, models: [], resetsAt };
  }
  if (!limits.session || !limits.weekly) throw new Error("Ollama did not return session and weekly usage. The browser session may have expired; reconnect it in Usage.");
  return { limits, source: "settings" };
}

export async function fetchOllamaSettingsUsage(session: string): Promise<OllamaQuotaUsageResponse> {
  const response = await fetch("https://ollama.com/settings", {
    headers: { Cookie: `__Secure-session=${normalizeOllamaSession(session)}`, Accept: "text/html" },
    redirect: "manual", signal: AbortSignal.timeout(10_000),
  });
  if (response.status >= 300 && response.status < 400 || response.status === 401 || response.status === 403) {
    throw new Error("Ollama browser session expired or was rejected. Reconnect it in Usage.");
  }
  if (!response.ok) throw new Error(`Ollama settings request failed (${response.status}).`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Ollama returned an empty settings response.");
  const decoder = new TextDecoder();
  let html = "", bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error("Ollama settings response is too large.");
      html += decoder.decode(value, { stream: true });
    }
    return parseOllamaSettingsUsage(html + decoder.decode());
  } finally { await reader.cancel(); }
}
