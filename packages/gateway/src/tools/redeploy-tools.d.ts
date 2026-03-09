/**
 * gateway.redeploy — Self-update tool for the Jait gateway.
 *
 * Flow (blue-green for bare process, i.e. `npm install -g @jait/gateway`):
 *   1. Pull the latest version:  npm install -g @jait/gateway@latest
 *   2. Spawn a canary on PORT+1 to verify the new code boots correctly
 *   3. Health-check the canary
 *   4. If healthy → spawn a fresh gateway on the original port (detached),
 *      kill the canary, then gracefully shut down the current process
 *   5. If unhealthy → kill the canary, report failure, stay running
 *
 * For Docker Swarm the tool triggers `docker service update --image ...`
 * which uses the stack's start-first rolling update policy.
 */
import type { ToolDefinition } from "./contracts.js";
interface RedeployInput {
    /** Version/tag to install. Defaults to "latest". */
    version?: string;
    /** Skip the canary health check (not recommended). */
    skipCanary?: boolean;
}
interface RedeployDeps {
    /** Current gateway port (from config) */
    port: number;
    /** Graceful shutdown callback — will be called when cutover succeeds */
    shutdown: () => Promise<void>;
}
export declare function createRedeployTool(deps: RedeployDeps): ToolDefinition<RedeployInput>;
export {};
//# sourceMappingURL=redeploy-tools.d.ts.map