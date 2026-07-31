import { createHash, randomBytes } from "node:crypto";
import type { CalendarTokens } from "./types.js";

export interface CalendarOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function envCalendarCredentials(): CalendarOAuthCredentials | null {
  const clientId = process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_ID"]?.trim()
    || process.env["GMAIL_OAUTH_CLIENT_ID"]?.trim();
  const clientSecret = process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"]?.trim()
    || process.env["GMAIL_OAUTH_CLIENT_SECRET"]?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function createCalendarPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildCalendarAuthorizeUrl(params: {
  credentials: CalendarOAuthCredentials;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", params.credentials.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

function tokensFromResponse(data: Record<string, unknown>, fallbackRefresh?: string): CalendarTokens {
  const expiresIn = typeof data["expires_in"] === "number" ? data["expires_in"] : 3600;
  return {
    accessToken: String(data["access_token"] ?? ""),
    refreshToken: typeof data["refresh_token"] === "string"
      ? data["refresh_token"]
      : fallbackRefresh ?? null,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof data["scope"] === "string" ? data["scope"] : undefined,
  };
}

async function tokenRequest(body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = data["error_description"] ?? data["error"] ?? `HTTP ${response.status}`;
    throw new Error(`Calendar OAuth token request failed: ${detail}`);
  }
  return data;
}

export async function exchangeCalendarCode(params: {
  credentials: CalendarOAuthCredentials;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<CalendarTokens> {
  const data = await tokenRequest({
    client_id: params.credentials.clientId,
    client_secret: params.credentials.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
    code_verifier: params.codeVerifier,
  });
  return tokensFromResponse(data);
}

export async function refreshCalendarTokens(params: {
  credentials: CalendarOAuthCredentials;
  refreshToken: string;
}): Promise<CalendarTokens> {
  const data = await tokenRequest({
    client_id: params.credentials.clientId,
    client_secret: params.credentials.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: "refresh_token",
  });
  return tokensFromResponse(data, params.refreshToken);
}
