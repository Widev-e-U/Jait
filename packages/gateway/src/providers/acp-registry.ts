import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AcpProviderConfig, AcpProviderRegistryMetadata } from "./acp-provider.js";

export const ACP_REGISTRY_URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

const ACP_REGISTRY_CACHE_TTL_MS = 60 * 60_000;
const ACP_REGISTRY_FETCH_TIMEOUT_MS = 5_000;
const ACP_REGISTRY_MAX_BYTES = 2 * 1024 * 1024;
const PROVIDER_ID_ALIASES: Record<string, string> = {
  "claude-acp": "claude-code",
  "codex-acp": "codex",
  "pi-acp": "pi",
};

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

interface PackageDistribution {
  package: string;
  args: string[];
  env: Record<string, string>;
}

interface BinaryDistribution {
  archive: string;
  cmd: string;
  args: string[];
  env: Record<string, string>;
  sha256?: string;
}

export interface LoadAcpRegistryOptions {
  fallbackDefinitions?: AcpProviderConfig[];
  fetchImpl?: FetchLike;
  registryUrl?: string;
  cacheFile?: string | null;
  force?: boolean;
  preferFallbackDefinitions?: boolean;
}

let memoryCache: { registryUrl: string; loadedAt: number; providers: AcpProviderConfig[] } | null = null;
let inflightLoad: Promise<AcpProviderConfig[]> | null = null;

export async function loadAcpRegistryProviderConfigs(
  options: LoadAcpRegistryOptions = {},
): Promise<AcpProviderConfig[]> {
  const registryUrl = options.registryUrl ?? process.env.JAIT_ACP_REGISTRY_URL?.trim() ?? ACP_REGISTRY_URL;
  const fallbackDefinitions = options.fallbackDefinitions ?? [];
  if (process.env.JAIT_ACP_REGISTRY_DISABLED === "1") return fallbackDefinitions;

  if (!options.force && memoryCache?.registryUrl === registryUrl
    && Date.now() - memoryCache.loadedAt < ACP_REGISTRY_CACHE_TTL_MS) {
    return mergeFallbackDefinitions(
      memoryCache.providers,
      fallbackDefinitions,
      options.preferFallbackDefinitions,
    );
  }
  if (!options.force && inflightLoad) {
    return mergeFallbackDefinitions(
      await inflightLoad,
      fallbackDefinitions,
      options.preferFallbackDefinitions,
    );
  }

  const cacheFile = options.cacheFile === undefined
    ? join(homedir(), ".jait", "cache", "acp-registry.json")
    : options.cacheFile;
  const fetchImpl = options.fetchImpl ?? fetch;

  inflightLoad = (async () => {
    try {
      const response = await fetchImpl(registryUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Jait ACP registry client",
        },
        signal: AbortSignal.timeout(ACP_REGISTRY_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`ACP registry returned HTTP ${response.status}`);
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > ACP_REGISTRY_MAX_BYTES) {
        throw new Error("ACP registry response exceeded the size limit");
      }
      const providers = parseAcpRegistry(JSON.parse(raw));
      if (providers.length === 0) throw new Error("ACP registry contained no runnable agents");
      if (cacheFile) {
        await mkdir(dirname(cacheFile), { recursive: true, mode: 0o700 });
        await writeFile(cacheFile, raw, { encoding: "utf8", mode: 0o600 });
      }
      memoryCache = { registryUrl, loadedAt: Date.now(), providers };
      return providers;
    } catch (error) {
      if (cacheFile) {
        try {
          const providers = parseAcpRegistry(JSON.parse(await readFile(cacheFile, "utf8")));
          if (providers.length > 0) {
            memoryCache = { registryUrl, loadedAt: Date.now(), providers };
            return providers;
          }
        } catch {}
      }
      console.warn("ACP registry unavailable; using bundled provider definitions.", error);
      return [];
    }
  })().finally(() => {
    inflightLoad = null;
  });

  return mergeFallbackDefinitions(
    await inflightLoad,
    fallbackDefinitions,
    options.preferFallbackDefinitions,
  );
}

export function parseAcpRegistry(value: unknown): AcpProviderConfig[] {
  if (!isRecord(value) || !Array.isArray(value.agents)) return [];
  const seen = new Set<string>();
  const providers: AcpProviderConfig[] = [];

  for (const entry of value.agents) {
    const config = parseRegistryAgent(entry);
    if (!config || seen.has(config.id)) continue;
    seen.add(config.id);
    providers.push(config);
  }

  return providers.sort((left, right) => left.name.localeCompare(right.name));
}

