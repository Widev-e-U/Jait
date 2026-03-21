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

  // ── Screen share ──
  ScreenShare: "screen.share",
  ScreenCapture: "screen.capture",
  ScreenRecord: "screen.record",

  // ── Browser & web ──
  BrowserNavigate: "browser.navigate",
  BrowserSnapshot: "browser.snapshot",
  BrowserClick: "browser.click",
  BrowserType: "browser.type",
  BrowserSelect: "browser.select",
  BrowserScroll: "browser.scroll",
  BrowserWait: "browser.wait",
  BrowserScreenshot: "browser.screenshot",
  BrowserSandboxStart: "browser.sandbox.start",
  WebFetch: "web.fetch",
  WebSearch: "web.search",

  // ── Preview ──
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
  MemoryForget: "memory.forget",

  // ── Voice ──
  VoiceSpeak: "voice.speak",

  // ── Agent ──
  AgentSpawn: "agent.spawn",
  ThreadControl: "thread.control",

  // ── Meta (tool discovery) ──
  ToolsList: "tools.list",
  ToolsSearch: "tools.search",

  // ── Network ──
  NetworkScan: "network.scan",

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
