// OAuth2 (authorization-code) helpers for Gmail and Outlook.
//
// Client credentials are resolved (in priority order) from:
//   1. Per-user secrets (type "email-oauth-app", keys "<provider>-client-id" /
//      "<provider>-client-secret") — lets the user configure apps from the UI.
//   2. Gateway environment variables.
//
//   Gmail:   GMAIL_OAUTH_CLIENT_ID    / GMAIL_OAUTH_CLIENT_SECRET
//   Outlook: OUTLOOK_OAUTH_CLIENT_ID  / OUTLOOK_OAUTH_CLIENT_SECRET

import { createHash, randomBytes } from "node:crypto";
import type { EmailProvider, EmailTokens } from "./types.js";

interface ProviderOAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Extra params appended to the authorize URL. */
  authorizeParams: Record<string, string>;
}

const PROVIDERS: Record<EmailProvider, ProviderOAuthConfig> = {
  gmail: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    // offline + consent are required to reliably receive a refresh token.
    authorizeParams: { access_type: "offline", prompt: "consent" },
  },
  outlook: {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "offline_access",
      "https://graph.microsoft.com/Mail.ReadWrite",
      "https://graph.microsoft.com/Mail.Send",
      "https://graph.microsoft.com/User.Read",
    ],
    authorizeParams: { response_mode: "query" },
  },
};

export interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

export type ClientCredentialResolver = (
  provider: EmailProvider,
) => OAuthClientCredentials | null;

export function envClientCredentials(provider: EmailProvider): OAuthClientCredentials | null {
  const prefix = provider === "gmail" ? "GMAIL" : "OUTLOOK";
  const clientId = process.env[`${prefix}_OAUTH_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${prefix}_OAUTH_CLIENT_SECRET`]?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** PKCE verifier/challenge pair (S256). */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(params: {
  provider: EmailProvider;
  credentials: OAuthClientCredentials;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const cfg = PROVIDERS[params.provider];
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", params.credentials.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scopes.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  for (const [k, v] of Object.entries(cfg.authorizeParams)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

function tokensFromResponse(data: Record<string, unknown>, fallbackRefresh?: string | null): EmailTokens {
  const expiresIn = typeof data["expires_in"] === "number" ? data["expires_in"] : 3600;
  return {
    accessToken: String(data["access_token"] ?? ""),
    refreshToken: (data["refresh_token"] as string | undefined) ?? fallbackRefresh ?? null,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: data["scope"] as string | undefined,
  };
}

async function postToken(
  provider: EmailProvider,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(PROVIDERS[provider].tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = data["error_description"] ?? data["error"] ?? `HTTP ${res.status}`;
    throw new Error(`OAuth token request failed: ${detail}`);
  }
  return data;
}

export async function exchangeCode(params: {
  provider: EmailProvider;
  credentials: OAuthClientCredentials;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<EmailTokens> {
  const data = await postToken(params.provider, {
    client_id: params.credentials.clientId,
    client_secret: params.credentials.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
    code_verifier: params.codeVerifier,
  });
  return tokensFromResponse(data);
}

export async function refreshTokens(params: {
  provider: EmailProvider;
  credentials: OAuthClientCredentials;
  refreshToken: string;
}): Promise<EmailTokens> {
  const data = await postToken(params.provider, {
    client_id: params.credentials.clientId,
    client_secret: params.credentials.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: "refresh_token",
  });
  return tokensFromResponse(data, params.refreshToken);
}
