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
const STORAGE_KEY = 'jait-gateway-url';
const DEFAULT_HTTP = 'http://localhost:8000';
// ── Helpers ──────────────────────────────────────────────────────────
function stripTrailingSlash(url) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}
function httpToWs(httpUrl) {
    return httpUrl.replace(/^http/, 'ws');
}
// ── Read / write user override ───────────────────────────────────────
export function getStoredGatewayUrl() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v && v.trim() ? v.trim() : null;
    }
    catch {
        return null;
    }
}
export function setStoredGatewayUrl(url) {
    try {
        if (url && url.trim()) {
            localStorage.setItem(STORAGE_KEY, stripTrailingSlash(url.trim()));
        }
        else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }
    catch {
        // localStorage unavailable (e.g. sandboxed iframe)
    }
    // Notify other tabs / listeners
    window.dispatchEvent(new Event('jait-gateway-url-changed'));
}
// ── Resolved getters ─────────────────────────────────────────────────
/**
 * HTTP(S) gateway URL used by `fetch()` calls.
 */
export function getApiUrl() {
    const stored = getStoredGatewayUrl();
    if (stored)
        return stripTrailingSlash(stored);
    // Electron desktop bridge
    const desktop = window.jaitDesktop?.getInfo?.()?.gatewayUrl;
    if (desktop)
        return stripTrailingSlash(desktop);
    // Build-time env (Vite)
    const env = import.meta.env.VITE_API_URL;
    if (env)
        return stripTrailingSlash(env);
    return DEFAULT_HTTP;
}
/**
 * WebSocket gateway URL.
 */
export function getWsUrl() {
    const stored = getStoredGatewayUrl();
    if (stored)
        return stripTrailingSlash(httpToWs(stored));
    const env = import.meta.env.VITE_WS_URL;
    if (env)
        return stripTrailingSlash(env);
    const apiUrl = getApiUrl();
    return stripTrailingSlash(httpToWs(apiUrl));
}
// ── Convenience constants (snapshot at import time — prefer getters) ─
export const API_URL = getApiUrl();
export const WS_URL = getWsUrl();
//# sourceMappingURL=gateway-url.js.map