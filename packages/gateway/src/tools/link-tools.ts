import { JAIT_PAGES, JAIT_PAGE_IDS, parseJaitRenderedLink } from "@jait/shared";
import type { ToolDefinition } from "./contracts.js";

export const jaitLinkTool: ToolDefinition<{ href: string; label: string }> = {
  name: "jait.link",
  displayName: "Show Jait link",
  description: "Render a clickable link in chat to where a Jait change happened, or a relevant Jait page the user requested. Call explicitly after successful changes when useful; ordinary tool calls do not render links. This only displays a link and does not navigate automatically or modify anything. Use a short descriptive label, e.g. View the updated team. Supported pages: "
    + JAIT_PAGE_IDS.map((id) => `${JAIT_PAGES[id].title}: ${JAIT_PAGES[id].path}`).join(", ")
    + ". Specific chats support /chat?sessionId=<id>; threads support /threads?threadId=<id>. Other pages open the page overview; do not invent unsupported detail routes.",
  tier: "core", category: "meta", page: "chat", source: "builtin", risk: "low", defaultConsentLevel: "none",
  discovery: { aliases: ["render link", "show link", "change destination", "Jait navigation"] },
  parameters: { type: "object", required: ["href", "label"], properties: {
    href: { type: "string", description: "Internal Jait path from jait.catalog, e.g. /agents, /jobs, /settings or /network. Use only supported query parameters." },
    label: { type: "string", description: "Short user-facing link text describing what changed, e.g. View the updated team." },
  } },
  async execute(input) {
    const data = parseJaitRenderedLink(input);
    if (!data) return { ok: false, message: "Provide a supported internal Jait path and a non-empty label of at most 160 characters. External URLs and fragments are not supported." };
    return { ok: true, message: data.label, data };
  },
};
