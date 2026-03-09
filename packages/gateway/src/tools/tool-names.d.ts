/**
 * Canonical tool name constants.
 *
 * Using a const object instead of an enum for zero-cost at runtime
 * (enums generate a reverse-mapping object; const objects are erased).
 *
 * Borrowed from VS Code Copilot Chat's ToolName enum — prevents string
 * typo bugs and enables IDE autocomplete for tool references.
 */
export declare const ToolName: {
    readonly TerminalRun: "terminal.run";
    readonly TerminalStream: "terminal.stream";
    readonly FileRead: "file.read";
    readonly FileWrite: "file.write";
    readonly FilePatch: "file.patch";
    readonly FileList: "file.list";
    readonly FileStat: "file.stat";
    readonly OsQuery: "os.query";
    readonly OsInstall: "os.install";
    readonly OsTool: "os.tool";
    readonly OsToolAlt: "os_tool";
    readonly SurfacesList: "surfaces.list";
    readonly SurfacesStart: "surfaces.start";
    readonly SurfacesStop: "surfaces.stop";
    readonly CronAdd: "cron.add";
    readonly CronList: "cron.list";
    readonly CronRemove: "cron.remove";
    readonly CronUpdate: "cron.update";
    readonly GatewayStatus: "gateway.status";
    readonly ScreenShare: "screen.share";
    readonly ScreenCapture: "screen.capture";
    readonly ScreenRecord: "screen.record";
    readonly BrowserNavigate: "browser.navigate";
    readonly BrowserSnapshot: "browser.snapshot";
    readonly BrowserClick: "browser.click";
    readonly BrowserType: "browser.type";
    readonly BrowserSelect: "browser.select";
    readonly BrowserScroll: "browser.scroll";
    readonly BrowserWait: "browser.wait";
    readonly BrowserScreenshot: "browser.screenshot";
    readonly BrowserSandboxStart: "browser.sandbox.start";
    readonly WebFetch: "web.fetch";
    readonly WebSearch: "web.search";
    readonly MemorySave: "memory.save";
    readonly MemorySearch: "memory.search";
    readonly MemoryForget: "memory.forget";
    readonly VoiceSpeak: "voice.speak";
    readonly AgentSpawn: "agent.spawn";
    readonly ThreadControl: "thread.control";
    readonly ToolsList: "tools.list";
    readonly ToolsSearch: "tools.search";
    readonly NetworkScan: "network.scan";
    readonly CoreRead: "read";
    readonly CoreEdit: "edit";
    readonly CoreExecute: "execute";
    readonly CoreSearch: "search";
    readonly CoreWeb: "web";
    readonly CoreAgent: "agent";
    readonly CoreTodo: "todo";
    readonly CoreJait: "jait";
};
/** Union of all known tool name values. */
export type ToolNameValue = (typeof ToolName)[keyof typeof ToolName];
//# sourceMappingURL=tool-names.d.ts.map