import type { AppConfig } from "../config.js";

/** Native/CLI clients have no Origin; browser cookie authority is origin-bound. */
export function isAllowedRequestOrigin(headers: { origin?: string; host?: string }, config: Pick<AppConfig, "corsOrigin">): boolean {
  if (!headers.origin) return true;
  if (["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost", "capacitor://localhost"].includes(headers.origin)) return true;
  try {
    const origin = new URL(headers.origin);
    if (origin.origin !== headers.origin || !["http:", "https:"].includes(origin.protocol)) return false;
    if (origin.host === headers.host) return true;
    return config.corsOrigin.split(",").some((entry) => entry.trim() === origin.origin);
  } catch { return false; }
}
