import type { FastifyInstance } from "fastify";
import type { ConsentManager } from "../security/consent-manager.js";
import type { DeviceRegistry } from "../services/device-registry.js";
import type { SessionService } from "../services/sessions.js";
interface MobileRouteDeps {
    deviceRegistry: DeviceRegistry;
    consentManager: ConsentManager;
    sessionService?: SessionService;
}
export declare function registerMobileRoutes(app: FastifyInstance, deps: MobileRouteDeps): void;
export {};
//# sourceMappingURL=mobile.d.ts.map