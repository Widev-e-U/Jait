/**
 * Product page contract. Every routable Jait page is declared here.
 * Navigation and agent discovery consume this same registry: adding a page
 * requires an explanation, user outcomes, and tool references (or an explicit
 * UI-only outcome). Tools themselves are resolved live by the gateway.
 */
export type JaitPageFeature = { id: string; description: string } & (
  | { toolRefs: readonly [string, ...string[]]; uiOnlyReason?: never }
  | { toolRefs: readonly []; uiOnlyReason: string }
);
export interface JaitPageContract {
  title: string;
  path: string;
  mode: "developer" | "manager" | "both";
  description: string;
  examples: readonly string[];
  features: readonly JaitPageFeature[];
  /** New tools in these namespaces automatically join the page. */
  toolPrefixes: readonly string[];
}
export const JAIT_PAGES = {
  chat: {
    title: "Chat", path: "/", mode: "developer",
    description: "Ask Jait to work in a personal or project conversation, use tools, and inspect the results.",
    examples: ["Start a chat", "Find a prior conversation", "Run a command in this project"],
    features: [{ id: "navigation", description: "Render an explicit link to where a Jait change happened.", toolRefs: ["jait.link"] },
      { id: "history", description: "Search persisted conversations and inspect exact chat traces.", toolRefs: ["session.search", "chat.traces"] },
      { id: "workspace", description: "Read, edit, search, execute, and preview work in the active project.", toolRefs: ["read", "edit", "search", "jait.terminal", "preview.open"] }],
    toolPrefixes: ["chat.", "session.", "file.", "terminal.", "preview.", "browser.", "web.", "project.", "surface.", "screen.", "voice.", "architecture."],
  },
  agents: {
    title: "Agents", path: "/agents", mode: "manager",
    description: "Manage persistent Jait people and teams: profiles, personas, roles, reporting lines, providers, models, repositories, skills, and tool preferences. These are saved agents from the Agents page, distinct from temporary execution workers.",
    examples: ["Set up a Scrum team", "Create an agent", "Give the developer a manager", "Pause an agent", "Assign skills to my team"],
    features: [{ id: "profiles", description: "List, inspect, create, update, pause, and delete persistent agent profiles and configure reporting relationships.", toolRefs: ["agent.profiles.inspect", "agent.profiles"] },
      { id: "team_chat", description: "Persistent hierarchy team rooms with independent agent work chats, addressed handoffs, user participation, and neutral source-chat relays.", toolRefs: ["team.chat"] },
      { id: "work", description: "Run work using a saved personaAgentId; use cron tools for executable schedules. Profile schedules and tasks describe preferences; saving a profile alone does not launch work.", toolRefs: ["thread.control", "cron.add", "cron.update"] }],
    toolPrefixes: ["agent.profiles", "team."],
  },
  threads: {
    title: "Threads", path: "/threads", mode: "manager",
    description: "Create, start, resume, interrupt, and review execution threads, including work assigned to saved agents.",
    examples: ["Start work for this agent", "Review a thread", "Create a pull request from a thread"],
    features: [{ id: "execution", description: "Control execution and review activities using thread IDs or saved personaAgentId values.", toolRefs: ["thread.control"] }],
    toolPrefixes: ["thread.", "agent.", "swarm."],
  },
  pulls: {
    title: "Pull Requests", path: "/pulls", mode: "developer",
    description: "Inspect repository pull requests and prepare changes for review.",
    examples: ["Show my pull requests", "Create a PR from this thread"],
    features: [{ id: "review", description: "Prepare a pull request from completed thread work.", toolRefs: ["thread.control"] }],
    toolPrefixes: ["github.", "git."],
  },
  todo: {
    title: "Todo", path: "/todo", mode: "developer",
    description: "Manage saved follow-up tasks across chats and track multi-step work.",
    examples: ["Save a task for later", "Show my todos"],
    features: [{ id: "tasks", description: "List, add, update, and remove durable todos.", toolRefs: ["jait.todos"] }],
    toolPrefixes: ["jait.todos", "todo"],
  },
  email: {
    title: "Email", path: "/emails", mode: "developer",
    description: "Read and organize mail using connected accounts and available channel tools.",
    examples: ["Read my email", "Show mail accounts"],
    features: [{ id: "mail", description: "Use connected mail services; availability depends on account and tool configuration.", toolRefs: [], uiOnlyReason: "Account-specific adapters are resolved from registered tools; no generic mail mutation is implied." }],
    toolPrefixes: ["email.", "mail.", "gmail.", "outlook.", "himalaya."],
  },
  calendar: {
    title: "Calendar", path: "/calendar", mode: "developer",
    description: "View and manage calendar events using connected calendar accounts.",
    examples: ["Show my calendar", "Find an upcoming event"],
    features: [{ id: "events", description: "Use available connected calendar adapters.", toolRefs: [], uiOnlyReason: "Calendar tool availability depends on connected accounts." }],
    toolPrefixes: ["calendar."],
  },
  memory: {
    title: "Memory", path: "/memory", mode: "developer",
    description: "Inspect and maintain durable memories, preferences, and reminders. Saved memory is separate from persisted chat history.",
    examples: ["What do you remember", "Save this preference", "Find my reminders"],
    features: [{ id: "memories", description: "Search, save, list, and remove durable context.", toolRefs: ["memory.search", "memory.save", "memory.list"] }],
    toolPrefixes: ["memory.", "reminder."],
  },
  jobs: {
    title: "Jobs", path: "/jobs", mode: "developer",
    description: "Manage scheduled and recurring work and inspect job execution.",
    examples: ["Schedule a task", "Pause a recurring job", "Show scheduled work"],
    features: [{ id: "schedules", description: "Create, update, list, and remove executable scheduled jobs.", toolRefs: ["cron.add", "cron.update", "cron.list", "cron.remove"] }],
    toolPrefixes: ["cron.", "job.", "scheduler.", "taskflow."],
  },
  network: {
    title: "Network", path: "/network", mode: "developer",
    description: "Discover connected nodes and authorized network assets, manage assessment scopes, inspect evidence and findings, and verify improvements.",
    examples: ["Show my network", "Assess an authorized host", "Inspect connected nodes"],
    features: [{ id: "discovery", description: "Discover assets and inspect network state.", toolRefs: ["network.scan"] },
      { id: "assessment", description: "Use registered security tools with their scope and consent requirements.", toolRefs: ["security.scope.get", "security.results.show"] }],
    toolPrefixes: ["network.", "security.", "node.", "ssh."],
  },
  settings: {
    title: "Settings", path: "/settings", mode: "both",
    description: "Configure Jait, providers, models, tool policies, skills, plugins, channels, and gateway services.",
    examples: ["Configure Jait", "Show tools", "Connect a provider", "Manage skills"],
    features: [{ id: "discovery", description: "Inspect available tools and the live product capability catalog.", toolRefs: ["jait.catalog", "tools.search", "tools.list"] }],
    toolPrefixes: ["gateway.", "provider.", "model.", "tools.", "skill.", "skills.", "plugin.", "channels.", "os.", "decision.", "jait.catalog"],
  },
} as const satisfies Record<string, JaitPageContract>;

