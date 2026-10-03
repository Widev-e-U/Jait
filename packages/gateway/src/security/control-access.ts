import type { SessionService } from "../services/sessions.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { ConsentManager } from "./consent-manager.js";

/** One ownership policy shared by HTTP, WebSocket input and output. */
export class ControlAccess {
  constructor(
    private sessions?: SessionService,
    private surfaces?: SurfaceRegistry,
    private consent?: ConsentManager,
  ) {}
  executionSession(sessionId: string, userId: string, projectRoot: string): string {
    if (sessionId !== "default" || !this.sessions || typeof this.sessions.create !== "function") return sessionId;
    return this.sessions.create({ userId, projectPath: projectRoot, name: "API tool session" }).id;
  }
  session(sessionId: string, userId: string | null): boolean {
    return Boolean(userId && this.sessions?.getById(sessionId, userId));
  }
  surface(id: string, userId: string | null): boolean {
    if (!userId) return false;
    const surface = this.surfaces?.getSurface(id);
    if (!surface) return false;
    const owner = this.surfaces?.getOwner(id);
    return owner ? owner === userId : this.session(surface.sessionId ?? "", userId);
  }
  consentRequest(id: string, userId: string | null): boolean {
    const request = this.consent?.getRequest(id);
    return Boolean(request && request.status === "pending" && this.session(request.sessionId, userId));
  }
}
