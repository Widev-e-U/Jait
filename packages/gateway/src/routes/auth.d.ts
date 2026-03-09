import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { UserService } from "../services/users.js";
import type { ToolRegistry } from "../tools/registry.js";
export declare function registerAuthRoutes(app: FastifyInstance, config: AppConfig, users: UserService, toolRegistry?: ToolRegistry): void;
//# sourceMappingURL=auth.d.ts.map