function parseRegistryAgent(value: unknown): AcpProviderConfig | null {
  if (!isRecord(value) || !isRecord(value.distribution)) return null;
  const registryId = readString(value.id);
  const name = readString(value.name);
  const version = readString(value.version);
  const description = readString(value.description);
  if (!registryId || !/^[a-z][a-z0-9-]*$/.test(registryId) || !name || !version || !description) return null;

  const icon = readHttpsUrl(value.icon);
  const website = readHttpsUrl(value.website);
  const repository = readHttpsUrl(value.repository);
  const metadataBase = {
    id: registryId,
    version,
    ...(icon ? { icon } : {}),
    ...(website ? { website } : {}),
    ...(repository ? { repository } : {}),
  };
  const id = PROVIDER_ID_ALIASES[registryId] ?? registryId;

  const npx = parsePackageDistribution(value.distribution.npx);
  if (npx) {
    return providerConfig(id, name, description, process.platform === "win32" ? "npx.cmd" : "npx", [
      "-y",
      npx.package,
      ...npx.args,
    ], npx.env, { ...metadataBase, distribution: "npx" });
  }

  const uvx = parsePackageDistribution(value.distribution.uvx);
  if (uvx) {
    return providerConfig(id, name, description, "uvx", [uvx.package, ...uvx.args], uvx.env, {
      ...metadataBase,
      distribution: "uvx",
    });
  }

  const target = currentPlatformTarget();
  const binary = target && isRecord(value.distribution.binary)
    ? parseBinaryDistribution(value.distribution.binary[target])
    : null;
  if (!binary || !target) return null;
  const launcherPath = resolveBinaryLauncherPath();
  const spec = Buffer.from(JSON.stringify({
    id: registryId,
    version,
    target,
    ...binary,
  }), "utf8").toString("base64url");
  return providerConfig(id, name, description, process.execPath, [launcherPath, spec], {
    ...binary.env,
    JAIT_ACP_BINARY_ROOT: join(homedir(), ".jait", "acp-agents"),
  }, { ...metadataBase, distribution: "binary" });
}

function providerConfig(
  id: string,
  name: string,
  description: string,
  command: string,
  args: string[],
  env: Record<string, string>,
  registry: AcpProviderRegistryMetadata,
): AcpProviderConfig {
  return {
    id,
    providerType: id,
    name,
    description,
    command,
    args,
    ...(Object.keys(env).length > 0 ? { env } : {}),
    auth: "acp",
    registry,
  };
}

function parsePackageDistribution(value: unknown): PackageDistribution | null {
  if (!isRecord(value)) return null;
  const packageName = readString(value.package);
  if (!packageName || /[\r\n\0]/.test(packageName)) return null;
  return {
    package: packageName,
    args: readStringArray(value.args),
    env: readEnvironment(value.env),
  };
}

function parseBinaryDistribution(value: unknown): BinaryDistribution | null {
  if (!isRecord(value)) return null;
  const archive = readHttpsUrl(value.archive);
  const cmd = readString(value.cmd);
  const sha256 = readString(value.sha256);
  const normalizedCommand = cmd?.replaceAll("\\", "/");
  if (!archive || !cmd || !normalizedCommand || /[\r\n\0]/.test(cmd)
    || normalizedCommand.startsWith("/") || /^[A-Za-z]:\//.test(normalizedCommand)
    || normalizedCommand.split("/").includes("..")) return null;
  if (sha256 && !/^[a-f0-9]{64}$/i.test(sha256)) return null;
  return {
    archive,
    cmd,
    args: readStringArray(value.args),
    env: readEnvironment(value.env),
    ...(sha256 ? { sha256: sha256.toLowerCase() } : {}),
  };
}

function mergeFallbackDefinitions(
  registryProviders: AcpProviderConfig[],
  fallbackDefinitions: AcpProviderConfig[],
  preferFallbackDefinitions = false,
): AcpProviderConfig[] {
  const merged = new Map(registryProviders.map((provider) => [provider.id, provider]));
  for (const fallback of fallbackDefinitions) {
    if (fallback.auth === false) continue;
    if (preferFallbackDefinitions || !merged.has(fallback.id)) merged.set(fallback.id, fallback);
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function currentPlatformTarget(): string | null {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const architecture = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : null;
  if (!architecture || !["darwin", "linux", "windows"].includes(platform)) return null;
  return `${platform}-${architecture}`;
}

function resolveBinaryLauncherPath(): string {
  const currentPath = fileURLToPath(import.meta.url);
  return join(dirname(currentPath), `acp-binary-launcher${extname(currentPath)}`);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !/[\r\n\0]/.test(item))
    : [];
}

function readEnvironment(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry[0]) && typeof entry[1] === "string"
  ));
}

function readHttpsUrl(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
