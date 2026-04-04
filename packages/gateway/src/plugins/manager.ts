/**
 * Plugin Manager — discovery, loading, lifecycle, and persistence.
 *
 * Extension directories are scanned for `jait.plugin.json` manifests.
 * Enabled plugins are dynamically imported and their contributions
 * are registered with the tool / provider registries.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

import type { PluginManifest } from "./manifest.js";
import { validateManifest } from "./manifest.js";
import type {
  InstalledPlugin,
  LoadedPlugin,
  PluginContext,
  PluginModule,
  PluginStatus,
} from "./contracts.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { discoverOpenClawPlugins, openclawToJaitManifest, createOpenClawPluginModule } from "./openclaw-adapter.js";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Default extensions root: ~/.jait/extensions/ */
export function defaultExtensionsDir(): string {
  return join(homedir(), ".jait", "extensions");
}

/* ------------------------------------------------------------------ */
/*  Plugin Manager                                                     */
/* ------------------------------------------------------------------ */

export interface PluginManagerDeps {
  sqlite: SqliteDatabase;
  toolRegistry: ToolRegistry;
  gatewayVersion: string;
  workspaceRoot: string;
  extensionsDir?: string;
  /** Additional directories to scan for OpenClaw-format plugins. */
  openclawExtensionsDirs?: string[];
}

export class PluginManager {
  private readonly sqlite: SqliteDatabase;
  private readonly toolRegistry: ToolRegistry;
  private readonly gatewayVersion: string;
  private readonly workspaceRoot: string;
  private readonly extensionsDir: string;
  private readonly openclawExtensionsDirs: string[];

  /** In-memory map of loaded plugins keyed by id. */
  private readonly loaded = new Map<string, LoadedPlugin>();
  /** OpenClaw plugin modules keyed by jait id (openclaw:<id>). */
  private readonly openclawModules = new Map<string, PluginModule>();

  constructor(deps: PluginManagerDeps) {
    this.sqlite = deps.sqlite;
    this.toolRegistry = deps.toolRegistry;
    this.gatewayVersion = deps.gatewayVersion;
    this.workspaceRoot = deps.workspaceRoot;
    this.extensionsDir = deps.extensionsDir ?? defaultExtensionsDir();
    this.openclawExtensionsDirs = deps.openclawExtensionsDirs ?? [];
  }

  /* ---------------------------------------------------------------- */
  /*  DB helpers                                                       */
  /* ---------------------------------------------------------------- */

  private getInstalled(id: string): InstalledPlugin | null {
    const row = this.sqlite
      .prepare("SELECT * FROM plugins WHERE id = ?")
      .get(id) as Record<string, unknown> | null;
    return row ? rowToInstalled(row) : null;
  }

  private upsertInstalled(p: InstalledPlugin): void {
    this.sqlite
      .prepare(
        `INSERT INTO plugins (id, display_name, version, description, author, path, status, config, error, installed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           display_name = excluded.display_name,
           version = excluded.version,
           description = excluded.description,
           author = excluded.author,
           path = excluded.path,
           status = excluded.status,
           config = excluded.config,
           error = excluded.error,
           updated_at = excluded.updated_at`,
      )
      .run(
        p.id,
        p.displayName,
        p.version,
        p.description ?? null,
        p.author ?? null,
        p.path,
        p.status,
        JSON.stringify(p.config),
        p.error ?? null,
        p.installedAt,
        p.updatedAt,
      );
  }

  private deleteInstalled(id: string): void {
    this.sqlite.prepare("DELETE FROM plugins WHERE id = ?").run(id);
  }

  /* ---------------------------------------------------------------- */
  /*  Discovery — scan extensions directory for manifests              */
  /* ---------------------------------------------------------------- */

  async discover(): Promise<PluginManifest[]> {
    const manifests: PluginManifest[] = [];
    let entries: string[];
    try {
      entries = await readdir(this.extensionsDir);
    } catch {
      // Directory doesn't exist yet — that's fine
      return manifests;
    }

    for (const entry of entries) {
      const dir = join(this.extensionsDir, entry);
      const dirStat = await stat(dir).catch(() => null);
      if (!dirStat?.isDirectory()) continue;

      const manifestPath = join(dir, "jait.plugin.json");
      try {
        const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
        const err = validateManifest(raw);
        if (err) {
          console.warn(`Plugin manifest invalid at ${manifestPath}: ${err}`);
          continue;
        }
        // Attach the resolved directory path for later import
        (raw as PluginManifest & { _path?: string })._path = dir;
        manifests.push(raw as PluginManifest);
      } catch {
        // No manifest or invalid JSON — skip
      }
    }
    return manifests;
  }

  /* ---------------------------------------------------------------- */
  /*  Sync — reconcile discovered manifests with DB state              */
  /* ---------------------------------------------------------------- */

