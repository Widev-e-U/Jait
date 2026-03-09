import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
export declare function registerHealthRoutes(app: FastifyInstance, config?: AppConfig, deps?: {
    getDeviceCount?: () => number;
    getSchemaVersion?: () => number;
}): void;
//# sourceMappingURL=health.d.ts.map