import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type {
  ChannelConnector,
  ChannelConnectorEvents,
  ChannelStatus,
  InboundMessage,
  OutboundMessage,
} from "../types.js";

const DEFAULT_PORT = 3978;
const DEFAULT_PATH = "/api/messages";
const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const BOT_FRAMEWORK_SCOPE = "https://api.botframework.com/.default";
const BOT_FRAMEWORK_OPENID_CONFIGURATION =
  "https://login.botframework.com/v1/.well-known/openidconfiguration";
const BOT_FRAMEWORK_ISSUER = "https://api.botframework.com";
const SERVICE_URL_HOST_ALLOWLIST = [
  "smba.trafficmanager.net",
  "smba.infra.gcc.teams.microsoft.com",
  "smba.infra.gov.teams.microsoft.us",
  "smba.infra.dod.teams.microsoft.us",
  "botframework.azure.cn",
] as const;

interface MSTeamsAccount {
  id?: string;
  name?: string;
  aadObjectId?: string;
  role?: string;
}

interface MSTeamsActivity {
  id?: string;
  type?: string;
  text?: string;
  timestamp?: string;
  serviceUrl?: string;
  channelId?: string;
  from?: MSTeamsAccount;
  recipient?: MSTeamsAccount;
  conversation?: {
    id?: string;
    conversationType?: string;
    tenantId?: string;
  };
  channelData?: {
    tenant?: { id?: string };
  };
  locale?: string;
}

