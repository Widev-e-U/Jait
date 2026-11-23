import type { AppConfig } from "../config.js";

// Fastify inject defaults to localhost without the gateway port. Preserve the
// listening address because chat routes use this origin to configure CLI MCP.
function getInternalRequestHost(config: Pick<AppConfig, "host" | "port">): string {
  const connectHost = config.host === "0.0.0.0"
    ? "127.0.0.1"
    : config.host === "::"
      ? "::1"
      : config.host;
  const authority = connectHost.includes(":") ? `[${connectHost}]` : connectHost;
  return `${authority}:${config.port}`;
}

export function getInternalChatRequestHeaders(
  config: Pick<AppConfig, "host" | "port">,
  token: string,
): { authorization: string; host: string } {
  return {
    authorization: `Bearer ${token}`,
    host: getInternalRequestHost(config),
  };
}