  /**
   * Discover all plugins, sync them with DB, and load enabled ones.
   * Called once at gateway startup.
   */
  async syncAndLoad(): Promise<void> {
    const manifests = await this.discover();
    const now = new Date().toISOString();

    for (const manifest of manifests) {
      const dir = (manifest as PluginManifest & { _path?: string })._path!;
      let existing = this.getInstalled(manifest.id);

      if (!existing) {
        // New plugin discovered — install as disabled by default
        existing = {
          id: manifest.id,
          displayName: manifest.displayName,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          path: dir,
          status: "installed",
          config: {},
          installedAt: now,
          updatedAt: now,
        };
        this.upsertInstalled(existing);
      } else {
        // Update metadata if version/path changed
        if (existing.version !== manifest.version || existing.path !== dir) {
          existing.version = manifest.version;
          existing.displayName = manifest.displayName;
          existing.description = manifest.description;
          existing.author = manifest.author;
          existing.path = dir;
          existing.updatedAt = now;
          this.upsertInstalled(existing);
        }
      }

      // Load if enabled
      if (existing.status === "enabled") {
        await this.loadPlugin(manifest, existing);
      }
    }

    // ── OpenClaw compatibility: discover openclaw.plugin.json ──────
    // Scan both the Jait extensions dir and any explicit OpenClaw dirs
    const openclawScanDirs = [this.extensionsDir, ...this.openclawExtensionsDirs];
    let openclawCount = 0;

    for (const scanDir of openclawScanDirs) {
      const ocPlugins = await discoverOpenClawPlugins(scanDir);
      for (const { manifest: ocManifest, dir } of ocPlugins) {
        const jaitId = `openclaw:${ocManifest.id}`;
        // Skip if a native Jait plugin with the same base id already exists
        if (manifests.some((m) => m.id === ocManifest.id)) continue;

        const jaitManifest = openclawToJaitManifest(ocManifest, dir);
        let existing = this.getInstalled(jaitId);

        if (!existing) {
          existing = {
            id: jaitId,
            displayName: jaitManifest.displayName,
            version: jaitManifest.version ?? "0.0.0",
            description: jaitManifest.description,
            author: "OpenClaw",
            path: dir,
            status: "installed",
            config: {},
            installedAt: now,
            updatedAt: now,
          };
          this.upsertInstalled(existing);
        } else if (existing.path !== dir) {
          existing.path = dir;
          existing.updatedAt = now;
          this.upsertInstalled(existing);
        }

        // Store the module factory for later loading
        const pluginModule = createOpenClawPluginModule(ocManifest, dir);
        this.openclawModules.set(jaitId, pluginModule);

        if (existing.status === "enabled") {
          await this.loadPluginWithModule(jaitManifest, existing, pluginModule);
        }
        openclawCount++;
      }
    }

    console.log(
      `Plugins: ${manifests.length} native + ${openclawCount} OpenClaw discovered, ${this.loaded.size} loaded`,
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Load / unload a single plugin                                    */
  /* ---------------------------------------------------------------- */

  private buildContext(installed: InstalledPlugin): PluginContext {
    const self = this;
    return {
      gatewayVersion: this.gatewayVersion,
      workspaceRoot: this.workspaceRoot,
      getConfig<T = Record<string, unknown>>(): T {
        // Re-read from DB to get latest
        const current = self.getInstalled(installed.id);
        return (current?.config ?? {}) as T;
      },
      async setConfig(value: Record<string, unknown>): Promise<void> {
        const current = self.getInstalled(installed.id);
        if (current) {
          current.config = value;
          current.updatedAt = new Date().toISOString();
          self.upsertInstalled(current);
        }
      },
      log: {
        info: (msg, ...args) => console.log(`[plugin:${installed.id}]`, msg, ...args),
        warn: (msg, ...args) => console.warn(`[plugin:${installed.id}]`, msg, ...args),
        error: (msg, ...args) => console.error(`[plugin:${installed.id}]`, msg, ...args),
      },
    };
  }

  private async loadPlugin(manifest: PluginManifest, installed: InstalledPlugin): Promise<void> {
    try {
      const entryFile = manifest.main ?? "index.js";
      const entryPath = resolve(installed.path, entryFile);
      const mod = await import(entryPath);

      // Support both default export and named `plugin` export
      const pluginModule: PluginModule | undefined =
        mod.default ?? mod.plugin;

      if (!pluginModule || typeof pluginModule.setup !== "function") {
        throw new Error(`Plugin entry at ${entryPath} must export a PluginModule (use definePlugin())`);
      }

      const ctx = this.buildContext(installed);
      const contribution = (await pluginModule.setup(ctx)) ?? null;

      // Register contributed tools
      if (contribution?.tools?.length) {
        this.toolRegistry.registerPluginTools(
          { id: manifest.id, displayName: manifest.displayName },
          contribution.tools,
        );
      }

      this.loaded.set(manifest.id, {
        manifest,
        installed,
        module: pluginModule,
        contribution,
      });

      // Clear any previous error
      if (installed.error) {
        installed.error = undefined;
        installed.updatedAt = new Date().toISOString();
        this.upsertInstalled(installed);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to load plugin ${manifest.id}:`, message);
      installed.status = "error";
      installed.error = message;
      installed.updatedAt = new Date().toISOString();
      this.upsertInstalled(installed);
    }
  }

  /** Load a plugin using a pre-built module (used for OpenClaw adapter). */
  private async loadPluginWithModule(manifest: PluginManifest, installed: InstalledPlugin, pluginModule: PluginModule): Promise<void> {
    try {
      const ctx = this.buildContext(installed);
      const contribution = (await pluginModule.setup(ctx)) ?? null;

      if (contribution?.tools?.length) {
        this.toolRegistry.registerPluginTools(
          { id: installed.id, displayName: installed.displayName },
          contribution.tools,
        );
      }

      this.loaded.set(installed.id, {
        manifest,
        installed,
        module: pluginModule,
        contribution,
      });

      if (installed.error) {
        installed.error = undefined;
        installed.updatedAt = new Date().toISOString();
        this.upsertInstalled(installed);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to load OpenClaw plugin ${installed.id}:`, message);
      installed.status = "error";
      installed.error = message;
      installed.updatedAt = new Date().toISOString();
      this.upsertInstalled(installed);
    }
  }

  private async unloadPlugin(id: string): Promise<void> {
    const loaded = this.loaded.get(id);
    if (!loaded) return;
    try {
      await loaded.module?.dispose();
    } catch (err) {
      console.error(`Error disposing plugin ${id}:`, err);
    }
    this.loaded.delete(id);
  }

  /* ---------------------------------------------------------------- */
  /*  Public API — used by REST routes                                 */
  /* ---------------------------------------------------------------- */

  /** List all installed plugins (from DB). */
  listInstalled(): InstalledPlugin[] {
    const rows = this.sqlite
      .prepare("SELECT * FROM plugins ORDER BY display_name")
      .all() as Record<string, unknown>[];
    return rows.map(rowToInstalled);
  }

  /** Get a single installed plugin. */
  getPlugin(id: string): InstalledPlugin | null {
    return this.getInstalled(id);
  }

  /** Enable a plugin and load it. */
  async enable(id: string): Promise<InstalledPlugin> {
    const installed = this.getInstalled(id);
    if (!installed) throw new Error(`Plugin '${id}' not found`);

    installed.status = "enabled";
    installed.error = undefined;
    installed.updatedAt = new Date().toISOString();
    this.upsertInstalled(installed);

    // Re-discover manifest so we can load it
    const manifests = await this.discover();
    const manifest = manifests.find((m) => m.id === id);
    if (manifest) {
      await this.loadPlugin(manifest, installed);
    } else {
      // Check for OpenClaw adapter module
      const ocModule = this.openclawModules.get(id);
      if (ocModule) {
        const jaitManifest = openclawToJaitManifest(
          { id: id.replace(/^openclaw:/, ""), name: installed.displayName, version: installed.version, description: installed.description },
          installed.path,
        );
        await this.loadPluginWithModule(jaitManifest, installed, ocModule);
      }
    }

    return this.getInstalled(id) ?? installed;
  }

  /** Disable a plugin and unload it. */
  async disable(id: string): Promise<InstalledPlugin> {
    const installed = this.getInstalled(id);
    if (!installed) throw new Error(`Plugin '${id}' not found`);

    await this.unloadPlugin(id);

    installed.status = "disabled";
    installed.error = undefined;
    installed.updatedAt = new Date().toISOString();
    this.upsertInstalled(installed);

    return installed;
  }

  /** Uninstall a plugin (unload + remove from DB). Does NOT delete files. */
  async uninstall(id: string): Promise<void> {
    await this.unloadPlugin(id);
    this.deleteInstalled(id);
  }

  /** Get / set plugin config. */
  getPluginConfig(id: string): Record<string, unknown> {
    return this.getInstalled(id)?.config ?? {};
  }

  async setPluginConfig(id: string, config: Record<string, unknown>): Promise<void> {
    const installed = this.getInstalled(id);
    if (!installed) throw new Error(`Plugin '${id}' not found`);
    installed.config = config;
    installed.updatedAt = new Date().toISOString();
    this.upsertInstalled(installed);
  }

  /** Gracefully dispose of all loaded plugins. */
  async disposeAll(): Promise<void> {
    for (const [id] of this.loaded) {
      await this.unloadPlugin(id);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Row conversion                                                     */
/* ------------------------------------------------------------------ */

function rowToInstalled(row: Record<string, unknown>): InstalledPlugin {
  return {
    id: row.id as string,
    displayName: row.display_name as string,
    version: row.version as string,
    description: (row.description as string) ?? undefined,
    author: (row.author as string) ?? undefined,
    path: row.path as string,
    status: row.status as PluginStatus,
    config: JSON.parse((row.config as string) || "{}"),
    error: (row.error as string) ?? undefined,
    installedAt: row.installed_at as string,
    updatedAt: row.updated_at as string,
  };
}
