export const JAIT_CORE_MCP_SERVER_NAME = "jait_core";
export const JAIT_DEFERRED_MCP_SERVER_NAME = "jait";
export const JAIT_CORE_CODE_MODE_NAMESPACE = "mcp__jait_core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeJaitCodexConfig(rawConfig?: string): string {
  let config: Record<string, unknown> = {};
  if (rawConfig?.trim()) {
    try {
      const parsed = JSON.parse(rawConfig) as unknown;
      if (!isRecord(parsed)) return rawConfig;
      config = parsed;
    } catch {
      return rawConfig;
    }
  }

  const features = isRecord(config["features"])
    ? config["features"]
    : {};
  const codeMode = isRecord(features["code_mode"])
    ? features["code_mode"]
    : {};
  const configuredNamespaces = Array.isArray(codeMode["direct_only_tool_namespaces"])
    ? codeMode["direct_only_tool_namespaces"].filter((value): value is string => typeof value === "string")
    : [];

  return JSON.stringify({
    ...config,
    features: {
      ...features,
      code_mode: {
        ...codeMode,
        direct_only_tool_namespaces: [
          ...new Set([...configuredNamespaces, JAIT_CORE_CODE_MODE_NAMESPACE]),
        ],
      },
    },
  });
}
