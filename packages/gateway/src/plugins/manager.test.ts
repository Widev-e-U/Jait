import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { openRawSqlite } from "../db/sqlite-shim.js";
import { ToolRegistry } from "../tools/registry.js";
import { ChannelManager, type ReplyGenerator } from "../channels/manager.js";
import type { LLMConfig } from "../tools/agent-loop.js";
import { PluginManager } from "./manager.js";

const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;

function createPluginsTable(sqlite: Awaited<ReturnType<typeof openRawSqlite>>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT,
      author TEXT,
      path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'installed',
      config TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

async function buildManager(options: { extensionsDir?: string; openclawExtensionsDirs?: string[] } = {}) {
  const sqlite = await openRawSqlite(":memory:");
  createPluginsTable(sqlite);
  const toolRegistry = new ToolRegistry();
  const channelManager = new ChannelManager({
    sqlite,
    resolveLLM: () => fakeLLM,
    replyGenerator: noopGen,
  });
  const pluginManager = new PluginManager({
    sqlite,
    toolRegistry,
    channelManager,
    gatewayVersion: "0.0.0-test",
    projectRoot: process.cwd(),
    extensionsDir: options.extensionsDir,
    openclawExtensionsDirs: options.openclawExtensionsDirs,
  });
  return { pluginManager, channelManager };
}

describe("PluginManager channel contributions", () => {
  it("registers native plugin channels only while the plugin is enabled", async () => {
    const extensionsDir = await mkdtemp(join(tmpdir(), "jait-ext-"));
    const pluginDir = join(extensionsDir, "sms");
    await mkdir(pluginDir);
    await writeFile(join(pluginDir, "jait.plugin.json"), JSON.stringify({
      id: "sms-plugin",
      displayName: "SMS Plugin",
      version: "1.0.0",
      main: "index.js",
      contributes: { channels: [{ id: "sms", displayName: "SMS" }] },
    }));
    await writeFile(join(pluginDir, "index.js"), `
      const connector = {
        id: "sms",
        label: "SMS",
        async start(events) { events.onStatus("connected"); },
        async stop() {},
        async send() {},
        status() { return "stopped"; },
        currentQr() { return null; },
      };
      export default {
        id: "sms-plugin",
        displayName: "SMS Plugin",
        async setup() { return { channels: [connector] }; },
        async dispose() {},
      };
    `);

    const { pluginManager, channelManager } = await buildManager({ extensionsDir });
    await pluginManager.syncAndLoad();
    expect(channelManager.list()).toHaveLength(0);

    await pluginManager.enable("sms-plugin");
    expect(channelManager.list()).toMatchObject([{ id: "sms", label: "SMS" }]);

    await pluginManager.disable("sms-plugin");
    expect(channelManager.list()).toHaveLength(0);
  });

  it("bridges OpenClaw messaging plugins as activatable channels", async () => {
    const extensionsDir = await mkdtemp(join(tmpdir(), "jait-empty-ext-"));
    const openclawDir = await mkdtemp(join(tmpdir(), "openclaw-ext-"));
    for (const [id, name] of [["whatsapp", "WhatsApp"], ["telegram", "Telegram"], ["msteams", "Microsoft Teams"]] as const) {
      const pluginDir = join(openclawDir, id);
      await mkdir(pluginDir);
      await writeFile(join(pluginDir, "openclaw.plugin.json"), JSON.stringify({
        id,
        name,
        version: "1.0.0",
        channels: [id],
      }));
      await writeFile(join(pluginDir, "index.js"), `
        export default {
          loadChannelPlugin() {},
          setChannelRuntime() {},
        };
      `);
    }

    const { pluginManager, channelManager } = await buildManager({
      extensionsDir,
      openclawExtensionsDirs: [openclawDir],
    });
    await pluginManager.syncAndLoad();
    expect(channelManager.list()).toHaveLength(0);

    await pluginManager.enable("openclaw:whatsapp");
    expect(channelManager.list()).toMatchObject([{ id: "whatsapp", label: "WhatsApp" }]);

    await pluginManager.disable("openclaw:whatsapp");
    expect(channelManager.list()).toHaveLength(0);

    await pluginManager.enable("openclaw:telegram");
    expect(channelManager.list()).toMatchObject([{ id: "telegram", label: "Telegram" }]);

    await pluginManager.disable("openclaw:telegram");
    expect(channelManager.list()).toHaveLength(0);

    await pluginManager.enable("openclaw:msteams");
    expect(channelManager.list()).toMatchObject([{ id: "msteams", label: "Microsoft Teams" }]);

    await pluginManager.disable("openclaw:msteams");
    expect(channelManager.list()).toHaveLength(0);
  });
});
