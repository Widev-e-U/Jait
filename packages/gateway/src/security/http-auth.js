import * as jose from "jose";
function getJwtSecret(secret) {
    return new TextEncoder().encode(secret || "jait-dev-secret-change-in-production");
}
export function extractBearerToken(headerValue) {
    if (typeof headerValue !== "string")
        return null;
    const trimmed = headerValue.trim();
    if (!trimmed.toLowerCase().startsWith("bearer "))
        return null;
    const token = trimmed.slice(7).trim();
    return token || null;
}
export async function signAuthToken(user, jwtSecret) {
    return new jose.SignJWT({ username: user.username })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(user.id)
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(getJwtSecret(jwtSecret));
}
export async function verifyAuthToken(token, jwtSecret) {
    try {
        const { payload } = await jose.jwtVerify(token, getJwtSecret(jwtSecret));
        const id = typeof payload.sub === "string" ? payload.sub : "";
        const username = typeof payload.username === "string" ? payload.username : "";
        if (!id || !username)
            return null;
        return { id, username };
    }
    catch {
        return null;
    }
}
export async function requireAuth(request, reply, jwtSecret) {
    const token = extractBearerToken(request.headers.authorization);
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
//# sourceMappingURL=http-auth.js.map