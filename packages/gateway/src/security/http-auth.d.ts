import type { FastifyReply, FastifyRequest } from "fastify";
export interface AuthUser {
    id: string;
    username: string;
}
export declare function extractBearerToken(headerValue: unknown): string | null;
export declare function signAuthToken(user: AuthUser, jwtSecret: string): Promise<string>;
export declare function verifyAuthToken(token: string, jwtSecret: string): Promise<AuthUser | null>;
export declare function requireAuth(request: FastifyRequest, reply: FastifyReply, jwtSecret: string): Promise<AuthUser | null>;
//# sourceMappingURL=http-auth.d.ts.map