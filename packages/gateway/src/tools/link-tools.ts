import { JAIT_PAGES, JAIT_PAGE_IDS, parseJaitRenderedLink, type JaitPageContract } from "@jait/shared";
import type { ToolDefinition } from "./contracts.js";

export const jaitLinkTool: ToolDefinition<{ href: string; label: string; search?: string }> = {
  name: "jait.link",
  displayName: "Show Jait link",
  description: "Render a clickable link in chat to where a Jait change happened, or a relevant Jait page the user requested. Optional navigation card for a relevant user-viewable result inside Jait. Ordinary Markdown links are clickable and preferred in replies; do not call this after unrelated code edits or internal task tracking. This only displays a link and does not navigate automatically or modify anything. Use a short descriptive label, e.g. View the updated team. Supported pages: "
    + JAIT_PAGE_IDS.map((id) => `${JAIT_PAGES[id].title}: ${JAIT_PAGES[id].path}`).join(", ")
    + ". Specific chats support /chat?sessionId=<id>; threads support /threads?threadId=<id>. Searchable pages support q, e.g. /emails?q=from%3Aalice or /settings?q=providers. Use search to set q with automatic URL encoding, or put parameters directly in href. jait.catalog exposes each page's supported queryParameters, including settings tab and nested search fields. Do not invent unsupported detail routes.",
  tier: "core", category: "meta", page: "chat", source: "builtin", risk: "low", defaultConsentLevel: "none",
  discovery: { aliases: ["render link", "show link", "change destination", "Jait navigation"] },
  parameters: { type: "object", required: ["href", "label"], properties: {
    href: { type: "string", description: "Internal Jait path from jait.catalog, e.g. /agents, /jobs, /settings or /network. Use only supported query parameters." },
    search: { type: "string", description: "Optional search bar text for a page supporting q (chat, email, settings, todo, messenger). Encoded automatically into href; an empty string clears the search. For other search bars use the page queryParameters from jait.catalog in href." },
    label: { type: "string", description: "Short user-facing link text describing what changed, e.g. View the updated team." },
  } },
  async execute(input) {
    const data = parseJaitRenderedLink(input);
    if (!data) return { ok: false, message: "Provide a supported internal Jait path and a non-empty label of at most 160 characters. External URLs and fragments are not supported." };
    if (input.search !== undefined) {
      if (typeof input.search !== "string") return { ok: false, message: "Search must be a string." };
      const url = new URL(data.href, "https://jait.invalid");
      const page: JaitPageContract | undefined = JAIT_PAGE_IDS.map(id => JAIT_PAGES[id]).find(page => page.path === url.pathname
        || (url.pathname === "/chat" && page.path === "/") || (url.pathname === "/email" && page.path === "/emails"));
      if (!page?.queryParameters?.q) return { ok: false, message: "This page has no primary search bar. Use jait.catalog for its supported queryParameters." };
      url.searchParams.set("q", input.search);
      const searched = parseJaitRenderedLink({ ...data, href: url.pathname + url.search });
      if (!searched) return { ok: false, message: "The search link exceeds the supported URL length." };
      return { ok: true, message: searched.label, data: searched };
    }
    return { ok: true, message: data.label, data };
  },
};
