/**
 * Canonical tool name constants.
 *
 * Using a const object instead of an enum for zero-cost at runtime
 * (enums generate a reverse-mapping object; const objects are erased).
 *
 * Borrowed from VS Code Copilot Chat's ToolName enum — prevents string
 * typo bugs and enables IDE autocomplete for tool references.
 */
export const ToolName = {
  // ── Terminal ──
  TerminalRun: "terminal.run",
  TerminalStream: "terminal.stream",
  JaitTerminal: "jait.terminal",

  // ── File system ──
  FileRead: "file.read",
  FileWrite: "file.write",
  FilePatch: "file.patch",
  FileList: "file.list",
  FileStat: "file.stat",
  ImageView: "image.view",

  // ── OS ──
  OsQuery: "os.query",
  OsInstall: "os.install",
  OsTool: "os.tool",
  OsToolAlt: "os_tool",

  // ── User-visible computer control ──
  ComputerTargets: "computer.targets",
  ComputerSession: "computer.session",
  ComputerObserve: "computer.observe",
  ComputerAct: "computer.act",

  // ── Surfaces ──
  SurfacesList: "surfaces.list",
  SurfacesStart: "surfaces.start",
  SurfacesStop: "surfaces.stop",

  // ── Scheduler / cron ──
  CronAdd: "cron.add",
  CronList: "cron.list",
  CronRemove: "cron.remove",
  CronUpdate: "cron.update",

  // ── Gateway ──
  GatewayStatus: "gateway.status",
  ProjectCreate: "project.create",
  ProjectAssignRepository: "project.assign_repository",
  ProjectTransfer: "project.transfer",
  ProjectEditorOpen: "project.editor.open",
  JaitTodos: "jait.todos",
  UserAsk: "user.ask",

  // ── Messaging channels ──
  ChannelSend: "channel.send",
  ChannelRemind: "channel.remind",

  // ── Skills & extensions management ──
  SkillsManage: "skills.manage",
  ExtensionsManage: "extensions.manage",

  // ── Screen share ──
  ScreenShare: "screen.share",
  ScreenCapture: "screen.capture",
  ScreenRecord: "screen.record",

  // ── Browser & web ──
  BrowserNavigate: "browser.navigate",
  BrowserSnapshot: "browser.snapshot",
  BrowserInspect: "browser.inspect",
  BrowserClick: "browser.click",
  BrowserType: "browser.type",
  BrowserSelect: "browser.select",
  BrowserScroll: "browser.scroll",
  BrowserWait: "browser.wait",
  BrowserScreenshot: "browser.screenshot",
  BrowserSandboxStart: "browser.sandbox.start",
  WindowsSandboxStart: "windows.sandbox.start",
  WindowsSandboxStop: "windows.sandbox.stop",
  LinuxDesktopSandboxStart: "linux.desktop.sandbox.start",
  LinuxDesktopSandboxStop: "linux.desktop.sandbox.stop",
  WebFetch: "web.fetch",
  WebSearch: "web.search",

  BrowserOpen: "browser.open",
  BrowserClose: "browser.close",
  BrowserRestart: "browser.restart",
  BrowserStatus: "browser.status",
  BrowserLogs: "browser.logs",

  // ── Legacy preview names (execution compatibility only) ──
  PreviewStart: "preview.start",
  PreviewOpen: "preview.open",
  PreviewStop: "preview.stop",
  PreviewRestart: "preview.restart",
  PreviewStatus: "preview.status",
  PreviewLogs: "preview.logs",
  PreviewInspect: "preview.inspect",

  // ── Memory ──
  MemorySave: "memory.save",
  MemorySearch: "memory.search",
  MemoryList: "memory.list",
  MemoryUpdate: "memory.update",
  MemoryForget: "memory.forget",
  SessionSearch: "session.search",
  ChatTraces: "chat.traces",
  SessionSql: "session.sql",

  // ── Voice ──
  VoiceSpeak: "voice.speak",

  // ── Agent ──
  AgentSpawn: "agent.spawn",
  AgentMessage: "agent.message",
  ThreadControl: "thread.control",

  // ── Meta (tool discovery) ──
  ToolsList: "tools.list",
  ToolsSearch: "tools.search",

  // ── Network ──
  NetworkScan: "network.scan",
  ElevatedRun: "elevated.run",

  // ── Core tools (simplified set) ──
  CoreRead: "read",
  CoreEdit: "edit",
  CoreExecute: "execute",
  CoreSearch: "search",
  CoreWeb: "web",
  CoreAgent: "agent",
  CoreTodo: "todo",
  CoreJait: "jait",
} as const;

/** Union of all known tool name values. */
export type ToolNameValue = (typeof ToolName)[keyof typeof ToolName];

/** Renaming the public family must preserve existing disable rules and policies. */
export const BROWSER_TOOL_REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
  "preview.open": "browser.open", "preview.stop": "browser.close", "preview.restart": "browser.restart",
  "preview.status": "browser.status", "preview.logs": "browser.logs", "preview.inspect": "browser.inspect",
});
export function toolPolicyNames(name: string): string[] {
  const canonical = BROWSER_TOOL_REPLACEMENTS[name] ?? name;
  const legacy = Object.keys(BROWSER_TOOL_REPLACEMENTS).find(key => BROWSER_TOOL_REPLACEMENTS[key] === canonical);
  return legacy ? [canonical, legacy] : [canonical];
}
export function isToolDisabled(name: string, disabled?: Set<string>): boolean {
  return !!disabled && toolPolicyNames(name).some(candidate => disabled.has(candidate));
}
