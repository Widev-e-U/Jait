import type { FastifyReply, FastifyRequest } from "fastify";
import * as jose from "jose";

export interface AuthUser {
  id: string;
  username: string;
}

function getJwtSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret || "jait-dev-secret-change-in-production");
}

export const AUTH_COOKIE_NAME = "jait_token";

export function extractBearerToken(headerValue: unknown): string | null {
  if (typeof headerValue !== "string") return null;
  const trimmed = headerValue.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

export async function signAuthToken(
  user: AuthUser,
  jwtSecret: string,
): Promise<string> {
  return new jose.SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret(jwtSecret));
}

export async function verifyAuthToken(
  token: string,
  jwtSecret: string,
): Promise<AuthUser | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret(jwtSecret));
    const id = typeof payload.sub === "string" ? payload.sub : "";
    const username = typeof payload.username === "string" ? payload.username : "";
    if (!id || !username) return null;
    return { id, username };
  } catch {
    return null;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  jwtSecret: string,
): Promise<AuthUser | null> {
  const token = extractBearerToken(request.headers.authorization)
    ?? (request.cookies?.[AUTH_COOKIE_NAME] || null);
  if (!token) {
    await reply.status(401).send({ detail: "login_required" });
    return null;
  }
  const user = await verifyAuthToken(token, jwtSecret);
  if (!user) {
    await reply.status(401).send({ detail: "login_required" });
    return null;
  }
  return user;
}

