import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";

// ---------------------------------------------------------------------------
// Home Assistant tools — talk to a Home Assistant instance over its REST API.
//
// Credentials are resolved (in priority order) from the per-request API keys
// or the gateway environment:
//   - HA_URL / HASS_URL       base URL, e.g. http://192.0.2.10:8123
//   - HA_TOKEN / HASS_TOKEN   a long-lived access token (HA → Profile → Security)
// ---------------------------------------------------------------------------

interface HassCreds {
  url: string;
  token: string;
}

function resolveCreds(context: ToolContext): HassCreds | { error: string } {
  const url = (
    context.apiKeys?.["HA_URL"]
    ?? context.apiKeys?.["HASS_URL"]
    ?? process.env["HA_URL"]
    ?? process.env["HASS_URL"]
    ?? ""
  ).trim().replace(/\/+$/, "");
  const token = (
    context.apiKeys?.["HA_TOKEN"]
    ?? context.apiKeys?.["HASS_TOKEN"]
    ?? process.env["HA_TOKEN"]
    ?? process.env["HASS_TOKEN"]
    ?? ""
  ).trim();
  if (!url) {
    return {
      error:
        "Home Assistant URL not configured. Set HA_URL in Settings → API keys.",
    };
  }
  if (!token) {
    return {
      error:
        "Home Assistant token not configured. Create a long-lived access token in HA (Profile → Security) and set HA_TOKEN in Settings → API keys.",
    };
  }
  return { url, token };
}

interface HassResponse {
  ok: boolean;
  status: number;
  data: unknown;
}

