/**
 * Centralised gateway URL resolution.
 *
 * Priority (highest → lowest):
 *   1. User override stored in localStorage (`jait-gateway-url`)
 *   2. Electron bridge value (`window.jaitDesktop?.getInfo()?.gatewayUrl`)
 *   3. Build-time env var (`VITE_API_URL`)
 *   4. Fallback: `http://localhost:8000`
 *
 * All modules should import `getApiUrl()` / `getWsUrl()` from here instead
 * of reading `import.meta.env.VITE_API_URL` directly.
 */
export declare function getStoredGatewayUrl(): string | null;
export declare function setStoredGatewayUrl(url: string | null): void;
/**
 * HTTP(S) gateway URL used by `fetch()` calls.
 */
export declare function getApiUrl(): string;
/**
 * WebSocket gateway URL.
 */
export declare function getWsUrl(): string;
export declare const API_URL: string;
export declare const WS_URL: string;
//# sourceMappingURL=gateway-url.d.ts.map