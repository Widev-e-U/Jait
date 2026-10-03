import * as jose from "jose";

export async function signPreviewToken(userId: string, resource: string, secret: string): Promise<string> {
  return new jose.SignJWT({ purpose: "preview", resource }).setSubject(userId)
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}
export async function verifyPreviewToken(token: string, resource: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return payload.purpose === "preview" && payload.resource === resource && typeof payload.sub === "string" ? payload.sub : null;
  } catch { return null; }
}