export type JaitPageId = keyof typeof JAIT_PAGES;
export const JAIT_PAGE_IDS = Object.keys(JAIT_PAGES) as JaitPageId[];
export interface JaitPageLink { pageId: JaitPageId; title: string; href: string }

export function jaitPageLink(pageId: JaitPageId): JaitPageLink {
  const page = JAIT_PAGES[pageId];
  return { pageId, title: page.title, href: page.path };
}

/** Exact matches precede prefixes so persistent agent profiles never map to workers. */
export function getToolPageId(name: string, category?: string): JaitPageId | undefined {
  const prefixes = JAIT_PAGE_IDS.flatMap((id) => JAIT_PAGES[id].toolPrefixes.map((prefix) => ({ id, prefix })));
  const match = prefixes.sort((a, b) => b.prefix.length - a.prefix.length).find(({ prefix }) => name.startsWith(prefix));
  if (match) return match.id;
  for (const id of JAIT_PAGE_IDS) {
    if (JAIT_PAGES[id].features.some((feature) => (feature.toolRefs as readonly string[]).includes(name))) return id;
  }
  const categories: Record<string, JaitPageId> = {
    terminal: "chat", filesystem: "chat", surfaces: "chat", screen: "chat", browser: "chat", web: "chat",
    voice: "chat", agent: "threads", scheduler: "jobs", memory: "memory", network: "network",
    channels: "settings", gateway: "settings", os: "settings", meta: "settings", external: "settings",
  };
  return category ? categories[category] : undefined;
}

/** Shared membership rule used by agent discovery and the visual catalogue. */
export function isJaitPageTool(tool: { name: string; page?: JaitPageId }, pageId: JaitPageId): boolean {
  return tool.page === pageId || getToolPageId(tool.name) === pageId
    || JAIT_PAGES[pageId].features.some((feature) => (feature.toolRefs as readonly string[]).includes(tool.name));
}