interface StoredMSTeamsReference {
  activityId?: string;
  serviceUrl: string;
  conversation: {
    id: string;
    conversationType?: string;
    tenantId?: string;
  };
  user?: MSTeamsAccount;
  bot?: MSTeamsAccount;
  tenantId?: string;
  locale?: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

export interface MSTeamsConnectorDeps {
  appId?: string;
  appPassword?: string;
  tenantId?: string;
  host?: string;
  port?: number;
  path?: string;
  maxBodyBytes?: number;
  fetchImpl?: typeof fetch;
  validateAuth?: (authorization: string, activity: MSTeamsActivity) => Promise<void>;
  now?: () => number;
  log?: (msg: string, ...args: unknown[]) => void;
}

class PayloadTooLargeError extends Error {}

const openIdConfigurationCache = new Map<string, Promise<string>>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizePath(path: string | undefined): string {
  const trimmed = path?.trim() || DEFAULT_PATH;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeConversationId(raw: string): string {
  return raw.split(";")[0] ?? raw;
}

export function decodeMSTeamsHtmlEntities(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function msteamsHtmlToPlainText(html: string): string {
  return decodeMSTeamsHtmlEntities(
    html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).replace(/\s+/g, " ");
}

export function stripMSTeamsMentionTags(text: string): string {
  return text.replace(/<at[^>]*>.*?<\/at>/gi, "").trim();
}

function normalizeMSTeamsText(raw: string): string {
  return msteamsHtmlToPlainText(stripMSTeamsMentionTags(raw)).trim();
}

export function isAllowedMSTeamsServiceUrl(serviceUrl: unknown): serviceUrl is string {
  if (typeof serviceUrl !== "string") return false;
  try {
    const parsed = new URL(serviceUrl.trim());
    if (parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    return SERVICE_URL_HOST_ALLOWLIST.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

function normalizeMSTeamsServiceUrl(serviceUrl: string): string {
  if (!isAllowedMSTeamsServiceUrl(serviceUrl)) {
    let host = "invalid-url";
    try {
      host = new URL(serviceUrl).hostname || host;
    } catch { /* keep fallback */ }
    throw new Error(`Blocked Microsoft Teams serviceUrl host: ${host}`);
  }
  return serviceUrl.trim().replace(/\/+$/, "");
}

function parseActivityTimestamp(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return Date.now();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
}

export function msteamsActivityToInbound(activity: MSTeamsActivity): InboundMessage | null {
  if (activity.type !== "message") return null;
  const text = normalizeMSTeamsText(activity.text ?? "");
  if (!text) return null;
  const conversationId = normalizeConversationId(activity.conversation?.id ?? "");
  if (!conversationId) return null;
  const senderId = activity.from?.aadObjectId ?? activity.from?.id ?? conversationId;
  const fromMe = Boolean(activity.from?.id && activity.from.id === activity.recipient?.id);
  return {
    channelId: "msteams",
    conversationId,
    senderId,
    senderName: activity.from?.name,
    text,
    timestamp: parseActivityTimestamp(activity.timestamp),
    fromMe,
    isSelfChat: false,
  };
}

function buildReference(activity: MSTeamsActivity): StoredMSTeamsReference | null {
  const conversationId = normalizeConversationId(activity.conversation?.id ?? "");
  if (!conversationId || !activity.serviceUrl) return null;
  const serviceUrl = normalizeMSTeamsServiceUrl(activity.serviceUrl);
  const tenantId = activity.channelData?.tenant?.id ?? activity.conversation?.tenantId;
  return {
    activityId: activity.id,
    serviceUrl,
    conversation: {
      id: conversationId,
      conversationType: activity.conversation?.conversationType,
      tenantId,
    },
    user: activity.from,
    bot: activity.recipient,
    tenantId,
    locale: activity.locale,
  };
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new PayloadTooLargeError("Payload too large");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function tokenFromAuthorization(authorization: string): string {
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() ?? "";
}

function allowedIssuers(tenantId: string): string[] {
  return [
    BOT_FRAMEWORK_ISSUER,
    `https://sts.windows.net/${tenantId}/`,
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
  ];
}

function openIdConfigurationUrlForIssuer(issuer: string, tenantId: string): string | null {
  if (issuer === BOT_FRAMEWORK_ISSUER) return BOT_FRAMEWORK_OPENID_CONFIGURATION;
  if (issuer === `https://sts.windows.net/${tenantId}/`) {
    return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/.well-known/openid-configuration`;
  }
  if (issuer === `https://login.microsoftonline.com/${tenantId}/v2.0`) {
    return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/v2.0/.well-known/openid-configuration`;
  }
  return null;
}

async function jwksForIssuer(
  issuer: string,
  tenantId: string,
  fetchImpl: typeof fetch,
): Promise<ReturnType<typeof createRemoteJWKSet>> {
  const configUrl = openIdConfigurationUrlForIssuer(issuer, tenantId);
  if (!configUrl) throw new Error(`Unsupported Microsoft Teams token issuer: ${issuer}`);
  const cached = jwksCache.get(configUrl);
  if (cached) return cached;

  const jwksUriPromise = openIdConfigurationCache.get(configUrl) ?? (async () => {
    const res = await fetchImpl(configUrl);
    if (!res.ok) throw new Error(`Failed to fetch OpenID configuration (HTTP ${res.status})`);
    const json = await res.json() as { jwks_uri?: unknown };
    if (typeof json.jwks_uri !== "string" || !json.jwks_uri) {
      throw new Error("OpenID configuration did not include jwks_uri");
    }
    return json.jwks_uri;
  })();
  openIdConfigurationCache.set(configUrl, jwksUriPromise);

  const jwks = createRemoteJWKSet(new URL(await jwksUriPromise));
  jwksCache.set(configUrl, jwks);
  return jwks;
}

export async function validateMSTeamsAuthorization(params: {
  authorization: string;
  appId: string;
  tenantId: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const token = tokenFromAuthorization(params.authorization);
  if (!token) throw new Error("Missing Bearer token");
  const decoded = decodeJwt(token);
  const issuer = typeof decoded.iss === "string" ? decoded.iss : "";
  if (!allowedIssuers(params.tenantId).includes(issuer)) {
    throw new Error("Unsupported Microsoft Teams token issuer");
  }
  const jwks = await jwksForIssuer(issuer, params.tenantId, params.fetchImpl ?? fetch);
  await jwtVerify(token, jwks, {
    audience: params.appId,
    issuer,
  });
}

export class MSTeamsConnector implements ChannelConnector {
  readonly id = "msteams";
  readonly label = "Microsoft Teams";

  private readonly deps: MSTeamsConnectorDeps;
  private readonly host: string;
  private readonly port: number;
  private readonly path: string;
  private readonly maxBodyBytes: number;
  private _status: ChannelStatus = "stopped";
  private server: Server | null = null;
  private events: ChannelConnectorEvents | null = null;
  private tokenCache: TokenCache | null = null;
  private references = new Map<string, StoredMSTeamsReference>();

  constructor(deps: MSTeamsConnectorDeps = {}) {
    this.deps = deps;
    this.host = deps.host ?? process.env.MSTEAMS_WEBHOOK_HOST ?? "0.0.0.0";
    this.port = deps.port ?? Number.parseInt(process.env.MSTEAMS_WEBHOOK_PORT ?? `${DEFAULT_PORT}`, 10);
    this.path = normalizePath(deps.path ?? process.env.MSTEAMS_WEBHOOK_PATH);
    this.maxBodyBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  }

  status(): ChannelStatus { return this._status; }
  currentQr(): string | null { return null; }

  listenPort(): number | null {
    const address = this.server?.address();
    return typeof address === "object" && address ? address.port : null;
  }

  private log(msg: string, ...args: unknown[]) {
    (this.deps.log ?? ((m, ...a) => console.log("[msteams]", m, ...a)))(msg, ...args);
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private fetch(): typeof fetch {
    return this.deps.fetchImpl ?? fetch;
  }

  private credentials(): { appId: string; appPassword: string; tenantId: string } | null {
    const appId = this.deps.appId ?? process.env.MSTEAMS_APP_ID ?? "";
    const appPassword = this.deps.appPassword ?? process.env.MSTEAMS_APP_PASSWORD ?? "";
    const tenantId = this.deps.tenantId ?? process.env.MSTEAMS_TENANT_ID ?? "";
    if (!appId || !appPassword || !tenantId) return null;
    return { appId, appPassword, tenantId };
  }

  private setStatus(status: ChannelStatus, detail?: { error?: string }) {
    this._status = status;
    this.events?.onStatus(status, detail);
  }

  async start(events: ChannelConnectorEvents): Promise<void> {
    this.events = events;
    const creds = this.credentials();
    if (!creds) {
      this.setStatus("error", {
        error: "MSTEAMS_APP_ID, MSTEAMS_APP_PASSWORD, and MSTEAMS_TENANT_ID are required",
      });
      return;
    }
    if (this.server) return;
    this.setStatus("connecting");
    const server = createServer((req, res) => {
      void this.handleRequest(req, res, creds);
    });
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          server.off("listening", onListening);
          reject(err);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(this.port, this.host);
      });
      this.setStatus("connected");
      this.log(`listening on ${this.host}:${this.listenPort() ?? this.port}${this.path}`);
    } catch (err) {
      this.server = null;
      this.setStatus("error", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.tokenCache = null;
    this.references.clear();
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    this.setStatus("stopped");
  }

  async send(msg: OutboundMessage): Promise<void> {
    const creds = this.credentials();
    if (!creds) throw new Error("Microsoft Teams credentials are not configured");
    const conversationId = normalizeConversationId(msg.conversationId);
    const ref = this.references.get(conversationId);
    if (!ref) {
      throw new Error(
        `No Microsoft Teams conversation reference for '${conversationId}'. The bot must receive a message first.`,
      );
    }
    const token = await this.botToken(creds);
    const url = `${ref.serviceUrl}/v3/conversations/${encodeURIComponent(conversationId)}/activities`;
    const channelData = ref.tenantId ? { tenant: { id: ref.tenantId } } : undefined;
    const activity = {
      type: "message",
      text: msg.text,
      channelId: "msteams",
      from: ref.bot ?? { id: creds.appId, role: "bot" },
      recipient: ref.user,
      conversation: ref.conversation,
      serviceUrl: ref.serviceUrl,
      locale: ref.locale,
      ...(channelData ? { channelData } : {}),
    };
    const res = await this.fetch()(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(activity),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Microsoft Teams send failed (HTTP ${res.status})${body ? `: ${body}` : ""}`);
    }
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    creds: { appId: string; appPassword: string; tenantId: string },
  ): Promise<void> {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    if (req.method !== "POST" || requestUrl.pathname !== this.path) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
    try {
      const body = await readJsonBody(req, this.maxBodyBytes);
      const activity = body && typeof body === "object" ? body as MSTeamsActivity : {};
      await this.validateAuth(auth, activity, creds);
      const reference = buildReference(activity);
      if (reference) {
        this.references.set(reference.conversation.id, reference);
      }
      const inbound = msteamsActivityToInbound(activity);
      if (inbound) {
        this.events?.onInbound(inbound);
      }
      sendJson(res, 202, { ok: true });
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        sendJson(res, 413, { error: "Payload too large" });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("token") || message.includes("issuer") ? 401 : 400;
      sendJson(res, status, { error: message });
    }
  }

  private async validateAuth(
    authorization: string,
    activity: MSTeamsActivity,
    creds: { appId: string; tenantId: string },
  ): Promise<void> {
    if (this.deps.validateAuth) {
      await this.deps.validateAuth(authorization, activity);
      return;
    }
    if (process.env.MSTEAMS_SKIP_AUTH_VALIDATION === "true") {
      return;
    }
    await validateMSTeamsAuthorization({
      authorization,
      appId: creds.appId,
      tenantId: creds.tenantId,
      fetchImpl: this.fetch(),
    });
  }

  private async botToken(creds: { appId: string; appPassword: string; tenantId: string }): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > this.now() + 60_000) {
      return this.tokenCache.accessToken;
    }
    const form = new URLSearchParams({
      client_id: creds.appId,
      client_secret: creds.appPassword,
      grant_type: "client_credentials",
      scope: BOT_FRAMEWORK_SCOPE,
    });
    const res = await this.fetch()(
      `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Microsoft Teams token request failed (HTTP ${res.status})${body ? `: ${body}` : ""}`);
    }
    const json = await res.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof json.access_token !== "string" || !json.access_token) {
      throw new Error("Microsoft Teams token response did not include access_token");
    }
    const expiresInSeconds = typeof json.expires_in === "number" ? json.expires_in : 3600;
    this.tokenCache = {
      accessToken: json.access_token,
      expiresAt: this.now() + expiresInSeconds * 1000,
    };
    return json.access_token;
  }
}
