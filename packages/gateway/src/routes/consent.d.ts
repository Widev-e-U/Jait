/**
 * Consent Routes — Sprint 4.9
 *
 * REST API for consent management: list pending, approve, reject.
 */
import type { FastifyInstance } from "fastify";
import type { ConsentManager } from "../security/consent-manager.js";
import type { AuditWriter } from "../services/audit.js";
export declare function registerConsentRoutes(app: FastifyInstance, consentManager: ConsentManager, audit: AuditWriter): void;
//# sourceMappingURL=consent.d.ts.map