async function hassFetch(
  creds: HassCreds,
  path: string,
  context: ToolContext,
  init?: { method?: string; body?: unknown },
): Promise<HassResponse> {
  const res = await fetch(`${creds.url}/api${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: context.signal,
  });
  const text = await res.text();
  let data: unknown = text;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // leave as raw text
    }
  }
  return { ok: res.ok, status: res.status, data };
}

function describeError(status: number, data: unknown): string {
  if (status === 401) return "Home Assistant rejected the token (401 Unauthorized). Check HA_TOKEN.";
  if (status === 404) return "Home Assistant returned 404 Not Found — check the path/entity.";
  const detail =
    data && typeof data === "object" && "message" in data
      ? String((data as { message: unknown }).message)
      : typeof data === "string"
        ? data
        : JSON.stringify(data);
  return `Home Assistant request failed (HTTP ${status})${detail ? `: ${detail}` : ""}`;
}

// ── homeassistant.states ─────────────────────────────────────────────

interface StatesInput {
  entity_id?: string;
}

export function createHomeAssistantStatesTool(): ToolDefinition<StatesInput> {
  return {
    name: "homeassistant.states",
    description:
      "Read the current state of Home Assistant entities. Omit entity_id to list all entities and their states, " +
      "or pass a specific entity_id (e.g. 'light.kitchen') to fetch a single entity's state and attributes.",
    tier: "standard",
    category: "network",
    source: "builtin",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description:
            "Optional entity id to fetch a single entity, e.g. 'light.kitchen'. Omit to list all entities.",
        },
      },
    },
    async execute(input, context): Promise<ToolResult> {
      const creds = resolveCreds(context);
      if ("error" in creds) return { ok: false, message: creds.error };

      const entityId = input?.entity_id?.trim();
      try {
        const res = await hassFetch(creds, entityId ? `/states/${encodeURIComponent(entityId)}` : "/states", context);
        if (!res.ok) return { ok: false, message: describeError(res.status, res.data) };

        if (entityId) {
          const s = res.data as { state?: string };
          return {
            ok: true,
            message: `${entityId} = ${s?.state ?? "unknown"}`,
            data: res.data,
          };
        }
        const all = Array.isArray(res.data) ? res.data : [];
        return {
          ok: true,
          message: `Fetched ${all.length} entities from Home Assistant.`,
          data: all,
        };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Home Assistant request failed" };
      }
    },
  };
}

// ── homeassistant.call_service ───────────────────────────────────────

interface CallServiceInput {
  domain: string;
  service: string;
  entity_id?: string | string[];
  service_data?: Record<string, unknown>;
}

export function createHomeAssistantCallServiceTool(): ToolDefinition<CallServiceInput> {
  return {
    name: "homeassistant.call_service",
    description:
      "Call a Home Assistant service to control devices, e.g. turn lights on/off, set a thermostat, run scenes. " +
      "Provide the domain (e.g. 'light'), service (e.g. 'turn_on'), and optionally a target entity_id plus service_data " +
      "(e.g. { brightness_pct: 50 }). Use homeassistant.services to discover available domains/services.",
    tier: "standard",
    category: "network",
    source: "builtin",
    risk: "medium",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Service domain, e.g. 'light', 'switch', 'climate', 'scene', 'script'.",
        },
        service: {
          type: "string",
          description: "Service name within the domain, e.g. 'turn_on', 'turn_off', 'toggle', 'set_temperature'.",
        },
        entity_id: {
          type: "string",
          description:
            "Optional target entity id (or comma-separated list) the service acts on, e.g. 'light.kitchen'.",
        },
        service_data: {
          type: "object",
          description:
            "Optional extra service data merged into the request body, e.g. { brightness_pct: 50, color_name: 'red' }.",
          properties: {},
        },
      },
      required: ["domain", "service"],
    },
    async execute(input, context): Promise<ToolResult> {
      const creds = resolveCreds(context);
      if ("error" in creds) return { ok: false, message: creds.error };

      const domain = input?.domain?.trim();
      const service = input?.service?.trim();
      if (!domain || !service) {
        return { ok: false, message: "Both 'domain' and 'service' are required." };
      }

      const body: Record<string, unknown> = { ...(input.service_data ?? {}) };
      if (input.entity_id !== undefined) {
        body["entity_id"] = input.entity_id;
      }

      try {
        const res = await hassFetch(
          creds,
          `/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`,
          context,
          { method: "POST", body },
        );
        if (!res.ok) return { ok: false, message: describeError(res.status, res.data) };

        const changed = Array.isArray(res.data) ? res.data.length : 0;
        const target = input.entity_id ? ` on ${Array.isArray(input.entity_id) ? input.entity_id.join(", ") : input.entity_id}` : "";
        return {
          ok: true,
          message: `Called ${domain}.${service}${target} (${changed} state${changed === 1 ? "" : "s"} changed).`,
          data: res.data,
        };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Home Assistant request failed" };
      }
    },
  };
}

// ── homeassistant.services ───────────────────────────────────────────

interface ServicesInput {
  domain?: string;
}

export function createHomeAssistantServicesTool(): ToolDefinition<ServicesInput> {
  return {
    name: "homeassistant.services",
    description:
      "List the service domains and services available in Home Assistant. Optionally filter to a single domain " +
      "(e.g. 'light') to see just its services. Use this to discover what homeassistant.call_service can do.",
    tier: "standard",
    category: "network",
    source: "builtin",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Optional domain to filter by, e.g. 'light'. Omit to list all domains.",
        },
      },
    },
    async execute(input, context): Promise<ToolResult> {
      const creds = resolveCreds(context);
      if ("error" in creds) return { ok: false, message: creds.error };

      try {
        const res = await hassFetch(creds, "/services", context);
        if (!res.ok) return { ok: false, message: describeError(res.status, res.data) };

        const all = (Array.isArray(res.data) ? res.data : []) as Array<{
          domain: string;
          services: Record<string, unknown>;
        }>;
        const filter = input?.domain?.trim();
        const filtered = filter ? all.filter((d) => d.domain === filter) : all;

        if (filter && filtered.length === 0) {
          return { ok: false, message: `No service domain '${filter}' found in Home Assistant.` };
        }
        return {
          ok: true,
          message: filter
            ? `Domain '${filter}' exposes ${Object.keys(filtered[0]?.services ?? {}).length} services.`
            : `Home Assistant exposes ${all.length} service domains.`,
          data: filtered,
        };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Home Assistant request failed" };
      }
    },
  };
}
